fingerprint: 1pckik6
service: apisa
message: [shopifyRetryGraphQL] AxiosError: Request failed with status code 401
app: BLOG
repo: blogs
date: 2026-08-04T10:15:24.154Z
status: mr_open
attempt: 1

# BLOG · apisa · 1pckik6

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/839

**Root cause.** Shop ZeyGA7UaqrZBTQ1cgDW2 (5k0par-xd.myshopify.com) uninstalled at 2026-08-04T06:10:24.385Z and its accessToken was removed from the shop doc, but the merchant's still-open standalone (apiSa) session stayed valid, so one dashboard load at 09:53:58 fanned out ~10 Shopify Admin calls with no token — every one returned 401, each was logged at severity ERROR and then swallowed, so 16/16 HTTP requests answered 2xx and the only user-visible effect was the Slack page.

**Mechanism.** auth logged 'Handling uninstalling for 5k0par-xd.myshopify.com' at 06:10:23.755Z and 'Cancelling subscription' at 06:10:24.433Z; uninstallationService.uninstallApp wrote uninstalledAt and blanked the token (uninstallationService.js:31) — the live Firestore doc shops/ZeyGA7UaqrZBTQ1cgDW2 now has shopifyDomain=5k0par-xd.myshopify.com, uninstalledAt=2026-08-04T06:10:24.385Z and NO accessToken field (updateTime 06:10:24.470Z). apiSa is guarded only by @avada/core verifyRequest() (handlers/apiSa.js:37), a session-cookie check that knows nothing about uninstall, so 3h43m later the merchant's open tab replayed a full dashboard load: 16 apiSa requests between 09:53:50Z and 09:54:10Z, all status < 400. Each handler called initShopify (shopifyService.js:23), which built a Shopify client with accessToken undefined, so every Admin call went out with a blank X-Shopify-Access-Token and Shopify answered 401. GraphQL callers went through makeGraphQlApi → shopifyRetryGraphQL, whose catch fires logger.error unconditionally before the retryability check (helpers/api.js:151); 401 is not in RETRYABLE_STATUSES (helpers/api.js:145) so it rethrew immediately — 8 [shopifyRetryGraphQL] ERROR lines, zero retries — and the sink (severity>=ERROR) paged on one of them. REST callers took the got path and logged at shopifyService.js:704 ([getMainThemeId], 3×). Every caller then swallowed the throw and returned degraded data: getShopifyArticleById logs and returns {} (shopifyGraphQlService.js:873, 5×), getShopLocales returns [] (shopifyGraphQlService.js:2455), getShopifyArticles (shopifyService.js:367), handleFetchPdfFiles (pdfFileService.js:84), getEnableBlocks (shopifyController.js:610), blockLoader (appBlockController.js:104) — which is why requests=0 at status>=500. This is one cause with ~10 symptoms, all inside execution ids ehds8p6cinzx/ehdscd5xeojb on revision apisa-00114-ces. The correct behaviour is to fail the request once at the session layer when shop.uninstalledAt is set, not to issue ten tokenless Admin calls and page on each; the seoProxyApi pattern at helpers/api.js:102 (warn for an expected 4xx rejection) is the log-level shape this path is missing.

Confidence: `high`

## Code
- `packages/functions/src/handlers/apiSa.js:37` — apiSa is gated only by verifyRequest() session auth — no uninstall check, so a session issued before uninstall keeps driving Admin calls for a shop with no token
- `packages/functions/src/services/uninstallationService.js:31` — uninstall writes uninstalledAt and blanks accessToken but leaves the shop doc and every session alive; the live doc confirms uninstalledAt=2026-08-04T06:10:24.385Z and no accessToken
- `packages/functions/src/services/shopifyService.js:23` — initShopify builds the client from shop.accessToken with no guard on it being missing/uninstalled — this is where a tokenless request should be refused
- `packages/functions/src/helpers/api.js:151` — logger.error fires on every caught failure before the retryability check — this is the line that produced the paging [shopifyRetryGraphQL] 401 entries
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES omits 401, so each call threw immediately: 8 log lines for 8 calls, no retry storm
- `packages/functions/src/helpers/api.js:102` — seoProxyApi already warns instead of errors for an expected upstream 4xx — the shape shopifyRetryGraphQL should copy
- `packages/functions/src/services/shopifyGraphQlService.js:873` — getShopifyArticleById logs ERROR then returns {} — 5 of the 401 lines, and the reason /apiSa/recentBlogs still answered 200
- `packages/functions/src/services/shopifyService.js:704` — [getMainThemeId] ERROR ×3 — the got/REST path hits the same missing token, so a fix confined to the GraphQL helper would not cover it
- `packages/functions/src/services/shopifyGraphQlService.js:2455` — getShopLocales swallows the 401 and returns [], keeping /apiSa/settings at 200
- `packages/functions/src/controllers/appBlockController.js:104` — blockLoader swallows the 401 — /apiSa/blockLoader answered 200 while logging ERROR

## Evidence
- 3 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-08-04T06:00:00Z" AND timestamp<="2026-08-04T06:15:00Z" AND textPayload:"5k0par-xd.myshopify.com"`
- 11 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:39:00Z" AND timestamp<="2026-08-04T10:09:00Z" AND jsonPayload.message:"ZeyGA7UaqrZBTQ1cgDW2"`
- 8 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:39:00Z" AND timestamp<="2026-08-04T10:09:00Z" AND jsonPayload.tag="[shopifyRetryGraphQL]"`
- 16 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:53:50Z" AND timestamp<="2026-08-04T09:54:10Z" AND httpRequest.status<400`

## Job
- analyze rounds: 2
- cost: $4.09
- branch: `fix/prod-blog-1pckik6`
- fix commit: `be3565e32dd065c2a87b6ceb80af6e791a6af554`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/839
- tests: 295 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix (suite load)

```
packages/functions/src/handlers/apiSa.js | 2 ++
 1 file changed, 2 insertions(+)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
