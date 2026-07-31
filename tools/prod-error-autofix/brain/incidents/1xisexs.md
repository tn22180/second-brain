fingerprint: 1xisexs
service: api
message: [genSuggested] kakZR5lRK5kln8uTXk1E Error genSuggested CompletionTruncatedError: Model output truncated before completion (finish_reason=error) for model google/gemini-2.5-flash-lite on suggested_outline; retried 1x (partial content length 76)
app: BLOG
repo: blogs
date: 2026-07-31T10:02:26.531Z
status: mr_open
attempt: 1

# BLOG · api · 1xisexs

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/809

**Root cause.** OpenRouter's provider for google/gemini-2.5-flash-lite aborts generation mid-output (finish_reason=error) on roughly a third of /api/gen-ai-suggested completions, returning 76–318 chars of half-written JSON; getCompletion's single immediate same-model retry (MAX_TRUNCATION_RETRIES=1) recovers 6 of 9 but the other 3 exhaust it and become CompletionTruncatedError → HTTP 503.

**Mechanism.** genSuggested calls getCompletion with model 'gpt-4.1', which resolveModel maps to DEFAULT_TEXT_MODEL = google/gemini-2.5-flash-lite (packages/functions/src/const/aiModels.js:20). OpenRouter answers with finish_reason='error' and a partial content string; the check at openAi.service.js:157 flags it truncated via isJsonCompletionIncomplete (finish_reason 'error' is not in the finishReason==='length' clause — the JSON-parseability clause is what fires). The loop retries once against the identical body and the same model with no backoff (openAi.service.js:152-169). When that second attempt also comes back finish_reason=error it throws CompletionTruncatedError at openAi.service.js:161, which genAIBlogController.js:368 converts to a 503. Provider abort reason is never captured: the code reads only finish_reason and message.content, so resp.error / resp.choices[0].error is discarded. In the 30-min alert window 9 completions hit finish_reason=error, all on gemini-2.5-flash-lite, all across suggested_* prompt names; 3 exhausted the retry, matching exactly the 3 × 503 request logs. This is not new breakage — before the retry code deployed at 2026-07-31T08:48Z the same aborts surfaced as 70 SyntaxError 500s in 24h.

Confidence: `medium`

## Code
- `packages/functions/src/services/openAi.service.js:55` — MAX_TRUNCATION_RETRIES = 1 — only one retry, which 3 of 9 aborts outlived
- `packages/functions/src/services/openAi.service.js:157` — truncation test: finish_reason==='length' OR unparseable JSON; finish_reason='error' is caught only by the second clause
- `packages/functions/src/services/openAi.service.js:153` — retry re-issues the identical body against the same model with no backoff and no fallback
- `packages/functions/src/services/openAi.service.js:161` — throws CompletionTruncatedError after the single retry — the alerted error
- `packages/functions/src/services/openAi.service.js:155` — only message.content is read; resp.error / choices[0].error carrying the provider abort reason is dropped, so the cause of finish_reason=error is unobservable
- `packages/functions/src/const/aiModels.js:20` — DEFAULT_TEXT_MODEL = google/gemini-2.5-flash-lite — the model in all 10 aborts
- `packages/functions/src/controllers/genAIBlogController.js:331` — blog-post-idea-outline passes name 'suggested_outline'; stack frame genAIBlogController:338 lands here
- `packages/functions/src/controllers/genAIBlogController.js:368` — CompletionTruncatedError mapped to HTTP 503, matching the 3 × 503 request logs

## Evidence
- 10 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T09:48:00Z" AND timestamp<="2026-07-31T09:48:44.940Z" AND jsonPayload.message:"output truncated (finish_reason="`
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T09:48:00Z" AND timestamp<="2026-07-31T09:48:44.940Z" AND jsonPayload.error.name="CompletionTruncatedError"`
- 26 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T09:18:44.940Z" AND timestamp<="2026-07-31T09:48:44.940Z" AND httpRequest.requestUrl:"/api/gen-ai-suggested/"`
- 304 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T09:48:00Z" AND timestamp<="2026-07-31T09:48:44Z" AND httpRequest.requestUrl:"/api/gen-ai-suggested/"`
- 70 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T09:48:00Z" AND timestamp<="2026-07-31T08:48:16Z" AND jsonPayload.tag="[genSuggested]" AND jsonPayload.error.name="SyntaxError"`

## Job
- analyze rounds: 1
- cost: $2.43
- branch: `fix/prod-blog-1xisexs`
- fix commit: `50aebe8ca0f735652a81cedd522698b31c975cc6`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/809
- tests: 247 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
.../__tests__/getCompletion.truncation.test.js     | 54 ++++++++++++++++++++--
 packages/functions/src/services/openAi.service.js  | 43 ++++++++++++-----
 2 files changed, 81 insertions(+), 16 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
