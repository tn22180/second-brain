fingerprint: 1m8run2
service: apisa
message: [getShopifyArticleById] fKUMrHXwtJca3KNWMU6X <gid://shopify/Article/576919142457> Error: Article not found
app: BLOG
repo: blogs
date: 2026-07-31T12:44:15.216Z
status: mr_open
attempt: 1

# BLOG · apisa · 1m8run2

**Outcome.** duplicate of 3349gs — MR https://gitlab.com/avada/blogs/-/merge_requests/802

**Root cause.** Duplicate of fingerprint 3349gs (MR 802 already open, unmerged): shop fKUMrHXwtJca3KNWMU6X's recentOpenedArticles holds 4 gids Shopify no longer resolves, and getShopifyArticleById logs that expected miss at logger.error (severity ERROR), so an HTTP 200 /apiSa/articles?getRecentPosts=true load fires a prod-error-alert on every open.

**Mechanism.** GET /apiSa/articles?getRecentPosts=true reaches the same apiRouter as /api (packages/functions/src/handlers/apiSa.js:41 mounts apiRouter('/apiSa')), so articleController.list runs identically on both services. list() reads shop.recentOpenedArticles (articleController.js:657), normalizes and takes the first 5 (articleController.js:668), and calls getShopifyArticleById inside Promise.all (articleController.js:670 — the alert's Promise.all index 2). For gid://shopify/Article/576919142457, 576916947001, 576916914233 and 576916389945 Shopify's Admin GraphQL answers data.article: null, so processJSONMetafield returns falsy and the null-article guard throws new Error('Article not found') (shopifyGraphQlService.js:852). The catch at shopifyGraphQlService.js:873 logs it via logger.error, which stamps severity ERROR (helpers/logger.js:79) and returns {} (shopifyGraphQlService.js:874). Back in list(), isEmpty(article) drops it (articleController.js:672) and the handler answers 200 {success:true} — confirmed by zero httpRequest.status>=500 on /apiSa/articles in the window (the single 500 present is GET /api/article/1004583846233, a different endpoint and cause). Nothing prunes the dead ids, so the same 3-4 gids re-log on every recent-posts load: 21 of the 25 tag entries in 24h belong to this one shop, in identical bursts of 3 at 10:47:52, 10:49:24 (apisa) and 11:01:03 (api). The open MR 802 branch fix/prod-blog-3349gs already changes both halves — prune dead ids from recentOpenedArticles in list(), and downgrade the miss to logger.warn — and covers apisa automatically since it is the same shared handler.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:852` — throw new Error('Article not found') when Shopify returns data.article: null — the exact message and top frame in the alert stack
- `packages/functions/src/services/shopifyGraphQlService.js:873` — logger.error('[getShopifyArticleById]', shop?.id, id, e) — emits the alert tag/message at severity ERROR for a condition the caller treats as normal
- `packages/functions/src/services/shopifyGraphQlService.js:874` — returns {} after logging, so the caller never sees a failure — proves the ERROR log is noise, not a fault
- `packages/functions/src/controllers/articleController.js:670` — the getShopifyArticleById call inside Promise.all named by the stack (lib articleController.js:700:27, Promise.all index 2)
- `packages/functions/src/controllers/articleController.js:657` — articleIds sourced from shop.recentOpenedArticles — the stale-id store that is never pruned when an article dies in Shopify, which is why the same gids re-log on every load
- `packages/functions/src/controllers/articleController.js:672` — isEmpty(article) => false, filtered at line 680 — the miss is swallowed and the response is 200
- `packages/functions/src/handlers/apiSa.js:41` — apiRouter('/apiSa') — apisa mounts the same routes as api, so this is the same defect on a second service, not a new one
- `packages/functions/src/helpers/logger.js:79` — logger.error writes severity ERROR, which is what the prod-error-alerts sink filters on

## Evidence
- 6 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-07-31T10:32:53.866Z" AND timestamp<="2026-07-31T11:02:53.866Z" AND severity>=ERROR`
- 25 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.service_name="api") AND timestamp>="2026-07-30T11:00:00Z" AND timestamp<="2026-07-31T11:05:00Z" AND jsonPayload.tag="[getShopifyArticleById]"`
- 1 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.service_name="api") AND timestamp>="2026-07-31T10:32:53.866Z" AND timestamp<="2026-07-31T11:05:00Z" AND httpRequest.status>=500`
- 9 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-07-31T10:32:53.866Z" AND timestamp<="2026-07-31T11:02:53.866Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $0.94
- MR: https://gitlab.com/avada/blogs/-/merge_requests/802

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
