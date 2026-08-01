fingerprint: pboq3f
service: api
message: [genSuggested] fKUMrHXwtJca3KNWMU6X Error genSuggested CompletionTruncatedError: Model output truncated before completion (finish_reason=error) for model google/gemini-2.5-flash on suggested_recomment_blog; retried 2x (partial content length 61); provider reason: google/gemini-2.5-flash is temporari
app: BLOG
repo: blogs
date: 2026-07-31T15:02:53.491Z
status: deferred
attempt: 1

# BLOG · api · pboq3f

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** OpenRouter's Google Gemini upstream was rate-limited for at least 88 minutes (13:04:01–14:32:09Z), and getCompletion's last-attempt fallback swaps google/gemini-2.5-flash-lite for google/gemini-2.5-flash — another Google SKU behind the same rate-limited upstream — so with all 3 attempts crammed into 17.4s by a flat 300ms backoff, one /api/gen-ai-suggested/recommendBlogPost chain exhausted every attempt and genSuggested answered 503.

**Mechanism.** POST /api/gen-ai-suggested/recommendBlogPost reaches genSuggested (genAIBlogController.js:192), case 'recommendBlogPost' calls getCompletion with model 'gpt-4.1', format 'json_object', zodSchema suggestedRecommentBlog and name 'suggested_recomment_blog' (genAIBlogController.js:219-225). LEGACY_MODEL_MAP resolves the request to DEFAULT_TEXT_MODEL = google/gemini-2.5-flash-lite (aiModels.js:19). Every attempt returned finish_reason='error' with resp.error.message 'google/gemini-2.5-flash-lite is temporarily rate-limited upstream', captured as providerReason at openAi.service.js:167; because format is json_object the content is JSON-parse-checked, the half-document fails isJsonCompletionIncomplete and the attempt counts as truncated (openAi.service.js:168-169). Attempt 1 warned at 14:16:29.825Z (retry 1/2), attempt 2 at 14:16:32.516Z (retry 2/2), then the finishReason==='error' branch at openAi.service.js:161-162 swapped attemptModel to DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash (aiModels.js:20) — same vendor, same upstream limit — which aborted with partial content length 61, so CompletionTruncatedError was thrown at openAi.service.js:173 at 14:16:38.340Z. genSuggested's catch maps that class to 503 (genAIBlogController.js:368-371). The request log matches to the millisecond: 503 POST /api/gen-ai-suggested/recommendBlogPost at 14:16:20.894Z, latency 17.444839826s → 14:16:38.339Z. The only inter-attempt sleep is TRUNCATION_RETRY_BACKOFF_MS = 300, flat, no jitter, no growth (openAi.service.js:56, awaited at :189), so the whole retry budget is 17s against an outage spanning 88 minutes. In the 30-minute alert window 15 log lines carry the rate-limit text: 14 flash-lite retry warnings across 7 distinct chains (14:01:57/14:02:01, 14:09:02/14:09:04, 14:15:41/14:15:45, 14:16:29/14:16:32, 14:23:22/14:23:23, 14:29:55/14:29:56, 14:31:36/14:31:37) plus the single CompletionTruncatedError naming google/gemini-2.5-flash — i.e. 6 of 7 chains happened to recover, the one whose pro-model fallback also hit the limit produced the only 503. The three 'Article not found' ERROR lines at 14:16:21-22 come from articleController.list → getShopifyArticleById and are an unrelated, already-tracked cause.

Confidence: `high`

## Code
- `packages/functions/src/services/openAi.service.js:161` — final-attempt fallback triggers on finish_reason='error' regardless of why the provider aborted — a vendor-wide rate limit gets treated like a transient per-model abort
- `packages/functions/src/services/openAi.service.js:162` — the swap itself: attemptModel = DEFAULT_PRO_TEXT_MODEL, another google/* SKU behind the same rate-limited upstream
- `packages/functions/src/services/openAi.service.js:167` — providerReason 'temporarily rate-limited upstream' is captured but only decorates the error message; it never changes backoff or model choice
- `packages/functions/src/services/openAi.service.js:56` — TRUNCATION_RETRY_BACKOFF_MS = 300, flat, no jitter — all 3 attempts land inside 17.4s against an 88-minute upstream limit
- `packages/functions/src/services/openAi.service.js:189` — the only delay between attempts, identical for a cap-hit truncation and for a provider rate-limit abort
- `packages/functions/src/services/openAi.service.js:173` — throws CompletionTruncatedError after attempt 3 — the exact error in the alert, at lib/services/openAi.service.js:179 in the deployed bundle
- `packages/functions/src/const/aiModels.js:19` — DEFAULT_TEXT_MODEL = google/gemini-2.5-flash-lite, the model named in all 14 retry warnings
- `packages/functions/src/const/aiModels.js:20` — DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash, the fallback target named in the thrown error
- `packages/functions/src/controllers/genAIBlogController.js:219` — recommendBlogPost's getCompletion call, name 'suggested_recomment_blog' — the name in the alert and in every 14:16 log line
- `packages/functions/src/controllers/genAIBlogController.js:221` — model 'gpt-4.1' is a legacy alias that maps to the Gemini default, so the caller cannot see which vendor it actually depends on
- `packages/functions/src/controllers/genAIBlogController.js:369` — maps CompletionTruncatedError to the observed 503

## Evidence
- 15 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-31T14:01:41.344Z" AND timestamp<="2026-07-31T14:31:41.344Z" AND "temporarily rate-limited upstream"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-31T14:01:41.344Z" AND timestamp<="2026-07-31T14:31:41.344Z" AND "CompletionTruncatedError"`
- 43 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-31T13:00:00Z" AND timestamp<="2026-07-31T14:40:00Z" AND "temporarily rate-limited upstream"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-31T14:01:41.344Z" AND timestamp<="2026-07-31T14:31:41.344Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.04

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
