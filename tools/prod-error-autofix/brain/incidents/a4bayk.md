fingerprint: a4bayk
service: createPreviewImages
message: TypeError [ERR_INVALID_ARG_TYPE]: The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received undefined
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-13T08:56:47.737Z
status: inconclusive
attempt: 6

# IMG-OPT · createPreviewImages · a4bayk

**Outcome.** smoke gate new_failures

**Root cause.** getLargestImage picks the shop's largest Shopify file by ORIGINAL_UPLOAD_SIZE under query "media_type:IMAGE", which includes SVGs; sharp cannot produce an output buffer for SVG, so sharpCompressImage returns {log} with no `base64`, and all four OPTIMIZE_QUALITY_TYPES branches call uploadToCloudStorage(undefined) → save() → Buffer.from(undefined) → TypeError [ERR_INVALID_ARG_TYPE].

**Mechanism.** 08:50:04.041Z the handler starts for tockup-422.myshopify.com. getLargestImage (packages/functions/src/helpers/graphql/getLargestImage.js:11) runs `files(first:1, query:"media_type:IMAGE", sortKey:ORIGINAL_UPLOAD_SIZE, reverse:true)` — Shopify classifies SVG under media_type:IMAGE, so the largest file returned is an SVG. uploadToStorage then fans out 4 concurrent branches (packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:63-77), one per quality. In each, compressImage reads metadata.format === 'svg', falls into the switch default and logs `Format not handled: svg` then returns false (packages/functions/src/helpers/optimize/sharp.js:192-194) — logged 4× at 08:50:06.201/.210/.227/.263Z. process() then hits `if (!destBuffer) return {log};` (sharp.js:54), so the destructure `const {base64: attachment}` (subscribeCreatePreviewImages.js:65) yields undefined. That undefined is passed straight to uploadToCloudStorage (subscribeCreatePreviewImages.js:70), which calls saveToTemp → save-file's save() → Buffer.from(undefined) and throws ERR_INVALID_ARG_TYPE — the 4 ERROR entries at 08:50:06.207/.211/.228/.263Z, tagged `Promise.all (index 0..3)`, i.e. every quality of one invocation. uploadToCloudStorage swallows it and returns null (storageService.js:34-37), so all 4 `originalSource` are null; handleCreateFiles' fileCreate mutation is rejected by Shopify (`Expected value to not be null` for 0..3.originalSource at 08:50:06.396Z) and its catch returns the string '' (shopifyGraphQlService.js:1254-1255), so `createdFiles.map` at subscribeCreatePreviewImages.js:36 throws `createdFiles.map is not a function` at 08:50:11.397Z. Same defect, second SVG entry path in the 24h window: a different shop's SVG made sharp(srcBuffer).metadata() throw `Input buffer has corrupt header: glib: XML parse error` (4 entries), which also lands on `!destBuffer` and produces the identical TypeError. Net effect: the shop's preview images are never created and isCreatedPreviewImages is never set, so the shop falls back to the static defaultImage set.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/getLargestImage.js:11` — query "media_type:IMAGE" sortKey:ORIGINAL_UPLOAD_SIZE reverse:true — Shopify returns SVGs under media_type:IMAGE, so the largest file can be an SVG
- `packages/functions/src/helpers/optimize/sharp.js:192` — switch default for metadata.format logs 'Format not handled:' and returns false — the exact line that emitted `Format not handled: svg` 4× at 08:50:06Z
- `packages/functions/src/helpers/optimize/sharp.js:54` — `if (!destBuffer) return {log};` — returns an object with no `base64` key, silently
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:65` — `const {base64: attachment} = await sharpCompressImage(...)` — attachment is undefined, never checked
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:70` — passes the undefined attachment into uploadToCloudStorage; this is lib/handlers/pubsub/subscribeCreatePreviewImages.js:85 in the prod stack, inside Promise.all indices 0-3
- `packages/functions/src/services/storageService.js:22` — await saveToTemp({file: fileBuffer, ...}) with fileBuffer undefined → save-file's Buffer.from(undefined) throws ERR_INVALID_ARG_TYPE
- `packages/functions/src/services/storageService.js:35` — catch swallows the TypeError and returns null, so the failure is only visible as a console.error and originalSource becomes null
- `packages/functions/src/services/shopifyGraphQlService.js:1255` — handleCreateFiles returns '' on the rejected fileCreate mutation, which is why the follow-on error is `createdFiles.map is not a function`
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:36` — createdFiles.map on the '' returned above — the 08:50:11.397Z secondary error

## Evidence
- 4 matching entries: `(resource.labels.service_name="createPreviewImages" OR resource.labels.function_name="createPreviewImages") AND timestamp>="2026-08-13T08:49:00Z" AND timestamp<="2026-08-13T08:52:00Z" AND textPayload:"Format not handled: svg"`
- 4 matching entries: `(resource.labels.service_name="createPreviewImages" OR resource.labels.function_name="createPreviewImages") AND timestamp>="2026-08-13T08:49:00Z" AND timestamp<="2026-08-13T08:52:00Z" AND severity>=ERROR`
- 1 matching entries: `(resource.labels.service_name="createPreviewImages" OR resource.labels.function_name="createPreviewImages") AND timestamp>="2026-08-13T08:49:00Z" AND timestamp<="2026-08-13T08:52:00Z" AND textPayload:"handleCreateFiles"`
- 5 matching entries: `(resource.labels.service_name="createPreviewImages" OR resource.labels.function_name="createPreviewImages") AND timestamp>="2026-08-12T09:00:00Z" AND timestamp<="2026-08-13T09:05:00Z" AND textPayload:"createdFiles.map is not a function"`
- 4 matching entries: `(resource.labels.service_name="createPreviewImages" OR resource.labels.function_name="createPreviewImages") AND timestamp>="2026-08-12T09:00:00Z" AND timestamp<="2026-08-13T09:05:00Z" AND textPayload:"corrupt header"`

## Job
- analyze rounds: 1
- cost: $3.00
- tests: 16 tests, 115 failing · baseline 114 failing · reproduce check did not pass

```
.../pubsub/subscribeCreatePreviewImages.js         | 35 ++++++++++++----------
 .../src/helpers/graphql/getLargestImage.js         |  4 +--
 packages/functions/src/services/storageService.js  |  4 +--
 3 files changed, 24 insertions(+), 19 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
