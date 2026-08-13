fingerprint: 1qaf59t
service: api
message: [genImage] QXOLRWBxzBs7ECnepRhh Error generateImageToShopifyCDN Error: File upload failed: Cannot read properties of undefined (reading 'fileErrors')
app: BLOG
repo: blogs
date: 2026-08-12T13:51:18.433Z
status: mr_open
attempt: 1

# BLOG · api · 1qaf59t

**Outcome.** duplicate of 12ctzqp — MR https://gitlab.com/avada/blogs/-/merge_requests/867

**Root cause.** Duplicate of fingerprint sbztha (MR https://gitlab.com/avada/blogs/-/merge_requests/867 open, unmerged — fix commit 510968a89 is not on master): createFile reads fileCreate.files[0].fileErrors without ever checking fileCreate.userErrors, so when Shopify's fileCreate rejects the input and answers files: [] plus userErrors, the code throws TypeError: Cannot read properties of undefined (reading 'fileErrors') instead of surfacing Shopify's message, and the catch-all retry replays the same rejected mutation 3× before POST /api/ai-image 500s.

**Mechanism.** genImage (genImageAIController.js:23) → generateAndUploadImages → processImageUpload (imageGeneration.service.js:34) calls handleUploadFile. stagedUploadsCreate succeeded and the POST to the staged target returned ok — otherwise the throw at shopifyGraphQlService.js:149 ('Upload failed: …') would fire, and no such line exists in the window. createFile then issues the fileCreate mutation; Shopify answers fileCreate.files = [] with the reason in fileCreate.userErrors, a field the query selects at shopifyGraphQlService.js:174 but the code never reads. Line 190 takes files[0] → undefined; line 192 dereferences .fileErrors → TypeError. The error names 'fileErrors', not 'files' or '0', which pins fileCreate as present and files as an empty array, i.e. the userErrors branch. The catch at line 201 does not distinguish a client-side TypeError from a transient Shopify fault, so line 203 sleeps 2s and re-issues the identical mutation 3× with the same result, then rethrows; the outer catch (line 212) logs '[handleUploadFile] QXOLRWBxzBs7ECnepRhh Upload file error' and rewraps as 'File upload failed: <message>', which is the alert text. Shopify's userErrors is discarded, so the real rejection reason is not recoverable from any log line. Same defect, same shop, same day as sbztha — that one was the apiv2 service, this is api.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:190` — const file = fileCreate.files[0] — undefined when Shopify returns files: []
- `packages/functions/src/services/shopifyGraphQlService.js:192` — file.fileErrors?.length dereferences that undefined — the TypeError in the alert
- `packages/functions/src/services/shopifyGraphQlService.js:174` — userErrors is selected by the mutation but never read anywhere in createFile
- `packages/functions/src/services/shopifyGraphQlService.js:202` — catch-all retry re-issues the identical rejected mutation 3× because it cannot tell a TypeError from a transient fault
- `packages/functions/src/services/shopifyGraphQlService.js:213` — rewrap as 'File upload failed: <message>' — the exact alert string
- `packages/functions/src/services/imageGeneration.service.js:34` — processImageUpload's handleUploadFile call, the Promise.all frame in the stack
- `packages/functions/src/controllers/genImageAIController.js:40` — genImage awaits generateAndUploadImages; its catch turns the throw into the 500 on POST /api/ai-image

## Evidence
- 6 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-07T00:00:00Z" AND timestamp<="2026-08-08T00:00:00Z" AND jsonPayload.message:"fileErrors"`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-07T09:33:20.615Z" AND timestamp<="2026-08-07T10:03:20.615Z" AND jsonPayload.tag="[handleUploadFile]"`
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-07T09:33:20.615Z" AND timestamp<="2026-08-07T10:03:20.615Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.33
- MR: https://gitlab.com/avada/blogs/-/merge_requests/867

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
