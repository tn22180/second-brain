fingerprint: 1h0gjn4
service: apigen2
message: HTTP 500 GET /api/analysis/page/692247560537
app: SEO
repo: seo
date: 2026-08-30T14:20:18.536Z
status: fix_disabled
attempt: 3

# SEO · apigen2 · 1h0gjn4

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shopify REST answered HTTP 429 to getAllMetafields' `shopify.metafield.list` for shop sl3ZiH1q5RIjyZcXsLaa; prepareMetafields rethrew, resolveAll swallowed the rejection into `undefined`, and getResourceDetailData then destructured `seoMetafields` off `undefined` — the TypeError getOne turned into all 3 alerted 500s.

**Mechanism.** All 3 apigen2 500s are GET /api/analysis/page/:id (type=`page`), so getAllMetafields takes the REST branch `shopify.metafield.list({metafield:{owner_resource,owner_id}})` at shopifyService.js:1582; initShopify builds the client with `maxRetries = 0` (shopifyService.js:63) so shopify-api-node never retries the 429. Shop sl3ZiH1q5RIjyZcXsLaa was being served by 5 distinct apigen2 instances in the same 25s (00a41e8c1d22/1ddd/1dfb/1dcb/1d73) while a bulk optimize ran — 36 `Response code 429 (Too Many Requests)` stderr lines in the window across getCount, getStructuredSetting, get shops and getAllMetafields — so the per-process `autoLimit` cannot coordinate the shared per-shop bucket. Each 429 on the metafield read logs `[getAllMetafields] Response code 429` (shopifyService.js:1591) and rethrows; prepareMetafields logs `prepareMetafields HTTPError: Response code 429` and rethrows (analysis.js:408); that promise is the first of five passed to resolveAll at analysisDetailService.js:67, whose catch returns the value of `logger.error(...)` i.e. `undefined` (resolveAll.js:11). `metafields` is therefore `undefined` at analysisDetailService.js:88, and `const {seoMetafields, ...} = metafields` throws. getOne catches at analysisController.js:439 and sets 500. Mapping is 3-for-3, to the millisecond and to the instance: req start 14:17:37.342296 + latency 1.597511536s = 14:17:38.9398 vs getOne log 14:17:38.940082 (inst …1ddd); 14:17:43.770359 + 5.963372387s = 14:17:49.7337 vs 14:17:49.734800 (inst …1dfb); 14:17:49.874542 + 3.879562078s = 14:17:53.7541 vs 14:17:53.754853 (inst …1d22). Requests 1 and 2 also had prepareAnalysisPage reject on 429, but that value is only read optionally — the destructure of `metafields` is the throwing line.

Confidence: `high`

## Code
- `packages/functions/src/helpers/utils/resolveAll.js:11` — `p.catch(e => logger.error(...))` converts a rejected promise into `undefined` — this is what turns the 429 into an undefined `metafields`. Emits the 10 `Error while resolving promises` lines in the window.
- `packages/functions/src/services/analysisDetailService.js:67` — getResourceDetailData destructures `[metafields, asset, seoAnalysisPage, shopifyItem, marketRootUrls]` off resolveAll, so a rejected prepareMetafields yields `undefined` instead of failing the request.
- `packages/functions/src/services/analysisDetailService.js:89` — Unguarded `const {seoMetafields, ...} = metafields` — the throwing line producing `Cannot destructure property 'seoMetafields' of 'metafields' as it is undefined`.
- `packages/functions/src/helpers/analysis.js:408` — prepareMetafields catch logs `prepareMetafields` + error then rethrows — matches the 3 `prepareMetafields HTTPError: Response code 429` stderr lines.
- `packages/functions/src/services/shopifyService.js:1582` — `page`/`article` branch uses REST `shopify.metafield.list` — the call Shopify 429'd for these page-type requests.
- `packages/functions/src/services/shopifyService.js:1591` — getAllMetafields catch emits the exact `[getAllMetafields] Response code 429 (Too Many Requests)` message seen 3× at 14:17:38.637981Z, 14:17:49.539364Z, 14:17:53.701081Z, then rethrows with no retry.
- `packages/functions/src/services/shopifyService.js:63` — initShopify defaults `maxRetries = 0`, so the REST 429 on the page metafield path is never retried; `autoLimit` is per-process and cannot coordinate the 5 instances sharing this shop's bucket.
- `packages/functions/src/controllers/analysisController.js:439` — getOne catch logs `[getOne] <shopID> <message>` and sets ctx.status = 500 — the 3 alerted HTTP 500s.

## Evidence
- 3 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-30T14:03:09.569Z" AND timestamp<="2026-08-30T14:33:09.569Z" AND httpRequest.status>=500`
- 3 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-30T14:03:09.569Z" AND timestamp<="2026-08-30T14:33:09.569Z" AND logName:"stderr" AND textPayload:"Cannot destructure property"`
- 3 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-30T14:03:09.569Z" AND timestamp<="2026-08-30T14:33:09.569Z" AND logName:"stderr" AND textPayload:"[getAllMetafields] Response code 429"`
- 3 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-30T14:03:09.569Z" AND timestamp<="2026-08-30T14:33:09.569Z" AND logName:"stderr" AND textPayload:"prepareMetafields HTTPError"`
- 10 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-30T14:03:09.569Z" AND timestamp<="2026-08-30T14:33:09.569Z" AND logName:"stderr" AND textPayload:"Error while resolving promises"`
- 36 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-30T14:03:09.569Z" AND timestamp<="2026-08-30T14:33:09.569Z" AND logName:"stderr" AND textPayload:"Response code 429 (Too Many Requests)"`

## Job
- analyze rounds: 1
- cost: $1.63

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
