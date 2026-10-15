fingerprint: fu73qv
service: api
message: [getImageAlt] Invalid response body while trying to fetch <https://openrouter.ai/api/v1/chat/completions>: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-10-15T03:07:17.073Z
status: fix_disabled
attempt: 1

# BLOG · api · fu73qv

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint 3dcha9 — same app, service, revision api-00190-lub and the SAME execution (execution_id 8y83q2ppj17j, 2026-10-15T02:58:02.167Z): one transient mid-body TLS reset from openrouter.ai (FetchError code=ECONNRESET raised inside node-fetch's Gunzip, i.e. after response headers arrived) aborted the single vision completion issued by getImageAlt → getCompletion, and nothing on that path retries a transport-level failure, so one alt-text job failed permanently. This alert fired on the [getImageAlt] line of that same throw; 3dcha9 fired on the [optimizeAltImageByAI] line 162µs later.

**Mechanism.** generateAltTextForImage (fileImageService.js:282, launched fire-and-forget at :266) → optimizeAltImageByAI (:324) → getImageAlt (openAi.service.js:286) → getCompletion (:305) → client.chat.completions.create (:186). getImageAlt passes a vision parts array as `content`, so the ollamaRoute branch at :113 is skipped and the client is the OpenRouter one from openrouter/index.js:8, constructed with no maxRetries override; the OpenAI SDK's default retry only wraps the request leg, so a socket reset during gunzip of an already-200 response surfaces as a raw node-fetch FetchError (name='FetchError', code='ECONNRESET'), not an APIConnectionError, and is never reissued. getCompletion's only loop (:182-212) retries truncation, which needs `resp` to be assigned — the throw at :186 skips the loop body entirely. getImageAlt logs error.message at :308 (the exact alert text) and rethrows at :309; optimizeAltImageByAI logs at :334 then throws a flattened `new Error('Failed to optimize alt image by AI')` at :335, discarding error.code so no caller upstream can classify it as retryable; generateAltTextForImage's catch (:315) writes altTextStatus='failed' for gid://shopify/MediaImage/31746213281877 of shop IjyqW3WY1YkA72diIYe5. The repo already has the right classifier for exactly this code on the Shopify side — RETRYABLE_CODES listing 'ECONNRESET' at helpers/api.js:138, consumed at :165 — but the OpenRouter path has no equivalent; openrouter/vision.js:61 only treats status 429/5xx as retryable and is not on this call path. Window context: 3 ECONNRESET-coded app errors and 12 'Exception from a finished function: Error: read ECONNRESET' on the same revision, i.e. a fleet-wide transient egress reset burst — but only the OpenRouter leg had no retry, so only it failed permanently.

Confidence: `high`

## Code
- `packages/functions/src/services/openAi.service.js:186` — the OpenRouter chat.completions.create call that threw; the surrounding loop retries truncation only, so a transport/body error escapes before resp is assigned
- `packages/functions/src/services/openAi.service.js:305` — getImageAlt's single getCompletion call — no retry, no error classification
- `packages/functions/src/services/openAi.service.js:308` — logger.error('[getImageAlt]', error.message) — produces the exact alert text at 02:58:02.167651Z
- `packages/functions/src/services/openAi.service.js:309` — rethrow with no classification, so the transport error propagates as a hard failure
- `packages/functions/src/services/openrouter/index.js:8` — OpenAI client built with no maxRetries; SDK default retry covers the request leg only, not a mid-body gunzip failure
- `packages/functions/src/services/fileImageService.js:332` — optimizeAltImageByAI's one-shot call to getImageAlt — the stack frame reported as lib/services/fileImageService.js:397
- `packages/functions/src/services/fileImageService.js:335` — wraps the FetchError into a bare Error, discarding error.code='ECONNRESET' so no upper layer can retry
- `packages/functions/src/services/fileImageService.js:315` — generateAltTextForImage catch that emitted the 02:58:02.167924Z ERROR line and set altTextStatus='failed'
- `packages/functions/src/services/fileImageService.js:266` — fire-and-forget launch — the failure has no HTTP request attached, which is why requests=0 for this window
- `packages/functions/src/services/openrouter/vision.js:61` — the only existing OpenRouter retry classifier — status-only (429/5xx), no error-code branch, and not used by the alt-text path
- `packages/functions/src/helpers/api.js:138` — RETRYABLE_CODES already lists ECONNRESET for the Shopify got client — the precedent the OpenRouter path is missing

## Evidence
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-15T02:43:03.607Z" AND timestamp<="2026-10-15T03:13:03.607Z" AND labels.execution_id="8y83q2ppj17j"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-15T02:43:03.607Z" AND timestamp<="2026-10-15T03:13:03.607Z" AND jsonPayload.tag="[getImageAlt]"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-14T03:00:00Z" AND timestamp<="2026-10-15T03:13:03Z" AND jsonPayload.tag="[getImageAlt]"`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-15T02:43:03.607Z" AND timestamp<="2026-10-15T03:13:03.607Z" AND jsonPayload.error.code="ECONNRESET"`
- 12 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-15T02:43:03.607Z" AND timestamp<="2026-10-15T03:13:03.607Z" AND textPayload:"Exception from a finished function"`

## Job
- analyze rounds: 1
- cost: $1.16

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
