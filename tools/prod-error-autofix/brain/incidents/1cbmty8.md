fingerprint: 1cbmty8
service: apisagen2
message: HTTP 500 GET /apiSa/dev/shop-faq-setting
app: SEO
repo: seo
date: 2026-08-12T17:42:50.283Z
status: mr_open
attempt: 1

# SEO · apisagen2 · 1cbmty8

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2178

**Root cause.** GET /apiSa/dev/shop-faq-setting returns 500 because shopGetFaqSetting builds its Shopify client with a bare initShopify(shop) — which defaults to maxRetries: 0, i.e. got retry disabled — so a single Shopify REST 429 on shopify.metafield.list propagates out of a catch block that sets ctx.status = 500 and rethrows.

**Mechanism.** Shop lARMF1UUdHnTswELmBhd was REST-throttled for the whole 30-min window (36 of 37 stderr lines are 'Response code 429 (Too Many Requests)' for that one shopID, spread over 6 distinct call sites). devController.shopGetFaqSetting:1904 calls initShopify(shop) with no options; shopifyService.js:63 defaults {autoLimit: true, maxRetries: 0}, and node_modules/shopify-api-node/index.js:181-192 sets `options.retry = 0` whenever maxRetries is 0 — autoLimit only spaces calls inside one client instance (a fresh instance per request), it does not retry a 429. So metafield.list at :1905 rejects with got HTTPError ERR_NON_2XX_3XX_RESPONSE after ~104-113ms (matching the 0.125s / 0.169s request latencies), the catch at :1916 sets ctx.status = 500 and rethrows, apiSa.js:77 logs '[apiSa] lARMF1UUdHnTswELmBhd Response code 429' and the request is emitted as HTTP 500. The other apiSa endpoints hit by the same 429 storm do not alert because they swallow it and answer 200 — shopController.js:102 logs 'get shops error' then sets ctx.body = {} (21 times in the window), analysisController.js:167/:222 the same (10 times). This endpoint is the only one in the window that converts the throttle into a 5xx.

Confidence: `high`

## Code
- `packages/functions/src/controllers/devController.js:1904` — shopGetFaqSetting builds the client with bare initShopify(shop) — inherits maxRetries: 0, so no 429 retry
- `packages/functions/src/controllers/devController.js:1905` — the throwing call: shopify.metafield.list(...) — Shopify REST, the exact API that returned 429
- `packages/functions/src/controllers/devController.js:1916` — catch sets ctx.status = 500 and rethrows, turning an upstream throttle into a server error alert
- `packages/functions/src/services/shopifyService.js:63` — initShopify default options {apiVersion, autoLimit: true, maxRetries: 0} — the 0 is what disables got's retry
- `packages/functions/src/services/shopifyService.js:40` — SHOPIFY_MAX_RETRY = 50 exists and is used by the Pub/Sub paths (e.g. subscribeGenFaq.js:251 initShopify(shop, {maxRetries: SHOPIFY_MAX_RETRY})); this controller opted out of it
- `packages/functions/src/handlers/apiSa.js:77` — top-level apiSa error log that emitted '[apiSa] lARMF1UUdHnTswELmBhd Response code 429' twice, one per 500
- `packages/functions/src/controllers/shopController.js:102` — contrast path: same 429, caught and answered 200 with ctx.body = {} — 21 occurrences, zero alerts

## Evidence
- 36 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-08-10T22:35:55.585Z" AND timestamp<="2026-08-10T23:05:55.585Z" AND logName:"stderr" AND textPayload:"429 (Too Many Requests)"`
- 2 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-08-10T22:35:55.585Z" AND timestamp<="2026-08-10T23:05:55.585Z" AND logName:"stderr" AND textPayload:"unhandledError" AND textPayload:"shop-faq-setting"`
- 2 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-08-10T22:35:55.585Z" AND timestamp<="2026-08-10T23:05:55.585Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $4.77
- branch: `fix/prod-seo-1cbmty8`
- fix commit: `14ed828532008363c486b8784ddb3026d8e4779c`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2178
- tests: 927 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix

```
packages/functions/src/controllers/devController.js | 14 ++++++++++----
 1 file changed, 10 insertions(+), 4 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
