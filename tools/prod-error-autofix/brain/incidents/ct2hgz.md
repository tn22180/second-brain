fingerprint: ct2hgz
service: apiSa
message: HTTPError: Response code 401 (Unauthorized)
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-07-31T07:34:16.729Z
status: inconclusive
attempt: 1

# IMG-OPT · apiSa · ct2hgz

**Outcome.** smoke gate new_failures

**Root cause.** Shop 8tkx0j-zj.myshopify.com's stored Shopify access token (***REMOVED-SECRET***) stopped being accepted by the Admin API between 06:59:04Z and 07:00:21Z on 2026-07-31, and the app has no 401 handling: every apiSa controller catches the got HTTPError, dumps it bare via console.error(e) and returns 200, so each stale-token call becomes an untagged severity=ERROR entry that the alert sink picks up.

**Mechanism.** initShopify (shopifyService.js:34-48) builds a shopify-api-node client from the Firestore-stored token and logs `<domain> <token>` at line 39. Both apiSa executions in the window are preceded by exactly that line for 8tkx0j-zj.myshopify.com: execution k92lhc6lnckc at 07:00:21.886Z then the bare `HTTPError: Response code 401 (Unauthorized)` / `code: 'ERR_NON_2XX_3XX_RESPONSE'` dump at 07:00:22.421Z (520ms request per the got timings block); execution jqvqwnl4ox7r at 07:00:27.451Z then `main theme error HTTPError: Response code 401` (shopifyService.js:129, getMainThemeId) and `[getCurrentAppHandle] Request failed with status code 401` (shopifyService.js:441) — that pair is appBlockController.loadAppBlocks, which fires getMainThemeId (appBlockController.js:67) and getCurrentAppHandle (appBlockController.js:74) off one initShopify. Both executions finished `status code: 200` because every catch swallows the error, which is why the `requests` read (httpRequest.status>=500) returned zero rows. The first execution's route is not recoverable: apiSa is a gen1 cloud_function whose entries carry no httpRequest payload, and the log line is an untagged `console.error(e)` (e.g. shopifyController.js:158) with no route or shop in it. Nothing in packages/functions/src reacts to a Shopify 401 — no path marks the token dead or the shop uninstalled — so the frontend keeps polling and the same fingerprint keeps re-firing until the merchant's tab closes. Separately, the same initShopify log line writes live Shopify Admin tokens for 5,644 distinct shops into Cloud Logging.

Confidence: `medium`

## Code
- `packages/functions/src/services/shopifyService.js:39` — console.log(shopifyDomain, accessToken) — emits the exact log line that precedes both 401s, and leaks 5,644 shops' plaintext Admin tokens into Cloud Logging
- `packages/functions/src/services/shopifyService.js:34` — initShopify builds the shopify-api-node client from the stored token; every 401 in this window originates from a client built here
- `packages/functions/src/services/shopifyService.js:129` — console.error('main theme error', e.message) — matches the 07:00:27.917Z line verbatim, identifying getMainThemeId as one 401 source
- `packages/functions/src/services/shopifyService.js:441` — console.error('[getCurrentAppHandle]', e.message) — matches the 07:00:28.000Z line, identifying the second 401 source in execution jqvqwnl4ox7r
- `packages/functions/src/controllers/appBlockController.js:74` — loadAppBlocks calls getMainThemeId + getCurrentAppHandle off one initShopify, producing exactly the two tagged 401 lines seen together in jqvqwnl4ox7r
- `packages/functions/src/controllers/shopifyController.js:158` — representative bare `console.error(e)` catch that prints the raw got HTTPError object with no route/shop tag and still returns 200 — the shape of the alerting log line in k92lhc6lnckc
- `packages/functions/src/handlers/apiSa.js:48` — apiSa mounts verifyRequest() + the /apiSa router with no Shopify-401 middleware; there is no layer that converts a revoked Admin token into a typed response or marks the shop

## Evidence
- 3 matching entries: `resource.labels.function_name="apiSa" AND timestamp>="2026-07-31T06:45:00Z" AND timestamp<="2026-07-31T07:15:00Z" AND textPayload:"401"`
- 2 matching entries: `resource.labels.function_name="apiSa" AND timestamp>="2026-07-31T06:45:00Z" AND timestamp<="2026-07-31T07:15:00Z" AND textPayload:"8tkx0j-zj"`
- 8 matching entries: `timestamp>="2026-07-31T06:50:00Z" AND timestamp<="2026-07-31T07:00:00Z" AND textPayload:"8tkx0j-zj"`
- 827 matching entries: `timestamp>="2026-07-30T07:00:00Z" AND timestamp<="2026-07-31T08:00:00Z" AND (textPayload:"Response code 401" OR textPayload:"status code 401")`
- 19979 matching entries: `timestamp>="2026-07-30T07:00:00Z" AND timestamp<="2026-07-31T08:00:00Z" AND textPayload:"shpat_"`

## Job
- analyze rounds: 1
- cost: $5.38
- tests: 16 tests, 74 failing · baseline 73 failing · reproduce check did not pass

```
packages/functions/src/services/shopifyService.js | 45 +++++++++++++++++++++--
 1 file changed, 41 insertions(+), 4 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
