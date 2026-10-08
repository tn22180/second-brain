fingerprint: dequv9
service: api
message: [handleError] 1RHZSwH0t7fVUPch3G5R undefined InternalServerError: syntax error, unexpected STRING (""), expecting COLON at [2, 53]
app: BLOG
repo: blogs
date: 2026-10-08T04:26:31.609Z
status: fix_disabled
attempt: 1

# BLOG · api · dequv9

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint 6k9sr7 (also re-fired as 1whfb1o, 1gpn40b, l91eqz, gdw1lp) — same app, service, endpoint and the same 8 requests: the prod revision serving at 2026-10-07T17:00Z still ran the pre-db58a0392 getPostsGraphQL, which spliced the raw ctx.query.search string into a double-quoted GraphQL argument literal, so a search containing a `"` closed the string early and Shopify's GraphQL parser rejected the document. The fix shipped in tag v1.85.12 nine hours after this alert, so HEAD is already correct and there is nothing to change.

**Mechanism.** controllers/shopifyController.js:320 passes `ctx.query.search` verbatim as `searchQuery` into getPostsGraphQL. The deployed helper at alert time (git show db58a0392^:packages/functions/src/helpers/graphql/graphQLPosts.js) built line 2 of the document as `      articles(first: ${first}, query: "${searchQuery}", sortKey: TITLE) {` — with first=20 the opening quote sits at column 34, so user text starts at column 35. For the logged request `search=It+is+set+to+%22Post%22` → `It is set to "Post"`, the lexer closes the string at the user's `"` (col 48), reads `Post` (cols 49-52) as the next argument name, demands a COLON and finds the STRING `""` at col 53 → `syntax error, unexpected STRING (""), expecting COLON at [2, 53]`, character-exact against the alert. shopify-api-node surfaces it as RequestError, graphQLPosts.js:20 logs `[getPostsGraphQL] Error fetching posts`, rethrows, and shopifyController.js:335 turns it into ctx.throw(500) — the `/workspace/lib/controllers/shopifyController.js:451` frame in the stack. At HEAD the splice is gone: search goes through the `$query` GraphQL variable built by buildArticleSearchQuery, whose escapeTerm (articleSearchQuery.js:14) escapes `\ " '`, so this input is now harmless. db58a0392 committed 2026-10-08T00:15 +0700, tagged v1.85.12 2026-10-08T02:08Z — both after the 2026-10-07T17:00Z alert, which is why prod was still failing in this window.

Confidence: `high`

## Code
- `packages/functions/src/controllers/shopifyController.js:320` — getPostsStore passes the raw `search` query param straight through as searchQuery — unchanged call site, present in the revision that failed
- `packages/functions/src/controllers/shopifyController.js:335` — ctx.throw(500, e.message) — the frame the stack names (/workspace/lib/controllers/shopifyController.js:451)
- `packages/functions/src/helpers/graphql/graphQLPosts.js:16` — the splice site; at HEAD it is already fixed (`query: buildArticleSearchQuery(searchQuery) || null` via the $query variable), the revision serving at alert time still had `query: "${searchQuery}"` inline
- `packages/functions/src/helpers/graphql/graphQLPosts.js:20` — logger.error('[getPostsGraphQL]', 'Error fetching posts:', error) — emits the third logged line in the alert, then rethrows
- `packages/functions/src/helpers/utils/articleSearchQuery.js:14` — escapeTerm — the quote/backslash escape that landed with db58a0392 and makes this input harmless
- `packages/functions/src/helpers/graphql/graphQLProducts.js:19` — same splice family still live and unfixed: merchant search text spliced into `query: "status:active ${querySearch}"` — recorded as fingerprint 1pphxpv
- `packages/functions/src/helpers/graphql/graphQLProducts.js:285` — second live instance of the same splice on the product search path

## Evidence
- 8 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-07T16:45:24.454Z" AND timestamp<="2026-10-07T17:15:24.454Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"/api/shopify/posts"`
- 24 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-07T16:45:24.454Z" AND timestamp<="2026-10-07T17:15:24.454Z" AND severity>=ERROR AND jsonPayload.message:"expecting COLON"`
- 8 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-07T16:45:24.454Z" AND timestamp<="2026-10-07T17:15:24.454Z" AND severity>=ERROR AND jsonPayload.tag="[getPostsGraphQL]"`

## Job
- analyze rounds: 1
- cost: $0.62

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
