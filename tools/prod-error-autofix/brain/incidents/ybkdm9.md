fingerprint: ybkdm9
service: apisa
message: [getShopifyArticleById] ZeyGA7UaqrZBTQ1cgDW2 <gid://shopify/Article/562878742624> AxiosError: Request failed with status code 401
app: BLOG
repo: blogs
date: 2026-08-04T11:01:03.107Z
status: inconclusive
attempt: 1

# BLOG · apisa · ybkdm9

**Outcome.** smoke gate new_failures

**Root cause.** Shop ZeyGA7UaqrZBTQ1cgDW2 (5k0par-xd.myshopify.com) uninstalled at 2026-08-04T06:10:23.755Z, which blanked its accessToken, but its apiSa session cookie stayed live — a dashboard load 3h43m later ran GET /apiSa/articles?getRecentPosts=true, which fanned out exactly 5 tokenless getShopifyArticleById calls that all drew Shopify 401, and getShopifyArticleById's catch logs that expected 401 at logger.error (shopifyGraphQlService.js:873), so the sink paged on a merchant uninstall, not an app fault.

**Mechanism.** auth logged 'Handling uninstalling for 5k0par-xd.myshopify.com' at 06:10:23.755078Z and 'Cancelling subscription' at 06:10:24.433122Z; uninstallApp then wrote {accessToken: '', uninstalledAt: new Date()} onto the shop doc (uninstallationService.js:31) and left the doc and its sessions alive. apiSa's only gate is @avada/core verifyRequest() (handlers/apiSa.js:39), a session-cookie check that knows nothing about install state, so at 09:53:58Z the merchant's still-open standalone tab replayed a full dashboard load: 16 GET/POST /apiSa/* in 1.2s, every one HTTP 200 (that is why the round-1 httpRequest.status>=500 query matched nothing — there were no 5xx; this alert is an application-error line, not a request failure). The alerted request is GET /apiSa/articles?...&getRecentPosts=true at 09:53:58.683748Z → articleController.list (articleController.js:671). getRecentPosts=true takes the branch at articleController.js:680, normalizes shop.recentOpenedArticles, and slices to 5 — articleIds.slice(0, 5).map(...) at articleController.js:691 calls getShopifyArticleById at articleController.js:693. That is why the burst carries exactly 5 [getShopifyArticleById] lines, one per gid: 562697076832, 563061981280, 562839355488, 562878742624 (the alerted one, 09:53:59.011965Z), 563002671200, all within 19ms. Each call went through initShopify (shopifyService.js:23), which destructures accessToken with no guard on empty string, so the Admin GraphQL request went out with a blank X-Shopify-Access-Token and Shopify answered 401. shopifyRetryGraphQL rethrew immediately (401 not in RETRYABLE_STATUSES, helpers/api.js:156 already downgrades its own line to warn via the merged df79f2e73 fix), getShopifyArticleById caught it and logged at logger.error (shopifyGraphQlService.js:873) before returning {} — that logger.error is the exact entry the sink matched. Nothing is user-facing: the catch returns {}, articleController.js:695 drops empty articles, and the request answered 200. This is the same 23-line 09:53:58-59Z burst already cut into fingerprints 16sagxr / 1pckik6 / ve6kl7 / 12v7fbr / ksxs3b / 1izzel4; the merged df79f2e73 covered shopifyRetryGraphQL and getShopLocales (9 of 23 lines), and this fingerprint is the 5-line getShopifyArticleById slice that still logs at ERROR. isShopifyAuthError is already imported into this exact file at shopifyGraphQlService.js:10 and used at shopifyGraphQlService.js:2455, so the fix is a one-branch change at the same call site shape.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:873` — the exact alerting line — getShopifyArticleById logs the expected uninstalled-shop 401 at logger.error and returns {}; not covered by the merged df79f2e73 fix
- `packages/functions/src/services/shopifyGraphQlService.js:750` — getShopifyArticleById definition; its makeGraphQlApi call is what draws the 401 once accessToken is ''
- `packages/functions/src/controllers/articleController.js:693` — the caller in the alerted request — list() invokes getShopifyArticleById per recent article id
- `packages/functions/src/controllers/articleController.js:691` — articleIds.slice(0, 5) — explains why the burst has exactly 5 [getShopifyArticleById] lines, not one per stored gid
- `packages/functions/src/controllers/articleController.js:680` — the getRecentPosts branch reading shop.recentOpenedArticles — the query param present on the 09:53:58.683748Z request
- `packages/functions/src/services/shopifyGraphQlService.js:10` — isShopifyAuthError is already imported into this file — the fix needs no new import
- `packages/functions/src/helpers/api.js:149` — isShopifyAuthError predicate already exists and is exported — what the catch at 873 should branch on
- `packages/functions/src/helpers/api.js:156` — shopifyRetryGraphQL already downgrades 401 to warn (df79f2e73), which is why only the per-caller catches still page
- `packages/functions/src/services/shopifyGraphQlService.js:2455` — getShopLocales already applies isShopifyAuthError in its catch — the exact shape to copy at line 873
- `packages/functions/src/services/shopifyService.js:23` — initShopify destructures accessToken with no guard for empty string — every Admin call goes out unauthenticated after uninstall
- `packages/functions/src/services/uninstallationService.js:31` — uninstall writes {accessToken: '', uninstalledAt} and leaves the shop doc and sessions alive
- `packages/functions/src/handlers/apiSa.js:39` — verifyRequest() is the only gate on /apiSa/* — session cookie only, no isInstalled/uninstalledAt check, so a stale tab replays a full dashboard load
- `packages/functions/src/services/shopifyService.js:367` — getShopifyArticles — same still-ERROR pattern in this burst, MR 843 open for it (fingerprint 1izzel4)
- `packages/functions/src/services/shopifyService.js:704` — getMainThemeId x3 in this burst — got/REST path, so a GraphQL-only fix would not cover it
- `packages/functions/src/controllers/tag.controller.js:19` — the storefront path's local isShopifyAuthError -> warn, the precedent this fix follows

## Evidence
- 5 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-04T09:53:50Z" AND timestamp<="2026-08-04T09:54:30Z" AND jsonPayload.tag="[getShopifyArticleById]"`
- 16 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-04T09:53:50Z" AND timestamp<="2026-08-04T09:54:30Z" AND httpRequest.requestMethod!=""`
- 3 matching entries: `resource.labels.service_name="auth" AND timestamp>="2026-08-04T06:09:00Z" AND timestamp<="2026-08-04T06:20:00Z" AND textPayload:"5k0par-xd"`
- 23 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-04T09:39:01Z" AND timestamp<="2026-08-04T10:09:01Z" AND severity>=ERROR`

## Job
- analyze rounds: 2
- cost: $2.86
- tests: 297 tests, 7 failing · baseline 4 failing · reproduce check did not pass

```
packages/functions/src/services/shopifyGraphQlService.js | 6 +++++-
 1 file changed, 5 insertions(+), 1 deletion(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
