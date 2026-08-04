fingerprint: 1hjewuf
service: api
message: HTTP 503 POST /api/gen-ai-suggested/blog-post-idea-outline
app: BLOG
repo: blogs
date: 2026-08-03T13:55:12.885Z
status: mr_open
attempt: 3

# BLOG · api · 1hjewuf

**Outcome.** duplicate of 10ydl1h — MR https://gitlab.com/avada/blogs/-/merge_requests/826

**Root cause.** Duplicate of fingerprint pboq3f (MR https://gitlab.com/avada/blogs/-/merge_requests/826 open, unmerged): during OpenRouter's intermittent rate limit on Google's Gemini SKUs, getCompletion's last-attempt fallback swaps google/gemini-2.5-flash-lite for google/gemini-2.5-flash — another Google model behind the same rate-limited upstream — so both /api/gen-ai-suggested 503s in this window exhausted all 3 attempts and genSuggested answered 503.

**Mechanism.** POST /api/gen-ai-suggested/:type reaches genSuggested; both failing types call getCompletion with model 'gpt-4.1' and format 'json_object' — case 'recommendBlogPost' name 'suggested_recomment_blog' (genAIBlogController.js:216-225) and case 'blog-post-idea-outline' name 'suggested_outline' (genAIBlogController.js:316-333). LEGACY_MODEL_MAP resolves 'gpt-4.1' to DEFAULT_TEXT_MODEL = google/gemini-2.5-flash-lite (openAi.service.js:28, aiModels.js:19). OpenRouter answers HTTP 200 with finish_reason='error' and resp.error.message 'google/gemini-2.5-flash-lite is temporarily rate-limited upstream' (captured as providerReason at openAi.service.js:167); because format is json_object, isJsonCompletionIncomplete fails on the partial body so the attempt counts as truncated. Attempts 1 and 2 re-issue the same model after a flat 300ms sleep (MAX_TRUNCATION_RETRIES=2 at :55, TRUNCATION_RETRY_BACKOFF_MS=300 at :56, awaited at :189); on attempt 3 the finishReason==='error' branch at :161-162 swaps attemptModel to DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash (aiModels.js:20) — same vendor, same rate-limited upstream — which also aborts, so CompletionTruncatedError is thrown at :173 (prod frame lib/services/openAi.service.js:179) and mapped to 503 at genAIBlogController.js:368-369. Both chains match to the millisecond: recommendBlogPost 503 at 12:39:50.907Z latency 39.344273865s → 12:40:30.251Z vs the error line at 12:40:30.253055Z, preceded by retry 1/2 at 12:39:58.176Z and retry 2/2 at 12:40:08.945Z; blog-post-idea-outline (the alerting endpoint) 503 at 12:45:55.209Z latency 9.321404092s → 12:46:04.530Z vs the error line at 12:46:04.529515Z, preceded by retry 1/2 at 12:45:59.852Z and retry 2/2 at 12:46:00.766Z. Both thrown errors name google/gemini-2.5-flash (the fallback), while all retry warnings name google/gemini-2.5-flash-lite — the vendor-identical swap made visible in the log text. Counts in this 30-minute window are exact: 2 of 2 5xx are these 503s, 2 of 2 CompletionTruncatedError, 10 'temporarily rate-limited upstream' lines. The other 8 rate-limit encounters (suggested_topics 12:51:29/13:01:06, suggested_recomment_blog 12:45:29/12:52:40, plus the four retry lines belonging to the two failures) recovered on a retry — the difference is purely whether the last attempt's Google fallback also landed on the limit. Partial content lengths 249 and 292 chars confirm an early abort, not an output cap. Unrelated noise in the window: 8 'Failed to log event' 16 UNAUTHENTICATED lines (P6), [getOne] 429 from Shopify, [getCrmWidgets] 400 from public.avada.io, and the z.toJSONSchema json_object fallback warnings — none produced a 5xx.

Confidence: `high`

## Code
- `packages/functions/src/services/openAi.service.js:161` — final-attempt fallback fires on finish_reason='error' regardless of cause — a vendor-wide rate limit is treated like a transient per-model abort
- `packages/functions/src/services/openAi.service.js:162` — the swap itself: attemptModel = DEFAULT_PRO_TEXT_MODEL, another google/* SKU behind the same rate-limited upstream
- `packages/functions/src/services/openAi.service.js:167` — providerReason 'temporarily rate-limited upstream' is captured but only decorates the message; it never changes backoff or model choice
- `packages/functions/src/services/openAi.service.js:173` — throws CompletionTruncatedError after attempt 3 — the exact error in the alert, lib/services/openAi.service.js:179 in the deployed bundle
- `packages/functions/src/services/openAi.service.js:56` — TRUNCATION_RETRY_BACKOFF_MS = 300, flat, no jitter — whole retry budget is seconds against a multi-hour intermittent upstream limit
- `packages/functions/src/services/openAi.service.js:189` — the only delay between attempts, identical for a cap-hit truncation and a provider rate-limit abort
- `packages/functions/src/services/openAi.service.js:28` — LEGACY_MODEL_MAP maps the caller's 'gpt-4.1' to DEFAULT_TEXT_MODEL, so the caller cannot see which vendor it depends on
- `packages/functions/src/const/aiModels.js:19` — DEFAULT_TEXT_MODEL = google/gemini-2.5-flash-lite — the model named in all retry warnings in this window
- `packages/functions/src/const/aiModels.js:20` — DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash — the fallback target named in both thrown errors
- `packages/functions/src/const/aiModels.js:16` — OPENROUTER_DEEPSEEK_V3_1 already exists as a non-Google backup — the fallback that would have survived this limit
- `packages/functions/src/controllers/genAIBlogController.js:316` — case 'blog-post-idea-outline' — the alerting endpoint, name 'suggested_outline', the 12:45:55 chain
- `packages/functions/src/controllers/genAIBlogController.js:216` — case 'recommendBlogPost', name 'suggested_recomment_blog' — the second 503 at 12:39:50
- `packages/functions/src/controllers/genAIBlogController.js:369` — maps CompletionTruncatedError to the observed 503

## Evidence
- 10 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-03T12:31:07.765Z" AND timestamp<="2026-08-03T13:01:07.765Z" AND "temporarily rate-limited upstream"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-03T12:31:07.765Z" AND timestamp<="2026-08-03T13:01:07.765Z" AND "CompletionTruncatedError"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-03T12:31:07.765Z" AND timestamp<="2026-08-03T13:01:07.765Z" AND httpRequest.status>=500`
- 51 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-03T00:00:00Z" AND timestamp<="2026-08-03T14:00:00Z" AND "temporarily rate-limited upstream"`

## Job
- analyze rounds: 1
- cost: $1.08
- MR: https://gitlab.com/avada/blogs/-/merge_requests/826

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
