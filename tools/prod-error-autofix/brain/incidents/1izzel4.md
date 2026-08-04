fingerprint: 1izzel4
service: apisa
message: [getShopifyArticles] ZeyGA7UaqrZBTQ1cgDW2 AxiosError: Request failed with status code 401
app: BLOG
repo: blogs
date: 2026-08-04T10:50:33.261Z
status: mr_open
attempt: 1

# BLOG · apisa · 1izzel4

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/843

**Root cause.** Shop ZeyGA7UaqrZBTQ1cgDW2 (5k0par-xd.myshopify.com) uninstalled at 2026-08-04T06:10:24Z, which blanked its accessToken, but its apiSa session cookie stayed valid — a dashboard load 3h43m later fanned out ~14 tokenless Shopify Admin calls that all returned 401, and getShopifyArticles' catch (shopifyService.js:367) logs that expected 401 at logger.error, so the sink paged on a merchant uninstall, not an app fault.

**Mechanism.** auth logged 'Handling uninstalling for 5k0par-xd.myshopify.com' at 06:10:23.755Z and 'Cancelling subscription' at 06:10:24.433Z; uninstallApp then wrote {accessToken: '', uninstalledAt: new Date()} onto the shop doc (services/uninstallationService.js:31). apiSa's only gate is @avada/core verifyRequest() (handlers/apiSa.js:39), a session-cookie check that knows nothing about install state, so at 09:53:58Z the merchant's still-open standalone tab replayed a full dashboard load: 16 GET/POST /apiSa/* in 1.2s, all HTTP 200 (requests read at status>=500 returned 0). Every handler resolved the same shop doc and called initShopify (services/shopifyService.js:23), which destructures accessToken with no guard on empty string, so every Admin call went out with a blank X-Shopify-Access-Token and Shopify answered 401 to all of them — 23 ERROR lines in one burst: getShopifyArticleById×5, shopifyRetryGraphQL×8, getMainThemeId×3, and one each of getShopifyArticles, getShopLocales, getProductsGraphQL, handleFetchPdfFiles, getEnableBlocks, blockLoader, getOne. The alerted line is GET /apiSa/articles (09:53:58.683Z) reaching articleController.list:709 → getShopifyArticles (shopifyService.js:271); makeGraphQlApi threw the AxiosError 401, shopifyRetryGraphQL rethrew immediately (401 is not in RETRYABLE_STATUSES, helpers/api.js) and getShopifyArticles' catch logged it at logger.error before rethrowing (shopifyService.js:367) — that is the exact log entry the sink matched at 09:53:58.873810Z. This is the sixth fingerprint cut from this one 23-line burst (16sagxr, 1pckik6, ve6kl7, 12v7fbr, ksxs3b). The already-merged fix df79f2e73 added isShopifyAuthError (helpers/api.js:149) and applied it in shopifyRetryGraphQL (api.js:156) and getShopLocales (shopifyGraphQlService.js:2455) — that covers 9 of the 23 lines. The other 14, including this one, still log at ERROR, so the same merchant action still pages. Nothing is user-facing: each caller swallows or returns degraded data and all 16 requests answered 200.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:367` — the exact alerting line — getShopifyArticles logs the expected uninstalled-shop 401 at logger.error, not covered by the merged isShopifyAuthError fix
- `packages/functions/src/services/shopifyService.js:271` — getShopifyArticles definition; its makeGraphQlApi call is what draws the 401 when accessToken is ''
- `packages/functions/src/controllers/articleController.js:709` — GET /apiSa/articles calls getShopifyArticles — the caller in the alerted request at 09:53:58.683Z
- `packages/functions/src/helpers/api.js:149` — isShopifyAuthError already exists and is exported — the predicate the remaining catches should use
- `packages/functions/src/helpers/api.js:156` — shopifyRetryGraphQL already downgrades 401 to warn (df79f2e73), which is why only the per-caller catches still page
- `packages/functions/src/services/shopifyService.js:23` — initShopify destructures accessToken with no guard for empty string — every Admin call goes out unauthenticated after uninstall
- `packages/functions/src/services/uninstallationService.js:31` — uninstall writes {accessToken: '', uninstalledAt} and leaves the shop doc and sessions alive
- `packages/functions/src/handlers/apiSa.js:39` — verifyRequest() is the only gate on /apiSa/* — session cookie only, no isInstalled/uninstalledAt check
- `packages/functions/src/services/shopifyGraphQlService.js:873` — getShopifyArticleById — same still-ERROR pattern, 5 of the 14 remaining lines in this burst
- `packages/functions/src/services/shopifyService.js:704` — getMainThemeId ×3 — the got/REST path hits the same missing token, so a GraphQL-only fix would not cover it
- `packages/functions/src/services/pdfFileService.js:84` — handleFetchPdfFiles — same still-ERROR pattern in this burst
- `packages/functions/src/helpers/graphql/graphQLProducts.js:62` — getProductsGraphQL — same still-ERROR pattern in this burst
- `packages/functions/src/controllers/tag.controller.js:19` — the storefront path's local isShopifyAuthError → warn, the shape the apiSa callers should copy

## Evidence
- 1 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:53:50Z" AND timestamp<="2026-08-04T09:54:30Z" AND jsonPayload.tag="[getShopifyArticles]"`
- 3 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-08-04T06:09:00Z" AND timestamp<="2026-08-04T06:20:00Z" AND textPayload:"5k0par-xd"`
- 16 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:53:50Z" AND timestamp<="2026-08-04T09:54:30Z" AND httpRequest.requestMethod!=""`
- 23 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-04T09:39:01Z" AND timestamp<="2026-08-04T10:09:01Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $2.79
- branch: `fix/prod-blog-1izzel4`
- fix commit: `08864eb511d6b9bc54d0e49e0745409aaed54ab1`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/843
- tests: 297 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
packages/functions/src/helpers/graphql/graphQLProducts.js  | 13 +++++++++++--
 .../shopifyGraphQlService.invalidArticleShape.test.js      | 12 ++++++++----
 .../shopifyGraphQlService.normalizeArticleId.test.js       | 12 ++++++++----
 .../__tests__/shopifyGraphQlService.nullArticle.test.js    | 12 ++++++++----
 packages/functions/src/services/pdfFileService.js          |  8 ++++++--
 packages/functions/src/services/shopifyGraphQlService.js   |  6 +++++-
 packages/functions/src/services/shopifyService.js          | 14 +++++++++++---
 7 files changed, 57 insertions(+), 20 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
