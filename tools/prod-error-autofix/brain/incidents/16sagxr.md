fingerprint: 16sagxr
service: apisa
message: [getShopLocales] ZeyGA7UaqrZBTQ1cgDW2 AxiosError: Request failed with status code 401
app: BLOG
repo: blogs
date: 2026-08-04T10:03:49.126Z
status: mr_open
attempt: 1

# BLOG · apisa · 16sagxr

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/838

**Root cause.** Shop ZeyGA7UaqrZBTQ1cgDW2 (5k0par-xd.myshopify.com) uninstalled the app at 2026-08-04T06:10:23Z, which blanked its accessToken in Firestore, but its standalone-app session cookie stayed valid — so a dashboard load 3h43m later at 09:53:58Z fanned out ~12 Shopify Admin calls with an empty token and every one returned HTTP 401, each logged at logger.error.

**Mechanism.** auth logged 'Handling uninstalling for 5k0par-xd.myshopify.com' at 06:10:23.755Z; uninstallApp then wrote {accessToken: '', uninstalledAt: new Date()} onto the shop doc (services/uninstallationService.js:31) — the live doc now reads uninstalledAt=2026-08-04T06:10:24.385Z, isInstalled=false, isActiveInstall=false and carries no accessToken field. apiSa's only gate is verifyRequest() (handlers/apiSa.js:39), which validates the Avada session cookie and never checks install state, so at 09:53:58Z the merchant's still-live standalone session drove a full dashboard load: 16 GET/POST /apiSa/* in 1.2s. Every handler resolved the same shop doc and called initShopify (services/shopifyService.js:25), which built a Shopify client with accessToken === '' — hence 'X-Shopify-Access-Token: ' on every Admin call. Shopify answered 401 to all of them: 5× getShopifyArticleById, getShopifyArticles, getShopLocales (the alerted line, shopifyGraphQlService.js:2455), handleFetchPdfFiles, getProductsGraphQL, and 3× getMainThemeId via blockLoader/getEnableBlocks/settings getOne. 401 is not in RETRYABLE_STATUSES (helpers/api.js:145) so shopifyRetryGraphQL rethrows immediately, but it logs every failure at logger.error first (helpers/api.js:151), doubling the noise — 23 ERROR lines from one page load, one of which paged. Not user-facing: all 16 apiSa requests answered HTTP 200 and the requests read (status>=500) returned 0 entries; each catch swallows the 401 and returns []. The storefront proxy path already handles exactly this case correctly via isShopifyAuthError → logger.warn + empty payload (controllers/tag.controller.js:19,90); the apiSa/api paths have no equivalent.

Confidence: `high`

## Code
- `packages/functions/src/services/uninstallationService.js:31` — uninstall handler blanks accessToken and stamps uninstalledAt — the shop doc keeps existing with an empty token
- `packages/functions/src/handlers/apiSa.js:39` — verifyRequest() is the only gate on /apiSa/*; it validates the session cookie and never checks isInstalled/uninstalledAt, so an uninstalled shop keeps serving
- `packages/functions/src/services/shopifyService.js:25` — initShopify destructures accessToken with no guard for empty string — every Admin call goes out unauthenticated
- `packages/functions/src/services/shopifyGraphQlService.js:2455` — the exact log line in the alert: getShopLocales catch logs the AxiosError at logger.error, which is what the sink paged on
- `packages/functions/src/helpers/api.js:151` — shopifyRetryGraphQL logs every failure at logger.error before deciding retryability, so each 401 pages twice
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES omits 401 — correct, the 401 is rethrown immediately, no retry storm
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError — the existing 401-as-warn pattern on the proxy path that the apiSa path should reuse

## Evidence
- 23 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-04T09:39:00Z" AND timestamp<="2026-08-04T10:09:00Z" AND jsonPayload.message:"401"`
- 3 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-08-04T06:09:00Z" AND timestamp<="2026-08-04T06:20:00Z" AND textPayload:"5k0par-xd"`
- 16 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:53:50Z" AND timestamp<="2026-08-04T09:54:30Z" AND httpRequest.requestMethod!=""`
- 11 matching entries: `timestamp>="2026-08-03T10:00:00Z" AND timestamp<="2026-08-04T10:10:00Z" AND jsonPayload.message:"ZeyGA7UaqrZBTQ1cgDW2"`

## Job
- analyze rounds: 1
- cost: $3.43
- branch: `fix/prod-blog-16sagxr`
- fix commit: `df79f2e739708199bfc3c14cf97a4b303e53df34`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/838
- tests: 295 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
.../src/helpers/__tests__/shopifyRetryGraphQL.test.js     | 15 ++++++++++++++-
 packages/functions/src/helpers/api.js                     | 11 ++++++++++-
 packages/functions/src/services/shopifyGraphQlService.js  |  8 ++++++--
 3 files changed, 30 insertions(+), 4 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
