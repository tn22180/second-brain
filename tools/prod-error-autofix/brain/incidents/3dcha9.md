fingerprint: 3dcha9
service: api
message: [optimizeAltImageByAI] IjyqW3WY1YkA72diIYe5 FetchError: Invalid response body while trying to fetch <https://openrouter.ai/api/v1/chat/completions>: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-10-15T03:04:06.441Z
status: fix_disabled
attempt: 1

# BLOG · api · 3dcha9

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** A transient mid-body TLS reset from openrouter.ai (FetchError: read ECONNRESET raised inside node-fetch's Gunzip, i.e. while the response body was being decompressed, after headers had already arrived) aborted the single vision completion issued by getImageAlt → getCompletion, and nothing on that path retries a transport-level failure, so one alt-text job failed permanently.

**Mechanism.** generateAltTextForImage (fileImageService.js:282, launched fire-and-forget at :266) → optimizeAltImageByAI (:324) → getImageAlt (openAi.service.js:286) → getCompletion (:305) → client.chat.completions.create (:186). The openai client (openrouter/index.js:8) is constructed with no maxRetries override, and the SDK's default retry only wraps the request leg — once a 200 response's headers are in, body decompression happens outside the retry path, so a socket reset during gunzip surfaces as a raw node-fetch FetchError (name='FetchError', code='ECONNRESET'), not an APIConnectionError, and is never reissued. getCompletion's only loop (:182-212) retries on truncation (finish_reason / JSON-parseability of resp), which requires resp to exist; the throw at :186 skips it entirely. getImageAlt rethrows (:309), optimizeAltImageByAI logs then rethrows a flattened `new Error('Failed to optimize alt image by AI')` (:335) which drops error.code so no caller upstream can classify it as retryable, and generateAltTextForImage's catch (:314) writes altTextStatus='failed' for gid://shopify/MediaImage/31746213281877 of shop IjyqW3WY1YkA72diIYe5. The repo already has the right classifier for exactly this code on the Shopify side — RETRYABLE_CODES including 'ECONNRESET' at helpers/api.js:137 — but the OpenRouter path has no equivalent; openrouter/vision.js:61 only treats status 429/5xx as retryable and is not on this call path.

Confidence: `high`

## Code
- `packages/functions/src/services/openAi.service.js:186` — the OpenRouter chat.completions.create call that threw; the surrounding loop retries truncation only, so a transport/body error escapes before resp is assigned
- `packages/functions/src/services/openAi.service.js:305` — getImageAlt's single getCompletion call — no retry, no error classification
- `packages/functions/src/services/openAi.service.js:309` — rethrow after logging '[getImageAlt] ...' — matches the 02:58:02.167651Z log line
- `packages/functions/src/services/openrouter/index.js:8` — OpenAI client built with no maxRetries; SDK default retry covers the request leg only, not a mid-body gunzip failure
- `packages/functions/src/services/fileImageService.js:332` — optimizeAltImageByAI's one-shot call to getImageAlt — the stack frame at lib/services/fileImageService.js:397
- `packages/functions/src/services/fileImageService.js:335` — wraps the FetchError into a bare Error, discarding error.code='ECONNRESET' so no upper layer can retry
- `packages/functions/src/services/fileImageService.js:315` — generateAltTextForImage catch that emitted the second ERROR line and set altTextStatus='failed'
- `packages/functions/src/services/openrouter/vision.js:61` — the only existing OpenRouter retry classifier — status-only (429/5xx), no error-code branch, and not used by the alt-text path
- `packages/functions/src/helpers/api.js:137` — RETRYABLE_CODES already lists ECONNRESET for the Shopify client — the precedent the OpenRouter path is missing

## Evidence
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-15T02:43:03.596Z" AND timestamp<="2026-10-15T03:13:03.596Z" AND jsonPayload.error.code="ECONNRESET"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-15T02:43:03.596Z" AND timestamp<="2026-10-15T03:13:03.596Z" AND jsonPayload.tag="[generateAltTextForImage]"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-14T03:00:00Z" AND timestamp<="2026-10-15T03:13:03Z" AND jsonPayload.tag="[optimizeAltImageByAI]"`
- 100 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-14T03:00:00Z" AND timestamp<="2026-10-15T03:13:03Z" AND jsonPayload.error.name="FetchError"`
- 10 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-15T02:43:03.596Z" AND timestamp<="2026-10-15T03:13:03.596Z" AND textPayload:"Exception from a finished function"`
- 0 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-15T02:43:03.596Z" AND timestamp<="2026-10-15T03:13:03.596Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.28

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
