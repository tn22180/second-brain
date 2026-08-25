fingerprint: o3dxv8
service: mcp
message: [getShopifyArticleById] IAD6Ij8qq3S7TQx2lQpA abc InvalidArticleIdError: Article id could not be resolved to a gid: "abc"
app: BLOG
repo: blogs
date: 2026-08-25T03:59:07.638Z
status: fix_disabled
attempt: 1

# BLOG · mcp · o3dxv8

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Not a request failure: getShopifyArticleById logs both of its expected "this article does not exist" outcomes at logger.error (severity=ERROR), so two MCP get_article calls with a bogus id ("abc", "999999999999") fired the prod-error sink while every one of the 64 mcp requests in the window returned HTTP 200. Duplicate of recorded fingerprints 1dosxzi and 7u4qve.

**Mechanism.** MCP client called get_article with articleId="abc" and articleId="999999999999" for shop IAD6Ij8qq3S7TQx2lQpA, 0.52s apart. getArticle.js:25 passes the id straight to getShopifyArticleById. For "abc", normalizeShopifyGid gives a string that fails the /^(\d+|gid:\/\/shopify\/Article\/\d+)$/ test at shopifyGraphQlService.js:759, so line 760 throws InvalidArticleIdError. For "999999999999" the Shopify GraphQL round trip returns article:null, so line 869 throws Error('Article not found'). Both land in the same catch, which logs at logger.error (line 890) and returns {} (line 891). getArticle.js:27 then sees !article?.id and answers the tool call with asRefusal — the correct, user-facing behaviour — and the HTTP response is 200. Only the ERROR-severity log line escapes, and the sink alerts on it.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:760` — throw new InvalidArticleIdError(id) — the exact error class and message in the alert, for id="abc"
- `packages/functions/src/services/shopifyGraphQlService.js:869` — throw new Error('Article not found') when Shopify answers article:null — the second alerted line, for id="999999999999"
- `packages/functions/src/services/shopifyGraphQlService.js:890` — logger.error('[getShopifyArticleById]', shop?.id, id, e) — emits severity=ERROR for both expected not-found outcomes; matches the log tag and the '<shopId> <id> <error>' shape exactly
- `packages/functions/src/services/shopifyGraphQlService.js:891` — return {} — the miss is swallowed, so nothing propagates to the MCP transport and the request stays 200
- `packages/functions/src/mcp/tools/getArticle.js:25` — the call site named in the stack (/workspace/lib/mcp/tools/getArticle.js:57)
- `packages/functions/src/mcp/tools/getArticle.js:27` — !article?.id → asRefusal: the tool already handles a miss correctly, proving the ERROR log is the only defect

## Evidence
- 2 matching entries: `resource.labels.service_name="mcp" AND timestamp>="2026-08-25T03:38:17.866Z" AND timestamp<="2026-08-25T04:08:17.866Z" AND jsonPayload.tag="[getShopifyArticleById]"`
- 64 matching entries: `resource.labels.service_name="mcp" AND timestamp>="2026-08-25T03:38:17.866Z" AND timestamp<="2026-08-25T04:08:17.866Z" AND httpRequest.requestMethod!=""`

## Job
- analyze rounds: 2
- cost: $2.15

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
