fingerprint: 1tfhqc5
service: createPreviewImages
message: Memory limit of 2048 MiB exceeded with 2301 MiB used. Consider increasing the memory limit, see <https://cloud.google.com/functions/docs/configuring/memory>
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-12T16:41:02.253Z
status: infra
attempt: 1

# IMG-OPT · createPreviewImages · 1tfhqc5

**Outcome.** infra class — reported, no MR

**Root cause.** createPreviewImages is declared memory:'2GB' while one invocation runs four concurrent sharpCompressImage pipelines over the same single image — the shop's largest file by ORIGINAL_UPLOAD_SIZE — peaking at 2301 MiB and getting OOM-killed; infra class, 1 kill in 259 invocations over 11 days.

**Mechanism.** installationService publishes one createPreviewImages message per install (installationService.js:79). handleCreatePreviewImages → uploadToStorage calls getLargestImage, which deliberately asks Shopify for the single biggest image in the shop (files(first:1, sortKey:ORIGINAL_UPLOAD_SIZE, reverse:true), getLargestImage.js:11). It then fans that one image out over OPTIMIZE_QUALITY_TYPES — exactly 4 entries (compressImage.js:10) — inside one Promise.all with no concurrency cap (subscribeCreatePreviewImages.js:63). Each of the 4 calls receives the bare mediaImage object with no .buffer, so each independently re-downloads the full image as an arraybuffer via prepareImage (sharp.js:44, sharp.js:86-102), then builds two sharp instances over it — one for metadata() (sharp.js:164) and one for the encode (sharp.js:175-196) — then holds destBuffer plus a base64 string ~4/3 its size (sharp.js:65). So peak resident = 4 × (srcBuffer + decoded raw pixels + destBuffer + base64), all live simultaneously. Prod log for execution sgcb9fem3vzb shows exactly this: start 23:05:34.278, then four '=== DEBUG: WebP quality calculation - output:' lines at 23:05:42.288/.289/.290/.290 with values 63, 72, 45, 83 — which are webpQuality() of the four declared qualities (medium 70→63, high 80→72, low 50→45, auto 92→83, sharp.js:168+224-239), i.e. all four encodes in flight within 3 ms of each other on the webp branch (sharp.js:186-187). 11 s later, at 23:05:53.197, 'Memory limit of 2048 MiB exceeded with 2301 MiB used', and the runtime records "Function execution took 18924 ms, finished with status: 'crash'" at 23:05:53.202. The declared limit in index.js:138 is memory:'2GB' = 2048 MiB, matching the kill message exactly. Shop was happymind-thedrop.myshopify.com. No application log line follows the kill, consistent with P3: the container dies before any catch block runs, so the try/catch at subscribeCreatePreviewImages.js:52 and :86 never fires.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/index.js:138` — createPreviewImages declared .runWith({memory: '2GB'}) = 2048 MiB — the exact number in the kill message
- `packages/functions/src/handlers/pubsub/subscribeCreatePreviewImages.js:63` — single unbounded Promise.all fans one image out to all compress types — the 4× multiplier on every buffer
- `packages/functions/src/const/optimize/compressImage.js:10` — OPTIMIZE_QUALITY_TYPES has exactly 4 entries, matching the 4 WebP debug lines logged 3 ms apart in the killed execution
- `packages/functions/src/helpers/graphql/getLargestImage.js:11` — sortKey:ORIGINAL_UPLOAD_SIZE, reverse:true — the input is by construction the shop's largest image, so worst case is selected on purpose
- `packages/functions/src/helpers/optimize/sharp.js:44` — mediaImage carries no .buffer, so each of the 4 calls falls to prepareImage and downloads the same image again — 4 independent srcBuffers
- `packages/functions/src/helpers/optimize/sharp.js:164` — sharp(srcBuffer).metadata() creates a second decode pipeline per call, on top of the encode pipeline at :175
- `packages/functions/src/helpers/optimize/sharp.js:186` — the '=== DEBUG: WebP quality calculation - output:' console.log that produced the four 23:05:42 lines identifying 4-way concurrency
- `packages/functions/src/helpers/optimize/sharp.js:65` — base64 string retained alongside destBuffer, ~1.33× extra per call
- `packages/functions/src/services/shopifyService.js:39` — unrelated to the OOM but in the same execution's log: initShopify console.logs the plaintext shpat_ offline token on every call

## Evidence
- 1 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-12T00:00:00Z" AND textPayload:"Memory limit"`
- 8 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-08T23:05:00Z" AND timestamp<="2026-08-08T23:07:00Z"`
- 259 matching entries: `resource.labels.function_name="createPreviewImages" AND timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-12T00:00:00Z" AND textPayload:"finished with status"`

## Job
- analyze rounds: 1
- cost: $1.50

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
