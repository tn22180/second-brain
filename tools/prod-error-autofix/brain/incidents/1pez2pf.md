fingerprint: 1pez2pf
service: apiSa
message: Error: Error: Request failed with status code 401
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-17T08:47:38.155Z
status: inconclusive
attempt: 1

# IMG-OPT · apiSa · 1pez2pf

**Outcome.** smoke gate new_failures

**Root cause.** All 11 alerted ERRORs are one shop — 6djfuf-1a.myshopify.com (shopId IQp3Y1BEXlfH66ZEFcsB) — whose stored offline accessToken shpat_1dccc735… was rejected by Shopify with HTTP 401 on every Admin API call between 08:28:31Z and 08:29:34Z, and apiSa has no invalid-token path, so getImages logged the raw axios error at ERROR severity and answered HTTP 200 with an empty image list.

**Mechanism.** getImages (shopifyController.js:151) calls handleGetFile, which fans out handleGetFiles (shopifyGraphQlService.js:756) → makeGraphQlApi (helpers/api.js:105) → shopifyRetryGraphQL. Shopify answered 401 to the `files` GraphQL POST; shopifyRetryGraphQL only retries statusCode in [500,502,503,520] (shopifyService.js:227) so it rethrows `new Error(e)`, which loses statusCode and prints as 'Error: Error: Request failed with status code 401'. The same token 401'd on the REST paths in the same executions ('main theme error', 'GetDataAsset Error', 'checkHasImages error', 'getFirstFileImages error' — 91 'Unauthorized' lines on apiSa in 24h, all this shop), so the token, not the query, is invalid. getImages' catch (shopifyController.js:158) does `console.error(e)` and returns {data:{images:[]}} — hence 'Function execution took 360 ms, finished with status code: 200' and an empty `requests` (status>=500) read. Two independent defects sit on this path: (a) makeGraphQlApi passes maxRetries into shopifyRetryGraphQL's `attempt` parameter (helpers/api.js:105 vs shopifyService.js:222), proven by all 13 logged 'shopifyRetryGraphQL error … attempt 6' lines on first failure — retries are dead for every GraphQL call in the app; (b) initShopify writes `console.log(shopifyDomain, accessToken)` (shopifyService.js:39), so every shop's Shopify Admin token is in plaintext in Cloud Logging — 39 such lines for this shop in the 30-minute window alone. Why the token went invalid is not in the logs: OAuth install completed 07:08:46Z, the same token succeeded on webHookHandlerSubscriber bulk-operation finish at 07:23–07:26Z, no app/uninstalled webhook ('uninstallApp') and no new OAuth callback were logged before the 401s began.

Confidence: `high`

## Code
- `packages/functions/src/controllers/shopifyController.js:158` — getImages catch does console.error(e) then returns empty images with HTTP 200 — the only reason this alert exists and the reason no 500 was recorded
- `packages/functions/src/controllers/shopifyController.js:151` — handleGetFile call site named in the prod stack (lib/controllers/shopifyController.js:183)
- `packages/functions/src/services/shopifyGraphQlService.js:785` — makeGraphQlApi call inside handleGetFiles — the frame that threw (lib/…:914)
- `packages/functions/src/helpers/api.js:105` — shopifyRetryGraphQL(handler, maxRetries) passes 5 into the `attempt` parameter, so attempt>=SHOPIFY_MAX_RETRY on the first failure — logs show 'attempt 6' every time, no retry ever happens
- `packages/functions/src/services/shopifyService.js:227` — retryable set is [500,502,503,520] on e.statusCode; 401 is correctly non-retryable but `throw new Error(e)` on line 229 flattens it to a string, so no caller can branch on 401
- `packages/functions/src/services/shopifyService.js:39` — console.log(shopifyDomain, accessToken) leaks every shop's Shopify Admin access token into Cloud Logging on every initShopify call — 39 lines for this shop in the alert window
- `packages/functions/src/services/shopifyService.js:295` — getDataAsset swallows the same 401 as 'GetDataAsset Error' and returns empty data, so the 401 is invisible to the caller

## Evidence
- 11 matching entries: `resource.labels.function_name="apiSa" AND timestamp>="2026-08-17T08:13:47Z" AND timestamp<="2026-08-17T08:43:47Z" AND severity>=ERROR AND textPayload:"status code 401"`
- 13 matching entries: `timestamp>="2026-08-16T09:00:00Z" AND timestamp<="2026-08-17T09:00:00Z" AND severity>=ERROR AND textPayload:"status code 401"`
- 39 matching entries: `resource.labels.function_name="apiSa" AND timestamp>="2026-08-17T08:13:47Z" AND timestamp<="2026-08-17T08:43:47Z" AND textPayload:"6djfuf-1a.myshopify.com"`
- 91 matching entries: `resource.labels.function_name="apiSa" AND timestamp>="2026-08-16T09:00:00Z" AND timestamp<="2026-08-17T09:00:00Z" AND textPayload:"Unauthorized"`
- 13 matching entries: `resource.labels.function_name="apiSa" AND timestamp>="2026-08-17T08:13:47Z" AND timestamp<="2026-08-17T08:43:47Z" AND textPayload:"shopifyRetryGraphQL error"`
- 5 matching entries: `resource.labels.function_name="webHookHandlerSubscriber" AND timestamp>="2026-08-17T07:20:00Z" AND timestamp<="2026-08-17T07:30:00Z" AND textPayload:"6djfuf-1a.myshopify.com"`
- 24 matching entries: `resource.labels.function_name="auth" AND timestamp>="2026-08-17T07:00:00Z" AND timestamp<="2026-08-17T08:30:00Z" AND textPayload:"6djfuf"`

## Job
- analyze rounds: 1
- cost: $8.98
- tests: 4 tests, 101 failing · baseline 100 failing · reproduce check did not pass

```
.../functions/src/controllers/shopifyController.js | 10 ++++++++-
 packages/functions/src/helpers/api.js              |  5 ++---
 packages/functions/src/services/shopifyService.js  | 24 ++++++++++++++++++++--
 3 files changed, 33 insertions(+), 6 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
