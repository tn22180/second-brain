fingerprint: v2oq6a
service: api
message: [unhandledError] GET /api/shopify/postByBlog 500 Cannot read properties of undefined (reading 'edges') InternalServerError: Cannot read properties of undefined (reading 'edges')
app: BLOG
repo: blogs
date: 2026-09-21T07:10:02.430Z
status: fix_disabled
attempt: 1

# BLOG · api · v2oq6a

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** GET /api/shopify/postByBlog is called with an Article gid in the `blogId` param (4 of 4 calls in the window), and getPostsByBlogGraphQL dereferences `node.articles.edges` unconditionally — Shopify's `node(id:)` returns `{}` for a node that is not a Blog because the query selects only the `... on Blog` inline fragment, so `node.articles` is undefined and the TypeError becomes a 500.

**Mechanism.** Log line [unhandledError] GET /api/shopify/postByBlog 500 at 07:00:15.606Z pairs with the Cloud Run request log 3ms-483ms earlier at 07:00:15.123Z whose URL is `?articleId=1006280048789&blogId=gid%3A%2F%2Fshopify%2FArticle%2F1006281752725` — blogId is an Article gid, not a Blog gid. shopifyController.getPostsByBlog passes that raw `ctx.query.blogId` straight into getPostsByBlogGraphQL (packages/functions/src/controllers/shopifyController.js:402). The GraphQL document interpolates it into `node(id: "${blogId}")` and selects fields only under `... on Blog` (packages/functions/src/helpers/graphql/graphQLPosts.js:84-108), so for an Article node Shopify answers `data.node = {}`. `return node.articles.edges` (graphQLPosts.js:112) then throws `TypeError: Cannot read properties of undefined (reading 'edges')` — exactly the [getPostsByBlogGraphQL] line logged 0.5ms before each [unhandledError]. The catch in the controller rethrows as `ctx.throw(500, e.message)` (shopifyController.js:418). Source of the bad param is the Related Blogs tab: SettingSelectBlogs switches `typeSearch` to `blog` and only then async-fetches `/shopify/blogs` into the same `listPosts` state (packages/assets/src/pages/Blog/BlogSettingLeft/RelatedBlogsTab/SettingSelectBlogs.js:46-47, :70), while ListPosts already routes a click on the still-rendered post rows through `fetchPostByBlog`, sending the post's Article gid as `blogId` (ListPosts.js:61). All 4 failures are one shop (FiNnkxsSJ96AC1ZWnaz8) and one article (articleId=1006280048789) inside 56 seconds — one merchant clicking 4 different post rows.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/graphQLPosts.js:112` — `return node.articles.edges` — the unguarded dereference that throws; stack frame graphQLPosts.js:137 in lib/ maps here
- `packages/functions/src/helpers/graphql/graphQLPosts.js:84` — `node(id: "${blogId}")` with only `... on Blog` selected, so a non-Blog gid yields `node = {}` instead of an error
- `packages/functions/src/controllers/shopifyController.js:402` — getPostsByBlog passes the unvalidated `ctx.query.blogId` into getPostsByBlogGraphQL — no gid type check
- `packages/functions/src/controllers/shopifyController.js:418` — `ctx.throw(500, e.message)` converts the caller's bad param into a 500 instead of a 400
- `packages/assets/src/pages/Blog/BlogSettingLeft/RelatedBlogsTab/ListPosts.js:61` — FE sends `blogId=${dataId.id}` from whatever row is in listPosts, with no check that the row is a Blog
- `packages/assets/src/pages/Blog/BlogSettingLeft/RelatedBlogsTab/SettingSelectBlogs.js:70` — fetchBlog replaces listPosts only after its async /shopify/blogs response, so post rows stay clickable while typeSearch is already 'blog'

## Evidence
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-21T06:45:42.386Z" AND timestamp<="2026-09-21T07:15:42.386Z" AND httpRequest.requestUrl:"postByBlog" AND httpRequest.requestUrl:"blogId=gid%3A%2F%2Fshopify%2FArticle"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-21T06:45:42.386Z" AND timestamp<="2026-09-21T07:15:42.386Z" AND jsonPayload.tag="[getPostsByBlogGraphQL]"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-21T06:45:42.386Z" AND timestamp<="2026-09-21T07:15:42.386Z" AND jsonPayload.tag="[unhandledError]" AND jsonPayload.message:"postByBlog"`

## Job
- analyze rounds: 2
- cost: $3.85

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
