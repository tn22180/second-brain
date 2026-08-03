fingerprint: a4bayk
service: createPreviewImages
message: TypeError [ERR_INVALID_ARG_TYPE]: The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received undefined
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-03T06:25:13.904Z
status: inconclusive
attempt: 3

# IMG-OPT · createPreviewImages · a4bayk

**Outcome.** smoke gate new_failures

**Root cause.** uploadToStorage passes sharpCompressImage's optional `base64` straight into uploadToCloudStorage without checking it exists, so whenever the shop's single largest Shopify file is one sharp cannot compress (animated image, unhandled format, download exhaustion, or output-not-smaller), `Buffer.from(undefined)` throws once per quality level and all 4 originalSource values come back null.

**Mechanism.** processCreatePreviewImages -> uploadToStorage -> getLargestImage picks the single biggest IMAGE file by ORIGINAL_UPLOAD_SIZE with no format filter (getLargestImage.js:11). For each of the 4 OPTIMIZE_QUALITY_TYPES (auto/high/medium/low, compressImage.js:10) it destructures `{base64: attachment}` from sharpCompressImage (subscribeCreatePreviewImages.js:65), whose documented return is `{log: {}, base64?: string}` — base64 is optional. sharp.js returns without base64 on four paths: `if (!destBuffer) return {log}` (sharp.js:53) reached from the animated branch (sharp.js:170, logs nothing), the unhandled-format branch (sharp.js:193, logs 'Format not handled'), and download exhaustion (sharp.js:131, logs 'sharp prepare image attempt N failed'); plus the skippedLarger exit (sharp.js:62, logs nothing). `attachment` is then undefined -> forwarded as fileBuffer (subscribeCreatePreviewImages.js:70) -> uploadToCloudStorage passes it to saveToTemp unchecked (storageService.js:22) -> saveToTemp calls save-file's save() (storageService.js:74) which does Buffer.from(undefined) -> TypeError ERR_INVALID_ARG_TYPE, swallowed by uploadToCloudStorage's catch returning null. All 4 files end with originalSource: null -> handleCreateFiles' fileCreate is rejected ('Expected value to not be null' for 0..3) -> non-array return -> `createdFiles.map is not a function` (subscribeCreatePreviewImages.js:36) and the shop never gets isCreatedPreviewImages. This alert's execution k34lgyjothsa (shop f5d1ae.myshopify.com, started 06:14:44.855) threw the identical TypeError at Promise.all index 0/1/2/3 within 3ms of each other (06:14:55.4557-.4585), followed by the fileCreate rejection at 06:14:55.635 and 'createdFiles.map is not a function' at 06:15:00.636. It logged no 'Format not handled' and no 'sharp prepare image attempt' line, so it took one of the two silent no-base64 exits (animated image at sharp.js:170, or skippedLarger at sharp.js:62) — the logs cannot distinguish which, and the defect is the same either way. Fleet shape over 7 days: 14 executions failed with exactly 4 TypeErrors each (all 4 quality levels, never a subset), 4 of them with a diagnostic line naming the cause — crwo5af5mxum and lcslc63d0sp0 timed out on .gif URLs, 8ccqur1iwtfx and vw9nfpddy5tm logged 4x 'Format not handled: svg' each — and 10 silent like this one.

Confidence: `high`

## Code
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:65` — destructures `{base64: attachment}` from sharpCompressImage, whose JSDoc return type is `{log: {}, base64?: string}` — optional and never checked
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:70` — passes the possibly-undefined `attachment` as fileBuffer — this is frame '/workspace/lib/handlers/pubsub/subscribeCreatePreviewImages.js:85:72' in all 4 stacks of this alert
- `packages/functions/src/services/storageService.js:22` — uploadToCloudStorage forwards fileBuffer to saveToTemp with no validation — frame 'uploadToCloudStorage (lib/services/storageService.js:34:11)'
- `packages/functions/src/services/storageService.js:74` — saveToTemp calls save-file's save(file, ...) which does Buffer.from(file) — the throw site, frame 'saveToTemp (lib/services/storageService.js:93:29)'
- `packages/functions/src/helpers/optimize/sharp.js:53` — `if (!destBuffer) return {log}` — the exit that returns with no base64, reached by three of the four failure branches
- `packages/functions/src/helpers/optimize/sharp.js:62` — skippedLarger `return {log}` — fourth no-base64 exit, silent, one of the two candidates for this execution
- `packages/functions/src/helpers/optimize/sharp.js:170` — `if (metadata.pages > 1)` pushes 'Animated image' and returns false without logging — the other silent candidate for k34lgyjothsa
- `packages/functions/src/helpers/optimize/sharp.js:193` — `console.log('Format not handled:', metadata.format)` then default returns false — produced 4x 'Format not handled: svg' on executions 8ccqur1iwtfx and vw9nfpddy5tm
- `packages/functions/src/helpers/optimize/sharp.js:131` — after maxRetries prepareImage returns `{errors:[...]}` with no destBuffer — the download-exhaustion path, seen on crwo5af5mxum and lcslc63d0sp0
- `packages/functions/src/helpers/graphql/getLargestImage.js:11` — sortKey ORIGINAL_UPLOAD_SIZE reverse with no format filter — deliberately selects the biggest file, which is exactly the animated-GIF / SVG / slow-download case sharp cannot handle
- `packages/functions/src/const/optimize/compressImage.js:10` — OPTIMIZE_QUALITY_TYPES has 4 entries — matches Promise.all indices 0..3 in the four stacks of this alert
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:36` — `createdFiles.map(...)` on the rejected fileCreate result — the downstream symptom logged in all 17 failing executions

## Evidence
- 17 matching entries: `(resource.labels.function_name="createPreviewImages") AND labels.execution_id="k34lgyjothsa"`
- 59 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-27T00:00:00Z" AND timestamp<="2026-08-03T06:30:00Z" AND textPayload:"    at save ("`
- 17 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-27T00:00:00Z" AND timestamp<="2026-08-03T06:30:00Z" AND textPayload:"createdFiles.map is not a function"`
- 149 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-27T00:00:00Z" AND timestamp<="2026-08-03T06:30:00Z" AND textPayload:"Function execution started"`
- 17 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-27T00:00:00Z" AND timestamp<="2026-08-03T06:30:00Z" AND textPayload:"Expected value to not be null"`
- 8 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-27T00:00:00Z" AND timestamp<="2026-08-03T06:30:00Z" AND textPayload:"Format not handled"`
- 11 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-27T00:00:00Z" AND timestamp<="2026-08-03T06:30:00Z" AND textPayload:"timeout of 30000ms exceeded"`

## Job
- analyze rounds: 1
- cost: $3.10
- tests: 16 tests, 75 failing · baseline 73 failing · reproduce check did not pass

```
.../pubsub/subscribeCreatePreviewImages.js         | 37 +++++++++++++---------
 packages/functions/src/services/storageService.js  |  7 ++--
 2 files changed, 27 insertions(+), 17 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
