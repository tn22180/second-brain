fingerprint: a4bayk
service: createPreviewImages
message: TypeError [ERR_INVALID_ARG_TYPE]: The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received undefined
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-02T05:17:57.509Z
status: inconclusive
attempt: 2

# IMG-OPT · createPreviewImages · a4bayk

**Outcome.** smoke gate new_failures

**Root cause.** uploadToStorage passes sharpCompressImage's optional `base64` straight into uploadToCloudStorage without checking it exists; whenever the shop's single largest Shopify file cannot be compressed (animated GIF, SVG, or a download that exhausts the 30s retry budget) sharp returns `{log}` with no base64, so `Buffer.from(undefined)` throws once per quality level and all 4 originalSource values come back null.

**Mechanism.** processCreatePreviewImages → uploadToStorage → getLargestImage picks the single biggest file by ORIGINAL_UPLOAD_SIZE with no format filter (getLargestImage.js:11) → for each of the 4 OPTIMIZE_QUALITY_TYPES it destructures `{base64: attachment}` from sharpCompressImage. sharp.js returns `{log}` with no base64 on three paths that all end at `if (!destBuffer) return {log}` (sharp.js:53): animated image (`metadata.pages > 1` → false, sharp.js:170), unhandled format (`Format not handled` → false, sharp.js:193), and download exhaustion (`return {errors:[e.message]}`, sharp.js:131, no destBuffer at all). `attachment` is then undefined → uploadToCloudStorage forwards it as fileBuffer (storageService.js:22) → saveToTemp → save-file's `Buffer.from(undefined)` → TypeError ERR_INVALID_ARG_TYPE, swallowed by uploadToCloudStorage's catch which returns null. All 4 files end with `originalSource: null` → handleCreateFiles' fileCreate is rejected ('Expected value to not be null' for 0..3) → non-array return → `createdFiles.map is not a function` (subscribeCreatePreviewImages.js:36) and the shop never gets isCreatedPreviewImages. This alert's execution crwo5af5mxum (cbra1v-1i.myshopify.com, started 05:07:39.58) had a GIF as its largest file: 3 of 4 parallel fetches of highlights_1080x1080_2.gif logged 'timeout of 30000ms exceeded' at 05:08:10.53 (30.9s after start, matching the `timeout: 30000` at sharp.js:91), the 4th completed the download at 05:08:04 with no diagnostic line — the silent animated-GIF branch — and all four ended in the same TypeError, followed by the fileCreate rejection at 05:08:12.679 and 'createdFiles.map is not a function' at 05:08:17.68. Same shape across the fleet: execution lcslc63d0sp0 timed out 8× on gemini_generated_video_5609ECDD.gif, executions 8ccqur1iwtfx and vw9nfpddy5tm logged 4× 'Format not handled: svg' each.

Confidence: `high`

## Code
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:65` — destructures `{base64: attachment}` from sharpCompressImage, whose documented return is `{log: {}, base64?: string}` — base64 is optional and never checked
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:70` — passes the possibly-undefined `attachment` as fileBuffer — this is the frame '/workspace/lib/handlers/pubsub/subscribeCreatePreviewImages.js:85:72' in all 59 stacks
- `packages/functions/src/services/storageService.js:22` — uploadToCloudStorage forwards fileBuffer to saveToTemp with no validation — frame 'uploadToCloudStorage (lib/services/storageService.js:34:11)'
- `packages/functions/src/services/storageService.js:74` — saveToTemp calls save-file's save(file, ...) which does Buffer.from(file) — the throw site, frame 'saveToTemp (lib/services/storageService.js:93:29)'
- `packages/functions/src/helpers/optimize/sharp.js:53` — `if (!destBuffer) return {log}` — the single exit that returns without base64, reached by all three failure branches
- `packages/functions/src/helpers/optimize/sharp.js:170` — `if (metadata.pages > 1)` pushes 'Animated image' and returns false — the silent branch that fired for the 4th quality level of crwo5af5mxum (a GIF) and logs nothing
- `packages/functions/src/helpers/optimize/sharp.js:91` — `timeout: 30000` on the image fetch — matches the 'timeout of 30000ms exceeded' lines at 05:08:10.53, 30.9s after execution start
- `packages/functions/src/helpers/optimize/sharp.js:131` — after maxRetries the prepareImage catch returns `{errors:[...]}` with no srcBuffer/destBuffer — third no-base64 path, seen 8× on execution lcslc63d0sp0
- `packages/functions/src/helpers/optimize/sharp.js:193` — `console.log('Format not handled:', metadata.format)` then default returns false — produced 4× 'Format not handled: svg' on executions 8ccqur1iwtfx and vw9nfpddy5tm
- `packages/functions/src/helpers/graphql/getLargestImage.js:11` — sortKey ORIGINAL_UPLOAD_SIZE reverse with no format filter — deliberately selects the biggest file, which is exactly the animated GIF / SVG / slow-download case sharp cannot handle
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:36` — `createdFiles.map(...)` on the rejected fileCreate result — the downstream symptom logged in all 17 failing executions

## Evidence
- 22 matching entries: `(resource.labels.function_name="createPreviewImages") AND labels.execution_id="crwo5af5mxum"`
- 59 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-26T00:00:00Z" AND timestamp<="2026-08-02T05:23:00Z" AND textPayload:"    at save ("`
- 17 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-26T00:00:00Z" AND timestamp<="2026-08-02T05:23:00Z" AND textPayload:"createdFiles.map is not a function"`
- 141 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-26T00:00:00Z" AND timestamp<="2026-08-02T05:23:00Z" AND textPayload:"Function execution started"`
- 8 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-26T00:00:00Z" AND timestamp<="2026-08-02T05:23:00Z" AND textPayload:"Format not handled"`
- 11 matching entries: `(resource.labels.function_name="createPreviewImages") AND timestamp>="2026-07-26T00:00:00Z" AND timestamp<="2026-08-02T05:23:00Z" AND textPayload:"timeout of 30000ms exceeded"`

## Job
- analyze rounds: 1
- cost: $3.60
- tests: 16 tests, 74 failing · baseline 73 failing · reproduce check did not pass

```
.../src/handlers/pubsub/subscribeCreatePreviewImages.js   | 15 +++++++++++----
 packages/functions/src/services/storageService.js         |  4 ++--
 2 files changed, 13 insertions(+), 6 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
