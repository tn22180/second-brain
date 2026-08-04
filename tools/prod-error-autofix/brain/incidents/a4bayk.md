fingerprint: a4bayk
service: createPreviewImages
message: TypeError [ERR_INVALID_ARG_TYPE]: The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received undefined
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-04T08:02:41.528Z
status: inconclusive
attempt: 4

# IMG-OPT · createPreviewImages · a4bayk

**Outcome.** smoke gate new_failures

**Root cause.** uploadToStorage destructures the optional `base64` off sharpCompressImage and passes it to uploadToCloudStorage without checking it exists, so whenever the shop's single largest Shopify image is one sharp returns no buffer for (animated, unhandled format, download exhaustion, or output-not-smaller), `Buffer.from(undefined)` throws once per quality level and all 4 originalSource values come back null.

**Mechanism.** Execution l6f1rh24ctfk (shop tumvi7-hu.myshopify.com, started 07:51:21.879Z) is the alert. getLargestImage asks Shopify for files(first:1, media_type:IMAGE, sortKey:ORIGINAL_UPLOAD_SIZE, reverse:true) — the single biggest image file, no format filter (getLargestImage.js:11). uploadToStorage then fans out over the 4 OPTIMIZE_QUALITY_TYPES (auto/high/medium/low, compressImage.js:10) and destructures `{base64: attachment}` from sharpCompressImage (subscribeCreatePreviewImages.js:65), whose declared return is `{log: {}, base64?: string}` — base64 is optional and is never checked. sharp.js returns with no base64 on four paths: `if (!destBuffer) return {log}` (sharp.js:53), reached from the animated branch (sharp.js:170, pushes 'Animated image' and logs nothing), the unhandled-format branch (sharp.js:193, logs 'Format not handled: <fmt>'), and download exhaustion (sharp.js:131, logs 'sharp prepare image attempt N failed'); plus the skippedLarger exit (sharp.js:62, silent). `attachment` is then undefined, forwarded as fileBuffer (subscribeCreatePreviewImages.js:70) -> uploadToCloudStorage hands it to saveToTemp unchecked (storageService.js:22) -> saveToTemp calls save-file's save() (storageService.js:74) which does Buffer.from(undefined) -> TypeError ERR_INVALID_ARG_TYPE, swallowed by uploadToCloudStorage's catch returning null. This execution threw it at Promise.all index 0/1/2/3 within 4ms (07:51:41.0119-.0154), all 4 originalSource null, so handleCreateFiles was rejected at 07:51:41.222 with 'Expected value to not be null' for 0..3, the non-array return made `createdFiles.map` throw at 07:51:46.224 (subscribeCreatePreviewImages.js:36), and the shop never got isCreatedPreviewImages or preview URLs. This execution logged no 'Format not handled' and no 'sharp prepare image attempt', so it took one of the two silent no-base64 exits (animated at sharp.js:170, or skippedLarger at sharp.js:62) — 19.07s elapsed between the shop line and the first TypeError, which fits a large slow-downloading source; the logs cannot separate the two and the defect is identical either way. Fleet shape 2026-07-28..08-04: 65 TypeErrors over 16 executions with exactly 4 each (never a subset) out of 152 executions total (10.5%), 17 with the downstream createdFiles.map failure; only 4 of the 16 carry a diagnostic line — crwo5af5mxum and lcslc63d0sp0 timed out downloading .gif sources, 8ccqur1iwtfx and vw9nfpddy5tm logged 4x 'Format not handled: svg' — the other 12, including this one, are silent.

Confidence: `high`

## Code
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:65` — destructures `{base64: attachment}` from sharpCompressImage, whose JSDoc return type is `{log: {}, base64?: string}` — optional, never checked
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:70` — passes the possibly-undefined `attachment` as fileBuffer — frame '/workspace/lib/handlers/pubsub/subscribeCreatePreviewImages.js:85:72' in all 4 stacks of this alert
- `packages/functions/src/services/storageService.js:22` — uploadToCloudStorage forwards fileBuffer to saveToTemp with no validation — frame 'uploadToCloudStorage (lib/services/storageService.js:34:11)'
- `packages/functions/src/services/storageService.js:74` — saveToTemp calls save-file's save(file, ...) which does Buffer.from(file) — the throw site, frame 'saveToTemp (lib/services/storageService.js:93:29)'
- `packages/functions/src/helpers/optimize/sharp.js:53` — `if (!destBuffer) return {log}` — the no-base64 exit reached by three of the four failure branches
- `packages/functions/src/helpers/optimize/sharp.js:62` — skippedLarger `return {log}` — fourth no-base64 exit, silent; one of two candidates for this execution
- `packages/functions/src/helpers/optimize/sharp.js:170` — `if (metadata.pages > 1)` pushes 'Animated image' and returns false without logging — the other silent candidate for l6f1rh24ctfk
- `packages/functions/src/helpers/optimize/sharp.js:193` — `console.log('Format not handled:', metadata.format)` then default returns false — produced 4x 'Format not handled: svg' on 8ccqur1iwtfx and vw9nfpddy5tm
- `packages/functions/src/helpers/optimize/sharp.js:131` — after maxRetries prepareImage returns `{errors:[...]}` with no destBuffer — the download-exhaustion path seen on crwo5af5mxum and lcslc63d0sp0
- `packages/functions/src/helpers/graphql/getLargestImage.js:11` — files(first:1 ... sortKey:ORIGINAL_UPLOAD_SIZE, reverse:true) with no format filter — deliberately picks the single biggest file, exactly the animated-GIF / SVG / slow-download case sharp cannot handle, with no fallback to the next candidate
- `packages/functions/src/const/optimize/compressImage.js:10` — OPTIMIZE_QUALITY_TYPES has 4 entries — matches Promise.all indices 0..3 in the four stacks of this alert
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:36` — `createdFiles.map(...)` on the rejected fileCreate result — the downstream symptom logged at 07:51:46.224 in this execution

## Evidence
- 17 matching entries: `(resource.labels.function_name="createPreviewImages") AND labels.execution_id="l6f1rh24ctfk"`
- 65 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-28T00:00:00Z" AND timestamp<="2026-08-04T08:06:51Z" AND textPayload:"    at save ("`
- 152 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-28T00:00:00Z" AND timestamp<="2026-08-04T08:06:51Z" AND textPayload:"Function execution started"`
- 17 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-28T00:00:00Z" AND timestamp<="2026-08-04T08:06:51Z" AND textPayload:"createdFiles.map is not a function"`
- 8 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-28T00:00:00Z" AND timestamp<="2026-08-04T08:06:51Z" AND textPayload:"Format not handled"`
- 7 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-28T00:00:00Z" AND timestamp<="2026-08-04T08:06:51Z" AND textPayload:"sharp prepare image attempt"`

## Job
- analyze rounds: 1
- cost: $3.75
- tests: 16 tests, 85 failing · baseline 84 failing · reproduce check did not pass

```
.../handlers/pubsub/subscribeCreatePreviewImages.js   | 19 +++++++++++++++----
 packages/functions/src/services/storageService.js     |  7 +++++--
 2 files changed, 20 insertions(+), 6 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
