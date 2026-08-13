fingerprint: 1yrpcp3
service: apigen2
message: HTTP 500 GET /api/analysis/article/623544107274
app: SEO
repo: seo
date: 2026-08-12T17:20:46.177Z
status: mr_open
attempt: 1

# SEO · apigen2 · 1yrpcp3

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2177

**Root cause.** A Shopify REST 429 on the article metafield.list call made prepareMetafields reject; resolveAll swallows the rejection and yields `undefined`, and getResourceDetailData then destructures `seoMetafields` off that `undefined`, throwing a TypeError that getOne converts to HTTP 500.

**Mechanism.** GET /api/analysis/article/623544107274?locale=de → analysisController.getOne → getResourceDetailData. Its resolveAll([...]) array runs prepareMetafields (helpers/analysis.js:349 → getAllMetafields → shopify.metafield.list for owner_resource 'article', shopifyService.js:1582). Shopify answered HTTP 429 — logged as '[getAllMetafields] Response code 429 (Too Many Requests)' at 18:07:08.367822Z and 'prepareMetafields HTTPError: Response code 429' at 18:07:08.368035Z. resolveAll.js:11 catches that rejection and returns the value of logger.error(), i.e. undefined, so `metafields` is undefined at analysisDetailService.js:84. The destructure throws 'Cannot destructure property \'seoMetafields\' of \'metafields\' as it is undefined' (logged 18:07:08.385614Z, stack: lib/services/analysisDetailService.js:97 ← lib/controllers/analysisController.js:466), which getOne's catch turns into ctx.status = 500 (analysisController.js:439). Request log timestamp 18:07:06.895193Z + latency 1.489321980s = 18:07:08.384 — matches the TypeError timestamp to the millisecond, and the promise-rejection log carries traceId 04302f90921b8d1c05b372ed4e45a2d3, the same trace as the 500 request.

Confidence: `high`

## Code
- `packages/functions/src/services/analysisDetailService.js:84` — Unguarded destructure of `metafields` — the exact line that throws when resolveAll returned undefined (prod stack lib/analysisDetailService.js:97)
- `packages/functions/src/helpers/utils/resolveAll.js:11` — p.catch(e => logger.error(...)) resolves the rejected promise to undefined, converting an upstream 429 into a silent undefined slot
- `packages/functions/src/helpers/analysis.js:349` — prepareMetafields awaits getAllMetafields with no retry/catch, so a 429 rejects the whole promise passed into resolveAll
- `packages/functions/src/services/shopifyService.js:1582` — type 'article' still reads metafields over Shopify REST shopify.metafield.list — the call that got 429; product/collection already moved to GraphQL at :1578
- `packages/functions/src/controllers/analysisController.js:439` — getOne catch sets ctx.status = 500, turning the TypeError into the alerted HTTP 500

## Evidence
- 1 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-10T17:52:29Z" AND timestamp<="2026-08-10T18:22:30Z" AND logName:"stderr" AND textPayload:"seoMetafields"`
- 65 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-10T17:52:29Z" AND timestamp<="2026-08-10T18:22:30Z" AND logName:"stderr" AND textPayload:"Response code 429"`
- 3 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-10T18:07:04Z" AND timestamp<="2026-08-10T18:07:10Z" AND logName:"stderr" AND textPayload:"Error while resolving promises"`
- 1 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-10T17:52:29.583Z" AND timestamp<="2026-08-10T18:22:29.583Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $3.97
- branch: `fix/prod-seo-1yrpcp3`
- fix commit: `c7b277a8d8e102656adceaae51463aed2b177e40`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2177
- tests: 926 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix

```
packages/functions/src/services/analysisDetailService.js | 2 +-
 packages/functions/src/services/shopifyService.js        | 8 +++++---
 2 files changed, 6 insertions(+), 4 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
