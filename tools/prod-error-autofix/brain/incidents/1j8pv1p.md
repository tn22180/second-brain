fingerprint: 1j8pv1p
service: api
message: [getPostsByBlogGraphQL] Error fetching posts from blog: TypeError: Cannot read properties of undefined (reading 'edges')
app: BLOG
repo: blogs
date: 2026-09-18T13:28:54.071Z
status: fix_disabled
attempt: 1

# BLOG · api · 1j8pv1p

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The editor's Related Blogs tab sent GET /api/shopify/postByBlog with an Article gid as `blogId` (gid://shopify/Article/706327773484). Shopify's `node(id:)` resolves that id to an Article, so the `... on Blog` fragment selects nothing, `node.articles` is undefined, and getPostsByBlogGraphQL throws reading `.edges`.

**Mechanism.** Request log: 3 of 3 GET /api/shopify/postByBlog calls in 13:26–13:28Z carried `blogId=gid%3A%2F%2Fshopify%2FArticle%2F706327773484&articleId=706375581996`. Each is followed within ~0.5s by one `[getPostsByBlogGraphQL] ... reading 'edges'` ERROR at 13:26:03.61, 13:26:43.64 and 13:27:52.71. For comparison, the last successful call at 13:06:06 sent `gid://shopify/Blog/92031909978`. getPostsByBlogGraphQL splices blogId into `node(id:"${blogId}") { ... on Blog { articles {...} } }`. For a non-Blog node, Shopify returns `node: {}` (not null and not a GraphQL error). So `node.articles.edges` throws TypeError. The error is logged at ERROR and rethrown. The controller getPostsByBlog catches it and answers HTTP 200 `{success:false}`, which is why the requests read shows 0 5xx. The Article gid comes from ListPosts.fetchPostByBlog, which sends `dataId.id` for whatever item the merchant clicked while `displayList` is `blog`. SettingSelectBlogs fills one shared `listPosts` state from both `/shopify/posts` (fetchPost) and `/shopify/blogs` (fetchBlog) with no guard on which request answers last. So a post list can still be on screen while typeSearch is `blog`, and a click sends an Article gid down the blog path. No FE log shows which ordering happened; that part is inferred from the code.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/graphQLPosts.js:112` — `return node.articles.edges;`: throws when node resolves to a non-Blog type, because the `... on Blog` fragment leaves `articles` undefined
- `packages/functions/src/helpers/graphql/graphQLPosts.js:84` — blogId is spliced into `node(id:)` with no check that it is a Blog gid
- `packages/functions/src/controllers/shopifyController.js:397` — getPostsByBlog takes blogId from ctx.query without validating it
- `packages/functions/src/controllers/shopifyController.js:416` — catch returns 200 {success:false}, so the failure never shows up as a 5xx
- `packages/assets/src/pages/Blog/BlogSettingLeft/RelatedBlogsTab/ListPosts.js:61` — fetchPostByBlog sends the clicked item's `dataId.id` as blogId, with no check that the item is a Blog
- `packages/assets/src/pages/Blog/BlogSettingLeft/RelatedBlogsTab/SettingSelectBlogs.js:57` — fetchPost and fetchBlog (line 70) both write the same listPosts state with no stale-response guard, so posts can be listed while typeSearch is `blog`

## Evidence
- 4 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"postByBlog" AND timestamp>="2026-09-18T13:00:00Z" AND timestamp<="2026-09-18T13:45:00Z"`
- 3 matching entries: `resource.labels.service_name="api" AND jsonPayload.tag="[getPostsByBlogGraphQL]" AND timestamp>="2026-09-11T00:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.65

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
