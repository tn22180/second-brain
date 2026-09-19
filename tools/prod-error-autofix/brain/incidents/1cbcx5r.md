fingerprint: 1cbcx5r
service: apisa
message: [getPostsByBlogGraphQL] Error fetching posts from blog: TypeError: Cannot read properties of undefined (reading 'edges')
app: BLOG
repo: blogs
date: 2026-09-18T13:40:53.136Z
status: fix_disabled
attempt: 1

# BLOG · apisa · 1cbcx5r

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint 1j8pv1p, now on the standalone service (apisa): the editor's Related Blogs tab sent GET /apiSa/shopify/postByBlog with an Article gid as `blogId` (gid://shopify/Article/706327773484, the same id and articleId=706375581996 as in 1j8pv1p). Shopify's node(id:) resolves that id to an Article, the `... on Blog` fragment selects nothing, `node.articles` is undefined, and getPostsByBlogGraphQL throws reading `.edges`. No request failed with a 5xx.

**Mechanism.** apisa request log: 1 GET /apiSa/shopify/postByBlog at 13:39:44.317Z with `articleId=706375581996&blogId=gid%3A%2F%2Fshopify%2FArticle%2F706327773484`, status 200. 535 ms later, at 13:39:44.852Z, there is 1 `[getPostsByBlogGraphQL] ... reading 'edges'` ERROR. It is the only one on apisa since 2026-09-11. getPostsByBlogGraphQL puts blogId straight into `node(id:"${blogId}") { ... on Blog { articles ... } }`. For a non-Blog node Shopify returns `node: {}`, so `node.articles.edges` throws TypeError. The error is logged at ERROR and rethrown. The controller getPostsByBlog catches it and answers 200 {success:false}, which is why the requests read shows 0 entries at >=500. The Article gid comes from ListPosts.fetchPostByBlog, which sends the clicked item's `dataId.id` as blogId. SettingSelectBlogs.fetchPost and fetchBlog both write the same listPosts state with no stale-response guard, so a post list can be on screen while the blog path is active. The same editor, the same article and the same bad blogId hit `api` at 13:26–13:28Z (1j8pv1p), so one merchant is repeating one UI action across the embedded and standalone surfaces. No FE log shows which response ordering happened; that part is inferred from the code.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/graphQLPosts.js:112` — `return node.articles.edges;` throws when node resolves to a non-Blog type, because the `... on Blog` fragment leaves `articles` undefined
- `packages/functions/src/helpers/graphql/graphQLPosts.js:84` — blogId goes into `node(id:)` with no check that it is a Blog gid
- `packages/functions/src/controllers/shopifyController.js:397` — getPostsByBlog takes blogId from ctx.query without validating it
- `packages/functions/src/controllers/shopifyController.js:416` — the catch returns 200 {success:false}, so the failure never shows as a 5xx
- `packages/assets/src/pages/Blog/BlogSettingLeft/RelatedBlogsTab/ListPosts.js:61` — fetchPostByBlog sends the clicked item's dataId.id as blogId without checking that the item is a Blog
- `packages/assets/src/pages/Blog/BlogSettingLeft/RelatedBlogsTab/SettingSelectBlogs.js:56` — fetchPost and fetchBlog (line 69) both write the same listPosts state with no stale-response guard

## Evidence
- 1 matching entries: `resource.labels.service_name="apisa" AND httpRequest.requestUrl:"postByBlog" AND timestamp>="2026-09-18T13:20:00Z" AND timestamp<="2026-09-18T13:55:00Z"`
- 1 matching entries: `resource.labels.service_name="apisa" AND jsonPayload.tag="[getPostsByBlogGraphQL]" AND timestamp>="2026-09-11T00:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.16

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
