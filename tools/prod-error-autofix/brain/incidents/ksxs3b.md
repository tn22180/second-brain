fingerprint: ksxs3b
service: apisa
message: [getEnableBlocks] ZeyGA7UaqrZBTQ1cgDW2 Error: HTTPError: Response code 401 (Unauthorized)
app: BLOG
repo: blogs
date: 2026-08-04T10:43:11.623Z
status: mr_open
attempt: 1

# BLOG · apisa · ksxs3b

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/842

**Root cause.** The same uninstalled shop ZeyGA7UaqrZBTQ1cgDW2 (accessToken blanked at 2026-08-04T06:10:24Z) drove a stale apiSa dashboard load at 09:53:58Z, and on the REST/got call path shopifyRetryApi flattens got's HTTPError into `new Error(e)` — dropping response.statusCode — so isShopifyAuthError cannot classify the 401 and getMainThemeId logs it at logger.error, paging the sink.

**Mechanism.** auth logged 'Handling uninstalling for 5k0par-xd.myshopify.com' at 06:10:23.755Z and uninstallationService wrote {accessToken: '', uninstalledAt} on the shop doc. apiSa's only gate is verifyRequest(), which never checks install state, so 3h43m later the merchant's still-live standalone session fanned out a full dashboard load. Every handler called initShopify (services/shopifyService.js:23-32), which builds the shopify-api-node client with accessToken === '' — Shopify answers 401 to every Admin call. Three of those calls are REST theme.list() through getMainThemeId (services/shopifyService.js:688) → shopifyRetryApi (services/shopifyService.js:141): 401 is not in shopifyRetryError's retryable codes [429,430,502,503], so line 146 does `throw new Error(e)`, which stringifies the got HTTPError into a plain Error whose message is 'HTTPError: Response code 401 (Unauthorized)' and which carries neither `response.status` nor `statusCode`. getMainThemeId's catch at services/shopifyService.js:704 therefore logs at logger.error unconditionally, and the three callers — getEnableBlocks (controllers/shopifyController.js:610, the alerted line), blockLoader (controllers/appBlockController.js:104) and settings getOne (controllers/settingsController.js:75) — each log the rethrow at logger.error again. That is 5-6 of the 23 ERROR lines in the window. The merged fix df79f2e73 added isShopifyAuthError (helpers/api.js:149) but wired it only into shopifyRetryGraphQL and getShopLocales — the axios/GraphQL path — so the REST path is untouched, and it would not work there anyway because the status has already been stripped by line 146.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:146` — shopifyRetryApi does `throw new Error(e)` on a non-retryable failure, flattening got's HTTPError and losing response.statusCode — the reason isShopifyAuthError cannot classify this 401
- `packages/functions/src/services/shopifyService.js:704` — getMainThemeId's catch logs every failure at logger.error, including the expected revoked-token 401 — the line that pages
- `packages/functions/src/services/shopifyService.js:778` — getAppBlockByType calls getMainThemeId, the frame between the controller and the 401 in the alert stack
- `packages/functions/src/controllers/shopifyController.js:610` — getEnableBlocks catch — the exact '[getEnableBlocks] ZeyGA7UaqrZBTQ1cgDW2 Error: HTTPError: Response code 401' line the alert fired on
- `packages/functions/src/controllers/appBlockController.js:104` — blockLoader catch — second logger.error from the same 401 burst, same getMainThemeId stack
- `packages/functions/src/controllers/settingsController.js:75` — settings getOne catch — third logger.error from the same burst ('Error get settings: HTTPError: Response code 401')
- `packages/functions/src/helpers/api.js:149` — isShopifyAuthError, added by merged commit df79f2e73 for the GraphQL path only; reads e?.response?.status ?? e?.statusCode, neither of which survives shopifyService.js:146
- `packages/functions/src/services/shopifyService.js:25` — initShopify destructures accessToken with no empty-string guard, so an uninstalled shop's client sends 'X-Shopify-Access-Token: '

## Evidence
- 5 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:53:50Z" AND timestamp<="2026-08-04T09:54:30Z" AND jsonPayload.message:"getMainThemeId"`
- 23 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:39:00Z" AND timestamp<="2026-08-04T10:09:00Z" AND severity>=ERROR AND jsonPayload.message:"401"`
- 3 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-08-04T06:09:00Z" AND timestamp<="2026-08-04T06:20:00Z" AND textPayload:"5k0par-xd"`
- 11 matching entries: `timestamp>="2026-08-03T10:00:00Z" AND timestamp<="2026-08-04T10:10:00Z" AND jsonPayload.message:"ZeyGA7UaqrZBTQ1cgDW2"`

## Job
- analyze rounds: 1
- cost: $2.33
- branch: `fix/prod-blog-ksxs3b`
- fix commit: `f9776e41b285ee4fea4bfbbf60f812bfb8c95d47`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/842
- tests: 297 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
packages/functions/src/controllers/appBlockController.js | 15 +++++++++++++--
 packages/functions/src/controllers/settingsController.js |  7 ++++++-
 packages/functions/src/controllers/shopifyController.js  |  7 ++++++-
 packages/functions/src/helpers/api.js                    |  3 ++-
 packages/functions/src/services/shopifyService.js        | 10 +++++++---
 5 files changed, 34 insertions(+), 8 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
