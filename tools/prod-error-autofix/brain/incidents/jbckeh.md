fingerprint: jbckeh
service: apiv2
message: [startImageGeneration] FiNnkxsSJ96AC1ZWnaz8 Failed to generate image Error: Failed to upload
app: BLOG
repo: blogs
date: 2026-08-13T02:00:55.691Z
status: deferred
attempt: 1

# BLOG · apiv2 · jbckeh

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** processImageUpload treats Shopify's still-processing MediaImage as a hard failure: retryGetImageUpload gives up after 10 polls (~6s) and returns the node with `image: null` and an empty `fileErrors`, so line 57 throws the fallback `new Error('Failed to upload')` for image index 3 of a 4-image batch that otherwise succeeded on the same shop and token.

**Mechanism.** callModelNode.startImageGeneration fans 4 descriptors out under Promise.allSettled; each calls resolveImageResult → processImageUpload (packages/functions/src/services/imageGeneration.service.js:43). handleUploadFile completes (fileCreate returned a file.id — no upload/userError log line exists), then retryGetImageUpload (packages/functions/src/controllers/shopifyController.js:242) polls getMediaImageById with `if (data.image || count >= 10) return data;` — 10 × delay(600) ≈ 6s of sleeps, no fileStatus check — and returns the node unresolved once the counter is spent. Back in processImageUpload, `image` is undefined and the thrown message is the `||` fallback string `'Failed to upload'`, not `fileErrors[0].details`, which proves Shopify reported no file error — i.e. the file was not failed, only not READY yet. resolveImageResult logs and rethrows (callModelNode.js:118), startImageGeneration logs the alerted line (callModelNode.js:186). The 01:56:56Z `[generate]` blog-JSON parse error in the same window is an earlier, separate execution and is not this alert's cause.

Confidence: `medium`

## Code
- `packages/functions/src/services/imageGeneration.service.js:57` — `if (!image) throw new Error(fileErrors[0]?.details || 'Failed to upload')` — the exact throw in the stack (lib:66:21); fallback string fired, so fileErrors was empty
- `packages/functions/src/services/imageGeneration.service.js:43` — the only caller of retryGetImageUpload on this path; its return value is destructured without ever inspecting fileStatus
- `packages/functions/src/controllers/shopifyController.js:244` — `if (data.image || count >= 10) return data;` — bounded at 10 polls × 600ms and returns the un-ready node instead of signalling timeout
- `packages/functions/src/controllers/shopifyController.js:246` — delay(600) between polls — total wait budget ≈6s, far under Shopify's async media-processing tail
- `packages/functions/src/langgraph/nodes/callModelNode.js:118` — resolveImageResult rethrows the upload error (stack frame lib/callModelNode.js:102)
- `packages/functions/src/langgraph/nodes/callModelNode.js:186` — startImageGeneration catch that emitted the alerted [startImageGeneration] line
- `packages/functions/src/services/shopifyGraphQlService.js:318` — pollFileStatus, the sibling helper that does it correctly — waits on terminal READY/FAILED — showing retryGetImageUpload's image-only check is the deviation
- `packages/functions/src/services/shopifyGraphQlService.js:354` — getMediaImageById already selects fileStatus and fileErrors; both are discarded by retryGetImageUpload

## Evidence
- 2 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-08-13T01:43:31.317Z" AND timestamp<="2026-08-13T02:13:31.317Z" AND jsonPayload.error.message="Failed to upload"`
- 1 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-08-13T01:43:31.317Z" AND timestamp<="2026-08-13T02:13:31.317Z" AND jsonPayload.tag="[startImageGeneration]"`
- 1 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-08-13T01:43:31.317Z" AND timestamp<="2026-08-13T02:13:31.317Z" AND jsonPayload.tag="[resolveImageResult]"`

## Job
- analyze rounds: 1
- cost: $1.41

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
