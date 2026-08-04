fingerprint: 1r6hbdn
service: api
message: [translateWithRetry] Translation attempt 1 failed: Model output truncated before completion (finish_reason=error) for model google/gemini-2.5-flash; retried 2x (partial content length 14); provider reason: google/gemini-2.5-flash is temporarily rate-limited upstream. Please retry shortly, or add you
app: BLOG
repo: blogs
date: 2026-08-03T15:13:43.424Z
status: mr_open
attempt: 1

# BLOG · api · 1r6hbdn

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/829

**Root cause.** During an OpenRouter rate-limit window on Google's Gemini SKUs, one translation chunk exhausted getCompletion's 2 truncation retries plus its last-attempt fallback to google/gemini-2.5-flash and threw CompletionTruncatedError; translateWithRetry logged that non-final attempt at logger.error (severity ERROR) even though its own retry loop then succeeded, so the Slack sink fired on a transient that self-healed.

**Mechanism.** translateContent splits article content into <=800-char chunks and runs 20 concurrently (translation.config.js CONCURRENCY.chunks_per_batch), each calling getCompletion({format:'json_object'}) with model 'gpt-4.1' -> LEGACY_MODEL_MAP -> google/gemini-2.5-flash-lite (openAi.service.js:28, const/aiModels.js DEFAULT_TEXT_MODEL). OpenRouter answered HTTP 200 with an aborted generation (finish_reason=error, provider reason 'google/gemini-2.5-flash-lite is temporarily rate-limited upstream'), so isJsonCompletionIncomplete flagged the partial body and getCompletion retried twice (33 such WARNING lines in the 30-min window, 93 in 10h). On the 3rd attempt it switched to DEFAULT_PRO_TEXT_MODEL google/gemini-2.5-flash (openAi.service.js:162), which was rate-limited too (partial content length 14), so it threw CompletionTruncatedError (openAi.service.js:173). translateWithRetry's catch fires logger.error at translation.service.js:157 BEFORE checking retryCount < max_attempts (=3) at :159, so a recoverable attempt is emitted at severity ERROR. The retry at attempt 2 succeeded: over 06:00-16:00Z there is exactly ONE [translateWithRetry] line and zero [getTranslatedArticle]/[translateContent] lines, and the window has zero httpRequest 5xx entries — no merchant-visible failure, only a false alert.

Confidence: `high`

## Code
- `packages/functions/src/services/translation.service.js:157` — logger.error fires on every attempt, including non-final retryable ones — this is the line that emitted the alert
- `packages/functions/src/services/translation.service.js:159` — the retry branch sits AFTER the error log, so the log cannot know whether the failure was final
- `packages/functions/src/services/openAi.service.js:173` — CompletionTruncatedError thrown after MAX_TRUNCATION_RETRIES — the error text quoted in the alert
- `packages/functions/src/services/openAi.service.js:162` — last-attempt fallback to DEFAULT_PRO_TEXT_MODEL explains why the alert names google/gemini-2.5-flash while the warns name gemini-2.5-flash-lite
- `packages/functions/src/config/translation.config.js:12` — max_attempts: 3 — attempt 1 failing is 1 of 4 tries, not a failure of the operation

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-03T06:00:00Z" AND timestamp<="2026-08-03T16:00:00Z" AND (jsonPayload.tag="[translateWithRetry]" OR jsonPayload.tag="[getTranslatedArticle]" OR jsonPayload.tag="[translateContent]")`
- 33 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-03T14:43:57.156Z" AND timestamp<="2026-08-03T15:13:57.156Z" AND jsonPayload.tag="[getCompletion]" AND jsonPayload.message:"json_object output truncated"`
- 93 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-03T06:00:00Z" AND timestamp<="2026-08-03T16:00:00Z" AND jsonPayload.tag="[getCompletion]" AND jsonPayload.message:"temporarily rate-limited upstream"`

## Job
- analyze rounds: 2
- cost: $4.05
- branch: `fix/prod-blog-1r6hbdn`
- fix commit: `5eb091a34b4fe82d282df5f70a48c09db0cd01ac`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/829
- tests: 270 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
packages/functions/src/services/translation.service.js | 11 +++++++++--
 1 file changed, 9 insertions(+), 2 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
