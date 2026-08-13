fingerprint: rpe1y2
service: api
message: [getProductsGraphQL] Error fetching products: RequestError: syntax error, unexpected IDENTIFIER ("Arched"), expecting COLON at [2, 83]
app: BLOG
repo: blogs
date: 2026-08-12T19:40:55.304Z
status: deferred
attempt: 1

# BLOG · api · rpe1y2

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** getProductsGraphQL interpolates the merchant's raw search text into a double-quoted GraphQL string literal, so the `"` in the search term `72" Tall Arched Fluted Door Modular Bookcases` closed the literal early and Shopify's parser rejected the document.

**Mechanism.** GET /api/shopify/products?search=72%22+Tall+Arched+Fluted+Door+Modular+Bookcases (routes/api.js:184) → getProductsStore reads ctx.query.search (shopifyController.js:258) and passes it as searchQuery (shopifyController.js:261). graphQLProducts.js:14 builds querySearch = `status:ACTIVE AND title:*72" Tall Arched Fluted Door Modular Bookcases*`; line 19 embeds it inside a double-quoted literal, emitting document line 2 as `      products(first: 25, query: "status:active status:ACTIVE AND title:*72" Tall Arched Fluted Door Modular Bookcases*", sortKey: TITLE) {`. Column math pins the offset exactly: 6 spaces + `products(first: ` = col 22, `25` = 24, `, query: ` = 33, opening `"` = 34, `status:active ` = 48, `status:ACTIVE` = 61, ` AND ` = 66, `title:*` = 73 → search text starts at col 74. So `7`=74, `2`=75, and the merchant's `"`=76 terminates the string. graphql-ruby then lexes bare tokens: IDENTIFIER `Tall` at cols 78-81 is read as the start of a new argument name, so the parser demands a COLON and instead sees IDENTIFIER `Arched` at col 83 — exactly `unexpected IDENTIFIER ("Arched"), expecting COLON at [2, 83]`. shopify.graphql (graphQLProducts.js:61) throws RequestError, isShopifyAuthError is false so the catch logs at logger.error (graphQLProducts.js:67 — the alert line) and rethrows, and getProductsStore's catch answers HTTP 200 with {success:false} (shopifyController.js:269), which is why the status>=500 requests read returned 0 entries. Two request logs carrying %22 (07:10:15.578Z, 07:10:22.433Z) map one-to-one onto the two error lines (07:10:15.988Z, 07:10:22.789Z); the sibling requests in the same second without a quote (search=72, search=) logged nothing. Same defect, same file, third occurrence in 7 days — 66" Black Faux Marble at 02:03:21Z was fingerprint rpe1y2 attempt 1. Sibling getBlogsGraphQL was already moved to a $query variable with JSON.stringify (graphQLPosts.js:65) and is safe; getProductsGraphQL, getCollectionsGraphQL (graphQLProducts.js:116) and the dead getProductsGraphQLDefault (graphQLProducts.js:285) still interpolate raw.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/graphQLProducts.js:14` — querySearch built with raw, unescaped searchQuery inside title:*...*
- `packages/functions/src/helpers/graphql/graphQLProducts.js:19` — querySearch interpolated into a double-quoted GraphQL string literal — the merchant's own quote closes it at col 76
- `packages/functions/src/helpers/graphql/graphQLProducts.js:61` — shopify.graphql call that throws the RequestError in the alert stack
- `packages/functions/src/helpers/graphql/graphQLProducts.js:67` — exact log line and tag [getProductsGraphQL] carried by the alert
- `packages/functions/src/controllers/shopifyController.js:258` — reads ctx.query.search with no validation or escaping
- `packages/functions/src/controllers/shopifyController.js:261` — only caller of getProductsGraphQL; feeds raw search text
- `packages/functions/src/controllers/shopifyController.js:269` — catch answers HTTP 200 {success:false}, so no 5xx request log exists — why the requests read was empty
- `packages/functions/src/routes/api.js:184` — GET /shopify/products route reaching getProductsStore
- `packages/functions/src/helpers/graphql/graphQLPosts.js:65` — the already-fixed sibling: passes the term through a $query variable with JSON.stringify — the pattern to mirror
- `packages/functions/src/helpers/graphql/graphQLProducts.js:116` — getCollectionsGraphQL has the identical defect on the same ctx.query.search value

## Evidence
- 2 matching entries: `resource.labels.service_name="api" AND jsonPayload.tag="[getProductsGraphQL]" AND timestamp>="2026-08-12T06:55:21Z" AND timestamp<="2026-08-12T07:25:21Z"`
- 6 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"/shopify/products" AND timestamp>="2026-08-12T07:09:00Z" AND timestamp<="2026-08-12T07:11:30Z"`
- 3 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"/shopify/products" AND httpRequest.requestUrl:"%22" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-12T08:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.10

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
