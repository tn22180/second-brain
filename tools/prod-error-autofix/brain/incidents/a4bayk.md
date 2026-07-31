fingerprint: a4bayk
service: createPreviewImages
message: TypeError [ERR_INVALID_ARG_TYPE]: The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received undefined
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-07-31T07:15:39.404Z
status: inconclusive
attempt: 1

# IMG-OPT · createPreviewImages · a4bayk

**Outcome.** smoke gate new_failures

**Root cause.** uploadToStorage feeds sharpCompressImage's optional `base64` straight into uploadToCloudStorage without checking it exists; sharpCompressImage returns `{log}` with no base64 whenever the shop's largest image cannot be compressed (SVG/unhandled format, animated image, or output >= original), so `Buffer.from(undefined)` throws inside save-file once per quality level.

**Mechanism.** installationService publishes topic `createPreviewImages` on install → processCreatePreviewImages → uploadToStorage picks the shop's single largest image via getLargestImage → for each of the 4 OPTIMIZE_QUALITY_TYPES it calls sharpCompressImage and destructures `{base64: attachment}`. sharp.js returns `{log}` (no `base64`) on three paths: unhandled format (switch default returns false → `if (!destBuffer) return {log}`), animated image (`metadata.pages > 1` → false), and skippedLarger (newSize >= oldSize). `attachment` is then `undefined`, uploadToCloudStorage passes it as `fileBuffer` to saveToTemp → `save(undefined, tempLocalFile)` → `Buffer.from(undefined)` → TypeError ERR_INVALID_ARG_TYPE, caught by uploadToCloudStorage's catch which returns null. All 4 entries of `files` end with `originalSource: null` → handleCreateFiles' fileCreate mutation is rejected ('Expected value to not be null' for 0..3) → handleCreateFiles returns non-array → `createdFiles.map is not a function` and the shop never gets isCreatedPreviewImages. Execution vw9nfpddy5tm (abiigc-aq.myshopify.com) logged 'Format not handled: svg' immediately before each of its 4 TypeErrors — the largest file on that shop is an SVG, which sharp's format switch does not handle. The other 3 executions logged no diagnostic line at all, which by elimination leaves the two silent no-base64 branches (animated image, or skippedLarger), since both prepareImage failure and compressImage catch would have logged.

Confidence: `high`

## Code
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:65` — destructures `{base64: attachment}` from sharpCompressImage, whose return type is documented `{log: {}, base64?: string}` — base64 is optional and not checked
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:70` — passes the possibly-undefined `attachment` as fileBuffer — this is the frame '/workspace/lib/handlers/pubsub/subscribeCreatePreviewImages.js:85:72' in every stack
- `packages/functions/src/services/storageService.js:22` — uploadToCloudStorage forwards fileBuffer to saveToTemp with no validation — stack frame 'uploadToCloudStorage (lib/services/storageService.js:34:11)'
- `packages/functions/src/services/storageService.js:74` — saveToTemp calls save-file's save(file, ...) which does Buffer.from(file) — the actual throw site, 'saveToTemp (lib/services/storageService.js:93:29)'
- `packages/functions/src/helpers/optimize/sharp.js:53` — `if (!destBuffer) return {log}` — returns without base64, the source of the undefined
- `packages/functions/src/helpers/optimize/sharp.js:193` — `console.log('Format not handled:', metadata.format)` then default returns false — produced the 4x 'Format not handled: svg' lines in execution vw9nfpddy5tm
- `packages/functions/src/helpers/optimize/sharp.js:59` — skippedLarger branch returns {log} with no base64 and logs nothing — the silent path matching the 3 executions with no diagnostic line
- `packages/functions/src/helpers/optimize/sharp.js:170` — animated-image branch returns false and logs nothing — the other silent no-base64 path
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:36` — `createdFiles.map(...)` on the rejected fileCreate result — downstream symptom 'Error processCreatePreviewImages createdFiles.map is not a function'

## Evidence
- 32 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-30T07:00:00Z" AND timestamp<="2026-07-31T07:10:00Z" AND textPayload:"ERR_INVALID_ARG_TYPE"`
- 4 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-30T07:00:00Z" AND timestamp<="2026-07-31T07:10:00Z" AND textPayload:"Format not handled"`
- 8 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-30T07:00:00Z" AND timestamp<="2026-07-31T07:10:00Z" AND (textPayload:"createdFiles.map" OR textPayload:"Expected value to not be null")`
- 22 matching entries: `(resource.labels.function_name="createPreviewImages") AND labels.execution_id="vw9nfpddy5tm"`

## Job
- analyze rounds: 1
- cost: $2.88
- tests: 16 tests, 74 failing · baseline 73 failing · reproduce check did not pass

```
.../handlers/pubsub/subscribeCreatePreviewImages.js   | 19 +++++++++++++++----
 packages/functions/src/services/storageService.js     |  4 ++--
 2 files changed, 17 insertions(+), 6 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
