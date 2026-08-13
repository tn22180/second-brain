fingerprint: 12ctzqp
service: api
message: HTTP 500 POST /api/ai-image
app: BLOG
repo: blogs
date: 2026-08-12T13:48:43.207Z
status: mr_open
attempt: 1

# BLOG · api · 12ctzqp

**Outcome.** duplicate of sbztha — MR https://gitlab.com/avada/blogs/-/merge_requests/867

**Root cause.** createFile inside handleUploadFile dereferences fileCreate.files[0] without ever checking fileCreate.userErrors or an empty files array, so when Shopify's fileCreate returns files: [] the TypeError "Cannot read properties of undefined (reading 'fileErrors')" is thrown, retried 3× by its own catch-all, then rethrown as "File upload failed: …" and surfaced by genImage as HTTP 500 on POST /api/ai-image.

**Mechanism.** genImageAIController.genImage → generateAndUploadImages → uploadImagesToShopify Promise.all → processImageUpload → handleUploadFile (imageGeneration.service.js:34). handleUploadFile stages the upload, POSTs the buffer, then calls the fileCreate mutation. At shopifyGraphQlService.js:190 it takes `fileCreate.files[0]` with no guard; Shopify answered with an empty `files` array (userErrors is queried at :174 but never read), so `file` is undefined and `file.fileErrors?.length` at :192 throws TypeError. The inner catch at :201 retries on ANY error including this programming error — 3 retries × 2s sleep plus staging, which is exactly the 15.06s / 15.61s request latencies. Final throw is wrapped at :213 into "File upload failed: …", propagates out of Promise.all, and genImageAIController.js:60 sets ctx.status = 500. Two of the three /api/ai-image 500s in the window (09:48:03.898 +15.06s → errors at 09:48:18.963; 09:48:28.430 +15.61s → errors at 09:48:44.038-.137, Promise.all index 0/1/2) are this cause, all shop QXOLRWBxzBs7ECnepRhh. Same defect as fingerprints sbztha / 1e34g1e, MR 867 open and unmerged, so it is still live on the api service too. The third 500 (09:54:35.361 +13.25s → error at 09:54:48.607) is a DIFFERENT cause behind the same HTTP-500 fingerprint: parseImage at openrouter/image.js:25-29 threw "OpenRouter returned no image data" after all 4 attempts (MAX_RETRIES=3, retryableEmptyImage), i.e. Gemini Flash Image returned a 200 with no image part four times in a row.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:190` — const file = fileCreate.files[0] — unguarded index into a possibly empty files array; this is the line the prod stack maps to (lib/…:234)
- `packages/functions/src/services/shopifyGraphQlService.js:192` — file.fileErrors?.length — throws the reported TypeError when file is undefined
- `packages/functions/src/services/shopifyGraphQlService.js:174` — userErrors is selected in the mutation but never inspected, so Shopify's own rejection reason is discarded
- `packages/functions/src/services/shopifyGraphQlService.js:202` — catch-all retry burns 3 extra round trips on a deterministic TypeError — the source of the ~15s latencies
- `packages/functions/src/services/shopifyGraphQlService.js:213` — rethrow as `File upload failed: ${error.message}` — matches the second error line in the logs
- `packages/functions/src/services/imageGeneration.service.js:34` — call site: handleUploadFile inside processImageUpload, reached from Promise.all (index 0/1/2 in the stacks)
- `packages/functions/src/controllers/genImageAIController.js:60` — ctx.status = 500 — turns the upload failure into the alerted HTTP 500
- `packages/functions/src/services/openrouter/image.js:26` — second, distinct cause behind the same fingerprint: throw 'OpenRouter returned no image data' after retries exhausted

## Evidence
- 4 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-07T09:33:20.445Z" AND timestamp<="2026-08-07T10:03:20.445Z" AND jsonPayload.error.stack:"createFile"`
- 1 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-07T09:33:20.445Z" AND timestamp<="2026-08-07T10:03:20.445Z" AND jsonPayload.error.message="OpenRouter returned no image data"`
- 3 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-07T09:33:20.445Z" AND timestamp<="2026-08-07T10:03:20.445Z" AND httpRequest.status=500 AND httpRequest.requestUrl:"/api/ai-image"`

## Job
- analyze rounds: 2
- cost: $1.90
- MR: https://gitlab.com/avada/blogs/-/merge_requests/867

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
