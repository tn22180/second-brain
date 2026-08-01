fingerprint: 10ydl1h
service: api
message: [genSuggested] kHaMBG9NlTv1MucqsHED Error genSuggested CompletionTruncatedError: Model output truncated before completion (finish_reason=error) for model google/gemini-2.5-flash on suggested_outline; retried 2x (partial content length 650); provider reason: google/gemini-2.5-flash is temporarily rat
app: BLOG
repo: blogs
date: 2026-07-31T14:55:07.014Z
status: deferred
attempt: 1

# BLOG · api · 10ydl1h

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** OpenRouter rate-limited the whole google/gemini-2.5 family upstream for ~23 minutes and returned it in-band as finish_reason='error' with partial content; getCompletion treats that as truncation, retries twice at a fixed 300ms backoff and then falls back to google/gemini-2.5-flash — another model in the same rate-limited pool — so 2 of the /api/gen-ai-suggested calls exhausted all three attempts and became HTTP 503.

**Mechanism.** genSuggested calls getCompletion with legacy model 'gpt-4.1', which resolveModel maps to DEFAULT_TEXT_MODEL = google/gemini-2.5-flash-lite (const/aiModels.js:19). OpenRouter answers HTTP 200 with finish_reason='error', partial content, and error.message 'google/gemini-2.5-flash-lite is temporarily rate-limited upstream'. isJsonCompletionIncomplete flags the partial body, so the loop at openAi.service.js:160 retries — 300ms fixed, no jitter (openAi.service.js:56,189), which lands inside the same rate-limit window. On the third attempt the finishReason==='error' branch swaps to DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash (openAi.service.js:161-162, aiModels.js:20), a sibling Google model behind the same upstream quota; it is rate-limited too, so the loop throws CompletionTruncatedError naming google/gemini-2.5-flash (openAi.service.js:173). genAIBlogController.js:368 maps that to ctx.status = 503. Counted over the 30-min window: 19 rate-limited aborts, every warn line on gemini-2.5-flash-lite, spread across suggested_recomment_blog (10), suggested_outline (4), suggested_main_keywords (2), suggested_secondary_keywords (1) — one cause, four prompt names, one handler. 17 of 19 recovered on retry; the 2 that did not are exactly the 2 x 503 request logs (11.61s POST /api/gen-ai-suggested/suggested-outline, 15.96s POST /api/gen-ai-suggested/recommendBlogPost). providerReason is already captured at openAi.service.js:167 but never branched on: a 429-class rate limit is retried identically to a random provider abort, and the fallback model is chosen without regard to which provider is throttled.

Confidence: `high`

## Code
- `packages/functions/src/services/openAi.service.js:162` — fallback goes to DEFAULT_PRO_TEXT_MODEL = google/gemini-2.5-flash, same rate-limited Google pool as flash-lite — the throw names this model, so the fallback itself was throttled
- `packages/functions/src/services/openAi.service.js:56` — TRUNCATION_RETRY_BACKOFF_MS = 300, fixed, no jitter and no escalation — all three attempts land inside the same rate-limit window
- `packages/functions/src/services/openAi.service.js:167` — providerReason ('...temporarily rate-limited upstream') is captured but never used to branch retry strategy
- `packages/functions/src/services/openAi.service.js:173` — throws CompletionTruncatedError after the third attempt — the alerted error
- `packages/functions/src/services/openAi.service.js:55` — MAX_TRUNCATION_RETRIES = 2, giving 3 attempts across ~600ms of backoff against a multi-minute upstream throttle
- `packages/functions/src/const/aiModels.js:19` — DEFAULT_TEXT_MODEL = gemini-2.5-flash-lite — the model in all 17 logged aborts
- `packages/functions/src/const/aiModels.js:20` — DEFAULT_PRO_TEXT_MODEL = gemini-2.5-flash — same vendor family, so the fallback shares the throttle
- `packages/functions/src/const/aiModels.js:16` — OPENROUTER_DEEPSEEK_V3_1 already declared as a backup text model — a non-Google fallback exists and is unused
- `packages/functions/src/controllers/genAIBlogController.js:368` — CompletionTruncatedError mapped to HTTP 503, matching the 2 x 503 request logs
- `packages/functions/src/controllers/genAIBlogController.js:366` — the catch that logs '[genSuggested] ... Error genSuggested' — the exact alert text

## Evidence
- 19 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T13:14:46.526Z" AND timestamp<="2026-07-31T13:44:46.526Z" AND jsonPayload.message:"temporarily rate-limited upstream"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T13:14:46.526Z" AND timestamp<="2026-07-31T13:44:46.526Z" AND jsonPayload.error.name="CompletionTruncatedError"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T13:14:46.526Z" AND timestamp<="2026-07-31T13:44:46.526Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T13:14:46.526Z" AND timestamp<="2026-07-31T13:44:46.526Z" AND httpRequest.requestUrl:"/api/gen-ai-suggested/"`
- 19 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T13:44:46Z" AND timestamp<="2026-07-31T13:44:46.526Z" AND jsonPayload.message:"temporarily rate-limited upstream"`

## Job
- analyze rounds: 1
- cost: $0.95

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
