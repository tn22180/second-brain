fingerprint: rgpyy6
service: apiv2
message: [resolveImageResult] FiNnkxsSJ96AC1ZWnaz8 Failed to upload generated image Error: Failed to upload
app: BLOG
repo: blogs
date: 2026-08-13T02:03:07.665Z
status: deferred
attempt: 1

# BLOG · apiv2 · rgpyy6

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** processImageUpload throws a hard 'Failed to upload' whenever Shopify's freshly-created MediaImage is still processing: retryGetImageUpload gives up after 10 polls (~6s) and returns the node with image=null and an empty fileErrors, so packages/functions/src/services/imageGeneration.service.js:57 fires its `|| 'Failed to upload'` fallback for image index 3 of a 4-image batch whose other 3 uploads succeeded on the same shop and token.

**Mechanism.** callModelNode.startImageGeneration fans the image descriptors out under Promise.allSettled (callModelNode.js:469); the alerted frame is `Promise.allSettled (index 3)`, i.e. the 4th descriptor, and no error line exists for indices 0-2 in the window. resolveImageResult (callModelNode.js:95) calls processImageUpload. handleUploadFile completed — the 30-minute window contains zero jsonPayload.tag="[handleUploadFile]" entries, so stagedUploadsCreate, the POST to the staged target and fileCreate all returned, and fileCreate.files[0].fileErrors was empty (shopifyGraphQlService.js:192 would have thrown otherwise). processImageUpload then calls retryGetImageUpload (imageGeneration.service.js:43), which loops `if (data.image || count >= 10) return data;` with delay(600) — a hard ceiling of ~6s — and returns the still-unresolved node once the counter is spent, discarding the `fileStatus` and `fileErrors` that getMediaImageById already selects (shopifyGraphQlService.js:354). Back at line 57 `image` is undefined and `fileErrors[0]?.details` is undefined, so the thrown message is the literal fallback string 'Failed to upload' — exactly the message in the log, which proves Shopify reported no file error: the file was not FAILED, only not yet READY. resolveImageResult logs and rethrows (callModelNode.js:113), startImageGeneration catches and logs the second line (callModelNode.js:186); both at 01:58:24.18Z, 0.17ms apart, one failure logged twice. The sibling helper pollFileStatus (shopifyGraphQlService.js:319) does it correctly by waiting on a terminal READY/FAILED status, which makes retryGetImageUpload's image-only check the deviation. The 01:56:56Z [generate] blog-JSON parse error and the 01:56:19/01:57:50Z Firestore 16 UNAUTHENTICATED lines are separate, unrelated entries in the same window.

Confidence: `medium`

## Code
- `packages/functions/src/services/imageGeneration.service.js:57` — `if (!image) throw new Error(fileErrors[0]?.details || 'Failed to upload')` — the exact throw in the stack (lib:66:21); the fallback string fired, so fileErrors was empty
- `packages/functions/src/services/imageGeneration.service.js:43` — the only caller of retryGetImageUpload on this path; destructures the returned node without ever inspecting fileStatus
- `packages/functions/src/controllers/shopifyController.js:244` — `if (data.image || count >= 10) return data;` — bounded at 10 polls and returns the un-ready node instead of signalling timeout
- `packages/functions/src/controllers/shopifyController.js:246` — delay(600) between polls — total wait budget ≈6s, far under Shopify's async media-processing tail
- `packages/functions/src/services/shopifyGraphQlService.js:192` — fileCreate's own fileErrors guard — it did not throw, so Shopify reported no file error for this upload
- `packages/functions/src/services/shopifyGraphQlService.js:354` — getMediaImageById already selects fileStatus and fileErrors; retryGetImageUpload discards both
- `packages/functions/src/services/shopifyGraphQlService.js:319` — pollFileStatus — the sibling helper that waits on terminal READY/FAILED, showing the image-only check is the deviation
- `packages/functions/src/langgraph/nodes/callModelNode.js:113` — resolveImageResult's catch that emitted the alerted [resolveImageResult] line, then rethrows (lib/callModelNode.js:102)
- `packages/functions/src/langgraph/nodes/callModelNode.js:186` — startImageGeneration catch that emitted the second, duplicate log line 0.17ms later
- `packages/functions/src/langgraph/nodes/callModelNode.js:469` — Promise.allSettled over pendingImagePromises — the `index 3` frame in the stack; per-image failure does not abort the batch

## Evidence
- 2 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-08-13T01:43:31.890Z" AND timestamp<="2026-08-13T02:13:31.890Z" AND jsonPayload.error.message="Failed to upload"`
- 1 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-08-13T01:43:31.890Z" AND timestamp<="2026-08-13T02:13:31.890Z" AND jsonPayload.tag="[resolveImageResult]"`
- 1 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-08-13T01:43:31.890Z" AND timestamp<="2026-08-13T02:13:31.890Z" AND jsonPayload.tag="[startImageGeneration]"`

## Job
- analyze rounds: 1
- cost: $1.38

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
