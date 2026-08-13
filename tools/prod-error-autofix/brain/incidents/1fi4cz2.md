fingerprint: 1fi4cz2
service: apisagen2
message: HTTP 500 GET /apiSa/shop-locales
app: SEO
repo: seo
date: 2026-08-12T20:27:25.933Z
status: mr_open
attempt: 1

# SEO · apisagen2 · 1fi4cz2

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2182

**Root cause.** GET /apiSa/shop-locales returned 500 because shopController.getShopLocales issues its Shopify Admin GraphQL POST through a bare, unretried client — initShopify is called without maxRetries (default 0, which sets got's retry to 0) and the call is not wrapped in shopifyRetryGraphQL — so a single transient Shopify HTTP 502 propagated out of the controller uncaught.

**Mechanism.** getShopLocales (packages/functions/src/controllers/shopController.js:376) builds its client with initShopify(shop, {apiVersion: 'unstable'}) at :380, leaving maxRetries at its default 0 (packages/functions/src/services/shopifyService.js:63). shopify-api-node only installs got's retry config when maxRetries > 0 (node_modules/shopify-api-node/index.js:326-338, `else options.retry = 0`) — even though 502 is in its own retryableStatusCodesArray. :384 then calls shopLocalesGraphQL(shopify), whose single `await shopify.graphql(...)` (packages/functions/src/helpers/graphql/shopLocalesGraphQL.js:14) is not wrapped in shopifyRetryGraphQL. Shopify's Admin API answered that POST with HTTP 502 after firstByte 211ms / total 247ms; got threw `HTTPError: Response code 502 (Bad Gateway)` with `code: 'ERR_NON_2XX_3XX_RESPONSE'` at got/dist/source/as-promise/index.js:118. getShopLocales has no try/catch, so the rejection reached createErrorHandler, which logged `[unhandledError] GET /apiSa/shop-locales 500` (packages/functions/src/middleware/errorHandler.js:17) and answered 500 — matching the request log's 0.2775s latency. Secondary defect on the same path: even if the call were wrapped, shopifyRetryGraphQL reads the status via `e.statusCode || e.response?.status` (shopifyService.js:587), and got's HTTPError sets neither (it sets e.response.statusCode) — the logged error dump enumerates only `code` and `timings`, no statusCode — so the 502 branch at :589 would never fire.

Confidence: `high`

## Code
- `packages/functions/src/controllers/shopController.js:384` — the failing call: shopLocalesGraphQL(shopify) invoked bare, no shopifyRetryGraphQL wrapper, no try/catch in the controller
- `packages/functions/src/controllers/shopController.js:380` — initShopify called with only apiVersion, so maxRetries stays 0 and got retry is disabled for this client
- `packages/functions/src/services/shopifyService.js:63` — initShopify's default maxRetries = 0, which shopify-api-node translates to options.retry = 0
- `packages/functions/src/helpers/graphql/shopLocalesGraphQL.js:14` — the single unretried shopify.graphql POST that got threw the 502 HTTPError from
- `packages/functions/src/services/shopifyService.js:587` — shopifyRetryGraphQL reads e.statusCode || e.response?.status; got's HTTPError sets neither, so the 502 retry branch at :589 is unreachable for this error shape
- `packages/functions/src/middleware/errorHandler.js:17` — turns the uncaught HTTPError into the alerted HTTP 500 and emits the [unhandledError] stderr line

## Evidence
- 1 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-08-12T11:15:56Z" AND timestamp<="2026-08-12T11:45:56Z" AND httpRequest.requestUrl:"/apiSa/shop-locales" AND httpRequest.status=500`
- 1 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-08-12T11:15:56Z" AND timestamp<="2026-08-12T11:45:56Z" AND logName:"stderr" AND textPayload:"[unhandledError] GET /apiSa/shop-locales 500 Response code 502"`
- 1 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-08-12T11:15:56Z" AND timestamp<="2026-08-12T11:45:56Z" AND logName:"stderr" AND textPayload:"ERR_NON_2XX_3XX_RESPONSE"`

## Job
- analyze rounds: 2
- cost: $6.32
- branch: `fix/prod-seo-1fi4cz2`
- fix commit: `8d95342d1399250fe39223e65f8284f0c5c0f385`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2182
- tests: 926 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix

```
packages/functions/src/controllers/shopController.js | 9 +++++++--
 packages/functions/src/services/shopifyService.js    | 2 +-
 2 files changed, 8 insertions(+), 3 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
