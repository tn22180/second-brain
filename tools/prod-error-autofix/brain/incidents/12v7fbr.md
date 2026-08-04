fingerprint: 12v7fbr
service: apisa
message: [getMainThemeId] HTTPError: Response code 401 (Unauthorized)
app: BLOG
repo: blogs
date: 2026-08-04T10:36:49.373Z
status: mr_open
attempt: 1

# BLOG · apisa · 12v7fbr

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/841

**Root cause.** Shop ZeyGA7UaqrZBTQ1cgDW2 (5k0par-xd.myshopify.com) uninstalled at 2026-08-04T06:10:23.755Z, which blanked its accessToken, but its still-valid standalone session drove a dashboard load at 09:53:58Z whose Shopify REST theme.list calls returned 401 — and getMainThemeId logs that revoked-token 401 at logger.error, so the sink paged; the merged isShopifyAuthError fix does not reach this path because shopifyRetryApi rethrows `new Error(e)`, discarding the status the classifier reads.

**Mechanism.** auth logged 'Handling uninstalling for 5k0par-xd.myshopify.com' at 06:10:23.755Z and 'Cancelling subscription' at 06:10:24.433Z; uninstallApp wrote {accessToken: '', uninstalledAt} onto the shop doc (services/uninstallationService.js:31). apiSa's only gate is verifyRequest() (handlers/apiSa.js:39), which validates the Avada session cookie and never checks install state, so 3h43m later the merchant's live session drove 16 GET/POST /apiSa/* in 1.2s — all answered HTTP 200. Every handler called initShopify with accessToken === '' and Shopify answered 401 to all Admin calls: 23 ERROR lines in a 200ms burst (09:53:58.820–09:53:59.020Z), all tagged with the same shopID. Three of them are the alerted line: getMainThemeId reached from blockLoader (controllers/appBlockController.js:43), from getAppBlockByType → getEnableBlocks (services/shopifyService.js:778) and from the settings getOne path. getMainThemeId's REST call goes through shopifyRetryApi (services/shopifyService.js:141); got throws HTTPError with the status on e.response.statusCode, shopifyRetryError finds no retry-after and no matching code so shopifyRetryApi rethrows `new Error(e)` (services/shopifyService.js:146) — a plain Error whose message is the stringified HTTPError and which carries neither e.response.status nor e.statusCode. getMainThemeId's catch then logs it at logger.error (services/shopifyService.js:704). The isShopifyAuthError classifier merged in df79f2e73 reads `e?.response?.status ?? e?.statusCode` (helpers/api.js:149) — both undefined after that flattening — so it returns false and this path keeps paging even though the GraphQL path (helpers/api.js:156) no longer does. The three callers re-log the same rethrown error at logger.error again (controllers/shopifyController.js:610, controllers/settingsController.js:75), tripling one 401 into three ERROR lines.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:704` — the exact alerted line — getMainThemeId's catch logs the revoked-token 401 at logger.error, which is what the prod-error-alerts sink paged on
- `packages/functions/src/services/shopifyService.js:146` — shopifyRetryApi rethrows `new Error(e)`, flattening got's HTTPError and dropping e.response.statusCode — this is why the merged isShopifyAuthError classifier cannot see the 401 on the REST path
- `packages/functions/src/helpers/api.js:149` — isShopifyAuthError reads e?.response?.status ?? e?.statusCode — matches axios errors only; got errors expose e.response.statusCode, and after line 146 nothing survives anyway
- `packages/functions/src/services/shopifyService.js:690` — the failing REST call: shopify.theme.list wrapped in shopifyRetryApi, issued with the empty accessToken
- `packages/functions/src/controllers/appBlockController.js:43` — blockLoader caller in the stack (/workspace/lib/controllers/appBlockController.js:59) — one of the three getMainThemeId 401s; /apiSa/blockLoader was requested twice in the burst
- `packages/functions/src/services/shopifyService.js:778` — getAppBlockByType → getMainThemeId, the second stack (/workspace/lib/services/shopifyService.js:888), reached from getEnableBlocks
- `packages/functions/src/controllers/shopifyController.js:610` — getEnableBlocks re-logs the same rethrown 401 at logger.error, multiplying one failure into extra ERROR lines
- `packages/functions/src/controllers/settingsController.js:75` — the third getMainThemeId 401, logged again as '[getOne] … Error get settings: HTTPError: Response code 401'
- `packages/functions/src/services/uninstallationService.js:31` — uninstall blanks accessToken and stamps uninstalledAt — the shop doc keeps existing with an empty token, so initShopify happily builds an unauthenticated client
- `packages/functions/src/handlers/apiSa.js:39` — verifyRequest() is the only gate on /apiSa/*; it validates the session cookie and never checks isInstalled/uninstalledAt, so an uninstalled shop keeps serving a full dashboard fan-out

## Evidence
- 3 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-08-04T09:39:00Z" AND timestamp<="2026-08-04T10:09:00Z" AND jsonPayload.tag="[getMainThemeId]"`
- 23 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-04T09:39:00Z" AND timestamp<="2026-08-04T10:09:00Z" AND jsonPayload.message:"401"`
- 3 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-08-04T06:09:00Z" AND timestamp<="2026-08-04T06:20:00Z" AND textPayload:"5k0par-xd"`
- 16 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:53:50Z" AND timestamp<="2026-08-04T09:54:30Z" AND httpRequest.requestMethod!=""`

## Job
- analyze rounds: 1
- cost: $2.62
- branch: `fix/prod-blog-12v7fbr`
- fix commit: `56bf907d690a2219bc9b39ce5930c5c9f95ae11a`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/841
- tests: 297 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
packages/functions/src/helpers/api.js             |  2 +-
 packages/functions/src/services/shopifyService.js | 14 +++++++++++---
 2 files changed, 12 insertions(+), 4 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
