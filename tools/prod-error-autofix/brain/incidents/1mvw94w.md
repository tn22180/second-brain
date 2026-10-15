fingerprint: 1mvw94w
service: api
message: [generateAltTextForImage] IjyqW3WY1YkA72diIYe5 <gid://shopify/MediaImage/31746213281877> Error: Failed to optimize alt image by AI
app: BLOG
repo: blogs
date: 2026-10-15T03:01:06.100Z
status: fix_disabled
attempt: 1

# BLOG · api · 1mvw94w

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** A single transient mid-body TLS reset from openrouter.ai (read ECONNRESET inside node-fetch's Gunzip, i.e. after response headers) killed one alt-text completion, and nothing on the AI path retries it: getCompletion's retry loop only re-issues on truncated/unparseable output, and the openai client is built with no maxRetries override — and openai v4's retry wraps request dispatch, not response-body read — so the FetchError propagated straight out to generateAltTextForImage and the image was marked altTextStatus:'failed'.

**Mechanism.** 02:58:02.167651Z [getImageAlt] logs 'Invalid response body while trying to fetch https://openrouter.ai/api/v1/chat/completions: read ECONNRESET' with the stack at node-fetch/lib/index.js:400 (Gunzip error) → the await getCompletion({content, format:'json_object'}) at packages/functions/src/services/openAi.service.js:305 rejects; the only retry in getCompletion is the truncation loop at openAi.service.js:182-212, whose retry condition is finish_reason==='length' or unparseable JSON, so a thrown network error from client.chat.completions.create (openAi.service.js:186) escapes the loop on attempt 1 → getImageAlt rethrows (openAi.service.js:309) → optimizeAltImageByAI's catch (fileImageService.js:333-336) logs the real error at 02:58:02.167813Z then throws a new generic Error('Failed to optimize alt image by AI'), which is exactly the alert text → generateAltTextForImage's catch (fileImageService.js:314-321) logs at 02:58:02.167924Z (the alert line, stack lib/fileImageService.js:397/355 = src 335/291) and writes altTextStatus:'failed' for shop IjyqW3WY1YkA72diIYe5 / gid://shopify/MediaImage/31746213281877. No maxRetries/timeout is set on the shared OpenRouter client (openrouter/index.js:8-15), and the repo's existing transient-code retry list (helpers/api.js:138) is used only by the Shopify path, never by the AI path.

Confidence: `high`

## Code
- `packages/functions/src/services/openAi.service.js:186` — the OpenRouter call whose body read was reset; sits inside a loop that only retries truncated output, so a thrown FetchError exits immediately
- `packages/functions/src/services/openAi.service.js:191` — retry predicate is finish_reason==='length' or unparseable JSON only — no transient network-error branch
- `packages/functions/src/services/openAi.service.js:305` — getImageAlt's await getCompletion — the rejection point behind the [getImageAlt] log line
- `packages/functions/src/services/openAi.service.js:309` — getImageAlt rethrows the FetchError unchanged after logging error.message
- `packages/functions/src/services/fileImageService.js:335` — optimizeAltImageByAI replaces the FetchError with a generic Error('Failed to optimize alt image by AI') — the alert message; lib line 397 maps here
- `packages/functions/src/services/fileImageService.js:291` — generateAltTextForImage's await optimizeAltImageByAI — lib line 355 in the alert stack
- `packages/functions/src/services/fileImageService.js:317` — the single failure is persisted as altTextStatus:'failed' with no retry, so one transient reset permanently fails that image
- `packages/functions/src/services/openrouter/index.js:8` — shared OpenAI client constructed with no maxRetries and no timeout; openai v4 retry covers request dispatch, not a mid-body Gunzip reset
- `packages/functions/src/helpers/api.js:138` — existing ECONNRESET transient-retry list used by the Shopify path and not by the AI path — the asymmetry that leaves this call unprotected

## Evidence
- 2 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-10-15T02:43:03.529Z" AND timestamp<="2026-10-15T03:13:03.529Z" AND jsonPayload.message:"openrouter.ai"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-14T03:00:00Z" AND jsonPayload.tag="[generateAltTextForImage]" AND severity>=ERROR`
- 5 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-10-15T02:43:03.529Z" AND timestamp<="2026-10-15T03:13:03.529Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.09

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
