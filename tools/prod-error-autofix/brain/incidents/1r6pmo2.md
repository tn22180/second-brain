fingerprint: 1r6pmo2
service: apiv2
message: [handleUploadFile] VwAcC7QWUxrBlExv4uEX Upload file error FetchError: request to <https://shopify-staged-uploads.storage.googleapis.com/> failed, reason: Client network socket disconnected before secure TLS connection was established
app: BLOG
repo: blogs
date: 2026-10-08T04:31:33.773Z
status: fix_disabled
attempt: 1

# BLOG · apiv2 · 1r6pmo2

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The staged-upload POST in handleUploadFile has no retry and no timeout, so one transient TLS handshake failure against shopify-staged-uploads.storage.googleapis.com (FetchError: Client network socket disconnected before secure TLS connection was established) aborted the whole featured-image upload for shop VwAcC7QWUxrBlExv4uEX — the same no-retry defect already recorded as fingerprints 1syz298 and 1e7h4we (both fix_disabled), now reached from the LangGraph featured-image path on apiv2 instead of the /upload controller on api.

**Mechanism.** LangGraphService builds createFeaturedImageNode; the node calls generateHeroImage → processImageUpload (packages/functions/src/services/imageGeneration.service.js:49) → handleUploadFile. handleUploadFile gets a stagedUploadsCreate target from Shopify, then POSTs the multipart form to that GCS URL with a bare `await fetch` at packages/functions/src/services/shopifyGraphQlService.js:138 — no retry, no timeout, no network-error handling. node-fetch's TLSSocket error listener rejected that promise with `FetchError: request to https://shopify-staged-uploads.storage.googleapis.com/ failed, reason: Client network socket disconnected before secure TLS connection was established` (stack frame node-fetch/lib/index.js:1501, matching the alert verbatim). Because the rejection comes from `fetch` itself, the `!uploadResponse.ok` branch at :147 is never reached; control goes straight to the catch at :212, which logged the 01:04:53.766789Z ERROR `[handleUploadFile] VwAcC7QWUxrBlExv4uEX Upload file error` and re-threw as `File upload failed: ${error.message}` (:213). createFeaturedImageNode's catch at packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:103 logged the second ERROR 234ms later (01:04:54.000941Z, stack `at handleUploadFile (/workspace/lib/services/shopifyGraphQlService.js:254:11)` = the re-throw in src), emitted `{status:'error'}` on the SSE stream and returned the text-only `fallback` brief, so the article shipped with no hero image and the HTTP response stayed 200 — which is why the requests read (httpRequest.status>=500) is empty. The defect is the asymmetry inside the same function: the inner createFile step retries 3× (:194, :203) while the one step that actually failed retries 0×. The second staged-upload POST at :2135 carries the identical defect.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:138` — The staged-upload POST that failed — bare `await fetch(urlString, {method:'POST', body: form, ...})`, no retry, no timeout, no network-error handling.
- `packages/functions/src/services/shopifyGraphQlService.js:147` — Proof the failure was transport-level, not a non-2xx response: a FetchError rejection from :138 skips this `!uploadResponse.ok` branch entirely, which is why the message carries no `Upload failed: <body>` prefix unlike incident 1syz298.
- `packages/functions/src/services/shopifyGraphQlService.js:194` — The retry budget that exists in this function but not on the failing step — createFile retries on fileErrors code UNKNOWN.
- `packages/functions/src/services/shopifyGraphQlService.js:203` — createFile's catch retries up to 3× on any error; the staged-upload POST at :138 retries 0×. The asymmetry is the defect.
- `packages/functions/src/services/shopifyGraphQlService.js:212` — `logger.error('[handleUploadFile]', shop?.id, 'Upload file error', error)` — emits the 2026-10-08T01:04:53.766789Z ERROR with tag [handleUploadFile] and shop id VwAcC7QWUxrBlExv4uEX quoted in the alert.
- `packages/functions/src/services/shopifyGraphQlService.js:2135` — Second, independent staged-upload POST with the same no-retry/no-timeout defect — a fix to :138 alone leaves this path exposed.
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:103` — The catch that logged the 01:04:54.000941Z `[createFeaturedImageNode] ... Failed to generate featured image` ERROR, then swallowed it — emits SSE status 'error' and returns the text-only fallback, so the request stays HTTP 200 (requests read empty).
- `packages/functions/src/services/imageGeneration.service.js:49` — The call chain link: processImageUpload invokes handleUploadFile, reached from generateHeroImage in the featured-image node — this is how an apiv2/LangGraph run lands in the same upload code as the api /upload controller.

## Evidence
- 1 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2") AND timestamp>="2026-10-08T00:49:55.445Z" AND timestamp<="2026-10-08T01:19:55.445Z" AND jsonPayload.tag="[handleUploadFile]"`
- 2 matching entries: `timestamp>="2026-10-01T00:00:00Z" AND timestamp<="2026-10-08T02:00:00Z" AND jsonPayload.message:"Client network socket disconnected before secure TLS connection was established"`
- 9 matching entries: `timestamp>="2026-09-08T00:00:00Z" AND timestamp<="2026-10-08T02:00:00Z" AND jsonPayload.tag="[handleUploadFile]"`

## Job
- analyze rounds: 1
- cost: $0.95

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
