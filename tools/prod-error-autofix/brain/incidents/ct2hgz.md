fingerprint: ct2hgz
service: apiSa
message: HTTPError: Response code 401 (Unauthorized)
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-18T02:07:26.349Z
status: inconclusive
attempt: 5

# IMG-OPT · apiSa · ct2hgz

**Outcome.** smoke gate new_failures

**Root cause.** The offline Shopify access token stored for shop 65rnj1-r6.myshopify.com is no longer valid at Shopify, so every Shopify Admin call made by apiSa for that shop returns HTTP 401; the handlers swallow it and answer 200, and the two catch sites that log the bare error object are the only lines the severity>=ERROR sink can see.

**Mechanism.** At 2026-08-18T01:52:23–01:52:34Z one merchant session issued 6 apiSa requests for 65rnj1-r6.myshopify.com. Each ran initShopify (packages/functions/src/services/shopifyService.js:38), which decrypts the stored token via prepareShopData and logs it verbatim at :39 — that log line is present in all 6 executions with the identical token value used since 2026-08-14. 6–13 ms later got issues the Admin API request (timings.start 1787017953603, response 1787017953888) and Shopify answers 401, raising got's HTTPError ERR_NON_2XX_3XX_RESPONSE. Four of the six calls are caught by prefixed loggers — 'main theme error' (shopifyService.js:129), '[getCurrentAppHandle]' (shopifyService.js:441), 'checkHasImages error' (shopifyController.js:390), 'getFirstFileImages error' (shopifyController.js:439) — which the GCF logging agent classifies as DEFAULT because the line does not begin with a stack trace. The other two catch sites pass the error object alone (bare `console.error(e)`, e.g. getThemes at shopifyController.js:353, which then still returns ctx.body={success:false,data:[]} and the function finishes 'with status code: 200'); that payload starts with 'HTTPError: … at Request.<anonymous>', the agent's stack-trace detection promotes it to severity ERROR, and those two lines alone are what the prod-error-alerts sink matched — hence an 11-occurrence alert with no endpoint and no shop in the text. Nothing in the code treats a Shopify 401 as a dead credential: the shop doc is never flagged, no re-auth is signalled to the client, and the same token is retried on every subsequent request.

Confidence: `medium`

## Code
- `packages/functions/src/services/shopifyService.js:38` — prepareShopData decrypts the stored offline token that Shopify then rejects with 401; every failing execution passes through here
- `packages/functions/src/services/shopifyService.js:39` — console.log(shopifyDomain, accessToken) — the '65rnj1-r6.myshopify.com shpat_…' line present in all 6 failing executions; it also writes plaintext Shopify offline tokens into Cloud Logging on every initShopify call
- `packages/functions/src/controllers/shopifyController.js:353` — bare console.error(e) in getThemes: logs the raw got HTTPError object, which is what the logging agent promotes to severity ERROR and the sink alerts on; the handler still returns 200
- `packages/functions/src/controllers/shopifyController.js:390` — 'checkHasImages error' — exact string observed at 01:52:29.209Z, same shop, same 401
- `packages/functions/src/controllers/shopifyController.js:439` — 'getFirstFileImages error' — exact string observed at 01:52:30.075Z
- `packages/functions/src/services/shopifyService.js:129` — 'main theme error' — exact string observed at 01:52:23.605Z; the 401 is swallowed and getMainThemeId returns false
- `packages/functions/src/services/shopifyService.js:441` — '[getCurrentAppHandle]' — exact string observed at 01:52:23.807Z with 'Request failed with status code 401'

## Evidence
- 5 matching entries: `resource.labels.function_name="apiSa" AND timestamp>="2026-08-18T01:52:20Z" AND timestamp<="2026-08-18T01:52:40Z" AND textPayload:"Response code 401"`
- 6 matching entries: `resource.labels.function_name="apiSa" AND timestamp>="2026-08-18T01:52:20Z" AND timestamp<="2026-08-18T01:52:40Z" AND textPayload:"65rnj1-r6.myshopify.com"`
- 498 matching entries: `resource.labels.function_name="apiSa" AND timestamp>="2026-08-17T02:00:00Z" AND timestamp<="2026-08-18T02:30:00Z" AND (textPayload:"Response code 401" OR textPayload:"myshopify.com shp")`
- 40 matching entries: `timestamp>="2026-08-10T00:00:00Z" AND textPayload:"65rnj1-r6"`
- 300 matching entries: `timestamp>="2026-08-17T18:55:00Z" AND timestamp<="2026-08-18T02:30:00Z" AND textPayload:"Response code 401"`

## Job
- analyze rounds: 1
- cost: $7.08
- tests: 4 tests, 102 failing · baseline 100 failing · reproduce check did not pass

```
packages/functions/src/controllers/shopifyController.js |  4 ++++
 packages/functions/src/repositories/shopRepository.js   | 14 ++++++++++++++
 packages/functions/src/services/shopifyService.js       |  7 +++++--
 3 files changed, 23 insertions(+), 2 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
