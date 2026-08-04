fingerprint: 14psg9p
service: api
message: [getBlogsGraphQL] Error fetching blogs: RequestError: syntax error, unexpected STRING (""), expecting COLON at [2, 46]
app: BLOG
repo: blogs
date: 2026-08-04T04:27:19.878Z
status: mr_open
attempt: 1

# BLOG · api · 14psg9p

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/832

**Root cause.** getBlogsGraphQL double-quotes the search filter: it builds `title:"${searchQuery}"` and then interpolates that string again inside `query: "${titleQuery}"`, so the inner quote terminates the GraphQL string literal and Shopify rejects the document with a syntax error for every non-empty search term.

**Mechanism.** GET /shopify/blogs (routes/api.js:189) → shopifyController.getBlogsStore passes ctx.query.search into getBlogsGraphQL as searchQuery (shopifyController.js:332). graphQLPosts.js:51 makes titleQuery = `title:"chicken"`; line 54 embeds it as `, query: "title:"chicken""`, so line 2 of the emitted document is `      blogs(first: 20 , query: "title:"chicken") {`. graphql-ruby lexes STRING("title:") at col 32-39, then reads the search word as a NAME token at col 40 and expects a COLON for a second argument — hence every message is `expecting COLON`. The reported column is exactly 40 + len(first word): 6-char word → [2,46], 7-char (`chicken`) → [2,47], and with a second word the next token is IDENTIFIER("anting") at [2,48]. The 5 errors at 04:14:33→04:14:41 are one merchant's debounced type-ahead progressing `chicke` → `chicken` → `chicken anting`. shopify.graphql throws RequestError, graphQLPosts.js:68 logs it and rethrows, getBlogsStore's catch (shopifyController.js:334-336) answers HTTP 200 with {success:false} — which is why the requests read returned 0 entries and the round-1 status>=500 query matched nothing. getPostsGraphQL:13 does the same interpolation but at a single level, so it does not break by construction.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/graphQLPosts.js:51` — titleQuery wraps searchQuery in literal double quotes
- `packages/functions/src/helpers/graphql/graphQLPosts.js:54` — titleQuery is re-wrapped in double quotes inside the GraphQL document — the nested quote ends the string literal at col 39, producing the syntax error
- `packages/functions/src/helpers/graphql/graphQLPosts.js:68` — the exact log line and tag in the alert
- `packages/functions/src/controllers/shopifyController.js:332` — only caller passing a non-empty searchQuery; feeds raw ctx.query.search
- `packages/functions/src/controllers/shopifyController.js:334` — catch returns 200 {success:false}, so no 5xx request log exists for this failure
- `packages/functions/src/routes/api.js:189` — GET /shopify/blogs route that reaches getBlogsStore

## Evidence
- 5 matching entries: `resource.labels.service_name="api" AND jsonPayload.tag="[getBlogsGraphQL]" AND timestamp>="2026-08-04T03:59:45Z" AND timestamp<="2026-08-04T04:29:45Z"`
- 5 matching entries: `resource.labels.service_name="api" AND jsonPayload.message:"[getBlogsGraphQL] Error fetching blogs" AND timestamp>="2026-07-28T00:00:00Z" AND timestamp<="2026-08-04T05:00:00Z"`

## Job
- analyze rounds: 2
- cost: $2.98
- branch: `fix/prod-blog-14psg9p`
- fix commit: `92c382b74eb819c8d09e77f63c76d1015c5d59b8`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/832
- tests: 281 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
packages/functions/src/helpers/graphql/graphQLPosts.js | 11 ++++++-----
 1 file changed, 6 insertions(+), 5 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
