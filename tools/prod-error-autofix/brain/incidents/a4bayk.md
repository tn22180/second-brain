fingerprint: a4bayk
service: createPreviewImages
message: TypeError [ERR_INVALID_ARG_TYPE]: The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received undefined
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-22T03:35:00.527Z
status: fix_disabled
attempt: 11

# IMG-OPT · createPreviewImages · a4bayk

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** sharpCompressImage returns {log} with no `base64` on every no-smaller-output path (animated image, unsupported format, newSize >= oldSize), and uploadToStorage destructures that missing `base64` and hands `undefined` straight to uploadToCloudStorage → save-file's Buffer.from(undefined), which throws ERR_INVALID_ARG_TYPE once per quality type (4× per execution).

**Mechanism.** Execution started 2026-08-19T09:43:15.894Z for shop cycologyclothing-com.myshopify.com. getLargestImage picks that shop's single biggest file (files(first:1, sortKey:ORIGINAL_UPLOAD_SIZE, reverse:true)). uploadToStorage maps the 4 OPTIMIZE_QUALITY_TYPES over sharpCompressImage (packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:63-65). For this image sharp produces no usable smaller buffer, so process returns `{log}` with no base64 — either at packages/functions/src/helpers/optimize/sharp.js:54 (destBuffer falsy: compressImage returned false, e.g. the Animated-image branch at sharp.js:171 which only pushes to `errors` and logs nothing) or at sharp.js:62 (skippedLarger, also silent). Both are console-silent, which matches the log: between the 09:43:15.940Z shop line and the first TypeError at 09:43:21.121Z there is no 'Format not handled' line (0 matches in-window) and no 'sharp prepare image attempt … failed' line. `const {base64: attachment}` is therefore undefined (subscribeCreatePreviewImages.js:65) and is passed unchecked as the first arg of uploadToCloudStorage (subscribeCreatePreviewImages.js:70) → saveToTemp (storageService.js:22) → save(file, tempLocalFile) (storageService.js:74) → save-file's Buffer.from(undefined) → TypeError, 4× at 09:43:21.121–.145Z, one per Promise.all index 0..3. uploadToCloudStorage catches it and returns null, so all 4 originalSource values are null: Shopify rejects the fileCreate at 09:43:21.268Z with 'invalid value for 0.originalSource … 3.originalSource (Expected value to not be null)', handleCreateFiles returns undefined, and processCreatePreviewImages dies at 09:43:26.269Z on 'createdFiles.map is not a function' (subscribeCreatePreviewImages.js:35). 12 identical TypeErrors in 24h = 3 executions × 4 quality types.

Confidence: `high`

## Code
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:65` — destructures `base64` from sharpCompressImage with no check that it exists
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:70` — passes the possibly-undefined attachment as the first arg of uploadToCloudStorage — stack frame lib/handlers/pubsub/subscribeCreatePreviewImages.js:85
- `packages/functions/src/helpers/optimize/sharp.js:53` — `if (!destBuffer) return {log}` — no-base64 return path, reached when compressImage returns false
- `packages/functions/src/helpers/optimize/sharp.js:60` — skippedLarger return path — also returns {log} with no base64, and logs nothing, matching the absence of any sharp log line in this execution
- `packages/functions/src/helpers/optimize/sharp.js:171` — Animated-image branch returns false with only errors.push and no console output — the other silent way destBuffer ends up falsy
- `packages/functions/src/services/storageService.js:22` — uploadToCloudStorage calls saveToTemp with fileBuffer unvalidated — stack frame lib/services/storageService.js:34
- `packages/functions/src/services/storageService.js:74` — saveToTemp → save-file `save(file, ...)`, which does Buffer.from(file) and throws on undefined — stack frame lib/services/storageService.js:93
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:35` — createdFiles.map with no guard — the downstream 'createdFiles.map is not a function' at 09:43:26.269Z

## Evidence
- 4 matching entries: `resource.labels.function_name="createPreviewImages" AND severity>=ERROR AND textPayload:"ERR_INVALID_ARG_TYPE" AND timestamp>="2026-08-19T09:28:23Z" AND timestamp<="2026-08-19T09:58:23Z"`
- 12 matching entries: `resource.labels.function_name="createPreviewImages" AND severity>=ERROR AND textPayload:"ERR_INVALID_ARG_TYPE" AND timestamp>="2026-08-18T09:28:23Z" AND timestamp<="2026-08-19T09:58:23Z"`
- 1 matching entries: `resource.labels.function_name="createPreviewImages" AND textPayload:"originalSource (Expected value to not be null)" AND timestamp>="2026-08-19T09:28:23Z" AND timestamp<="2026-08-19T09:58:23Z"`
- 1 matching entries: `resource.labels.function_name="createPreviewImages" AND textPayload:"createdFiles.map is not a function" AND timestamp>="2026-08-19T09:28:23Z" AND timestamp<="2026-08-19T09:58:23Z"`
- 1 matching entries: `resource.labels.function_name="createPreviewImages" AND textPayload:"cycologyclothing-com.myshopify.com" AND timestamp>="2026-08-19T09:28:23Z" AND timestamp<="2026-08-19T09:58:23Z"`
- 19 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-19T09:28:23Z" AND timestamp<="2026-08-19T09:58:23Z"`

## Job
- analyze rounds: 2
- cost: $3.15

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
