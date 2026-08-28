fingerprint: 2hqvaz
service: api
message: [handleUploadFile] oU1eLddMkUdpnYAYISPu Upload file error Error: Upload failed: Service Unavailable
app: BLOG
repo: blogs
date: 2026-08-28T02:42:45.262Z
status: fix_disabled
attempt: 1

# BLOG · api · 2hqvaz

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The staged-upload POST to Shopify's staged target got HTTP 503 Service Unavailable once, and that fetch has no retry, so handleUploadFile threw and the merchant's image upload failed.

**Mechanism.** handleUploadFile ran stagedUploadsCreate successfully (no error logged for it), then POSTed the multipart body to the returned stagedTargets[0].url with a bare node-fetch at packages/functions/src/services/shopifyGraphQlService.js:137 — no timeout, no retry, no status-based backoff. The target answered 503, whose body text is the literal string 'Service Unavailable', so the !uploadResponse.ok branch at :146 threw `new Error('Upload failed: Service Unavailable')` — matching the alerted stack frame (lib/services/shopifyGraphQlService.js:193 → src :148). The retry ladder that does exist (createFile, :151-207, 3 attempts) only wraps the later fileCreate mutation and is never reached. The outer catch at :210 logged '[handleUploadFile] oU1eLddMkUdpnYAYISPu Upload file error' and rethrew as 'File upload failed: …', which shopifyController.upload's catch at :229 logged again as '[upload] … Upload file error:' and then answered HTTP 200 with {success:false,error} at :230 — which is why the requests read for this window has 0 entries with status>=500. Two ERROR lines, one execution_id (ace7eroqy45n), one spanId (17898403587724564685), one shop (oU1eLddMkUdpnYAYISPu): one failure, not two.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:137` — the staged-upload POST — bare fetch, no retry and no timeout; the 503 lands here
- `packages/functions/src/services/shopifyGraphQlService.js:148` — throw new Error(`Upload failed: ${responseText}`) — responseText is the 503 body 'Service Unavailable', producing the exact alerted message
- `packages/functions/src/services/shopifyGraphQlService.js:151` — createFile's 3-attempt retry covers only the later fileCreate mutation, never the staged-upload POST that failed
- `packages/functions/src/services/shopifyGraphQlService.js:211` — logger.error('[handleUploadFile]', shop?.id, 'Upload file error', error) — emits the alerted line
- `packages/functions/src/controllers/shopifyController.js:229` — logger.error('[upload]', …) — the second ERROR line in the window, same execution
- `packages/functions/src/controllers/shopifyController.js:230` — ctx.body = {success:false,error} with no ctx.throw, so no 5xx request log exists for this failure

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-26T16:48:40.562Z" AND timestamp<="2026-08-26T17:18:40.562Z" AND jsonPayload.tag="[handleUploadFile]"`
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-26T16:48:40.562Z" AND timestamp<="2026-08-26T17:18:40.562Z" AND jsonPayload.message:"Upload failed: Service Unavailable"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-25T17:00:00Z" AND timestamp<="2026-08-27T17:00:00Z" AND jsonPayload.tag="[handleUploadFile]"`

## Job
- analyze rounds: 2
- cost: $2.17

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
