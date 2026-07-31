fingerprint: 1hjewuf
service: api
message: HTTP 503 POST /api/gen-ai-suggested/blog-post-idea-outline
app: BLOG
repo: blogs
date: 2026-07-31T10:17:23.438Z
status: inconclusive
attempt: 2

# BLOG · api · 1hjewuf

**Outcome.** fix blocked at agent_failed

**Root cause.** OpenRouter's provider for google/gemini-2.5-flash-lite aborts generation mid-output with finish_reason='error' on /api/gen-ai-suggested/*, and getCompletion's single same-model retry (MAX_TRUNCATION_RETRIES=1) is not enough to survive it, so it throws CompletionTruncatedError and genSuggested answers 503. This is the same cause already recorded as fingerprint 1xisexs, whose fix is open but undeployed as MR https://gitlab.com/avada/blogs/-/merge_requests/809.

**Mechanism.** genSuggested case 'blog-post-idea-outline' (genAIBlogController.js:316) calls complete({model:'gpt-4.1', format:'json_object', name:'suggested_outline'}) — resolveModel maps 'gpt-4.1' to DEFAULT_TEXT_MODEL = google/gemini-2.5-flash-lite (const/aiModels.js:19). OpenRouter returns a half-written JSON body with finish_reason='error' (not 'length'), which the guard from MR 804 catches via isJsonCompletionIncomplete, logs '[getCompletion] ... output truncated (finish_reason=error), retry 1/1', and re-issues once against the same model with no backoff (openAi.service.js:55, MAX_TRUNCATION_RETRIES=1). When the second attempt aborts too, openAi.service.js:161 throws CompletionTruncatedError; genAIBlogController.js:368-370 maps that class specifically to ctx.status = 503 with retryable:true, which is exactly the alert text. Pairing is 1:1 and exact: 503 at 09:45:20.601 (2.76s) → CompletionTruncatedError at 09:45:23.363 on suggested_outline (partial content 129 chars); 503 at 09:38:22.969 (2.99s) → 09:38:25.960 on suggested_recomment_blog (318 chars); 503 at 09:33:42.124 (1.86s) → 09:33:43.989 on suggested_outline (76 chars). All 3 of 3 gen-ai-suggested 503s in the 24h window are accounted for, and all 3 are the alerting fingerprint. The base rate is visible in the retry warnings: 10 provider aborts in the 30-minute window, every one of them finish_reason=error and zero finish_reason=length, so the output cap is not involved — 7 of 10 recovered on the single retry, 3 exhausted it and became 503s. Partial content of 76-318 chars means the abort lands very early in generation, not at any cap. Latency 1.86-2.99s is far under the 30s client timeout, so the cut is upstream. Distinct from the other 18 5xx in the same window, which are 504s at 539.947s against the function's own timeoutSeconds: 540 on /api/article* and are a separate cause, not this fingerprint.

Confidence: `high`

## Code
- `packages/functions/src/services/openAi.service.js:161` — throw new CompletionTruncatedError — the exact frame in the prod stack (lib/services/openAi.service.js:161:13)
- `packages/functions/src/services/openAi.service.js:55` — MAX_TRUNCATION_RETRIES = 1 — one same-model retry, no backoff, no provider/model fallback; too few for a transient provider abort
- `packages/functions/src/services/openAi.service.js:157` — truncation predicate catches the finish_reason='error' half-document via isJsonCompletionIncomplete, which is why these surface as CompletionTruncatedError and not SyntaxError
- `packages/functions/src/controllers/genAIBlogController.js:369` — ctx.status = 503 for CompletionTruncatedError — the 503 in the alert is deliberate, emitted here, not a Cloud Run capacity 503
- `packages/functions/src/controllers/genAIBlogController.js:316` — case 'blog-post-idea-outline' — the alerting endpoint; prod stack lib/controllers/genAIBlogController.js:338:33
- `packages/functions/src/controllers/genAIBlogController.js:367` — the '[genSuggested] ... Error genSuggested' line that carries CompletionTruncatedError in the errors read
- `packages/functions/src/const/aiModels.js:19` — DEFAULT_TEXT_MODEL = OPENROUTER_GEMINI_2_5_FLASH_LITE — the model named in every abort message

## Evidence
- 3 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-31T09:18:45.296Z" AND timestamp<="2026-07-31T09:48:45.296Z" AND jsonPayload.message:"CompletionTruncatedError"`
- 10 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-30T10:00:00Z" AND timestamp<="2026-07-31T09:48:45Z" AND jsonPayload.message:"output truncated (finish_reason="`
- 3 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-30T10:00:00Z" AND timestamp<="2026-07-31T09:48:45Z" AND httpRequest.status=503 AND httpRequest.requestUrl:"gen-ai-suggested"`
- 21 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-31T09:18:45.296Z" AND timestamp<="2026-07-31T09:48:45.296Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.07

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
