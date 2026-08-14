fingerprint: 1h0gjn4
service: apigen2
message: HTTP 500 GET /api/analysis/page/693724545173
app: SEO
repo: seo
date: 2026-08-14T11:28:34.492Z
status: inconclusive
attempt: 2

# SEO · apigen2 · 1h0gjn4

**Outcome.** security gate review_unavailable

**Root cause.** Shopify REST `metafield.list` answered HTTP 429 for shop f7gyAstbmRKIprVvNT24 during GET /api/analysis/page/693724545173; prepareMetafields rethrew, resolveAll swallowed that rejection into `undefined`, and getResourceDetailData then destructured `seoMetafields` off `undefined`, throwing a TypeError that getOne turned into the alerted 500.

**Mechanism.** Request starts 2026-08-14T07:19:23.976758Z, latency 1.346362006s → ends 07:19:25.323Z. At 07:19:24.803489Z stderr logs `[getAllMetafields] Response code 429 (Too Many Requests)` — type is `page` (URL /api/analysis/page/693724545173), so getAllMetafields takes the REST branch `shopify.metafield.list({metafield:{owner_resource,owner_id}})` (shopifyService.js:1582) and rethrows after logging (shopifyService.js:1591). initShopify builds the client with `maxRetries = 0` (shopifyService.js:63), so shopify-api-node never retries the 429. 0.4 ms later, 07:19:24.803881Z, `prepareMetafields HTTPError: Response code 429 (Too Many Requests)` — prepareMetafields logs then rethrows (analysis.js:412-413). That promise is the first of five passed to resolveAll at analysisDetailService.js:67, whose catch handler returns the value of `logger.error(...)`, i.e. `undefined` (resolveAll.js:11); `Error while resolving promises Promise { <rejected> HTTPError: Response code 429 }` is logged at 07:19:24.804308Z and 07:19:24.849870Z. `metafields` is therefore `undefined` at analysisDetailService.js:88, and `const {seoMetafields, ...} = metafields` throws `TypeError: Cannot destructure property 'seoMetafields' of 'metafields' as it is undefined` — the prod stack lands at lib/services/analysisDetailService.js:104:5, i.e. that destructure. getOne catches it at analysisController.js:439, logs `[getOne] f7gyAstbmRKIprVvNT24 Cannot destructure property 'seoMetafields'…` at 07:19:25.323984Z (= request start + latency, to the millisecond) and sets ctx.status = 500.

Confidence: `high`

## Code
- `packages/functions/src/helpers/utils/resolveAll.js:11` — `p.catch(e => logger.error(...))` converts a rejected promise into `undefined` — this is what turns the 429 into an undefined `metafields`.
- `packages/functions/src/services/analysisDetailService.js:67` — getResourceDetailData destructures `[metafields, asset, seoAnalysisPage, shopifyItem, marketRootUrls]` off resolveAll, so a rejected prepareMetafields yields `undefined` instead of failing.
- `packages/functions/src/services/analysisDetailService.js:89` — Unguarded `const {seoMetafields, ...} = metafields` — the throwing line; prod stack lands here (lib/services/analysisDetailService.js:104).
- `packages/functions/src/helpers/analysis.js:412` — prepareMetafields logs `prepareMetafields` + error then rethrows — matches the `prepareMetafields HTTPError: Response code 429` stderr line at 07:19:24.803881Z.
- `packages/functions/src/services/shopifyService.js:1582` — `page`/`article` branch uses REST `shopify.metafield.list` — the call Shopify 429'd for this page-type request.
- `packages/functions/src/services/shopifyService.js:1591` — getAllMetafields catch emits the exact `[getAllMetafields] Response code 429 (Too Many Requests)` message seen at 07:19:24.803489Z, then rethrows with no retry.
- `packages/functions/src/services/shopifyService.js:63` — initShopify defaults `maxRetries = 0`, so the REST 429 on the page metafield path is never retried.
- `packages/functions/src/controllers/analysisController.js:439` — getOne catch logs `[getOne] <shopID> <message>` and sets ctx.status = 500 — the alerted HTTP 500.

## Evidence
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T07:05:15.502Z" AND timestamp<="2026-08-14T07:35:15.502Z" AND logName:"stderr" AND textPayload:"Cannot destructure property"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T07:05:15.502Z" AND timestamp<="2026-08-14T07:35:15.502Z" AND logName:"stderr" AND textPayload:"[getAllMetafields] Response code 429"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T07:05:15.502Z" AND timestamp<="2026-08-14T07:35:15.502Z" AND logName:"stderr" AND textPayload:"prepareMetafields HTTPError"`
- 4 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T07:05:15.502Z" AND timestamp<="2026-08-14T07:35:15.502Z" AND logName:"stderr" AND textPayload:"Error while resolving promises"`
- 6 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T07:05:15.502Z" AND timestamp<="2026-08-14T07:35:15.502Z" AND logName:"stderr" AND textPayload:"Response code 429 (Too Many Requests)"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T07:05:15.502Z" AND timestamp<="2026-08-14T07:35:15.502Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $3.91
- tests: 1110 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix

```
.../src/services/analysisDetailService.js          | 29 +++++++++++++---------
 packages/functions/src/services/shopifyService.js  | 10 +++++---
 2 files changed, 24 insertions(+), 15 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
