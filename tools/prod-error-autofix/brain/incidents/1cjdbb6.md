fingerprint: 1cjdbb6
service: api
message: [translateWithRetry] Translation attempt 1 failed: Model output truncated before completion (finish_reason=stop) for model google/gemini-2.5-flash-lite; retried 2x (partial content length 943)
app: BLOG
repo: blogs
date: 2026-08-22T04:46:53.179Z
status: fix_disabled
attempt: 1

# BLOG · api · 1cjdbb6

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** translateWithRetry logs every failed attempt at logger.error before it checks whether a retry remains, so the transient chunk failures at 16:09:58Z and 16:10:11Z — both of which the retry loop then recovered from — were emitted at severity ERROR and fired the Slack sink even though no request failed.

**Mechanism.** articleController.update -> getTranslatedArticle (articlesHelper.js:242) -> translateContent splits the article into 800-char chunks (translation.config.js CONTENT_LIMITS) and runs up to 20 concurrently, each calling translateWithRetry. Two chunks in one request (execution_id 1puqy56j34sk, spanId 1317673144293962149) failed their FIRST attempt for two different transient reasons: (a) 16:09:55.00Z and 16:09:56.56Z getCompletion logged 'json_object output truncated (finish_reason=stop), retry 1/2 and 2/2' — openAi.service.js:169 flags a JSON payload that will not parse regardless of finish_reason — then threw CompletionTruncatedError at openAi.service.js:173, which is the exact alert text; (b) the second chunk got past getCompletion and died in translateWithRetry's own bare JSON.parse(translated) at translation.service.js:154 with 'Bad control character in string literal in JSON at position 621' — a latent second defect: getCompletion validates parseability with safeParseJsonCompletion, which REPAIRS raw control chars (safeParseJsonCompletion.js:55), but then returns the unrepaired stripMarkdownFence(rawContent) at openAi.service.js:199, so the caller re-parses with bare JSON.parse and dies on precisely the error the validator had just repaired. In both cases translation.service.js:157 fires logger.error BEFORE the `retryCount < max_attempts` branch at :159 (max_attempts 3, so attempt 1 is 1 of 4 tries), and both retries succeeded: over 2026-08-20T06:00-18:00Z there are exactly 2 [translateWithRetry] lines and ZERO [translateContent] / [getTranslatedArticle] error lines, and the alert window has zero httpRequest entries with status>=400. No merchant-visible failure — an alert on a transient that self-healed. Same defect and same line as recorded incident 1r6hbdn; its fix commit 5eb091a34 exists only on branch fix/prod-blog-1r6hbdn (MR 829), not on master (HEAD 0c2482b28), so the alert recurred.

Confidence: `high`

## Code
- `packages/functions/src/services/translation.service.js:157` — logger.error fires on every attempt including non-final retryable ones — the line that emitted this alert
- `packages/functions/src/services/translation.service.js:159` — the retry branch sits AFTER the error log, so the log cannot know the failure was recoverable
- `packages/functions/src/config/translation.config.js:12` — max_attempts: 3 — 'attempt 1 failed' is 1 of 4 tries, not a failure of the operation
- `packages/functions/src/services/openAi.service.js:173` — CompletionTruncatedError thrown after MAX_TRUNCATION_RETRIES — the exact message quoted in the alert
- `packages/functions/src/services/openAi.service.js:169` — truncation flagged by JSON-parseability, which is why the alert says finish_reason=stop rather than length
- `packages/functions/src/services/translation.service.js:154` — bare JSON.parse on the completion — source of the second failure 'Bad control character in string literal in JSON at position 621'
- `packages/functions/src/services/openAi.service.js:83` — getCompletion validates with safeParseJsonCompletion, which repairs raw control chars
- `packages/functions/src/services/openAi.service.js:199` — but returns the UNREPAIRED raw content, so the caller's JSON.parse still hits the control char the validator fixed
- `packages/functions/src/services/openrouter/safeParseJsonCompletion.js:55` — the repair path that would have parsed the second chunk successfully

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-20T06:00:00Z" AND timestamp<="2026-08-20T18:00:00Z" AND (jsonPayload.tag="[translateWithRetry]" OR jsonPayload.tag="[translateContent]" OR jsonPayload.tag="[getTranslatedArticle]")`
- 5 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-20T06:00:00Z" AND timestamp<="2026-08-20T18:00:00Z" AND jsonPayload.tag="[getCompletion]" AND jsonPayload.message:"output truncated"`
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-08-20T15:55:01.141Z" AND timestamp<="2026-08-20T16:25:01.141Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.65

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
