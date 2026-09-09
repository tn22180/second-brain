fingerprint: rpe1y2
service: api
message: [getProductsGraphQL] Error fetching products: RequestError: syntax error, unexpected IDENTIFIER ("Bar"), expecting COLON at [2, 90]
app: BLOG
repo: blogs
date: 2026-09-09T07:35:55.900Z
status: fix_disabled
attempt: 1

# BLOG · api · rpe1y2

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** getProductsGraphQL interpolates the merchant's raw `search` text into a double-quoted GraphQL string literal, so the `"` inside the search term `Jagger 72" Tall Bar Cabinet with Hutch` closed the literal early and Shopify's parser rejected the document at line 2 column 90.

**Mechanism.** GET /api/shopify/products?search=Jagger+72%22+Tall+Bar+Cabinet+with+Hutch at 2026-09-09T07:33:59.973330Z (request log, HTTP 200) → routes/api.js:185 → getProductsStore reads `const {search = ''} = ctx.query` (shopifyController.js:258) and passes it unescaped as searchQuery (shopifyController.js:261). graphQLProducts.js:14 builds querySearch = `status:ACTIVE AND title:*Jagger 72" Tall Bar Cabinet with Hutch*`; line 19 embeds it inside a double-quoted literal, so document line 2 is `      products(first: 25, query: "status:active status:ACTIVE AND title:*Jagger 72" Tall Bar Cabinet with Hutch*", sortKey: TITLE) {`. Column math pins the offset exactly (1-indexed): 6 spaces → col 7 `products(`; `first: ` ends col 22; `25` = 23-24; `, query: ` = 25-33; opening `"` = 34; `status:active ` = 35-48; `status:ACTIVE` = 49-61; ` AND ` = 62-66; `title:*` = 67-73; `Jagger ` = 74-80; `7`=81, `2`=82, merchant's `"`=83 terminates the string; space 84; IDENTIFIER `Tall` = 85-88 is lexed as the start of a new argument name so the parser demands a COLON; space 89; IDENTIFIER `Bar` starts at col 90 — exactly `unexpected IDENTIFIER ("Bar"), expecting COLON at [2, 90]`. shopify.graphql (graphQLProducts.js:61) throws RequestError (ERR_GOT_REQUEST_ERROR), isShopifyAuthError is false so the catch logs at logger.error with tag [getProductsGraphQL] (graphQLProducts.js:67 — the alert line, 07:34:00.498304Z, 0.5s after the request) and rethrows; getProductsStore's catch answers HTTP 200 with {success:false} (shopifyController.js:269), which is why the httpRequest.status>=500 read returned 0 entries. The two sibling typeahead requests in the same second without a quote (`Tall+Bar+Cabinet+with+Hutch` 07:34:05.637Z, `Tall+Bar+Cabinet` 07:34:09.273Z) and the 15 other search=* requests in the window logged nothing. Same defect, same file, fourth recorded occurrence (66" Black Faux Marble, 72" Tall Arched Fluted Door — fingerprint rpe1y2 / 1g630rl / 135nfbs). Sibling getBlogsGraphQL was already moved to a $query variable with JSON.stringify (graphQLPosts.js:65) and is safe; getProductsGraphQL, getCollectionsGraphQL (graphQLProducts.js:104) and the dead getProductsGraphQLDefault (graphQLProducts.js:282) still interpolate raw.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/graphQLProducts.js:14` — querySearch built with raw, unescaped searchQuery inside title:*...*
- `packages/functions/src/helpers/graphql/graphQLProducts.js:19` — querySearch interpolated into a double-quoted GraphQL string literal — the merchant's own quote closes it at col 83
- `packages/functions/src/helpers/graphql/graphQLProducts.js:61` — shopify.graphql call that throws the RequestError in the alert stack
- `packages/functions/src/helpers/graphql/graphQLProducts.js:67` — exact log line and tag [getProductsGraphQL] carried by the alert
- `packages/functions/src/controllers/shopifyController.js:258` — reads ctx.query.search with no validation or escaping
- `packages/functions/src/controllers/shopifyController.js:261` — only caller of getProductsGraphQL; feeds raw search text
- `packages/functions/src/controllers/shopifyController.js:269` — catch answers HTTP 200 {success:false}, so no 5xx request log exists — why the requests read was empty
- `packages/functions/src/routes/api.js:185` — GET /shopify/products route reaching getProductsStore
- `packages/functions/src/helpers/graphql/graphQLPosts.js:65` — already-fixed sibling: passes the term through a $query variable with JSON.stringify — the pattern to mirror
- `packages/functions/src/helpers/graphql/graphQLProducts.js:104` — getCollectionsGraphQL has the identical defect on the same ctx.query.search value
- `packages/functions/src/helpers/graphql/graphQLProducts.js:282` — getProductsGraphQLDefault interpolates raw searchQuery the same way

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND jsonPayload.tag="[getProductsGraphQL]" AND timestamp>="2026-09-09T07:19:03Z" AND timestamp<="2026-09-09T07:49:03Z"`
- 20 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"/shopify/products" AND timestamp>="2026-09-09T07:19:03Z" AND timestamp<="2026-09-09T07:49:03Z"`
- 1 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"/shopify/products" AND httpRequest.requestUrl:"%22" AND timestamp>="2026-09-09T07:19:03Z" AND timestamp<="2026-09-09T07:49:03Z"`

## Job
- analyze rounds: 1
- cost: $1.36

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
