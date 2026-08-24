fingerprint: ct2hgz
service: apiSa
message: HTTPError: Response code 401 (Unauthorized)
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-23T03:41:45.851Z
status: fix_disabled
attempt: 6

# IMG-OPT · apiSa · ct2hgz

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The offline Shopify access token stored for shop gfam8p-z5.myshopify.com (shpat_8ff2ce8e…41ef, unchanged since at least 2026-08-20) is no longer valid at Shopify, so every Shopify Admin call apiSa makes for that shop returns HTTP 401; the handlers swallow it and answer 200, and the single alerted ERROR is one catch site that passes the raw got HTTPError object to a bare console.error(e), whose stack-first payload the GCF logging agent promotes to severity ERROR.

**Mechanism.** At 2026-08-23T03:37:28–03:37:32Z one merchant session issued exactly 3 apiSa requests for gfam8p-z5.myshopify.com — the only apiSa traffic for that shop in 24h. Each ran initShopify (packages/functions/src/services/shopifyService.js:38), which decrypts the stored token via prepareShopData and logs it verbatim at :39; all 3 executions carry the identical line 'gfam8p-z5.myshopify.com ***REMOVED-SECRET***'. 180–290 ms later got issues the Admin request and Shopify answers 401 (execution jxep8gsdcqzh: timings.start 1787456248938, response 1787456249213, firstByte 182 ms), raising got's HTTPError ERR_NON_2XX_3XX_RESPONSE. Two of the three executions log through prefixed catches — 'main theme error' (shopifyService.js:129, 03:37:31.862Z), '[getCurrentAppHandle]' (shopifyService.js:441, 03:37:32.041Z), 'checkHasImages error' (shopifyController.js:390, 03:37:32.711Z) — which the logging agent classifies DEFAULT because the payload does not begin with a stack trace. Execution jxep8gsdcqzh instead hits a bare console.error(e) in the shopifyController /apiSa/shopify/* bootstrap family (getThemes at shopifyController.js:353 is the timing match: one Shopify REST call after initShopify, no other log line, then ctx.body={success:false,error,data:[]}); that payload starts with 'HTTPError: Response code 401 (Unauthorized)\n    at Request.<anonymous>', stack-trace detection promotes it to ERROR, and that one line is what the prod-error-alerts sink matched — hence an alert with no endpoint and no shop in its text while the function itself 'finished with status code: 200'. Nothing treats a Shopify 401 as a dead credential: the shop doc is never flagged, no re-auth is signalled, and the same token is reused on the next request (countImagesHandler at 2026-08-22T19:00Z shows the same 401 family fleet-wide on the cron path).

Confidence: `medium`

## Code
- `packages/functions/src/services/shopifyService.js:38` — prepareShopData decrypts the stored offline token Shopify then rejects with 401; all 3 failing executions pass through here
- `packages/functions/src/services/shopifyService.js:39` — console.log(shopifyDomain, accessToken) — the exact 'gfam8p-z5.myshopify.com shpat_…' line in all 3 executions; also writes plaintext Shopify offline tokens into Cloud Logging on every initShopify call
- `packages/functions/src/controllers/shopifyController.js:353` — bare console.error(e) in getThemes (/apiSa/shopify/themes, routes/api.js:126): dumps the raw got HTTPError, the payload shape the agent promotes to severity ERROR and the sink alerts on, while the handler still returns 200
- `packages/functions/src/controllers/shopifyController.js:390` — 'checkHasImages error HTTPError: Response code 401 (Unauthorized)' — exact string observed at 03:37:32.711Z, same shop, same 401, logged DEFAULT because it is prefixed
- `packages/functions/src/services/shopifyService.js:129` — 'main theme error HTTPError: Response code 401 (Unauthorized)' — exact string observed at 03:37:31.862Z; the 401 is swallowed and getMainThemeId returns false
- `packages/functions/src/services/shopifyService.js:441` — '[getCurrentAppHandle] Request failed with status code 401' — exact string observed at 03:37:32.041Z
- `packages/functions/src/routes/api.js:126` — route registration proving /apiSa/shopify/themes dispatches to the bare-logging getThemes catch

## Evidence
- 25 matching entries: `resource.labels.function_name="apiSa" AND labels.execution_id="jxep8gsdcqzh" AND timestamp>="2026-08-23T03:37:00Z" AND timestamp<="2026-08-23T03:38:00Z"`
- 3 matching entries: `resource.labels.function_name="apiSa" AND timestamp>="2026-08-22T03:52:00Z" AND timestamp<="2026-08-23T03:52:41Z" AND textPayload:"Response code 401"`
- 10 matching entries: `timestamp>="2026-08-20T00:00:00Z" AND timestamp<="2026-08-23T04:00:00Z" AND textPayload:"gfam8p-z5"`
- 30 matching entries: `resource.labels.function_name="apiSa" AND (labels.execution_id="mz7vupmd6lfh" OR labels.execution_id="66nt242qhrof") AND timestamp>="2026-08-23T03:37:00Z" AND timestamp<="2026-08-23T03:38:00Z"`
- 50 matching entries: `resource.labels.function_name="countImagesHandler" AND timestamp>="2026-08-22T18:59:00Z" AND timestamp<="2026-08-22T19:10:00Z" AND textPayload:"Response code 401"`

## Job
- analyze rounds: 1
- cost: $2.03

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
