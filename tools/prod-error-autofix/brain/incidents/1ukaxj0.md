fingerprint: 1ukaxj0
service: apisa
message: [handleError] ubkyJb5Ge4RAYjKqxl7M undefined InternalServerError: Cannot read properties of undefined (reading 'edges')
app: BLOG
repo: blogs
date: 2026-09-22T07:39:49.020Z
status: fix_disabled
attempt: 1

# BLOG · apisa · 1ukaxj0

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** GET /apiSa/shopify/postByBlog was called 4/4 times with an Article gid as `blogId` (gid://shopify/Article/706327773484); Shopify resolves node(id:) to an Article, the `... on Blog` inline fragment selects nothing, so `node` comes back `{}` and getPostsByBlogGraphQL throws on `node.articles.edges`.

**Mechanism.** routes/api.js:201 mounts GET /shopify/postByBlog (handlers/apiSa.js mounts the same apiRouter under /apiSa, which is why the standalone service serves it). getPostsByBlog reads `blogId` straight off ctx.query with only a '' default and no gid-type check (shopifyController.js:398), then passes it to getPostsByBlogGraphQL (shopifyController.js:402), which splices it into `node(id: "${blogId}") { ... on Blog { articles(first:7) { edges … } } }` (graphQLPosts.js:84) and dereferences `node.articles.edges` (graphQLPosts.js:112). For a node that is not a Blog, Shopify answers HTTP 200 with `node: {}` — not null, no GraphQL error — so `node.articles` is undefined and `.edges` throws TypeError. It is logged at graphQLPosts.js:114 and rethrown; the controller catch does ctx.throw(500, e.message) (shopifyController.js:418), producing the alerted [handleError]/[unhandledError] pair. Prod frames map to these symbols: lib/helpers/graphql/graphQLPosts.js:137 → src graphQLPosts.js:112, lib/controllers/shopifyController.js:552 → src shopifyController.js:418. All 4 request logs carry the identical query string articleId=706375581996&blogId=gid%3A%2F%2Fshopify%2FArticle%2F706327773484 — one shop (ubkyJb5Ge4RAYjKqxl7M), two double-clicks (07:33:55.946/07:33:56.396, 07:34:35.569/07:34:36.011), each request followed ~0.21-0.45s later by its 4-line error burst. The gid reaches the server from ListPosts.fetchPostByBlog, which sends the clicked item's dataId.id as blogId with no Blog check (ListPosts.js:61) and only runs when displayList === 'blog' (ListPosts.js:80). The list on screen held articles: in the 30-min window the only list-population calls before the failures are /shopify/posts at 07:33:50.213, 07:34:26.959 and 07:34:33.641 — the first /shopify/blogs call is at 07:34:40.329, i.e. AFTER all four 500s. SettingSelectBlogs fills one shared listPosts state from both endpoints (SettingSelectBlogs.js:57 for posts, :70 for blogs) with no discriminator, and its mount effect unconditionally calls fetchPost(' ') regardless of the persisted typeSearch (SettingSelectBlogs.js:116). So the persisted typeSearch was 'blog' (blog click path) while the list was populated with articles. Same signature and same master code as recorded fingerprints 1j8pv1p (2026-09-18, api), 1cbcx5r (2026-09-18, apisa), 1n81ob2 / v2oq6a (2026-09-21, api) and ta670i (2026-09-22, apisa) — all fix_disabled, nothing landed on master.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/graphQLPosts.js:112` — `return node.articles.edges;` — the throwing deref; prod frame graphQLPosts.js:137:26
- `packages/functions/src/helpers/graphql/graphQLPosts.js:84` — blogId spliced into node(id:) with no Blog-gid check and no __typename guard
- `packages/functions/src/helpers/graphql/graphQLPosts.js:114` — logger.error('[getPostsByBlogGraphQL]', …) — emits the alerted line, then rethrows
- `packages/functions/src/controllers/shopifyController.js:398` — blogId read from ctx.query with only a '' default, never validated as a Blog gid
- `packages/functions/src/controllers/shopifyController.js:402` — getPostsByBlogGraphQL({shopify, blogId}) inside Promise.all — index 0 of the failing pair
- `packages/functions/src/controllers/shopifyController.js:418` — ctx.throw(500, e.message) — prod frame shopifyController.js:552:14
- `packages/functions/src/routes/api.js:201` — mounts GET /shopify/postByBlog; handlers/apiSa.js reuses this router under /apiSa
- `packages/assets/src/pages/Blog/BlogSettingLeft/RelatedBlogsTab/ListPosts.js:61` — sends the clicked item's dataId.id as blogId with no check that it is a Blog
- `packages/assets/src/pages/Blog/BlogSettingLeft/RelatedBlogsTab/SettingSelectBlogs.js:116` — mount effect always fetchPost(' '), filling listPosts with articles regardless of persisted typeSearch
- `packages/assets/src/pages/Blog/BlogSettingLeft/RelatedBlogsTab/SettingSelectBlogs.js:70` — fetchBlog writes the same listPosts state as fetchPost (line 57) — one list, two item types, no discriminator

## Evidence
- 4 matching entries: `resource.labels.service_name="apisa" AND httpRequest.requestUrl:"postByBlog" AND timestamp>="2026-09-22T07:18:58Z" AND timestamp<="2026-09-22T07:48:58Z"`
- 5 matching entries: `resource.labels.service_name="apisa" AND (httpRequest.requestUrl:"/shopify/blogs" OR httpRequest.requestUrl:"/shopify/posts") AND timestamp>="2026-09-22T07:18:58Z" AND timestamp<="2026-09-22T07:48:58Z"`
- 16 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-09-22T07:18:58.450Z" AND timestamp<="2026-09-22T07:48:58.450Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.47

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
