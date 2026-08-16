fingerprint: 1dlgm1s
service: createPreviewImages
message: RangeError: Maximum call stack size exceeded
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-16T09:37:26.820Z
status: inconclusive
attempt: 4

# IMG-OPT · createPreviewImages · 1dlgm1s

**Outcome.** smoke gate new_failures

**Root cause.** subscribeCreatePreviewImages hands sharpCompressImage's base64 STRING to uploadToCloudStorage, which requires a Buffer; save-file then routes the string through string-to-arraybuffer → is-base64, whose regex .test() blows the V8 backtrack stack on the large auto-quality (q92) preview payload.

**Mechanism.** uploadToStorage destructures `{base64: attachment}` from sharpCompressImage (packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:65) — sharp.js:65 builds that with `Buffer.from(destBuffer).toString('base64')`, a string, while sharp.js:66 also returns the raw `destBuffer`. That string is passed as `fileBuffer` into uploadToCloudStorage (subscribeCreatePreviewImages.js:70), which forwards it as `{file: fileBuffer}` to saveToTemp (storageService.js:22) → `save(file, tempLocalFile)` (storageService.js:74). save-file's to-array-buffer sees a string, not a Buffer, so it falls to stringToArrayBuffer → isBase64 → `RegExp.test` over the whole multi-MB base64 string, which is exactly the frame stack in the alert (`at RegExp.test` / `isBase64` / `stringToArrayBuffer` / `to-array-buffer/index.js:21`). RangeError is caught by uploadToCloudStorage's catch (storageService.js:34-37), which returns null, so `files[0].originalSource` is null → Shopify rejects the fileCreate ('invalid value for 0.originalSource (Expected value to not be null)') → handleCreateFiles returns undefined → 'createdFiles.map is not a function'. Execution 2norx2khql0m (shop unpass-1358.myshopify.com, 2026-08-16T08:55) shows the whole chain in order: 4 successful compresses at 08:55:32 → RangeError at 08:55:43.746786Z → originalSource-null at 08:55:43.746801Z → createdFiles.map at 08:55:48. Index 0 is AUTO_OPTIMIZE_QUALITY (const/optimize/compressImage.js:11), quality 92, i.e. the largest of the four base64 strings — the only one big enough to overflow, and all 31 Shopify rejections in 7 days name index 0. The same defective line has a second symptom: when sharp returns `{log}` with no `base64` (skippedLarger / compress failure), `attachment` is undefined and save() throws ERR_INVALID_ARG_TYPE from the same storageService.js:93 frame.

Confidence: `high`

## Code
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:65` — destructures `{base64: attachment}` — a base64 string, not the Buffer the uploader needs; also undefined when sharp returns only `{log}`
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:70` — passes that string as the `fileBuffer` argument of uploadToCloudStorage; matches the `subscribeCreatePreviewImages.js:85:72` prod frame (lib line numbers differ)
- `packages/functions/src/helpers/optimize/sharp.js:65` — `const base64 = Buffer.from(destBuffer).toString('base64')` — where the oversized string is created
- `packages/functions/src/helpers/optimize/sharp.js:66` — `return {log, base64, destBuffer}` — the raw Buffer the caller should have used is already returned
- `packages/functions/src/services/storageService.js:22` — `await saveToTemp({file: fileBuffer, tempLocalFile})` — the `uploadToCloudStorage` frame in the stack
- `packages/functions/src/services/storageService.js:74` — `return save(file, tempLocalFile)` — the `saveToTemp` frame that enters save-file → to-array-buffer → is-base64
- `packages/functions/src/const/optimize/compressImage.js:11` — AUTO_OPTIMIZE_QUALITY is index 0 of OPTIMIZE_QUALITY_TYPES = quality 92 = largest payload; every Shopify rejection names index 0
- `packages/functions/src/services/storageService.js:34` — catch swallows the RangeError and returns null, turning a crash into a null originalSource downstream

## Evidence
- 19 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-09T00:00:00Z" AND timestamp<="2026-08-16T09:15:00Z" AND textPayload:"Maximum call stack size exceeded"`
- 31 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-09T00:00:00Z" AND timestamp<="2026-08-16T09:15:00Z" AND textPayload:"was provided invalid value for 0.originalSource"`
- 23 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-09T00:00:00Z" AND timestamp<="2026-08-16T09:15:00Z" AND textPayload:"ERR_INVALID_ARG_TYPE"`
- 6 matching entries: `resource.labels.function_name="createPreviewImages" AND labels.execution_id="2norx2khql0m"`
- 31 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-09T00:00:00Z" AND timestamp<="2026-08-16T09:15:00Z" AND textPayload:"createdFiles.map is not a function"`

## Job
- analyze rounds: 1
- cost: $5.51
- tests: 4 tests, 102 failing · baseline 100 failing · reproduce check did not pass

```
.../handlers/pubsub/subscribeCreatePreviewImages.js    | 18 ++++++++++++------
 packages/functions/src/services/storageService.js      |  8 ++++++--
 2 files changed, 18 insertions(+), 8 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
