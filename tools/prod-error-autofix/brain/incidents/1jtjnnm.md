fingerprint: 1jtjnnm
service: apiv2
message: [createFeaturedImageNode] uKFnFp3INAEMsjB4EuRx Failed to generate featured image Error: File upload failed: Cannot read properties of undefined (reading 'fileErrors')
app: BLOG
repo: blogs
date: 2026-09-12T14:30:47.636Z
status: fix_disabled
attempt: 2

# BLOG · apiv2 · 1jtjnnm

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shopify's fileCreate mutation answered every one of the 7 image uploads for shop uKFnFp3INAEMsjB4EuRx with `files: []` plus a populated `userErrors`, and createFile dereferences `fileCreate.files[0]` without checking either, so the rejection surfaced as `TypeError: Cannot read properties of undefined (reading 'fileErrors')` instead of Shopify's own message — which is also why the actual rejection reason is not recoverable from the logs.

**Mechanism.** processImageUpload (imageGeneration.service.js:49) calls handleUploadFile. Stage 1 (stagedUploadsCreate) and the staged POST both succeeded — line 128 destructures stagedTargets[0] and line 146 checks uploadResponse.ok, neither threw. Stage 2 runs the fileCreate mutation, which selects both `files { ... fileErrors }` and `userErrors { field message }` (lines 157-176), then line 189 takes `const file = fileCreate.files[0]` and line 191 reads `file.fileErrors`. The logged exception is `reading 'fileErrors'` on `undefined`, not `reading '0'` on null/undefined — so `fileCreate.files` was present and empty, i.e. Shopify accepted the request and rejected the input, reporting it in `userErrors`, which this code never reads. The TypeError is then caught by createFile's own catch (lines 200-206), which retries a deterministic type error 3× with 2s sleeps (4 fileCreate mutations per upload, 28 for this article), and finally by handleUploadFile's catch (line 211-212), which logs `[handleUploadFile] <shopId> Upload file error` and rethrows as `File upload failed: <message>`. That string is what the two callers log: resolveImageResult (callModelNode.js:117-119) for the 6 in-content images fanned out under Promise.allSettled, and createFeaturedImageNode's generateHeroImage (createFeaturedImageNode.js:23, logged at :107) for the hero image.

Confidence: `medium`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:189` — `const file = fileCreate.files[0]` — unguarded; files is [] when Shopify rejects, so file is undefined
- `packages/functions/src/services/shopifyGraphQlService.js:191` — `file.fileErrors?.length` — the exact throw site, matches `reading 'fileErrors'` at lib/…:233:38
- `packages/functions/src/services/shopifyGraphQlService.js:173` — `userErrors { field message }` is selected in the mutation but never read anywhere in createFile — the reason the real cause is invisible
- `packages/functions/src/services/shopifyGraphQlService.js:201` — `if (retries > 0)` catch-all retry re-runs the mutation 3× for a non-retryable TypeError: 4 fileCreate calls per upload
- `packages/functions/src/services/shopifyGraphQlService.js:212` — `throw new Error('File upload failed: ' + error.message)` — wraps the TypeError into the string the callers logged
- `packages/functions/src/services/shopifyGraphQlService.js:277` — the same file's other fileCreate path already does `if (userErrors?.length || !files?.length)` — the guard createFile is missing
- `packages/functions/src/services/imageGeneration.service.js:49` — `const [file] = await handleUploadFile(...)` — frame `processImageUpload` at lib/imageGeneration.service.js:56
- `packages/functions/src/langgraph/nodes/callModelNode.js:107` — resolveImageResult's processImageUpload call — 6 of the 7 failures, frame lib/callModelNode.js:107
- `packages/functions/src/langgraph/nodes/createFeaturedImageNode.js:23` — generateHeroImage's processImageUpload call — the 1 featured-image failure in the alert text

## Evidence
- 7 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2") AND timestamp>="2026-09-12T14:11:52.257Z" AND timestamp<="2026-09-12T14:41:52.257Z" AND jsonPayload.message:"Upload file error"`
- 20 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2") AND timestamp>="2026-09-12T14:11:52.257Z" AND timestamp<="2026-09-12T14:41:52.257Z" AND severity>=ERROR`
- 7 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.service_name="api" OR resource.labels.service_name="apisa" OR resource.labels.service_name="apisav2" OR resource.labels.service_name="mcp") AND timestamp>="2026-09-05T00:00:00Z" AND jsonPayload.message:"Upload file error"`
- 20 matching entries: `timestamp>="2026-09-05T00:00:00Z" AND jsonPayload.message:"uKFnFp3INAEMsjB4EuRx"`

## Job
- analyze rounds: 1
- cost: $2.00

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
