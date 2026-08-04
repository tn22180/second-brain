fingerprint: pboq3f
service: api
message: [genSuggested] JdbhaPwtrz2JXvQFsKcS Error genSuggested CompletionTruncatedError: Model output truncated before completion (finish_reason=error) for model google/gemini-2.5-flash on suggested_recomment_blog; retried 2x (partial content length 292); provider reason: google/gemini-2.5-flash is temporar
app: BLOG
repo: blogs
date: 2026-08-03T13:50:30.997Z
status: mr_open
attempt: 1

# BLOG · api · pboq3f

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/826

**Root cause.** During a 13.5-hour intermittent OpenRouter rate limit on Google's Gemini SKUs, getCompletion's last-attempt fallback swaps google/gemini-2.5-flash-lite for google/gemini-2.5-flash — another Google model behind the same rate-limited upstream — so the 2 of 51 rate-limit encounters whose final attempt also hit the limit exhausted all 3 attempts and genSuggested answered 503.

**Mechanism.** POST /api/gen-ai-suggested/:type reaches genSuggested (genAIBlogController.js:192). Both failing types call getCompletion with model 'gpt-4.1' and format 'json_object': case 'recommendBlogPost' with name 'suggested_recomment_blog' (genAIBlogController.js:219-225) and case 'blog-post-idea-outline' with name 'suggested_outline' (genAIBlogController.js:320-333). LEGACY_MODEL_MAP resolves 'gpt-4.1' to DEFAULT_TEXT_MODEL = google/gemini-2.5-flash-lite (openAi.service.js:28, aiModels.js:19). OpenRouter answered HTTP 200 with finish_reason='error' and resp.error.message 'google/gemini-2.5-flash-lite is temporarily rate-limited upstream', captured as providerReason at openAi.service.js:167; because format is json_object, isJsonCompletionIncomplete fails on the partial body and the attempt counts as truncated (openAi.service.js:168-169). On attempt 3 the finishReason==='error' branch at openAi.service.js:161-162 swaps attemptModel to DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash (aiModels.js:20) — same vendor, same rate-limited upstream — which also aborted, so CompletionTruncatedError was thrown at openAi.service.js:173 and mapped to 503 at genAIBlogController.js:368-369. Two chains match to the millisecond: recommendBlogPost 503 at 12:39:50.907Z latency 39.344273865s → 12:40:30.251Z vs the error line at 12:40:30.253055Z, preceded by retry 1/2 at 12:39:58.176Z and retry 2/2 at 12:40:08.945Z; blog-post-idea-outline 503 at 12:45:55.209Z latency 9.321404092s → 12:46:04.530Z vs the error line at 12:46:04.529515Z, preceded by retry 1/2 at 12:45:59.852Z and retry 2/2 at 12:46:00.766Z. Four other chains in the same window hit the identical rate limit and happened to recover on a retry (suggested_recomment_blog 12:26:30/12:26:32, 12:45:29, 12:52:40; suggested_topics 12:51:29) — the difference is purely whether the last attempt's Google fallback also landed on the limit. The only inter-attempt sleep is TRUNCATION_RETRY_BACKOFF_MS = 300, flat, no jitter, no growth (openAi.service.js:56, awaited at :189), so the whole retry budget is seconds against an upstream limit that spanned 00:03:27Z-13:37:11Z (51 log lines). Across those 14 hours only 2 CompletionTruncatedError were thrown, and both are the 503s in this window. The [genIdeas] SyntaxError at 12:25:54.349Z is an unrelated, already-tracked free-text-parse cause; the 8 'Failed to log event' 16 UNAUTHENTICATED lines are P6 and unrelated.

Confidence: `high`

## Code
- `packages/functions/src/services/openAi.service.js:161` — final-attempt fallback fires on finish_reason='error' regardless of cause — a vendor-wide rate limit is treated like a transient per-model abort
- `packages/functions/src/services/openAi.service.js:162` — the swap itself: attemptModel = DEFAULT_PRO_TEXT_MODEL, another google/* SKU behind the same rate-limited upstream
- `packages/functions/src/services/openAi.service.js:167` — providerReason 'temporarily rate-limited upstream' is captured but only decorates the message; it never changes backoff or model choice
- `packages/functions/src/services/openAi.service.js:56` — TRUNCATION_RETRY_BACKOFF_MS = 300, flat, no jitter — the retry budget is seconds against a 13.5-hour intermittent limit
- `packages/functions/src/services/openAi.service.js:189` — the only delay between attempts, identical for a cap-hit truncation and a provider rate-limit abort
- `packages/functions/src/services/openAi.service.js:173` — throws CompletionTruncatedError after attempt 3 — the exact error in the alert, lib/services/openAi.service.js:179 in the deployed bundle
- `packages/functions/src/services/openAi.service.js:28` — LEGACY_MODEL_MAP maps the caller's 'gpt-4.1' to DEFAULT_TEXT_MODEL, so the caller cannot see which vendor it depends on
- `packages/functions/src/const/aiModels.js:19` — DEFAULT_TEXT_MODEL = google/gemini-2.5-flash-lite, the model named in all 9 retry warnings in the window
- `packages/functions/src/const/aiModels.js:20` — DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash, the fallback target named in both thrown errors
- `packages/functions/src/const/aiModels.js:16` — OPENROUTER_DEEPSEEK_V3_1 already exists as a non-Google backup — the fallback that would have survived this outage
- `packages/functions/src/controllers/genAIBlogController.js:219` — recommendBlogPost's getCompletion call, name 'suggested_recomment_blog' — the name in the alert and the 12:39-12:40 chain
- `packages/functions/src/controllers/genAIBlogController.js:320` — blog-post-idea-outline's getCompletion call, name 'suggested_outline' — the second 503 at 12:45:55
- `packages/functions/src/controllers/genAIBlogController.js:369` — maps CompletionTruncatedError to the observed 503

## Evidence
- 11 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-03T12:25:31.932Z" AND timestamp<="2026-08-03T12:55:31.932Z" AND "temporarily rate-limited upstream"`
- 51 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-03T00:00:00Z" AND timestamp<="2026-08-03T14:00:00Z" AND "temporarily rate-limited upstream"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-03T00:00:00Z" AND timestamp<="2026-08-03T14:00:00Z" AND "CompletionTruncatedError"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-03T12:25:31.932Z" AND timestamp<="2026-08-03T12:55:31.932Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $3.18
- branch: `fix/prod-blog-pboq3f`
- fix commit: `d6701f20c26a9689212772119bd64e48e79baec6`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/826
- tests: 271 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
packages/functions/src/const/aiModels.js           |  5 +++
 ...AIBlogController.genSuggestedTruncation.test.js | 28 ++++++++++++-
 .../src/controllers/genAIBlogController.js         |  8 +++-
 .../__tests__/getCompletion.truncation.test.js     | 49 ++++++++++++++++++++++
 packages/functions/src/services/openAi.service.js  | 49 ++++++++++++++++++++--
 5 files changed, 132 insertions(+), 7 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
