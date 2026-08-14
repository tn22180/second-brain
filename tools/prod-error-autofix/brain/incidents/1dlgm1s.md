fingerprint: 1dlgm1s
service: createPreviewImages
message: RangeError: Maximum call stack size exceeded
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-14T01:54:27.753Z
status: inconclusive
attempt: 2

# IMG-OPT · createPreviewImages · 1dlgm1s

**Outcome.** smoke gate new_failures

**Root cause.** subscribeCreatePreviewImages passes the base64 *string* from sharpCompressImage into uploadToCloudStorage (which expects a Buffer), so save-file routes it to string-to-arraybuffer → is-base64, whose nested-quantifier regex overflows V8's irregexp stack on a multi-megabyte string: RangeError: Maximum call stack size exceeded.

**Mechanism.** getLargestImage deliberately asks Shopify for the single biggest image in the shop (files(first:1, query:"media_type:IMAGE", sortKey:ORIGINAL_UPLOAD_SIZE, reverse:true) — getLargestImage.js:11). uploadToStorage compresses it once per OPTIMIZE_QUALITY_TYPES entry (4: auto/high/medium/low). sharpCompressImage returns `{log, base64, destBuffer}` where base64 = Buffer.from(destBuffer).toString('base64') (sharp.js:65-66) — a JS string ~4/3 the compressed size. subscribeCreatePreviewImages.js:65 destructures `{base64: attachment}` and line 70-71 hands that string to uploadToCloudStorage, whose JSDoc/param is `fileBuffer {Buffer}` (storageService.js:13,18) but which enforces nothing. It forwards to saveToTemp → save(file, tempLocalFile) (storageService.js:22, :74) → save-file/index.js:27 → to-array-buffer sees typeof 'string', not a Buffer, so it takes the string-to-arraybuffer branch, which calls isBase64(str). is-base64 tests a pattern containing a nested quantifier ((?:[A-Za-z0-9+/]{4})*); V8 recurses per repetition, so RegExp.test on a string this long overflows the call stack — exactly the top two frames of the prod stack (RegExp.test → isBase64). uploadToCloudStorage swallows it (storageService.js:34-37, matching prod frame storageService.js:34:11) and returns null, so that preview entry ships `originalSource: null`. In the alerted execution gmjby16rh9do (shop sji0e0-jm.myshopify.com) the very next log line 0 ms later is `handleCreateFiles Variable $files of type [FileCreateInput!]! was provided invalid value for 0.originalSource (Expected value to not be null)`, then `Error processCreatePreviewImages createdFiles.map is not a function` — one cause, three symptoms, and the shop never gets isCreatedPreviewImages set. Size-dependence is visible in the data: across 7 days the 12 RangeErrors distribute over `async Promise.all (index N)` as 6/3/2/1 for N=0/1/2/3, i.e. monotonically decreasing with quality index — index 0 is AUTO_OPTIMIZE_QUALITY (quality 92, largest output, compressImage.js:10-15) and index 3 is LOW (quality 50, smallest). Only the callers that pass a real Buffer are unaffected: lightHouseService.js:325 passes Buffer.from(report[0],'utf8') and never throws, which isolates the defect to the string-typed caller, not to uploadToCloudStorage itself. The same unvalidated argument produces a sibling failure at the identical call site when sharpCompressImage returns no base64 at all (skippedLarger / compress failure): `TypeError [ERR_INVALID_ARG_TYPE] ... Received undefined at Function.from (node:buffer:322:9) at save (save-file/index.js:27:17)`, 126 log lines in 7 days — same line, same null-originalSource outcome, not a second root cause.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/getLargestImage.js:11` — sortKey:ORIGINAL_UPLOAD_SIZE, reverse:true, first:1 — the input is by construction the shop's largest image, so the base64 string is large enough to overflow the regex stack
- `packages/functions/src/helpers/optimize/sharp.js:65` — base64 = Buffer.from(destBuffer).toString('base64') — a String, not a Buffer; the type that sends save-file down the string branch
- `packages/functions/src/helpers/optimize/sharp.js:66` — return {log, base64, destBuffer} — destBuffer is already returned, so the correct value is available at the call site with no new plumbing
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:65` — destructures {base64: attachment} — attachment is a string, and is undefined when sharp returns only {log}
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:70` — passes that string as the fileBuffer arg; matches prod frame subscribeCreatePreviewImages.js:85:72 inside the Promise.all at src:63 (lib:77)
- `packages/functions/src/services/storageService.js:18` — signature/JSDoc says fileBuffer/{Buffer} but nothing enforces it; matches prod frame uploadToCloudStorage storageService.js:34:11
- `packages/functions/src/services/storageService.js:34` — catch swallows the RangeError and returns null, which is what becomes originalSource: null
- `packages/functions/src/services/storageService.js:74` — return save(file, tempLocalFile) — matches prod frame saveToTemp storageService.js:93:29 into save-file/index.js:27
- `packages/functions/src/services/lightHouseService.js:325` — the only other caller passes Buffer.from(report[0],'utf8') and never throws — isolates the defect to the string-typed caller
- `packages/functions/src/const/optimize/compressImage.js:10` — OPTIMIZE_QUALITY_TYPES = [auto, high, medium, low] — index 0 is quality 92 (largest output), which is why Promise.all index 0 dominates the RangeError distribution 6/3/2/1
- `packages/functions/package.json:80` — save-file ^2.3.1 is the dependency that pulls in to-array-buffer → string-to-arraybuffer → is-base64

## Evidence
- 1 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-13T13:58:26.303Z" AND timestamp<="2026-08-13T14:28:26.303Z" AND severity>=ERROR`
- 6 matching entries: `resource.labels.function_name="createPreviewImages" AND labels.execution_id="gmjby16rh9do" AND timestamp>="2026-08-13T13:58:26.303Z" AND timestamp<="2026-08-13T14:28:26.303Z"`
- 12 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-06T00:00:00Z" AND timestamp<="2026-08-13T15:00:00Z" AND textPayload:"Maximum call stack size exceeded"`
- 24 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-06T00:00:00Z" AND timestamp<="2026-08-13T15:00:00Z" AND textPayload:"Expected value to not be null"`
- 126 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-06T00:00:00Z" AND timestamp<="2026-08-13T15:00:00Z" AND textPayload:"ERR_INVALID_ARG_TYPE"`

## Job
- analyze rounds: 1
- cost: $4.71
- tests: 4 tests, 101 failing · baseline 100 failing · reproduce check did not pass

```
.../functions/src/handlers/pubsub/subscribeCreatePreviewImages.js | 8 +++++---
 1 file changed, 5 insertions(+), 3 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
