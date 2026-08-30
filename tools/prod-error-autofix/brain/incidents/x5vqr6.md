fingerprint: x5vqr6
service: apisagen2
message: HTTP 500 GET /apiSa/shopify/domains
app: SEO
repo: seo
date: 2026-08-29T22:50:44.003Z
status: fix_disabled
attempt: 1

# SEO · apisagen2 · x5vqr6

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The offline Shopify access token stored for shop q890gzQb2oI5TAvF2k86 (pqrqfr-j0.myshopify.com) is rejected by Shopify with HTTP 401, and shopifyController.getDomains is the only handler in that page load that rethrows instead of returning {success:false}, so all 6 GET /apiSa/shopify/domains calls became HTTP 500.

**Mechanism.** At 22:45:41-44Z every Shopify Admin call for shop q890gzQb2oI5TAvF2k86 returned 401 — 12 log lines across 5 distinct call sites ([apiSa] x6, [countShopifyUrlRedirects] x3, [getShopifyUrlRedirects], [getMainThemeId], 'get shops error'). The dumped axios config in the [unhandledError] line names the exact request: POST https://pqrqfr-j0.myshopify.com/admin/api/2026-07/graphql.json with header X-Shopify-Access-Token: ***REMOVED-SECRET***, i.e. the token decrypted from the shop doc's accessTokenHash is invalid at Shopify. Path: getDomains (controllers/shopifyController.js:75) -> handleGetDomainsByShop (services/shopifyGraphQlService.js:186) -> makeGraphQlApi (helpers/api.js:43) which sets the token header at helpers/api.js:52 -> shopifyRetryGraphQL (services/shopifyService.js:589) whose retry list is [429,502,503,520], so a 401 is rethrown immediately. getDomains' catch does `ctx.status = 500; throw e;` (shopifyController.js:82-83), so createErrorHandler answers 500 and logs at severity ERROR (middleware/errorHandler.js:18). The other four call sites hit the identical 401 in the same 3-second window and answered 200 with {success:false}, which is why the 6 request-log 500s are all and only /apiSa/shopify/domains. Secondary defect on the same line: errorHandler.js:18 passes the whole axios error object to the logger, so 6 of 6 entries print the merchant's plaintext shpat_ token into Cloud Logging.

Confidence: `high`

## Code
- `packages/functions/src/controllers/shopifyController.js:82` — getDomains' catch sets ctx.status=500 and rethrows any error, including an unrecoverable Shopify 401 — this is what turns the invalid token into the alerted HTTP 500
- `packages/functions/src/services/shopifyGraphQlService.js:186` — handleGetDomainsByShop issues the shop{domains} query through makeGraphQlApi with no handling for an auth failure
- `packages/functions/src/helpers/api.js:52` — sets X-Shopify-Access-Token on the axios request config; that config object is what later gets serialized into the error log, leaking the plaintext token
- `packages/functions/src/services/shopifyService.js:589` — shopifyRetryGraphQL retries only [429,502,503,520]; 401 falls through to the rethrow at :592, so the auth failure reaches the controller unclassified
- `packages/functions/src/middleware/errorHandler.js:18` — logs the full error object at severity ERROR — produces the [unhandledError] line and dumps the merchant's shpat_ access token into Cloud Logging

## Evidence
- 6 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-29T22:31:00Z" AND timestamp<="2026-08-29T23:01:00Z" AND httpRequest.status>=500`
- 12 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-29T22:31:00Z" AND timestamp<="2026-08-29T23:01:00Z" AND textPayload:"q890gzQb2oI5TAvF2k86" AND textPayload:"401"`
- 6 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-29T22:31:00Z" AND timestamp<="2026-08-29T23:01:00Z" AND textPayload:"[unhandledError] GET /apiSa/shopify/domains"`
- 6 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-29T22:31:00Z" AND timestamp<="2026-08-29T23:01:00Z" AND textPayload:"X-Shopify-Access-Token: shpat_"`
- 15 matching entries: `timestamp>="2026-08-28T00:00:00Z" AND timestamp<="2026-08-30T12:00:00Z" AND textPayload:"q890gzQb2oI5TAvF2k86"`

## Job
- analyze rounds: 1
- cost: $2.48

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
