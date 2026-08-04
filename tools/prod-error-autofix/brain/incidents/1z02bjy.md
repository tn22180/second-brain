fingerprint: 1z02bjy
service: apisa
message: [getProductsGraphQL] Error fetching products: HTTPError: Response code 401 (Unauthorized)
app: BLOG
repo: blogs
date: 2026-08-04T11:16:53.649Z
status: mr_open
attempt: 1

# BLOG · apisa · 1z02bjy

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/845

**Root cause.** Shop ZeyGA7UaqrZBTQ1cgDW2 (5k0par-xd.myshopify.com) uninstalled the app at 2026-08-04T06:10:23.755Z, revoking its Shopify access token; 3h43m later a still-open standalone admin session fired one burst of Shopify Admin calls that all returned 401, and getProductsGraphQL logs that revoked-token 401 at logger.error, which pages the prod-error-alerts sink even though no request failed.

**Mechanism.** auth logged 'Handling uninstalling for 5k0par-xd.myshopify.com' at 06:10:23.755Z. At 09:53:58.820–09:53:59.020Z (199 ms) apisa emitted 23 ERROR lines, every one carrying shop ZeyGA7UaqrZBTQ1cgDW2 and a 401 — 11 distinct Shopify Admin calls from a single page load of the standalone editor (getShopLocales, getOne/getMainThemeId, getShopifyArticles, getEnableBlocks, blockLoader, handleFetchPdfFiles, getProductsGraphQL, 5× getShopifyArticleById). The alerted line is graphQLProducts.js:62: getProductsGraphQL wraps `shopify.graphql()` (shopify-api-node → got) and unconditionally logger.error's whatever it catches, so a got HTTPError 401 is written at severity ERROR. Its only caller, shopifyController.getProductsStore, catches and answers HTTP 200 `{success:false}` (shopifyController.js:266-268) — which is why the requests read returned 0 entries and my round-1 httpRequest.status>=500 query matched nothing. The already-merged fix df79f2e73 added isShopifyAuthError to helpers/api.js:149, but it only guards the axios path (shopifyRetryGraphQL) and tests `e?.response?.status ?? e?.statusCode`; a got HTTPError carries the code at `e.response.statusCode`, so neither the getProductsGraphQL call path nor the got error shape is covered.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/graphQLProducts.js:62` — the alerted log line — unconditional logger.error on any error from shopify.graphql, including a revoked-token 401
- `packages/functions/src/helpers/graphql/graphQLProducts.js:59` — shopify.graphql() is the got-based shopify-api-node client, so it throws HTTPError, not AxiosError — matches /workspace/node_modules/got/... in the alert stack
- `packages/functions/src/controllers/shopifyController.js:267` — sole caller swallows the throw into a 200 {success:false}; no 5xx is ever emitted, which is why the requests read is empty
- `packages/functions/src/helpers/api.js:149` — existing isShopifyAuthError guard reads e.response.status / e.statusCode — neither field exists on a got HTTPError, and it is not applied on this call path at all
- `packages/functions/src/services/shopifyService.js:141` — shopifyRetryApi rethrows as `new Error(e)` — the same uncovered path behind getMainThemeId's 4 ERROR lines in this burst

## Evidence
- 23 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:39:01Z" AND timestamp<="2026-08-04T10:09:01Z" AND jsonPayload.message:"401"`
- 1 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-04T09:39:01Z" AND timestamp<="2026-08-04T10:09:01Z" AND jsonPayload.tag="[getProductsGraphQL]"`
- 1 matching entries: `timestamp>="2026-08-04T06:10:23Z" AND timestamp<="2026-08-04T06:10:25Z" AND (jsonPayload.message:"uninstall" OR textPayload:"uninstall")`
- 23 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-08-04T09:39:01Z" AND timestamp<="2026-08-04T10:09:01Z" AND severity>=ERROR`

## Job
- analyze rounds: 2
- cost: $3.35
- branch: `fix/prod-blog-1z02bjy`
- fix commit: `f965ce0676170336ff7755253cd28cbb140118f1`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/845
- tests: 298 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
packages/functions/src/helpers/api.js                     |  4 +++-
 packages/functions/src/helpers/graphql/graphQLProducts.js | 13 +++++++++++--
 2 files changed, 14 insertions(+), 3 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
