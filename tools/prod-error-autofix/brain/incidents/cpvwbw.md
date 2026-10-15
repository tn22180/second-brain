fingerprint: cpvwbw
service: api
message: [translateWithRetry] Translation attempt 1 failed: Translation timeout
app: BLOG
repo: blogs
date: 2026-10-14T14:06:56.551Z
status: fix_disabled
attempt: 1

# BLOG · api · cpvwbw

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The 40 000 ms per_chunk deadline that translateWithRetry enforces with Promise.race is smaller than the worst case of the call it races (getCompletion loops up to 3× over client.chat.completions.create with {timeout: 30000} on an OpenAI client with the SDK default maxRetries=2), so one ordinary slow OpenRouter completion loses the race and is logged at severity ERROR even though the retry recovers and the HTTP request returns 200.

**Mechanism.** 14:01:23.788 GET /api/article/616692121781?language=Vietnamese&locale=vi&sections=body_html,title,summary_html,meta_title,meta_description&switchLanguage=false → articleController → getTranslatedArticle maps the 5 sections concurrently, each calling translateContent (articlesHelper.js:272). body_html exceeds CONTENT_LIMITS 800 so splitContent produces chunks run in batches of 20. One chunk's getCompletion had not resolved 40 000 ms after request start, so the Promise.race leg at translation.service.js:146 rejected with new Error('Translation timeout') at 14:02:04.441 — request start + 40.65 s, matching TIMEOUTS.per_chunk = 40000 (translation.config.js:8). The catch logs it through logger.error (translation.service.js:157), which on this app emits severity ERROR, so the prod-error-alerts sink matched it and fired Slack. The recursive retry at translation.service.js:165 then succeeded: in 7 days of logs there is no 'attempt 2 failed', no 'Translation failed after 4 attempts', and no [translateContent]/[getTranslatedArticle] entry. The same request hit the same 40 s wall once more on its next batch at 14:02:47.882 and still completed 200 after 95.758820784 s; the following 14:03:00.362 call also returned 200 after 74.316123266 s, and requests with httpRequest.status>=500 in the window is 0. Why a 'timed out' chunk still costs a full completion and a 95 s request: the AbortController built at translation.service.js:103-104 is never handed to getCompletion (no signal parameter exists on it), so the race only abandons the promise while the OpenRouter HTTP call keeps running and billing, and clearTimeout(timeoutId) at translation.service.js:152 is unreachable on the timeout path, leaving a 40 s timer holding the instance. Merchant-visible tail, measured not proven: a second identical GET fired exactly 60.000 s after each slow one (14:02:23.771 and 14:04:00.371) and was rejected 401 in ~5 ms, which is the shape of a Shopify session token minted at t0 being replayed past its 60 s life.

Confidence: `high`

## Code
- `packages/functions/src/services/translation.service.js:146` — the Promise.race leg that rejects with the alerted message 'Translation timeout'
- `packages/functions/src/config/translation.config.js:8` — TIMEOUTS.per_chunk = 40000 — the 40.65 s gap between request start and the ERROR line
- `packages/functions/src/services/translation.service.js:157` — logger.error on a retryable attempt; blogs' logger emits severity ERROR, so the sink alerts on a self-healed failure
- `packages/functions/src/services/translation.service.js:165` — recursive retry that recovered — proves the 200 outcome, and why no 'attempt 2 failed' exists
- `packages/functions/src/services/translation.service.js:104` — AbortController abort timer created but controller.signal is never passed to getCompletion, so the deadline cancels nothing
- `packages/functions/src/services/openAi.service.js:186` — client.chat.completions.create({timeout: 30000}) inside a loop of MAX_TRUNCATION_RETRIES+1 = 3 attempts — inner worst case far exceeds the caller's 40 s
- `packages/functions/src/services/openrouter/index.js:8` — new OpenAI(...) sets no maxRetries, so the SDK default of 2 retries makes one create() call alone reach ~90 s
- `packages/functions/src/helpers/articlesHelper.js:272` — the switchLanguage==='false' branch that puts the alerted request on translateContent

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND jsonPayload.tag="[translateWithRetry]" AND timestamp>="2026-10-07T00:00:00Z"`
- 4 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"switchLanguage=false" AND timestamp>="2026-10-14T14:00:00Z" AND timestamp<="2026-10-14T14:10:00Z"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-10-14T13:47:06.078Z" AND timestamp<="2026-10-14T14:17:06.078Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.27

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
