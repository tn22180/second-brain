fingerprint: 135nfbs
service: api
message: [getProductsGraphQL] Error fetching products: RequestError: syntax error, unexpected INT ("6") at [2, 87]
app: BLOG
repo: blogs
date: 2026-09-09T02:48:06.978Z
status: fix_disabled
attempt: 1

# BLOG · api · 135nfbs

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** getProductsGraphQL hand-builds the Shopify GraphQL document by splicing the merchant's raw `search` query param into a double-quoted string literal (`query: "status:active ... title:*${searchQuery}*"`), so a search term containing an unescaped double quote terminates that literal early and the remaining search text is lexed as GraphQL tokens — here a bare integer `6` at query line 2 column 87 — which Shopify's parser rejects with HTTP 400.

**Mechanism.** GET /api/products-store reads ctx.query.search unvalidated (shopifyController.js:258) and hands it to getProductsGraphQL as searchQuery (shopifyController.js:261). graphQLProducts.js:14 wraps it as `title:*<search>*`; line 19 interpolates the result into a hand-written GraphQL string literal instead of passing it as a $variable. Reproducing the exact template with the default `first = 25` (the controller never passes `first`, graphQLProducts.js:12), query line 2 is `      products(first: 25, query: "status:active status:ACTIVE AND title:*<search>*", sortKey: TITLE) {` — the opening `*` lands at column 73 and searchQuery character 0 at column 74 (matches recorded fingerprint 1g630rl, where the invalid `*` at [2,99] fixed len=25). The alerted position [2,87] therefore pins the offending token to searchQuery offset 13, and the token being INT("6") rather than a lex error means the string literal was already closed by an unescaped `"` earlier in the search text, so ` 6` was parsed as a standalone Int in argument position. Shopify answers 400, shopify-api-node raises RequestError (ERR_GOT_REQUEST_ERROR, stack through got/index.js:113), the catch at graphQLProducts.js:64 finds it is not an auth error so it logs at logger.error (line 67) and rethrows; getProductsStore's catch swallows it into a 200 `{success:false}` (shopifyController.js:269), which is why the requests read has 0 entries with status>=500 — the product picker just returns empty for the merchant.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/graphQLProducts.js:14` — wraps raw searchQuery as `title:*${searchQuery}*` with no escaping
- `packages/functions/src/helpers/graphql/graphQLProducts.js:19` — splices it into a hand-built GraphQL string literal `query: "status:active ${querySearch}"` instead of a $variable — the injection point that produced [2, 87]
- `packages/functions/src/helpers/graphql/graphQLProducts.js:12` — `first = 25` default, never overridden by the caller — fixes the column arithmetic that maps [2,87] to searchQuery offset 13
- `packages/functions/src/helpers/graphql/graphQLProducts.js:67` — the logger.error that emitted the alerted line; error rethrown at line 69
- `packages/functions/src/controllers/shopifyController.js:258` — takes ctx.query.search with no validation or escaping
- `packages/functions/src/controllers/shopifyController.js:261` — passes it straight through as searchQuery
- `packages/functions/src/controllers/shopifyController.js:269` — catch returns 200 {success:false}, explaining requests=0 for this failure
- `packages/functions/src/helpers/graphql/graphQLProducts.js:285` — getProductsGraphQLDefault carries the identical unescaped interpolation — second live entry point, same defect
- `packages/functions/src/helpers/graphql/graphQLProducts.js:116` — getCollectionsGraphQL interpolates `filters`/`after` the same way

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-09T02:27:08.802Z" AND timestamp<="2026-09-09T02:57:08.802Z" AND jsonPayload.tag="[getProductsGraphQL]"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-02T00:00:00Z" AND timestamp<="2026-09-09T03:00:00Z" AND jsonPayload.tag="[getProductsGraphQL]"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-09T02:27:08.802Z" AND timestamp<="2026-09-09T02:57:08.802Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.38

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
