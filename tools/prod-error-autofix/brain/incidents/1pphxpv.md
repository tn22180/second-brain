fingerprint: 1pphxpv
service: api
message: [getProductsGraphQL] Error fetching products: RequestError: syntax error, unexpected invalid token ("*"), expecting COLON at [2, 94]
app: BLOG
repo: blogs
date: 2026-09-23T09:47:59.857Z
status: fix_disabled
attempt: 1

# BLOG · api · 1pphxpv

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** getProductsGraphQL splices the merchant's raw `search` text into a double-quoted GraphQL string literal, so the `"` in the typeahead term `5.11 Rambler 6" Boot` closed the literal early and left the trailing `*` of `title:*…*` as a bare invalid token at line 2 column 94.

**Mechanism.** GET /api/shopify/products?search=5.11+Rambler+6%22+Boot at 2026-09-23T09:41:09.436718Z (request log, HTTP 200) → routes/api.js:195 → getProductsStore reads `const {search = ''} = ctx.query` (shopifyController.js:258) and passes it unescaped as searchQuery (shopifyController.js:261). graphQLProducts.js:14 builds querySearch = `status:ACTIVE AND title:*5.11 Rambler 6" Boot*`; line 19 embeds it inside a double-quoted literal, so document line 2 is `      products(first: 25, query: "status:active status:ACTIVE AND title:*5.11 Rambler 6" Boot*", sortKey: TITLE) {`. Column math pins the offset exactly (1-indexed): 6 spaces → col 7 `products(`; `first: ` ends col 22; `25` 23-24; `, query: ` 25-33; opening `"` 34; `status:active ` 35-48; `status:ACTIVE` 49-61; ` AND ` 62-66; `title:*` 67-73; merchant text starts col 74 — `5.11 `=74-78, `Rambler`=79-85, ` `=86, `6`=87, merchant's `"`=88 terminates the string, ` `=89, IDENTIFIER `Boot`=90-93 is lexed as a new argument name so the parser demands a COLON, and the closing `*` of `title:*…*` lands on col 94 — exactly `unexpected invalid token ("*"), expecting COLON at [2, 94]`. The sibling keystroke confirms the arithmetic: the 15-char term `5.11 Rambler 6"` (09:41:15.213102Z) puts its quote at col 88 with nothing between it and the `*` at col 89, and Shopify answered `unexpected invalid token ("*") at [2, 89]` — no `expecting COLON`, because no identifier was consumed. shopify.graphql (graphQLProducts.js:61) throws RequestError (got ERR_NON_2XX via maybeError at shopify-api-node/index.js:299, matching the alert stack); isShopifyAuthError is false so the catch logs at logger.error with tag [getProductsGraphQL] (graphQLProducts.js:67 — the alert line, 09:41:09.935580Z, 0.5s after the request) and rethrows; getProductsStore's catch answers HTTP 200 with {success:false} (shopifyController.js:269), which is why the seeded httpRequest.status>=500 read returned 0 entries and why my round-2 requests query matched nothing — no 5xx request log exists for this failure, by design. 2 of 2 quote-carrying searches in the window failed; the 10 other /shopify/products requests, including `search=5.11+Rambler+6` (09:42:22, same term minus the quote) and `search=Salomon+Sense+Ride+5+SR`, logged nothing. Same defect, same file, fifth recorded occurrence (fingerprints rpe1y2 / 1g630rl / 135nfbs were 66" Black Faux Marble, 72" Tall Arched Fluted Door, Jagger 72" Tall Bar Cabinet). Sibling getBlogsGraphQL was already moved to a $query variable with JSON.stringify (graphQLPosts.js:51-65) and is safe; getProductsGraphQL, getCollectionsGraphQL (graphQLProducts.js:116) and getProductsGraphQLDefault (graphQLProducts.js:285) still interpolate raw.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/graphQLProducts.js:14` — querySearch built with raw, unescaped searchQuery inside title:*...*
- `packages/functions/src/helpers/graphql/graphQLProducts.js:19` — querySearch interpolated into a double-quoted GraphQL string literal — the merchant's own quote closes it at col 88, stranding the closing * at col 94
- `packages/functions/src/helpers/graphql/graphQLProducts.js:61` — shopify.graphql call that throws the RequestError in the alert stack
- `packages/functions/src/helpers/graphql/graphQLProducts.js:67` — exact log line and tag [getProductsGraphQL] carried by the alert
- `packages/functions/src/controllers/shopifyController.js:258` — reads ctx.query.search with no validation or escaping
- `packages/functions/src/controllers/shopifyController.js:261` — only caller of getProductsGraphQL; feeds raw search text
- `packages/functions/src/controllers/shopifyController.js:269` — catch answers HTTP 200 {success:false}, so no 5xx request log exists — why the seeded requests read was empty and why the round-2 status>=500 query matched nothing
- `packages/functions/src/routes/api.js:195` — GET /shopify/products route reaching getProductsStore
- `packages/functions/src/helpers/graphql/graphQLPosts.js:65` — already-fixed sibling: passes the term through a $query variable with JSON.stringify — the pattern to mirror
- `packages/functions/src/helpers/graphql/graphQLProducts.js:116` — getCollectionsGraphQL has the identical defect on the same ctx.query.search value
- `packages/functions/src/helpers/graphql/graphQLProducts.js:285` — getProductsGraphQLDefault interpolates raw searchQuery the same way

## Evidence
- 2 matching entries: `resource.labels.service_name="api" AND jsonPayload.tag="[getProductsGraphQL]" AND timestamp>="2026-09-23T09:26:11.518Z" AND timestamp<="2026-09-23T09:56:11.518Z"`
- 3 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"Rambler" AND timestamp>="2026-09-23T09:26:11.518Z" AND timestamp<="2026-09-23T09:56:11.518Z"`
- 12 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"/shopify/products" AND timestamp>="2026-09-23T09:26:11.518Z" AND timestamp<="2026-09-23T09:56:11.518Z"`

## Job
- analyze rounds: 3
- cost: $3.64

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
