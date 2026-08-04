fingerprint: 10ydl1h
service: api
message: [genSuggested] 0M9YQS84AXIMb4Tvh6CL Error genSuggested CompletionTruncatedError: Model output truncated before completion (finish_reason=error) for model google/gemini-2.5-flash on suggested_outline; retried 2x (partial content length 249); provider reason: google/gemini-2.5-flash is temporarily rat
app: BLOG
repo: blogs
date: 2026-08-03T13:52:51.022Z
status: mr_open
attempt: 1

# BLOG · api · 10ydl1h

**Outcome.** duplicate of pboq3f — MR https://gitlab.com/avada/blogs/-/merge_requests/826

**Root cause.** Duplicate of fingerprint pboq3f (MR https://gitlab.com/avada/blogs/-/merge_requests/826 open, unmerged — fix commit d6701f20c is on fix/prod-blog-pboq3f only, not on master): during the 2026-08-03 intermittent OpenRouter rate limit on Google's Gemini SKUs, getCompletion's last-attempt fallback swaps google/gemini-2.5-flash-lite for google/gemini-2.5-flash — another model behind the same rate-limited upstream — so the two /api/gen-ai-suggested calls whose third attempt also hit the limit exhausted all 3 attempts and answered 503.

**Mechanism.** POST /api/gen-ai-suggested/:type reaches genSuggested (genAIBlogController.js:192). Both failing types call getCompletion with model 'gpt-4.1' and format 'json_object': recommendBlogPost with name 'suggested_recomment_blog' (genAIBlogController.js:219) and blog-post-idea-outline with name 'suggested_outline' (genAIBlogController.js:329). LEGACY_MODEL_MAP resolves 'gpt-4.1' to DEFAULT_TEXT_MODEL = google/gemini-2.5-flash-lite (openAi.service.js:28, aiModels.js:19). OpenRouter answers HTTP 200 with finish_reason='error' and resp.error.message 'google/gemini-2.5-flash-lite is temporarily rate-limited upstream', captured as providerReason at openAi.service.js:167; because format is json_object, isJsonCompletionIncomplete fails on the partial body and the attempt counts as truncated (openAi.service.js:168-169). On attempt 3 the finishReason==='error' branch at openAi.service.js:161-162 swaps attemptModel to DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash (aiModels.js:20) — same vendor, same throttled upstream — which also aborted, so CompletionTruncatedError is thrown at openAi.service.js:173 and mapped to 503 at genAIBlogController.js:369. Timing matches to the millisecond in this window: recommendBlogPost 503 at 12:39:50.907Z latency 39.344273865s → 12:40:30.251Z vs the error line at 12:40:30.253055Z, preceded by retry 1/2 at 12:39:58.176Z and retry 2/2 at 12:40:08.945Z; blog-post-idea-outline 503 at 12:45:55.209Z latency 9.321404092s → 12:46:04.530Z vs the error line at 12:46:04.529515Z, preceded by retry 1/2 at 12:45:59.852Z and retry 2/2 at 12:46:00.766Z. Those are the only 2 entries with httpRequest.status>=500 in the window and the only 2 CompletionTruncatedError lines, against 9 'temporarily rate-limited upstream' lines in the same 30 minutes (53 across 2026-08-03 00:00-14:00Z) — three other chains (suggested_recomment_blog 12:45:29, suggested_topics 12:51:29, suggested_recomment_blog 12:52:40) hit the identical limit and happened to recover on a retry; the difference is purely whether the last attempt's Google fallback also landed on the limit. Only inter-attempt sleep is TRUNCATION_RETRY_BACKOFF_MS = 300, flat, no jitter (openAi.service.js:56, awaited at :189), so the whole retry budget is seconds against a multi-hour upstream throttle. The 12:57:58 [getOne] 429 and the 'Failed to log event' 16 UNAUTHENTICATED lines (P6) are unrelated and produced no 5xx.

Confidence: `high`

## Code
- `packages/functions/src/services/openAi.service.js:161` — final-attempt fallback fires on finish_reason='error' regardless of cause — a vendor-wide rate limit treated like a transient per-model abort
- `packages/functions/src/services/openAi.service.js:162` — the swap itself: attemptModel = DEFAULT_PRO_TEXT_MODEL, another google/* SKU behind the same rate-limited upstream — the model named in both thrown errors
- `packages/functions/src/services/openAi.service.js:167` — providerReason 'temporarily rate-limited upstream' captured but only decorates the message; never changes backoff or model choice
- `packages/functions/src/services/openAi.service.js:169` — isJsonCompletionIncomplete on the partial body marks the finish_reason='error' response as truncated
- `packages/functions/src/services/openAi.service.js:173` — throws CompletionTruncatedError after attempt 3 — the alert's error, lib/services/openAi.service.js:179 in the deployed bundle
- `packages/functions/src/services/openAi.service.js:56` — TRUNCATION_RETRY_BACKOFF_MS = 300, flat, no jitter — retry budget of seconds against a multi-hour limit
- `packages/functions/src/services/openAi.service.js:28` — LEGACY_MODEL_MAP maps caller's 'gpt-4.1' to DEFAULT_TEXT_MODEL, so the caller cannot see which vendor it depends on
- `packages/functions/src/const/aiModels.js:19` — DEFAULT_TEXT_MODEL = google/gemini-2.5-flash-lite — the model in all 9 retry warnings in the window
- `packages/functions/src/const/aiModels.js:20` — DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash — the fallback target, same throttled vendor
- `packages/functions/src/const/aiModels.js:16` — OPENROUTER_DEEPSEEK_V3_1 already exists as a non-Google backup — the fallback that would have survived
- `packages/functions/src/controllers/genAIBlogController.js:219` — recommendBlogPost's getCompletion call, name 'suggested_recomment_blog' — the 12:39-12:40 chain
- `packages/functions/src/controllers/genAIBlogController.js:329` — blog-post-idea-outline's getCompletion call, name 'suggested_outline' — the alert text and the 12:45-12:46 chain
- `packages/functions/src/controllers/genAIBlogController.js:369` — maps CompletionTruncatedError to the observed 503

## Evidence
- 9 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-03T12:31:06.230Z" AND timestamp<="2026-08-03T13:01:06.230Z" AND "temporarily rate-limited upstream"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-03T12:31:06.230Z" AND timestamp<="2026-08-03T13:01:06.230Z" AND "CompletionTruncatedError"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-03T12:31:06.230Z" AND timestamp<="2026-08-03T13:01:06.230Z" AND httpRequest.status>=500`
- 53 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-03T00:00:00Z" AND timestamp<="2026-08-03T14:00:00Z" AND "temporarily rate-limited upstream"`

## Job
- analyze rounds: 1
- cost: $1.15
- MR: https://gitlab.com/avada/blogs/-/merge_requests/826

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
