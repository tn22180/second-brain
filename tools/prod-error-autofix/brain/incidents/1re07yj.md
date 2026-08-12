fingerprint: 1re07yj
service: api
message: [fixAuditIssue] w0lcybA82sVX7AHRg4vo Error in fixAuditIssue: CompletionTruncatedError: Model output truncated before completion (finish_reason=error) for model google/gemini-2.5-flash on audit_agent_url_handle; retried 2x (partial content length 23); provider reason: google/gemini-2.5-flash is tempo
app: BLOG
repo: blogs
date: 2026-08-12T07:33:03.439Z
status: mr_open
attempt: 1

# BLOG · api · 1re07yj

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/859

**Root cause.** generateUrl asks for DEFAULT_MODEL_5 ('gpt-5.1'), which LEGACY_MODEL_MAP resolves to DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash — the exact model getCompletion's last-attempt fallback swaps to — so during the 2026-08-05 OpenRouter rate limit on Google's Gemini SKUs all three attempts hit the same rate-limited model, the fallback was a no-op, and CompletionTruncatedError propagated to a 500.

**Mechanism.** POST /api/audit-agent/fix-issue reaches fixAuditIssue (auditAgentController.js:50); issueType urlLength/slugKeyword dispatches to generateUrl (auditAgentController.js:98-99). generateUrl calls parseJsonCompletion with name 'audit_agent_url_handle' and model DEFAULT_MODEL_5 (chains.js:208-213), which calls getCompletion with format 'json_object' (chains.js:100). DEFAULT_MODEL_5 = 'gpt-5.1' (openAi.service.js:19) and LEGACY_MODEL_MAP maps 'gpt-5.1' → DEFAULT_PRO_TEXT_MODEL (openAi.service.js:29) = google/gemini-2.5-flash (aiModels.js:20), so body.model is already the pro model before the retry loop starts. OpenRouter answered HTTP 200 with finish_reason='error' and resp.error.message 'google/gemini-2.5-flash is temporarily rate-limited upstream', captured as providerReason (openAi.service.js:167); because needsJsonParse is true the partial 23-char body fails isJsonCompletionIncomplete and the attempt counts as truncated (openAi.service.js:168-169). On attempt 3 the finishReason==='error' branch sets attemptModel = DEFAULT_PRO_TEXT_MODEL (openAi.service.js:161-162) — identical to the model that just aborted twice, so the documented 'fall back to the pro model rather than reissuing the same model that just aborted' (openAi.service.js:155-156) reissues the same model. It aborted again and CompletionTruncatedError was thrown (openAi.service.js:173), caught by fixAuditIssue's catch which logs and sets ctx.status = 500 (auditAgentController.js:147-148). Timeline matches to the millisecond: request start 11:07:45.114660Z with latency 6.396992988s → 11:07:51.5117Z, against the thrown-error line at 11:07:51.512862Z, preceded by 'retry 1/2' at 11:07:46.267204Z and 'retry 2/2' at 11:07:48.382312Z, all three warnings naming google/gemini-2.5-flash — never flash-lite. The only inter-attempt sleep is TRUNCATION_RETRY_BACKOFF_MS = 300, flat, no jitter (openAi.service.js:56, awaited at :189), so the whole retry budget is ~6s against a limit that spanned 09:09Z–17:47Z. Scale: 54 rate-limit log lines that day, 32 naming flash-lite and 22 naming flash; 13 of them are audit_agent_* calls, all on flash. Only 2 chains in 24h exhausted all attempts — this one and suggested_recomment_blog at 11:47:20.105565Z; the latter started on flash-lite and genuinely changed model on the fallback, this one could not. 16 of the parseJsonCompletion call sites in chains.js pass DEFAULT_MODEL_5, so the no-op fallback covers the whole audit-agent surface. The 4 'Article not found' lines (10:57-10:59, articleController.list) and the 16 UNAUTHENTICATED 'Failed to log event' lines are unrelated, separately tracked causes.

Confidence: `high`

## Code
- `packages/functions/src/services/openAi.service.js:162` — the fallback assigns DEFAULT_PRO_TEXT_MODEL, which for a DEFAULT_MODEL_5 caller is the model that already failed twice — a no-op swap
- `packages/functions/src/services/openAi.service.js:161` — fallback fires on finish_reason='error' without checking whether attemptModel already equals the fallback target
- `packages/functions/src/services/openAi.service.js:29` — LEGACY_MODEL_MAP maps 'gpt-5.1' to DEFAULT_PRO_TEXT_MODEL, so pro-model callers enter the loop already on the fallback target
- `packages/functions/src/services/openAi.service.js:19` — DEFAULT_MODEL_5 = 'gpt-5.1', the model every audit-agent chain requests
- `packages/functions/src/const/aiModels.js:20` — DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash — the model named in all three retry warnings and in the thrown error
- `packages/functions/src/const/aiModels.js:16` — OPENROUTER_DEEPSEEK_V3_1 already exists as a non-Google backup — a fallback that would have survived a Google-wide rate limit
- `packages/functions/src/services/openAi.service.js:167` — providerReason 'temporarily rate-limited upstream' is captured but only decorates the message; it never changes backoff or model choice
- `packages/functions/src/services/openAi.service.js:56` — TRUNCATION_RETRY_BACKOFF_MS = 300, flat, no jitter — total retry budget ~6s against an 8-hour intermittent limit
- `packages/functions/src/services/openAi.service.js:189` — the only delay between attempts, identical for a cap-hit truncation and a provider rate-limit abort
- `packages/functions/src/services/openAi.service.js:173` — throws CompletionTruncatedError after attempt 3 — the exact error in the alert (lib/services/openAi.service.js:179 in the deployed bundle)
- `packages/functions/src/services/auditAgent/chains.js:212` — generateUrl passes model DEFAULT_MODEL_5 — the reason this call path starts on the fallback model
- `packages/functions/src/services/auditAgent/chains.js:211` — name 'audit_agent_url_handle', the name in the alert and in both retry warnings
- `packages/functions/src/services/auditAgent/chains.js:100` — parseJsonCompletion's getCompletion call with format 'json_object' — frame 'at async parseJsonCompletion' in the stack
- `packages/functions/src/controllers/auditAgentController.js:98` — URL_LENGTH dispatches to generateUrl — frame 'at async fixAuditIssue' in the stack
- `packages/functions/src/controllers/auditAgentController.js:148` — maps the thrown error to the observed HTTP 500

## Evidence
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-05T10:52:53.534Z" AND timestamp<="2026-08-05T11:22:53.534Z" AND "audit_agent_url_handle"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-05T23:59:59Z" AND "CompletionTruncatedError"`
- 54 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-05T23:59:59Z" AND "temporarily rate-limited upstream"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-05T10:52:53.534Z" AND timestamp<="2026-08-05T11:22:53.534Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $2.87
- branch: `fix/prod-blog-1re07yj`
- fix commit: `a445312ec2c3a9cc7a1cf0b428931e62d24b675e`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/859
- tests: 359 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
.../__tests__/getCompletion.truncation.test.js     | 49 ++++++++++++++++++++++
 packages/functions/src/services/openAi.service.js  | 22 +++++++---
 2 files changed, 66 insertions(+), 5 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
