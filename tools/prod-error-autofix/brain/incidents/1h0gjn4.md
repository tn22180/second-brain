fingerprint: 1h0gjn4
service: apigen2
message: HTTP 500 GET /api/analysis/page/162392146184
app: SEO
repo: seo
date: 2026-08-04T14:13:07.672Z
status: inconclusive
attempt: 1

# SEO · apigen2 · 1h0gjn4

**Outcome.** fix blocked at agent_failed

**Root cause.** Shopify REST answered `metafield.list` for shop LW7GWp7zmfDtdJfQhXjH with HTTP 429 during the GET /api/analysis/page/162392146184 request; prepareMetafields rethrew, resolveAll swallowed the rejection into `undefined`, and getResourceDetailData then destructured `seoMetafields` off that undefined value, throwing a TypeError that getOne turned into a 500.

**Mechanism.** Request trace 4b20322ba43b644e4383335b9addf435 starts 13:33:23.278Z, latency 5.663s → ends 13:33:28.94Z. At 13:33:28.392Z that same trace logs `[getAllMetafields] Response code 429 (Too Many Requests)` — shopifyService.getAllMetafields takes the `page` branch (`shopify.metafield.list`) and rethrows after logging (shopifyService.js:1578). initShopify builds the client with `maxRetries = 0` (shopifyService.js:63), so shopify-api-node never retries the 429. prepareMetafields logs `prepareMetafields HTTPError: Response code 429` at 13:33:28.3927Z and rethrows (analysis.js:412). That promise is one of four passed to resolveAll, whose catch handler returns the value of `logger.error(...)` — i.e. `undefined` (resolveAll.js:11) — and logs `Error while resolving promises` at 13:33:28.393Z under the same traceId. `metafields` is therefore undefined at analysisDetailService.js:85, `const {seoMetafields, ...} = metafields` throws `TypeError: Cannot destructure property 'seoMetafields' of 'metafields' as it is undefined`, caught by getOne at analysisController.js:438 which sets status 500 — logged at 13:33:28.943Z, exactly request start + latency.

Confidence: `high`

## Code
- `packages/functions/src/helpers/utils/resolveAll.js:11` — `p.catch(e => logger.error(...))` converts a rejected promise into `undefined` instead of a sentinel or a rethrow — this is what turns the 429 into an undefined `metafields`.
- `packages/functions/src/services/analysisDetailService.js:85` — Unguarded destructure `const {seoMetafields, ...} = metafields` on the resolveAll result; prod stack lands here (lib/services/analysisDetailService.js:97).
- `packages/functions/src/helpers/analysis.js:412` — prepareMetafields logs then rethrows the 429 — matches the `prepareMetafields HTTPError: Response code 429` stderr line at 13:33:28.3927Z.
- `packages/functions/src/services/shopifyService.js:1578` — getAllMetafields catch emits the exact `[getAllMetafields] Response code 429 (Too Many Requests)` message seen 19× in the window, then rethrows with no retry.
- `packages/functions/src/services/shopifyService.js:63` — initShopify defaults `maxRetries = 0`, so the REST 429 on the page/article metafield path is never retried.
- `packages/functions/src/controllers/analysisController.js:438` — getOne catch logs `[getOne] <shopID> <message>` and sets ctx.status = 500 — the alerted HTTP 500.

## Evidence
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-04T13:19:11.943Z" AND timestamp<="2026-08-04T13:49:11.943Z" AND logName:"stderr" AND textPayload:"Cannot destructure property"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-04T13:33:00Z" AND timestamp<="2026-08-04T13:34:00Z" AND logName:"stderr" AND textPayload:"4b20322ba43b644e4383335b9addf435"`
- 19 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-04T13:19:11.943Z" AND timestamp<="2026-08-04T13:49:11.943Z" AND logName:"stderr" AND textPayload:"[getAllMetafields] Response code 429"`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-04T13:19:11.943Z" AND timestamp<="2026-08-04T13:49:11.943Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 2
- cost: $3.28

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
