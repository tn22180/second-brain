fingerprint: chye57
service: api
message: [translateWithRetry] Translation attempt 1 failed: Bad control character in string literal in JSON at position 621 (line 3 column 605)
app: BLOG
repo: blogs
date: 2026-08-22T04:49:21.899Z
status: fix_disabled
attempt: 1

# BLOG · api · chye57

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** translation.service.js:154 re-parses getCompletion's return value with bare JSON.parse, but getCompletion returns the raw unrepaired model output — so a gemini-2.5-flash-lite completion carrying an unescaped 0x0A inside a JSON string value throws "Bad control character in string literal" in the caller even though getCompletion had already parsed that same payload successfully via safeParseJsonCompletion.

**Mechanism.** google/gemini-2.5-flash-lite answered the translate prompt with a raw newline inside the "value" string (error names line 3 column 605, i.e. inside the pretty-printed content.value of the returned JSON). Inside getCompletion, isJsonCompletionIncomplete (openAi.service.js:80-88) calls safeParseJsonCompletion, whose first JSON.parse throws and whose escapeControlCharsInJsonStrings repair then succeeds — so the payload is judged NOT truncated and the loop breaks (openAi.service.js:170). getCompletion then discards the repaired object and returns stripMarkdownFence(rawContent), the still-broken string (openAi.service.js:199,201). translateWithRetry does `JSON.parse(translated)` at translation.service.js:154 with no repair, throws the exact V8 message in the alert, is caught at :156 and logged at logger.error (:157) before the retry check at :159. RETRY.max_attempts=3, so it re-issued the chunk and attempt 2 succeeded — no "Translation attempt 2 failed", no "Translation failed after", no [translateContent] error, and 0 request-log entries with status>=500 in the window. Merchant-invisible; cost is one wasted AI call plus an ERROR-severity line that reaches the prod-error-alerts sink.

Confidence: `high`

## Code
- `packages/functions/src/services/translation.service.js:154` — bare JSON.parse of the completion — the throw site producing the alerted message
- `packages/functions/src/services/translation.service.js:157` — logger.error fires on every attempt, before the retryCount check at :159 decides the failure is recoverable
- `packages/functions/src/services/openAi.service.js:199` — returns stripMarkdownFence(rawContent) — the unrepaired string, not the object safeParseJsonCompletion already produced
- `packages/functions/src/services/openAi.service.js:83` — safeParseJsonCompletion is invoked only as a truncation probe; its repaired result is thrown away
- `packages/functions/src/services/openrouter/safeParseJsonCompletion.js:50` — the repair parser that already handles exactly this control-character case, documented against google/gemini-2.5-flash at line 1
- `packages/functions/src/config/translation.config.js:12` — max_attempts: 3 — why attempt 2 recovered and no terminal error was logged

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-20T15:55:14.026Z" AND timestamp<="2026-08-20T16:25:14.026Z" AND jsonPayload.message:"Bad control character in string literal"`
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-20T15:55:14.026Z" AND timestamp<="2026-08-20T16:25:14.026Z" AND jsonPayload.tag="[translateWithRetry]"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-20T15:55:14.026Z" AND timestamp<="2026-08-20T16:25:14.026Z" AND jsonPayload.tag="[getCompletion]"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-19T00:00:00Z" AND timestamp<="2026-08-21T00:00:00Z" AND jsonPayload.message:"Bad control character in string literal"`

## Job
- analyze rounds: 1
- cost: $1.71

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
