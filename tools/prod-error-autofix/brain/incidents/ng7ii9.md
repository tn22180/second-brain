fingerprint: ng7ii9
service: api
message: [upload] oU1eLddMkUdpnYAYISPu Upload file error: Error: File upload failed: Upload failed: Service Unavailable
app: BLOG
repo: blogs
date: 2026-08-28T02:43:49.074Z
status: fix_disabled
attempt: 1

# BLOG · api · ng7ii9

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The staged-upload POST to Shopify's staged target (GCS/S3) answered HTTP 503 once, and that fetch has no retry, so handleUploadFile threw and the merchant's image upload failed; the alerted `[upload]` line is the outer catch of the same single execution already recorded as fingerprint 2hqvaz.

**Mechanism.** handleUploadFile ran stagedUploadsCreate successfully (no error logged for it), then POSTed the multipart body to stagedTargets[0].url with a bare node-fetch at packages/functions/src/services/shopifyGraphQlService.js:137 — no timeout, no retry, no status-based backoff. The target answered 503 whose body text is the literal string 'Service Unavailable', so the `!uploadResponse.ok` branch threw `new Error('Upload failed: Service Unavailable')` at :148 (prod frame lib/…:193). The only retry ladder in this function, createFile at :151 (3 attempts), wraps the later fileCreate mutation and is never reached. The outer catch at :211 logged '[handleUploadFile] oU1eLddMkUdpnYAYISPu Upload file error' and rethrew as `File upload failed: ${error.message}` at :212 (prod frame lib/…:252), which shopifyController.upload's catch at :229 logged as the alerted '[upload] … Upload file error:' and then answered HTTP 200 with {success:false,error} at :230 — which is why the requests read has 0 entries with status>=500. Two ERROR lines, same timestamp to 0.2ms (17:03:27.254370Z and .254553Z), one shop oU1eLddMkUdpnYAYISPu: one failure, two log lines, not two causes.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:137` — the staged-upload POST — bare node-fetch, no retry, no timeout; the 503 lands here
- `packages/functions/src/services/shopifyGraphQlService.js:148` — throw new Error(`Upload failed: ${responseText}`) — responseText is the 503 body 'Service Unavailable', producing the exact inner message
- `packages/functions/src/services/shopifyGraphQlService.js:151` — createFile's 3-attempt retry covers only the later fileCreate mutation, never the staged-upload POST that failed
- `packages/functions/src/services/shopifyGraphQlService.js:211` — logger.error('[handleUploadFile]', shop?.id, 'Upload file error', error) — the paired ERROR line at 17:03:27.254370Z
- `packages/functions/src/services/shopifyGraphQlService.js:212` — throw new Error(`File upload failed: ${error.message}`) — wraps the inner message, producing the alerted 'File upload failed: Upload failed: Service Unavailable'
- `packages/functions/src/controllers/shopifyController.js:229` — logger.error('[upload]', getCurrentShop(ctx), 'Upload file error:', e) — emits the alerted line
- `packages/functions/src/controllers/shopifyController.js:230` — ctx.body = {success:false,error} with no ctx.throw, so no 5xx request log exists for this failure

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-26T16:48:40.984Z" AND timestamp<="2026-08-26T17:18:40.984Z" AND jsonPayload.tag="[upload]"`
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-25T17:00:00Z" AND timestamp<="2026-08-27T17:00:00Z" AND jsonPayload.message:"Upload failed: Service Unavailable"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-08-26T16:48:40.984Z" AND timestamp<="2026-08-26T17:18:40.984Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.05

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
