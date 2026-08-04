fingerprint: ve6kl7
service: apisa
message: [getOne] ZeyGA7UaqrZBTQ1cgDW2 Error get settings:  HTTPError: Response code 401 (Unauthorized)
app: BLOG
repo: blogs
date: 2026-08-04T10:29:36.215Z
status: mr_open
attempt: 1

# BLOG · apisa · ve6kl7

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/840

**Root cause.** Shop ZeyGA7UaqrZBTQ1cgDW2 (5k0par-xd.myshopify.com) uninstalled at 2026-08-04T06:10:23Z, blanking its accessToken, but its standalone (apiSa) session cookie stayed valid — a dashboard load 3h43m later at 09:53:58Z fanned out tokenless Shopify Admin calls that all returned 401, and the REST/got branch of that fan-out (getSettingDataConfig → getMainThemeId → shopifyRetryApi → settingsController.getOne) still logs the 401 at logger.error, which is the line that paged.

**Mechanism.** auth logged 'Handling uninstalling for 5k0par-xd.myshopify.com' at 06:10:23.755Z and 'Cancelling subscription' at 06:10:24.433Z (3 auth entries, verified). apiSa is gated only by @avada/core verifyRequest() (handlers/apiSa.js:37) — a session-cookie check that knows nothing about uninstall state — so at 09:53:58 the merchant's still-open tab drove one full settings/dashboard load. Every handler called initShopify (services/shopifyService.js:23), which builds the Shopify client from prepareShopData with the now-empty accessToken, so every Admin call went out with a blank X-Shopify-Access-Token and Shopify answered 401: 23 log lines carrying '401' in the window, all within 200ms (09:53:58.820–09:53:59.020), all for the same shopId. Two branches produce those lines. (a) GraphQL branch, 8 lines tagged [shopifyRetryGraphQL]: already handled — isShopifyAuthError (helpers/api.js:149) demotes 401/402/403 to logger.warn since commit df79f2e73 (MR 838, merged). (b) REST/got branch, which the alerted line belongs to: getSettingDataConfig calls getMainThemeId (services/getSettingDataConfig.js:11), getMainThemeId wraps shopify.theme.list in shopifyRetryApi (services/shopifyService.js:690); shopifyRetryApi rethrows with `throw new Error(e)` (services/shopifyService.js:146), which flattens the got HTTPError into a plain Error and destroys e.response.status — so isShopifyAuthError can never classify anything on this path even if it were applied. getMainThemeId then logs at logger.error (services/shopifyService.js:704, 3 entries in window) and rethrows; settingsController.getOne catches it and logs the alerted string at logger.error (controllers/settingsController.js:75, exactly 1 entry, verified by tag). Same shape for blockLoader (controllers/appBlockController.js:104), getEnableBlocks (controllers/shopifyController.js:610) and getProductsGraphQL (helpers/graphql/graphQLProducts.js:62). Not user-facing: every catch swallows and returns degraded data, so all 16 apiSa requests in 09:53:50–09:54:10Z answered <400 and the requests read (status>=500) was empty — that empty read is expected here, not a missing-data problem. This is the third fingerprint of one incident (16sagxr → MR 838 merged, 1pckik6 → MR 839 open/unmerged); MR 839's uninstall gate would prevent the fan-out entirely, MR 838's fix does not reach this REST branch.

Confidence: `high`

## Code
- `packages/functions/src/controllers/settingsController.js:75` — the exact alerted line: getOne logs the swallowed 401 at logger.error, which is what the severity>=ERROR sink paged on
- `packages/functions/src/services/getSettingDataConfig.js:11` — getOne's Promise.all reaches the REST path here — getMainThemeId on a tokenless client
- `packages/functions/src/services/shopifyService.js:704` — [getMainThemeId] logger.error, 3 entries in the window — the got/REST 401 log site, untouched by the merged GraphQL fix
- `packages/functions/src/services/shopifyService.js:146` — shopifyRetryApi rethrows `new Error(e)`, discarding e.response.status, so no downstream code can tell a 401 from a real fault on this path
- `packages/functions/src/services/shopifyService.js:23` — initShopify builds the client from shop.accessToken with no guard for an uninstalled/blank token — every Admin call goes out unauthenticated
- `packages/functions/src/handlers/apiSa.js:37` — verifyRequest() is the only gate on /apiSa/*; it validates the session cookie and never checks uninstalledAt, so a pre-uninstall session keeps driving Admin calls (MR 839 fixes this, unmerged in this worktree)
- `packages/functions/src/helpers/api.js:149` — isShopifyAuthError already exists and demotes 401/402/403 to warn — but only wired into shopifyRetryGraphQL, not the REST path
- `packages/functions/src/helpers/api.js:156` — the merged MR-838 branch that keeps the 8 [shopifyRetryGraphQL] 401s off the sink, proving the remaining ERROR lines come from the other branch
- `packages/functions/src/controllers/appBlockController.js:104` — blockLoader logs the same REST 401 at error and returns degraded data — same defect, second caller
- `packages/functions/src/controllers/shopifyController.js:610` — getEnableBlocks logs the same REST 401 at error — third caller, so a fix confined to settingsController would not cover the family

## Evidence
- 23 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-04T09:39:00Z" AND timestamp<="2026-08-04T10:09:00Z" AND jsonPayload.message:"401"`
- 1 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:39:00Z" AND timestamp<="2026-08-04T10:09:00Z" AND jsonPayload.tag="[getOne]"`
- 3 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:39:00Z" AND timestamp<="2026-08-04T10:09:00Z" AND jsonPayload.tag="[getMainThemeId]"`
- 8 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:39:00Z" AND timestamp<="2026-08-04T10:09:00Z" AND jsonPayload.tag="[shopifyRetryGraphQL]"`
- 3 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-08-04T06:00:00Z" AND timestamp<="2026-08-04T06:15:00Z" AND textPayload:"5k0par-xd.myshopify.com"`
- 16 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:53:50Z" AND timestamp<="2026-08-04T09:54:10Z" AND httpRequest.status<400`

## Job
- analyze rounds: 2
- cost: $5.94
- branch: `fix/prod-blog-ve6kl7`
- fix commit: `f9b58a3653d1baafdf6439680a20365045502eea`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/840
- tests: 299 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
packages/functions/src/controllers/appBlockController.js  | 15 +++++++++++++--
 packages/functions/src/controllers/settingsController.js  |  7 ++++++-
 packages/functions/src/controllers/shopifyController.js   |  7 ++++++-
 packages/functions/src/helpers/graphql/graphQLProducts.js | 13 +++++++++++--
 packages/functions/src/services/shopifyService.js         | 10 +++++++---
 5 files changed, 43 insertions(+), 9 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
