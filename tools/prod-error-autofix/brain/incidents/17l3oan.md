fingerprint: 17l3oan
service: api
message: [fixAuditIssue] yvdugQ1uIcIzQ5xdf8iN Error in fixAuditIssue: CompletionTruncatedError: Model output truncated before completion (finish_reason=error) for model google/gemini-2.5-flash on audit_agent_sentence_length_blocks; retried 2x (partial content length 39); provider reason: google/gemini-2.5-fl
app: BLOG
repo: blogs
date: 2026-08-12T18:16:31.765Z
status: mr_open
attempt: 1

# BLOG · api · 17l3oan

**Outcome.** duplicate of 1re07yj — MR https://gitlab.com/avada/blogs/-/merge_requests/859

**Root cause.** Duplicate of fingerprint 1re07yj (MR https://gitlab.com/avada/blogs/-/merge_requests/859 open, unmerged — a445312ec is not an ancestor of HEAD ac891de05): fixSentenceLengthBlocks asks for DEFAULT_MODEL_5 ('gpt-5.1'), which LEGACY_MODEL_MAP resolves to DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash — the exact model getCompletion's last-attempt fallback swaps to — so during the OpenRouter rate limit on Google's Gemini SKUs all three attempts hit the same rate-limited model, the fallback was a no-op, and CompletionTruncatedError propagated to the HTTP 500.

**Mechanism.** POST /api/audit-agent/fix-issue (request log 2026-08-11T14:50:35.278228Z, latency 25.444338193s → ends 14:51:00.7226Z) reaches fixAuditIssue (auditAgentController.js:50). issueType textSentenceLength with a non-empty data.blocks dispatches to fixSentenceLengthBlocks (auditAgentController.js:77-79 — stack frame 'at async fixAuditIssue (lib/controllers/auditAgentController.js:121:40)' is the awaited handler dispatch at auditAgentController.js:136). fixSentenceLengthBlocks calls parseJsonCompletion with name 'audit_agent_sentence_length_blocks' and model DEFAULT_MODEL_5 (chains.js:525-526 — deployed lib/chains.js:494), which calls getCompletion with format 'json_object' + zodSchema (chains.js:100 — deployed lib/chains.js:63). DEFAULT_MODEL_5 = 'gpt-5.1' (openAi.service.js:19) and LEGACY_MODEL_MAP maps it to DEFAULT_PRO_TEXT_MODEL (openAi.service.js:29) = google/gemini-2.5-flash (aiModels.js:20), so body.model is already the fallback target before the retry loop starts (openAi.service.js:112,159). OpenRouter answered HTTP 200 with finish_reason='error' and resp.error.message 'google/gemini-2.5-flash is temporarily rate-limited upstream', captured as providerReason (openAi.service.js:167); needsJsonParse is true so the 39-char partial body fails isJsonCompletionIncomplete and the attempt counts as truncated (openAi.service.js:168-169). Two retry warnings, both naming google/gemini-2.5-flash: 14:50:56.531562Z and 14:50:58.732591Z. On attempt 3 the finishReason==='error' branch sets attemptModel = DEFAULT_PRO_TEXT_MODEL (openAi.service.js:161-162) — identical to the model that just aborted twice, so the documented 'fall back to the pro model rather than reissuing the same model that just aborted' (openAi.service.js:155-156) reissues the same model. It aborted again and CompletionTruncatedError was thrown (openAi.service.js:173 — deployed lib/openAi.service.js:179, the frame in the alert), caught by fixAuditIssue's catch which logs at logger.error and sets ctx.status = 500 (auditAgentController.js:147-148). Timeline closes to the millisecond: 14:50:35.278228Z + 25.444338193s = 14:51:00.7226Z against the thrown-error line at 14:51:00.725086Z, and it is the only httpRequest.status>=500 entry in the 30-min window. Scale on 2026-08-11: 8 'temporarily rate-limited upstream' lines in 24h; 6 name google/gemini-2.5-flash (audit_agent_* chains, all on the pro model, so all on the no-op-fallback path) and 2 name google/gemini-2.5-flash-lite (suggested_recomment_blog, which can genuinely change model on the fallback and did not throw). Exactly 1 CompletionTruncatedError in 24h — this one; the other 5 flash aborts (audit_agent_url_handle 14:50:31.450100Z, audit_agent_introduction_keyword_block 16:15:07.064678Z, audit_agent_meta_description_keyword 20:03:43.533936Z) recovered on retry 1 of 2, i.e. only exhaustion of all three attempts reaches the merchant. The only inter-attempt sleep is TRUNCATION_RETRY_BACKOFF_MS = 300, flat, no jitter (openAi.service.js:56, awaited at :189). Unrelated, separately tracked noise in the same window: 16 UNAUTHENTICATED 'Failed to log event' lines (P6) and 3 [getCrmWidgets] 400s.

Confidence: `high`

## Code
- `packages/functions/src/services/openAi.service.js:162` — the fallback assigns DEFAULT_PRO_TEXT_MODEL, which for a DEFAULT_MODEL_5 caller is the model that already aborted twice — a no-op swap
- `packages/functions/src/services/openAi.service.js:161` — fallback fires on finish_reason='error' without checking whether attemptModel already equals the fallback target
- `packages/functions/src/services/openAi.service.js:29` — LEGACY_MODEL_MAP maps 'gpt-5.1' to DEFAULT_PRO_TEXT_MODEL, so pro-model callers enter the retry loop already on the fallback target
- `packages/functions/src/services/openAi.service.js:19` — DEFAULT_MODEL_5 = 'gpt-5.1', the model this chain requests
- `packages/functions/src/const/aiModels.js:20` — DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash — the model named in both retry warnings and in the thrown error
- `packages/functions/src/const/aiModels.js:16` — OPENROUTER_DEEPSEEK_V3_1 already exists as a non-Google backup that would survive a Google-wide rate limit
- `packages/functions/src/services/openAi.service.js:169` — needsJsonParse + isJsonCompletionIncomplete marks the 39-char partial body as truncated
- `packages/functions/src/services/openAi.service.js:167` — providerReason 'temporarily rate-limited upstream' is captured but only decorates the message; never changes backoff or model choice
- `packages/functions/src/services/openAi.service.js:56` — TRUNCATION_RETRY_BACKOFF_MS = 300, flat, no jitter — whole retry budget ~4.2s against an upstream rate limit
- `packages/functions/src/services/openAi.service.js:173` — throws CompletionTruncatedError after attempt 3 — deployed lib/services/openAi.service.js:179 in the alert stack
- `packages/functions/src/services/auditAgent/chains.js:526` — fixSentenceLengthBlocks passes model DEFAULT_MODEL_5 — why this call path starts on the fallback model (deployed lib/chains.js:494)
- `packages/functions/src/services/auditAgent/chains.js:525` — name 'audit_agent_sentence_length_blocks', the name in the alert and in both retry warnings
- `packages/functions/src/services/auditAgent/chains.js:100` — parseJsonCompletion's getCompletion call with format 'json_object' — frame 'at async parseJsonCompletion' (deployed lib/chains.js:63)
- `packages/functions/src/controllers/auditAgentController.js:79` — TEXT_SENTENCE_LENGTH with non-empty data.blocks dispatches to fixSentenceLengthBlocks
- `packages/functions/src/controllers/auditAgentController.js:136` — awaited handler dispatch — frame 'at async fixAuditIssue (lib/controllers/auditAgentController.js:121:40)'
- `packages/functions/src/controllers/auditAgentController.js:148` — maps the thrown error to the observed HTTP 500

## Evidence
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-11T14:36:22.399Z" AND timestamp<="2026-08-11T15:06:22.399Z" AND "audit_agent_sentence_length_blocks"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-11T14:36:22.399Z" AND timestamp<="2026-08-11T15:06:22.399Z" AND httpRequest.status>=500`
- 8 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-11T00:00:00Z" AND timestamp<="2026-08-11T23:59:59Z" AND "temporarily rate-limited upstream"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-11T00:00:00Z" AND timestamp<="2026-08-11T23:59:59Z" AND "CompletionTruncatedError"`

## Job
- analyze rounds: 1
- cost: $1.57
- MR: https://gitlab.com/avada/blogs/-/merge_requests/859

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
