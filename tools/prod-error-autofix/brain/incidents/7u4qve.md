fingerprint: 7u4qve
service: mcp
message: [getShopifyArticleById] IAD6Ij8qq3S7TQx2lQpA <gid://shopify/Article/1> Error: Article not found
app: BLOG
repo: blogs
date: 2026-08-22T03:59:09.241Z
status: fix_disabled
attempt: 1

# BLOG · mcp · 7u4qve

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** getShopifyArticleById logs the expected "this article does not exist in Shopify" miss at logger.error (severity ERROR), so the MCP get_article tool's designed not-found path — which answers the client with a refusal over HTTP 200 — fires a prod-error alert; nothing actually failed.

**Mechanism.** Claude called the MCP tool get_article with an id that does not resolve on shop IAD6Ij8qq3S7TQx2lQpA (once the model's placeholder gid://shopify/Article/1, once the stale gid://shopify/Article/572364390575). getArticle.handler calls getShopifyArticleById({shop, id, isReadOnly: true}) at packages/functions/src/mcp/tools/getArticle.js:25. Shopify Admin GraphQL answers data.article: null, processJSONMetafield returns falsy, and the guard at packages/functions/src/services/shopifyGraphQlService.js:869 throws new Error('Article not found') — the exact message and frame in the alert stack (lib line 958 = src 869). The catch at shopifyGraphQlService.js:890 passes that Error to logger.error, which writes severity ERROR (packages/functions/src/helpers/logger.js:79), the level the prod-error-alerts sink filters on, then returns {} at line 891. Back in the tool, `!article?.id` is true so the handler returns asRefusal('I could not find an article with id …') at getArticle.js:28 — a normal MCP tool result. Confirmed by the request logs: the POST /mcp wrapping the 02:37:15.046Z error line answered 200 at 02:37:15.505Z, and across 25h the mcp service logged zero httpRequest.status>=500. So the ERROR is noise on a success path, and it repeats for every miss because nothing suppresses it. Same defect family as fingerprint 3349gs (MR 802 open, unmerged — logger.error still at line 890 on master); this is a new caller of the same function, the MCP surface, where hallucinated or stale ids are a routine input rather than an exception.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:869` — throw new Error('Article not found') when Shopify returns data.article: null — the exact message in the alert
- `packages/functions/src/services/shopifyGraphQlService.js:890` — logger.error('[getShopifyArticleById]', shop?.id, id, e) — emits the alert tag at severity ERROR for a condition every caller treats as normal
- `packages/functions/src/services/shopifyGraphQlService.js:891` — returns {} after logging, so the caller never sees a failure — proves the ERROR log is noise, not a fault
- `packages/functions/src/mcp/tools/getArticle.js:25` — the getShopifyArticleById call named by the stack frame lib/mcp/tools/getArticle.js:31
- `packages/functions/src/mcp/tools/getArticle.js:28` — asRefusal on a missing article — the not-found case is an intended, documented tool outcome, answered 200
- `packages/functions/src/services/shopifyGraphQlService.js:760` — throw new InvalidArticleIdError(id) — the only genuinely bad-input branch, already separated from the not-found branch, so the two can be logged at different levels
- `packages/functions/src/helpers/logger.js:79` — logger.error writes severity ERROR, which is what the prod-error-alerts sink filters on

## Evidence
- 2 matching entries: `resource.labels.service_name="mcp" AND timestamp>="2026-08-19T02:00:00Z" AND timestamp<="2026-08-20T03:00:00Z" AND jsonPayload.tag="[getShopifyArticleById]"`
- 2 matching entries: `resource.labels.service_name="mcp" AND timestamp>="2026-08-20T02:37:14Z" AND timestamp<="2026-08-20T02:37:17Z" AND httpRequest.status=200`
- 12 matching entries: `resource.labels.service_name="mcp" AND timestamp>="2026-08-19T02:00:00Z" AND timestamp<="2026-08-20T03:00:00Z" AND httpRequest.status>=400`

## Job
- analyze rounds: 1
- cost: $1.30

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
