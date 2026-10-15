fingerprint: 19ycxiv
service: api
message: [upload] IjyqW3WY1YkA72diIYe5 Upload file error: RequestError: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-10-15T02:50:43.089Z
status: fix_disabled
attempt: 1

# BLOG · api · 19ycxiv

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** A Shopify Admin GraphQL POST issued by retryGetImageUpload → getMediaImageById died on a single TLS socket reset (got RequestError, code ECONNRESET), and because that call is a bare shopify.graphql with no retry and retryGetImageUpload has no catch, the already-successful file upload was reported to the merchant as a failure.

**Mechanism.** Execution 8xtc91oor2sp logged `[upload] IjyqW3WY1YkA72diIYe5 Upload file error: RequestError: read ECONNRESET` with jsonPayload.error.name=RequestError and code=ECONNRESET — an unwrapped got error. The `[upload]` tag pins it to the catch in shopifyController.js:229, i.e. inside upload()'s try block. All three upload services inside that block mutate or log the error before it reaches that catch: handleUploadFile rethrows `File upload failed: <msg>` after logging tag `[handleUploadFile]` (shopifyGraphQlService.js:213), handleUploadPdfFile rethrows `PDF upload failed:` after logging `[handleUploadPdfFile]`, handleUploadVideo rethrows raw but logs `[handleUploadVideo]` first. A 24h read (2026-10-14T03:00Z→2026-10-15T03:01Z) over all four tags returned exactly one entry — the `[upload]` one — zero of the three wrapper tags, and the message carries no `File upload failed:` prefix. The only remaining got call in that try block is shopifyController.js:200, `retryGetImageUpload({id: file.id, shopify})` → getMediaImageById (shopifyGraphQlService.js:344), a bare `shopify.graphql` POST. shopify-api-node 3.15.0 routes graphql through got as POST, which is not in got's idempotent retry method set, so the reset is a single-attempt failure; retryGetImageUpload (shopifyController.js:242) only loops on a missing `image` field and has no try/catch, so the RequestError propagates straight out. Ordering matters: line 199 already finished, so Shopify holds the created file while the merchant's editor receives `{success: false, error: 'read ECONNRESET'}` from line 230. The same window shows 6 `Exception from a finished function: Error: read ECONNRESET` entries on 6 other execution_ids (8x7bch2c23b5, 8xm7086nqk2y, 8xqmvt6iinz6, 8xsodjz0nuns, 8xv37a9a4679, 8xwtffcru9ln) — none is 8xtc91oor2sp, so they are co-occurring network instability on revision api-00190-lub, not this alert's execution.

Confidence: `medium`

## Code
- `packages/functions/src/controllers/shopifyController.js:200` — the only unwrapped got/shopify.graphql call path inside upload()'s try block — retryGetImageUpload, reached after the file was already created at line 199
- `packages/functions/src/controllers/shopifyController.js:229` — the catch that emitted the alert's `[upload] ... Upload file error:` line, with the raw RequestError as-is
- `packages/functions/src/controllers/shopifyController.js:230` — merchant-visible result: success:false with the raw socket error string, despite the Shopify file existing
- `packages/functions/src/controllers/shopifyController.js:242` — retryGetImageUpload has no try/catch and only retries on a missing image field, so a transport error escapes instead of being retried
- `packages/functions/src/services/shopifyGraphQlService.js:344` — getMediaImageById issues a bare shopify.graphql POST — no retry wrapper, got does not auto-retry POST on ECONNRESET
- `packages/functions/src/services/shopifyGraphQlService.js:213` — handleUploadFile would have prefixed the message with `File upload failed:` and logged tag [handleUploadFile]; neither appears, ruling this path out
- `packages/functions/src/helpers/api.js:138` — ECONNRESET is already in RETRYABLE_CODES for the makeGraphQlApi/shopifyRetryGraphQL path — the retry policy this call path bypasses

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-15T02:31:52Z" AND timestamp<="2026-10-15T03:01:52Z" AND jsonPayload.tag="[upload]" AND jsonPayload.error.code="ECONNRESET"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-14T03:00:00Z" AND timestamp<="2026-10-15T03:01:52Z" AND (jsonPayload.tag="[upload]" OR jsonPayload.tag="[handleUploadFile]" OR jsonPayload.tag="[handleUploadVideo]" OR jsonPayload.tag="[handleUploadPdfFile]")`
- 6 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-15T02:31:52Z" AND timestamp<="2026-10-15T03:01:52Z" AND textPayload:"Exception from a finished function: Error: read ECONNRESET"`
- 0 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-10-15T02:31:52.376Z" AND timestamp<="2026-10-15T03:01:52.376Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.25

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
