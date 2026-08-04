fingerprint: 9t0caz
service: api
message: [getBlogsGraphQL] Error fetching blogs: RequestError: syntax error, unexpected IDENTIFIER ("anting"), expecting COLON at [2, 48]
app: BLOG
repo: blogs
date: 2026-08-04T04:28:24.055Z
status: mr_open
attempt: 1

# BLOG · api · 9t0caz

**Outcome.** duplicate of 14psg9p — MR https://gitlab.com/avada/blogs/-/merge_requests/832

**Root cause.** Duplicate of fingerprint 14psg9p (MR https://gitlab.com/avada/blogs/-/merge_requests/832 open, unmerged): getBlogsGraphQL double-quotes the search filter — it builds `title:"${searchQuery}"` then interpolates that string again inside `query: "${titleQuery}"`, so the inner quote terminates the GraphQL string literal and Shopify rejects the whole document for any non-empty search term.

**Mechanism.** GET /shopify/blogs (routes/api.js:189) → shopifyController.getBlogsStore reads ctx.query.search (shopifyController.js:329) and passes it as searchQuery (shopifyController.js:332). graphQLPosts.js:51 makes titleQuery = `title:"chicken anting"`; line 54 embeds it inside another pair of quotes, so line 2 of the emitted document is `      blogs(first: 20 , query: "title:"chicken anting"") {`. graphql-ruby lexes STRING("title:") at cols 32-39, so the user's search text starts at col 40 and is scanned as bare tokens: for `chicken` the next token at col 47 is the stray quote pair → `unexpected STRING ("") at [2,47]`; for `chicken anting` the token at col 40+len('chicken ')=48 is `anting` → `unexpected IDENTIFIER ("anting") at [2,48]`, exactly the alert. The column is arithmetically pinned to 40 + offset-in-search-string, which is why 14psg9p's 6-char term gave [2,46]. The 5 errors 04:14:33→04:14:41 are one merchant's debounced type-ahead typing `chicke` → `chicken` → `chicken anting`. shopify.graphql throws RequestError, graphQLPosts.js:68 logs it and rethrows, and getBlogsStore's catch (shopifyController.js:334) answers HTTP 200 with {success:false} — which is why the status>=500 requests read returned 0 entries. genAIBlogService.js:353 is the only other caller and passes no searchQuery, so it never hits this. getPostsGraphQL:13 interpolates at a single level and is safe by construction.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/graphQLPosts.js:51` — titleQuery wraps searchQuery in literal double quotes
- `packages/functions/src/helpers/graphql/graphQLPosts.js:54` — titleQuery re-wrapped in double quotes inside the document — the nested quote closes the string literal at col 39, producing the syntax error
- `packages/functions/src/helpers/graphql/graphQLPosts.js:68` — the exact log line and tag carried by the alert
- `packages/functions/src/controllers/shopifyController.js:332` — only caller passing a non-empty searchQuery; feeds raw ctx.query.search
- `packages/functions/src/controllers/shopifyController.js:334` — catch returns 200 {success:false}, so no 5xx request log exists for this failure
- `packages/functions/src/routes/api.js:189` — GET /shopify/blogs route reaching getBlogsStore
- `packages/functions/src/services/genAIBlogService.js:353` — the other caller — passes no searchQuery, so it cannot produce this error

## Evidence
- 5 matching entries: `resource.labels.service_name="api" AND jsonPayload.tag="[getBlogsGraphQL]" AND timestamp>="2026-08-04T03:59:45Z" AND timestamp<="2026-08-04T04:29:45Z"`
- 5 matching entries: `resource.labels.service_name="api" AND jsonPayload.message:"[getBlogsGraphQL] Error fetching blogs" AND timestamp>="2026-07-28T00:00:00Z" AND timestamp<="2026-08-04T05:00:00Z"`

## Job
- analyze rounds: 1
- cost: $0.64
- MR: https://gitlab.com/avada/blogs/-/merge_requests/832

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
