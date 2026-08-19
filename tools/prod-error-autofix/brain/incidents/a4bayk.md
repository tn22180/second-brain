fingerprint: a4bayk
service: createPreviewImages
message: TypeError [ERR_INVALID_ARG_TYPE]: The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received undefined
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-18T16:45:31.896Z
status: inconclusive
attempt: 10

# IMG-OPT · createPreviewImages · a4bayk

**Outcome.** fix blocked at agent_failed

**Root cause.** sharpCompressImage returns {log} with no `base64` whenever it cannot produce a smaller buffer (unsupported format, animated image, or newSize >= oldSize), and uploadToStorage passes that undefined straight into uploadToCloudStorage → save-file's Buffer.from(undefined) throws ERR_INVALID_ARG_TYPE for all 4 quality types of that shop.

**Mechanism.** getLargestImage picks the shop's single biggest file (files(first:1, sortKey:ORIGINAL_UPLOAD_SIZE)). For shop nk3jiu-m6.myshopify.com (execution lhxmd9zpcsuk) that file is an SVG: compressImage hits its `default:` branch, logs `Format not handled: svg` (console.log, severity DEFAULT — invisible to the ERROR sink) and returns false (packages/functions/src/helpers/optimize/sharp.js:193). destBuffer is falsy so process returns `{log}` with no base64 (sharp.js:53), so `const {base64: attachment}` is undefined (subscribeCreatePreviewImages.js:65). attachment is handed unchecked to uploadToCloudStorage (subscribeCreatePreviewImages.js:70) → saveToTemp → save-file `Buffer.from(undefined)` → the TypeError. uploadToCloudStorage catches it, logs the stack and returns null, so all 4 originalSource values are null: Shopify then rejects the fileCreate with `invalid value for 0..3.originalSource (Expected value to not be null)`, handleCreateFiles returns undefined, and processCreatePreviewImages dies on `createdFiles.map is not a function`. The other two failing executions (8aotqm1r918y shop 9e65a2-b9, em94ta0n7ux6 shop rtuzwr-qr) show the same 4× TypeError with no `Format not handled` line — the silent branches of the same defect: `skippedLarger` (sharp.js:60) or `Animated image`, both of which also return {log} without base64.

Confidence: `high`

## Code
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:65` — destructures `base64` from sharpCompressImage with no check that it exists
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:70` — passes the possibly-undefined attachment straight into uploadToCloudStorage — the frame at lib/.../subscribeCreatePreviewImages.js:85 in the stack
- `packages/functions/src/helpers/optimize/sharp.js:53` — `if (!destBuffer) return {log}` — the no-base64 return path
- `packages/functions/src/helpers/optimize/sharp.js:60` — skippedLarger return path, also no base64, and it logs nothing (explains the 2 executions with no `Format not handled` line)
- `packages/functions/src/helpers/optimize/sharp.js:193` — `console.log('Format not handled:', metadata.format)` — the exact line that emitted `Format not handled: svg` 4× 0.6–3ms before the 4 TypeErrors
- `packages/functions/src/services/storageService.js:22` — uploadToCloudStorage calls saveToTemp with fileBuffer unvalidated — stack frame lib/services/storageService.js:34
- `packages/functions/src/services/storageService.js:74` — saveToTemp → save-file `save(file, ...)`, which does Buffer.from(file) and throws on undefined — stack frame lib/services/storageService.js:93

## Evidence
- 12 matching entries: `resource.labels.function_name="createPreviewImages" AND severity>=ERROR AND textPayload:"ERR_INVALID_ARG_TYPE"`
- 4 matching entries: `resource.labels.function_name="createPreviewImages" AND textPayload:"Format not handled"`
- 3 matching entries: `resource.labels.function_name="createPreviewImages" AND textPayload:"originalSource (Expected value to not be null)"`
- 3 matching entries: `resource.labels.function_name="createPreviewImages" AND textPayload:"createdFiles.map is not a function"`
- 15 matching entries: `resource.labels.function_name="createPreviewImages" AND labels.execution_id="lhxmd9zpcsuk"`

## Job
- analyze rounds: 1
- cost: $1.67

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
