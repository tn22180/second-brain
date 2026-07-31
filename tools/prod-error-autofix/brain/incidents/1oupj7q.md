fingerprint: 1oupj7q
service: api
message: HTTP 500 POST /api/audit-agent/fix-issue
app: BLOG
repo: blogs
date: 2026-07-31T07:54:56.604Z
status: mr_open
attempt: 1

# BLOG · api · 1oupj7q

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/801

**Root cause.** POST /api/audit-agent/fix-issue returns 500 whenever the OpenRouter completion behind parseJsonCompletion comes back as JSON that JSON.parse rejects — here a raw control character inside a string literal — because parseJsonCompletion calls bare JSON.parse on the model text with no repair, retry, or typed error.

**Mechanism.** fixAuditIssue dispatches TEXT_SENTENCE_LENGTH to fixSentenceLengthBlocks (packages/functions/src/services/auditAgent/chains.js:487), which calls parseJsonCompletion. getCompletion sends response_format json_schema/strict built from the zod v4 schema (packages/functions/src/services/openAi.service.js:107) against model gpt-5.1 → resolveModel → DEFAULT_PRO_TEXT_MODEL = 'google/gemini-2.5-flash' (packages/functions/src/const/aiModels.js:20). OpenRouter/Gemini does not actually guarantee that grammar: the returned body was pretty-printed JSON with an unescaped control char at byte 6233 (line 41 col 80). parseJsonCompletion then does JSON.parse(raw) with no guard (packages/functions/src/services/auditAgent/chains.js:92) → SyntaxError propagates to the controller catch, which sets 500 (packages/functions/src/controllers/auditAgentController.js:148). Timing confirms it is this request: the 500 started 2026-07-31T07:22:50.249018Z with latency 9.861118807s → 07:23:00.110, and the [fixAuditIssue] SyntaxError logged at 07:23:00.111497Z, 1.4ms later, same instanceId 001548f7291b02167ca87740e449463…

Confidence: `high`

## Code
- `packages/functions/src/services/auditAgent/chains.js:92` — bare JSON.parse(raw) on the model completion — the throw site named in the prod stack (lib/services/auditAgent/chains.js:49:54)
- `packages/functions/src/services/auditAgent/chains.js:487` — fixSentenceLengthBlocks calls parseJsonCompletion — the frame at lib chains.js:467 in the stack
- `packages/functions/src/controllers/auditAgentController.js:148` — catch turns any parse error into ctx.status = 500, producing the alerted HTTP 500
- `packages/functions/src/services/openAi.service.js:107` — json_schema strict response_format is sent, yet invalid JSON still comes back — so schema mode is not a sufficient guarantee on this provider
- `packages/functions/src/const/aiModels.js:20` — DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash, the model gpt-5.1 resolves to for this call

## Evidence
- 161 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-30T08:00:00Z" AND timestamp<="2026-07-31T08:00:00Z" AND httpRequest.requestUrl:"/api/audit-agent/fix-issue"`
- 6 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-30T08:00:00Z" AND timestamp<="2026-07-31T08:00:00Z" AND jsonPayload.tag="[fixAuditIssue]"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-07-31T07:08:02.242Z" AND timestamp<="2026-07-31T07:38:02.242Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 2
- cost: $3.44
- branch: `fix/prod-blog-1oupj7q`
- fix commit: `867c7632d6174dc48d6ce8f47c5cf7b19057fd5b`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/801
- tests: 229 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
.../functions/src/services/auditAgent/chains.js    | 32 +++++++---
 packages/functions/src/services/openAi.service.js  | 71 ++++++++++++++++++++++
 2 files changed, 94 insertions(+), 9 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
