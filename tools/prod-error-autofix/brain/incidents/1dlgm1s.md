fingerprint: 1dlgm1s
service: createPreviewImages
message: RangeError: Maximum call stack size exceeded
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-22T03:39:45.718Z
status: fix_disabled
attempt: 5

# IMG-OPT · createPreviewImages · 1dlgm1s

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** subscribeCreatePreviewImages passes sharpCompressImage's base64 STRING (not the Buffer it also returns) into uploadToCloudStorage, so save-file routes the multi-MB string through to-array-buffer → string-to-arraybuffer → is-base64's RegExp.test, which overflows the V8 backtrack stack with RangeError: Maximum call stack size exceeded.

**Mechanism.** Alerted execution whszxqe1u338 (shop qhchd0-g7.myshopify.com, 2026-08-19T11:18) shows the whole chain in order: 11:18:07.94 four sharp compresses finish (WebP quality outputs 45/72/63/83) → 11:18:20.662489Z RangeError with frames `isBase64` / `stringToArrayBuffer` / `to-array-buffer/index.js:21` / `save` / `saveToTemp (lib/services/storageService.js:93)` / `uploadToCloudStorage (lib/.../storageService.js:34)` / `subscribeCreatePreviewImages.js:85` / `async Promise.all (index 0)` → 11:18:20.662503Z 'handleCreateFiles Variable $files ... provided invalid value for 0.originalSource (Expected value to not be null)' → 11:18:25.662744Z 'Error processCreatePreviewImages createdFiles.map is not a function' → execution finishes 'ok' at 21606 ms. Source: packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:65 destructures `{base64: attachment}`; sharp.js:65 builds that with `Buffer.from(destBuffer).toString('base64')` — a string — while sharp.js:66 already returns the raw `destBuffer`. That string is handed to uploadToCloudStorage as `fileBuffer` (subscribeCreatePreviewImages.js:70) → `saveToTemp({file: fileBuffer})` (storageService.js:22) → `save(file, tempLocalFile)` (storageService.js:74), and save-file only takes the isBase64 branch because the arg is a string instead of a Buffer. The catch at storageService.js:34 swallows the RangeError and returns null, so `originalSource` is null → Shopify rejects the fileCreate → handleCreateFiles returns undefined → `createdFiles.map is not a function`. Index 0 of OPTIMIZE_QUALITY_TYPES (compressImage.js:11) is AUTO_OPTIMIZE_QUALITY, the highest quality / largest payload — every stack in the window says `Promise.all (index 0)` and every Shopify rejection names `0.originalSource`.

Confidence: `high`

## Code
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:65` — destructures `{base64: attachment}` — a base64 string, not the Buffer the uploader needs (and undefined when sharp returns only `{log}`)
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:70` — passes that string as the `fileBuffer` argument of uploadToCloudStorage; the `subscribeCreatePreviewImages.js:85:72` prod frame (lib line numbers differ)
- `packages/functions/src/helpers/optimize/sharp.js:65` — `const base64 = Buffer.from(destBuffer).toString('base64')` — where the oversized string is created
- `packages/functions/src/helpers/optimize/sharp.js:66` — `return {log, base64, destBuffer}` — the raw Buffer the caller should have used is already returned
- `packages/functions/src/services/storageService.js:22` — `await saveToTemp({file: fileBuffer, tempLocalFile})` — the `uploadToCloudStorage` frame in the stack
- `packages/functions/src/services/storageService.js:74` — `return save(file, tempLocalFile)` — the `saveToTemp` frame that enters save-file → to-array-buffer → is-base64
- `packages/functions/src/services/storageService.js:34` — catch swallows the RangeError and returns null, turning the crash into a null originalSource downstream
- `packages/functions/src/const/optimize/compressImage.js:11` — AUTO_OPTIMIZE_QUALITY is index 0 of OPTIMIZE_QUALITY_TYPES = largest payload; every stack says `Promise.all (index 0)` and every Shopify rejection names `0.originalSource`

## Evidence
- 12 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-16T00:00:00Z" AND timestamp<="2026-08-22T00:00:00Z" AND textPayload:"Maximum call stack size exceeded"`
- 20 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-16T00:00:00Z" AND timestamp<="2026-08-22T00:00:00Z" AND textPayload:"invalid value for 0.originalSource"`
- 20 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-16T00:00:00Z" AND timestamp<="2026-08-22T00:00:00Z" AND textPayload:"createdFiles.map is not a function"`
- 9 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-19T11:15:00Z" AND timestamp<="2026-08-19T11:25:00Z"`

## Job
- analyze rounds: 1
- cost: $1.32

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
