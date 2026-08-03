fingerprint: ct2hgz
service: apiSa
message: HTTPError: Response code 401 (Unauthorized)
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-03T09:20:14.774Z
status: inconclusive
attempt: 2

# IMG-OPT · apiSa · ct2hgz

**Outcome.** smoke gate new_failures

**Root cause.** Shop f49eef-3b.myshopify.com uninstalled the app at 08:08:31Z, which revoked its Shopify access token, but uninstallApp only writes {uninstalled:true} and leaves the dead token in Firestore while nothing gates apiSa on it — so the merchant's still-open standalone tab kept calling apiSa 53 minutes later, initShopify rebuilt a client from the revoked token, and Shopify answered 401.

**Mechanism.** auth logged `Handling uninstalling for  f49eef-3b.myshopify.com` at 2026-08-03T08:08:31.674Z, followed by `uninstallApp {..."isInstalled":true..."accessTokenHash":"U2FsdGVkX1+vv6o4paxYv3vVtNNMUk9oafD1qHlWxHxpvgo8uzc7qMVW2Wgj1MUtDUv9KDb50/CFa7HPbnc51Q=="}` — uninstallationService.js:24 writes only `{uninstalled: true, uninstalledAt}`: it does not clear accessToken/accessTokenHash and does not flip isInstalled (the dumped doc still shows isInstalled:true). At 09:01:47.727–09:01:50.309Z four apiSa executions (p4liay49xq79, p4liape6m2y0, 47eah6atmnne, p5eses3r70ds) each emit initShopify's `f49eef-3b.myshopify.com ***REMOVED-SECRET***` line (shopifyService.js:39) and then a 401 — apiSa mounts only verifyRequest() (apiSa.js:48), which validates the still-live session and has no uninstalled/dead-token gate. Three of the four are prefixed (`checkHasImages error`, `main theme error`, `[getCurrentAppHandle]`) and land at severity DEFAULT; execution p4liape6m2y0 hits a bare `console.error(e)` catch (representative: shopifyController.js:353, getThemes — one initShopify + one REST call, matching the 107ms got timing), so Cloud Functions' log parser sees an unprefixed stack trace, tags it severity=ERROR and attaches errorGroups COjFyJ_-2t2VTA. That single line is the only severity>=ERROR entry apiSa produced in 24h and is therefore the only thing the prod-error-alerts sink could match. Every one of the four executions still `finished with status code: 200` because each catch swallows the error, which is why the requests read (httpRequest.status>=500) is empty. The exact route of p4liape6m2y0 is not recoverable: apiSa is a gen1 cloud_function whose entries carry no httpRequest payload and the log line has no route tag.

Confidence: `high`

## Code
- `packages/functions/src/services/uninstallationService.js:24` — uninstallApp's only mutation — sets {uninstalled:true, uninstalledAt} and leaves the revoked accessToken/accessTokenHash and isInstalled:true in the shop doc, exactly as the 08:08:31.787Z dump shows
- `packages/functions/src/services/shopifyService.js:34` — initShopify builds the shopify-api-node client from the stored token; all four 09:01:4x executions built a client here from the revoked token
- `packages/functions/src/services/shopifyService.js:39` — console.log(shopifyDomain, accessToken) — emits the `f49eef-3b.myshopify.com shpat_ec8b...` line that immediately precedes every 401, and writes live Admin tokens into Cloud Logging
- `packages/functions/src/handlers/apiSa.js:48` — apiSa mounts verifyRequest() and the router with no uninstalled-shop or dead-token gate, so an uninstalled shop's session keeps hitting Shopify
- `packages/functions/src/controllers/shopifyController.js:353` — representative untagged `console.error(e)` on a route that does initShopify + one Shopify REST call (getThemes) — this catch shape produces the bare got stack that Cloud Functions tags severity=ERROR and that fired the alert
- `packages/functions/src/controllers/shopifyController.js:390` — `console.error('checkHasImages error', e)` — prefixed, so the same 401 in execution p4liay49xq79 stayed at severity DEFAULT and never reached the sink; proves the prefix, not the error, decides visibility
- `packages/functions/src/services/shopifyService.js:129` — console.error('main theme error', e.message) — matches the 09:01:48.709Z line verbatim, identifying getMainThemeId as a second 401 source on the same shop

## Evidence
- 1 matching entries: `timestamp>="2026-08-02T09:20:00Z" AND timestamp<="2026-08-03T09:20:00Z" AND textPayload:"Handling uninstalling" AND textPayload:"f49eef-3b"`
- 5 matching entries: `resource.labels.function_name="apiSa" AND timestamp>="2026-08-03T09:01:40Z" AND timestamp<="2026-08-03T09:02:00Z" AND textPayload:"401"`
- 4 matching entries: `timestamp>="2026-08-03T09:01:40Z" AND timestamp<="2026-08-03T09:02:00Z" AND textPayload:"f49eef-3b"`
- 1 matching entries: `resource.labels.function_name="apiSa" AND timestamp>="2026-08-02T09:20:00Z" AND timestamp<="2026-08-03T09:20:00Z" AND severity>=ERROR`
- 7 matching entries: `timestamp>="2026-08-02T09:20:00Z" AND timestamp<="2026-08-03T09:20:00Z" AND textPayload:"Handling uninstalling for"`

## Job
- analyze rounds: 1
- cost: $6.44
- tests: 16 tests, 75 failing · baseline 73 failing · reproduce check did not pass

```
.../functions/src/controllers/shopifyController.js | 37 +++++++++++++++-------
 packages/functions/src/services/shopifyService.js  | 14 +++++++-
 .../src/services/uninstallationService.js          | 19 ++++++++++-
 3 files changed, 56 insertions(+), 14 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
