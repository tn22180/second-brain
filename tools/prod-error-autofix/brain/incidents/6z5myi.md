fingerprint: 6z5myi
service: api
message: [handleUploadFile] QXOLRWBxzBs7ECnepRhh Upload file error TypeError: Cannot read properties of undefined (reading 'fileErrors')
app: BLOG
repo: blogs
date: 2026-08-12T13:53:25.198Z
status: mr_open
attempt: 1

# BLOG · api · 6z5myi

**Outcome.** duplicate of 1qaf59t — MR https://gitlab.com/avada/blogs/-/merge_requests/867

**Root cause.** Duplicate of fingerprint sbztha / 12ctzqp (MR https://gitlab.com/avada/blogs/-/merge_requests/867 open, unmerged — master at ac891de05 still carries the defect): createFile reads fileCreate.files[0].fileErrors without ever checking fileCreate.userErrors, so when Shopify's fileCreate rejects the staged image and answers files: [] plus userErrors, the code throws TypeError: Cannot read properties of undefined (reading 'fileErrors') instead of surfacing Shopify's reason, and the blanket catch replays the same rejected mutation 3× before POST /api/ai-image 500s.

**Mechanism.** genImageAIController.genImage (line 40) → generateAndUploadImages → Promise.all → processImageUpload (imageGeneration.service.js:34) → handleUploadFile. stagedUploadsCreate succeeds and the POST to the staged target returns ok — otherwise the throw at shopifyGraphQlService.js:149 ('Upload failed: ...') would fire, and no such line exists in the window. createFile then issues the fileCreate mutation; Shopify answers fileCreate.files = [] with the reason in fileCreate.userErrors, a field selected at line 174 but never read. Line 190 takes files[0] → undefined, line 192 dereferences .fileErrors on it → TypeError (prod frame lib/shopifyGraphQlService.js:234, src line 192). The catch at line 201 does not distinguish a client-side TypeError from a transient Shopify fault, so line 202 sleeps 2s and re-issues the identical mutation 3× — the ~6s of backoff inside the observed 15.06s and 15.61s request latencies. Line 212 logs '[handleUploadFile] QXOLRWBxzBs7ECnepRhh Upload file error', line 213 rewraps as 'File upload failed: <message>', and genImage's catch (genImageAIController.js:58-64) turns it into the 500. Because userErrors is discarded, Shopify's actual rejection reason is not recoverable from any log line. Note the window holds a second, unrelated cause behind the same endpoint: the third 500 (09:54:35.362 + 13.245s latency = 09:54:48.607) matches '[genImage] ... OpenRouter returned no image data' from openrouter/image.js parseImage, not this defect — 2 of 3 /api/ai-image 500s are the alert's cause.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:190` — const file = fileCreate.files[0] — unguarded index; undefined when Shopify returns files: []
- `packages/functions/src/services/shopifyGraphQlService.js:192` — file.fileErrors?.length — the exact throw site; the optional chain guards fileErrors, not file
- `packages/functions/src/services/shopifyGraphQlService.js:174` — userErrors is selected in the fileCreate mutation but never read, so Shopify's rejection reason is thrown away
- `packages/functions/src/services/shopifyGraphQlService.js:202` — blanket retry on any caught error replays the same rejected mutation 3× with 2s backoff, matching the 15.06s / 15.61s latency of the two failing requests
- `packages/functions/src/services/shopifyGraphQlService.js:212` — logger.error('[handleUploadFile]', shop?.id, 'Upload file error', error) — the exact alert text
- `packages/functions/src/services/imageGeneration.service.js:34` — const [file] = await handleUploadFile({...}) — the caller in every stack (prod frame imageGeneration.service.js:40)
- `packages/functions/src/services/imageGeneration.service.js:33` — fileName = `image-${Date.now()}-${index}` — extension-less name, unlike the merchant-filename callers that never fail; leading hypothesis for why Shopify rejects, unprovable while userErrors is discarded
- `packages/functions/src/controllers/genImageAIController.js:58` — genImage catch logs '[genImage] ... Error generateImageToShopifyCDN' and sets ctx.status = 500 — the observed request failures

## Evidence
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-07T09:33:20.950Z" AND timestamp<="2026-08-07T10:03:20.950Z" AND jsonPayload.tag="[handleUploadFile]"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-07T09:33:20.950Z" AND timestamp<="2026-08-07T10:03:20.950Z" AND jsonPayload.error.message:"fileErrors"`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-07T09:33:20.950Z" AND timestamp<="2026-08-07T10:03:20.950Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"/api/ai-image"`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-07T09:33:20.950Z" AND timestamp<="2026-08-07T10:03:20.950Z" AND jsonPayload.tag="[genImage]"`

## Job
- analyze rounds: 1
- cost: $1.16
- MR: https://gitlab.com/avada/blogs/-/merge_requests/867

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
