fingerprint: 1dlgm1s
service: createPreviewImages
message: RangeError: Maximum call stack size exceeded
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-12T08:26:03.185Z
status: inconclusive
attempt: 1

# IMG-OPT · createPreviewImages · 1dlgm1s

**Outcome.** smoke gate new_failures

**Root cause.** subscribeCreatePreviewImages passes the base64 *string* returned by sharpCompressImage into uploadToCloudStorage, which JSDoc-declares a Buffer; save-file therefore takes its string branch and runs is-base64's nested-quantifier regex over a multi-megabyte string, blowing the V8 irregexp stack with RangeError: Maximum call stack size exceeded.

**Mechanism.** getLargestImage deliberately asks Shopify for the single biggest file in the shop (files(first:1, sortKey:ORIGINAL_UPLOAD_SIZE, reverse:true), getLargestImage.js:11). sharpCompressImage compresses it and returns `base64 = Buffer.from(destBuffer).toString('base64')` (sharp.js:65) — a JS string ~4/3 the size of the compressed image. uploadToStorage destructures that as `attachment` (subscribeCreatePreviewImages.js:65) and hands it straight to uploadToCloudStorage(attachment, ...) (subscribeCreatePreviewImages.js:71). uploadToCloudStorage forwards it as `file` to saveToTemp (storageService.js:22) → save(file, tempLocalFile) (storageService.js:74). save-file → to-array-buffer sees typeof 'string', not a Buffer, so it routes to string-to-arraybuffer, which calls isBase64(str). is-base64's pattern uses a nested quantifier ((?:[A-Za-z0-9+/]{4})*) and V8's regex engine recurses per repetition, so RegExp.test on a string this long overflows the call stack — exactly the top two frames of the prod stack (RegExp.test → isBase64). uploadToCloudStorage swallows it in its catch (storageService.js:34-37) and returns null, so every preview entry gets originalSource: null and handleCreateFiles produces no usable preview images; the shop never gets isCreatedPreviewImages set. Contrast the only other caller, lightHouseService.js:325, which passes a real Buffer.from(...) and does not fail.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/getLargestImage.js:11` — sortKey:ORIGINAL_UPLOAD_SIZE, reverse:true — the input is by construction the shop's largest image, so the base64 string is large enough to overflow the regex stack
- `packages/functions/src/helpers/optimize/sharp.js:65` — returns base64 as a String, not a Buffer — the type that sends save-file down the string branch
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:65` — destructures {base64: attachment} — attachment is a string
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:71` — passes the base64 string as the fileBuffer arg; matches prod frame subscribeCreatePreviewImages.js:85:72 inside the Promise.all at src:63 (lib:77)
- `packages/functions/src/services/storageService.js:18` — signature/JSDoc says fileBuffer/{Buffer} but nothing enforces it; matches prod frame uploadToCloudStorage storageService.js:34:11
- `packages/functions/src/services/storageService.js:22` — await saveToTemp({file: fileBuffer, ...}) — the frame above save()
- `packages/functions/src/services/storageService.js:74` — return save(file, tempLocalFile) — matches prod frame saveToTemp storageService.js:93:29 into save-file/index.js:27
- `packages/functions/src/services/lightHouseService.js:325` — the other caller passes Buffer.from(report[0],'utf8') and never throws — isolates the defect to the string-typed caller, not to uploadToCloudStorage itself
- `packages/functions/package.json:79` — save-file ^2.3.1 is the dependency that pulls in to-array-buffer → string-to-arraybuffer → is-base64
- `packages/functions/src/const/optimize/compressImage.js:10` — OPTIMIZE_QUALITY_TYPES has exactly 4 entries, which is why the 4 alert occurrences are Promise.all indices 0,1,2,3 of ONE invocation, not 4 separate shops

## Evidence
- 4 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-06T09:03:34.158Z" AND timestamp<="2026-08-06T09:33:34.158Z" AND severity>=ERROR`
- 4 matching entries: `resource.labels.function_name="createPreviewImages" AND labels.execution_id="6v5z43p3x4yo" AND timestamp>="2026-08-06T09:03:34.158Z" AND timestamp<="2026-08-06T09:33:34.158Z" AND severity>=ERROR`
- 4 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-06T09:03:34.158Z" AND timestamp<="2026-08-06T09:33:34.158Z" AND textPayload:"stringToArrayBuffer"`

## Job
- analyze rounds: 1
- cost: $2.83
- tests: 16 tests, 115 failing · baseline 114 failing · reproduce check did not pass

```
.../functions/src/handlers/pubsub/subscribeCreatePreviewImages.js   | 2 +-
 packages/functions/src/services/storageService.js                   | 6 +++---
 2 files changed, 4 insertions(+), 4 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
