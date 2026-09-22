fingerprint: 15bgeed
service: apisa
message: HTTP 500 GET /apiSa/shopify/postByBlog
app: BLOG
repo: blogs
date: 2026-09-22T07:53:26.753Z
status: fix_disabled
attempt: 1

# BLOG · apisa · 15bgeed

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprints 1ukaxj0 / ta670i / 1cbcx5r (same app, service, endpoint, shop and article, still unfixed on master): all 4 GET /apiSa/shopify/postByBlog 500s in the window carried an Article gid as blogId (blogId=gid://shopify/Article/706327773484), and getPostsByBlogGraphQL dereferences node.articles.edges with no guard for a node that is not a Blog.

**Mechanism.** The request log shows 4/4 failures with query articleId=706375581996&blogId=gid%3A%2F%2Fshopify%2FArticle%2F706327773484 — a gid://shopify/Article/, not gid://shopify/Blog/. getPostsByBlog (packages/functions/src/controllers/shopifyController.js:402) passes that value straight into getPostsByBlogGraphQL, which builds `node(id: "${blogId}")` with a single `... on Blog` inline fragment (graphQLPosts.js:84-85). Shopify resolves the Article node fine, but no field in the selection set applies, so the response is `{node: {}}`; `node.articles` is undefined and `node.articles.edges` (graphQLPosts.js:112) throws `TypeError: Cannot read properties of undefined (reading 'edges')` — exactly the logged stack at lib/helpers/graphql/graphQLPosts.js:137. The helper rethrows (graphQLPosts.js:115), the controller catch calls ctx.throw(500, e.message) (shopifyController.js:418), producing the [unhandledError] GET /apiSa/shopify/postByBlog 500 line. Caller side: the Related Blogs tab mounts with an unconditional fetchPost(' ') that fills listPosts with Articles (SettingSelectBlogs.js:116) while displayList is the persisted relatedBlogsSettingData.typeSearch, which can already be 'blog' (SettingSelectBlogs.js:202); clicking a row then routes to fetchPostByBlog and sends the Article's own gid as blogId (ListPosts.js:61). That caller path is inferred from code, not proven by a log line; the Article-gid-as-blogId input and the crash site are proven.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/graphQLPosts.js:112` — return node.articles.edges — unguarded dereference that throws when node is not a Blog; matches the logged stack frame in lib/helpers/graphql/graphQLPosts.js
- `packages/functions/src/helpers/graphql/graphQLPosts.js:84` — node(id: "${blogId}") with only a `... on Blog` fragment, so an Article gid yields an empty node object instead of an error
- `packages/functions/src/controllers/shopifyController.js:402` — getPostsByBlog passes ctx.query.blogId into getPostsByBlogGraphQL with no gid-type validation
- `packages/functions/src/controllers/shopifyController.js:418` — catch turns the TypeError into ctx.throw(500, e.message) — the logged HTTP 500
- `packages/assets/src/pages/Blog/BlogSettingLeft/RelatedBlogsTab/ListPosts.js:61` — caller builds /shopify/postByBlog?blogId=${dataId.id} from whatever row was clicked, so an Article row sends an Article gid
- `packages/assets/src/pages/Blog/BlogSettingLeft/RelatedBlogsTab/SettingSelectBlogs.js:116` — unconditional fetchPost(' ') on mount populates the list with Articles even when the persisted typeSearch is 'blog', which is how an Article row reaches the blog branch

## Evidence
- 4 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-09-22T07:18:59.065Z" AND timestamp<="2026-09-22T07:48:59.065Z" AND httpRequest.status>=500`
- 16 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-09-22T07:18:59.065Z" AND timestamp<="2026-09-22T07:48:59.065Z" AND severity>=ERROR`
- 17 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-09-22T07:18:59.065Z" AND timestamp<="2026-09-22T07:48:59.065Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.76

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
