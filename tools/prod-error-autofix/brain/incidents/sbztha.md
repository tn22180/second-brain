fingerprint: sbztha
service: apiv2
message: [handleUploadFile] QXOLRWBxzBs7ECnepRhh Upload file error TypeError: Cannot read properties of undefined (reading 'fileErrors')
app: BLOG
repo: blogs
date: 2026-08-12T13:40:17.369Z
status: mr_open
attempt: 1

# BLOG · apiv2 · sbztha

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/867

**Root cause.** createFile reads fileCreate.files[0].fileErrors without ever checking fileCreate.userErrors, so when Shopify's fileCreate rejects the input and returns files: [] plus userErrors, the code throws TypeError: Cannot read properties of undefined (reading 'fileErrors') instead of surfacing Shopify's message, and the catch-all retry loop replays the same rejected mutation 3× before the request 500s.

**Mechanism.** processImageUpload (imageGeneration.service.js:34) calls handleUploadFile. stagedUploadsCreate succeeds and the POST to the staged target returns ok (otherwise the throw at shopifyGraphQlService.js:149 would fire, and no such message exists in the logs). createFile then runs the fileCreate mutation; Shopify answers fileCreate.files = [] with the reason in fileCreate.userErrors — a field the query selects at shopifyGraphQlService.js:174 but the code never reads. Line 190 takes files[0] → undefined; line 192 dereferences .fileErrors on it → TypeError. The catch at line 201 does not distinguish a client-side TypeError from a transient Shopify fault, so line 202 sleeps 2s and re-issues the identical mutation 3×, always with the same result, then rethrows. handleUploadFile's outer catch (line 212) logs '[handleUploadFile] <shopID> Upload file error' and rewraps as 'File upload failed: <message>', which is what the alert carries. Because Shopify's userErrors is discarded, the actual rejection reason is not recoverable from any log line.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:190` — const file = fileCreate.files[0]; — unguarded index; when Shopify returns files: [] this is undefined
- `packages/functions/src/services/shopifyGraphQlService.js:192` — file.fileErrors?.length — the exact throw site; optional chaining guards fileErrors, not file itself
- `packages/functions/src/services/shopifyGraphQlService.js:174` — userErrors is selected in the fileCreate mutation but never read anywhere, so Shopify's rejection reason is thrown away
- `packages/functions/src/services/shopifyGraphQlService.js:202` — blanket retry on any caught error replays the same rejected mutation 3× with 2s backoff, matching the 13.2–15.6s latency of the three /api/ai-image 500s
- `packages/functions/src/services/shopifyGraphQlService.js:212` — logger.error '[handleUploadFile]' <shopID> 'Upload file error' — the exact alert text
- `packages/functions/src/services/imageGeneration.service.js:34` — the only caller of handleUploadFile present in 11 of 11 stacks (via lib/imageGeneration.service.js:40)
- `packages/functions/src/services/imageGeneration.service.js:33` — fileName = `image-${Date.now()}-${index}` — extension-less, unlike the two shopifyController callers that pass merchant filenames and produce zero failures; leading hypothesis for why Shopify rejects, unproven while userErrors is discarded

## Evidence
- 20 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-08-07T09:25:10.405Z" AND timestamp<="2026-08-07T09:55:10.405Z" AND jsonPayload.error.message:"fileErrors"`
- 11 matching entries: `(resource.labels.service_name="api" OR resource.labels.service_name="apiv2") AND timestamp>="2026-08-06T00:00:00Z" AND timestamp<="2026-08-08T00:00:00Z" AND jsonPayload.tag="[handleUploadFile]"`
- 3 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"/api/ai-image" AND timestamp>="2026-08-06T00:00:00Z" AND timestamp<="2026-08-08T00:00:00Z"`
- 20 matching entries: `resource.labels.service_name="apiv2" AND timestamp>="2026-08-07T09:39:50Z" AND timestamp<="2026-08-07T09:40:10Z" AND jsonPayload.error.message:"fileErrors"`

## Job
- analyze rounds: 1
- cost: $3.64
- branch: `fix/prod-blog-sbztha`
- fix commit: `510968a89ecb70ab6cfef0786c0f56ec6e928789`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/867
- tests: 358 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
.../src/services/imageGeneration.service.js        |  5 ++--
 .../src/services/shopifyGraphQlService.js          | 29 ++++++++++++++++++++--
 2 files changed, 30 insertions(+), 4 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
