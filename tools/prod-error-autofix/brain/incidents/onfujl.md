fingerprint: onfujl
service: apisa
message: [getShopifyArticleById] ubkyJb5Ge4RAYjKqxl7M dev_zone Error: Article not found
app: BLOG
repo: blogs
date: 2026-08-04T04:46:25.723Z
status: mr_open
attempt: 1

# BLOG · apisa · onfujl

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/833

**Root cause.** The standalone editor was mounted at /articles/edit/dev_zone, so GET /apiSa/article/dev_zone reached articleController.getOne, which passes ctx.params.id into getShopifyArticleById with no article-id shape check; normalizeShopifyGid returns any string unchanged, the query asked Shopify for gid://shopify/Article/dev_zone, Shopify resolved it to null, and the service threw 'Article not found', logged it (this alert) and returned {} — the request still answered HTTP 200 with an empty article.

**Mechanism.** Request log: GET https://apisa-arodugkrmq-uc.a.run.app/apiSa/article/dev_zone?primary=en, status 200, latency 0.471860938s, referer https://blogapp.seoon.io/articles/edit/dev_zone, remoteIp 66.249.82.35 — the same browser session that had the editor open on /articles/edit/706327773484 two minutes earlier (PUT /apiSa/article/706327773484 at 04:31:51 from referer https://blogapp.seoon.io/articles/edit/706327773484, same 66.249.82.x). Two sibling requests in the same 0.8s burst carry the same token — /apiSa/recentBlogs?excludeId=dev_zone&limit=4 and /apiSa/blog-assist/dev_zone/title — i.e. the whole Blog/Edit page re-mounted with useParams().id === 'dev_zone' (packages/assets/src/pages/Blog/Edit.jsx:150 builds exactly `/article/${id}?primary=${shop?.primaryLocale}`, matching the observed ?primary=en). Server side: routes/api.js:96 maps GET /article/:id to getOne; getOne reads ctx.params.id at articleController.js:182 and hands it straight to getShopifyArticleById at :197 (Promise.all index 0 — the frame in the alert stack). Inside the service, normalizeShopifyGid('dev_zone') returns the string unchanged (normalizeShopifyGid.js:10 — any string passes), so the guard at shopifyGraphQlService.js:753 does not fire and :759 interpolates `gid://shopify/Article/dev_zone` into the query. Shopify returns no article, processJSONMetafield(resp.data?.article) is falsy at :850, :852 throws Error('Article not found'), :873 logs the exact prod line '[getShopifyArticleById] ubkyJb5Ge4RAYjKqxl7M dev_zone Error: Article not found', and :874 returns {} instead of rethrowing. Proof the success path ran rather than getOne's catch: jsonPayload.tag="[getOne]" (articleController.js:278) matched 0 entries on apisa in 24h, and the stderr line 'Failed to log event for domain hiveartes.com: 16 UNAUTHENTICATED' 0.092s later carries the SAME execution_id e5xvzzchcgjq and spanId 11433450998431376049 — that call is logUpdateBlogEvent(shop) at articleController.js:264, which sits only on the success return at :265. Consequence on {}: isEmpty(firstArticleVersion) is true at :252, so :256 writes an empty origin article version to Firestore keyed on articleId 'dev_zone', and the merchant/staff gets a blank editor with HTTP 200 instead of a 404. The eventLogService UNAUTHENTICATED failure is a separate, already-tracked defect (1efiw8j / 1xqxz29, MR 815) and is used here only as an execution-order marker. What put 'dev_zone' — a FE route segment (routes.jsx DevZone route, appMenu 'Dev Zone' url /dev_zone) — into the :id slot is NOT proven from the logs; no repo code pushes a relative 'dev_zone', and Home/index.jsx:39 pushes /articles/edit/${id} from an unvalidated ?id= query param, which is a plausible but unverified entry point. The backend defect stands independently: getOne accepts any path segment as an article id, unlike list() which normalizes and filters ids at articleController.js:658.

Confidence: `high`

## Code
- `packages/functions/src/controllers/articleController.js:182` — getOne takes ctx.params.id with no shape validation — 'dev_zone' enters here
- `packages/functions/src/controllers/articleController.js:197` — call site named in the alert stack (Promise.all index 0); passes the raw path segment to getShopifyArticleById
- `packages/functions/src/services/shopifyGraphQlService.js:752` — normalizeShopifyGid(id) — the only id check; a plain string passes untouched
- `packages/functions/src/helpers/utils/normalizeShopifyGid.js:10` — `if (typeof id === 'string') return id` — 'dev_zone' is accepted as a valid article id
- `packages/functions/src/services/shopifyGraphQlService.js:759` — builds gid://shopify/Article/dev_zone and issues a GraphQL query that cannot resolve
- `packages/functions/src/services/shopifyGraphQlService.js:852` — throw new Error('Article not found') when resp.data?.article is null — the message and frame in the alert
- `packages/functions/src/services/shopifyGraphQlService.js:873` — logger.error('[getShopifyArticleById]', shop?.id, id, e) — emits the exact prod log line the alert fired on
- `packages/functions/src/services/shopifyGraphQlService.js:874` — returns {} instead of rethrowing, so getOne cannot distinguish 'not an article id' from a real article (MR 798 family)
- `packages/functions/src/controllers/articleController.js:256` — isFirstTimeGet is true for {}, so createArticle persists an empty origin version keyed on articleId 'dev_zone'
- `packages/functions/src/controllers/articleController.js:264` — logUpdateBlogEvent(shop) on the success path only — its failure line shares execution_id e5xvzzchcgjq, proving getOne returned 200
- `packages/functions/src/controllers/articleController.js:265` — returns success: true with an empty article — HTTP 200, matching the request log
- `packages/functions/src/controllers/articleController.js:278` — getOne's catch (tag [getOne]) — 0 entries in 24h, confirming it never ran
- `packages/functions/src/controllers/articleController.js:658` — list() normalizes and filters ids before calling the same service — the guard getOne lacks
- `packages/functions/src/routes/api.js:96` — GET /article/:id → articleController.getOne, mounted under /apiSa by handlers/apiSa.js
- `packages/assets/src/pages/Blog/Edit.jsx:150` — builds /article/${id}?primary=… from useParams().id — matches the observed /apiSa/article/dev_zone?primary=en
- `packages/assets/src/pages/Home/index.jsx:39` — pushes /articles/edit/${id} from an unvalidated ?id= query param — plausible but unproven source of the 'dev_zone' route param

## Evidence
- 1 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-08-04T04:18:52.671Z" AND timestamp<="2026-08-04T04:48:52.671Z" AND severity>=ERROR`
- 3 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-04T04:33:30Z" AND timestamp<="2026-08-04T04:34:10Z" AND httpRequest.requestUrl:"dev_zone"`
- 1 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-04T04:33:41Z" AND timestamp<="2026-08-04T04:33:42Z" AND httpRequest.requestUrl:"article/dev_zone"`
- 2 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-04T04:18:52.671Z" AND timestamp<="2026-08-04T04:48:52.671Z" AND labels.execution_id="e5xvzzchcgjq"`
- 6 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-03T04:48:52Z" AND timestamp<="2026-08-04T04:48:52Z" AND jsonPayload.tag="[getShopifyArticleById]"`
- 35 matching entries: `timestamp>="2026-08-03T04:48:52Z" AND timestamp<="2026-08-04T04:48:52Z" AND jsonPayload.tag="[getShopifyArticleById]" AND jsonPayload.error.message="Article not found"`
- 22 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-04T04:24:00Z" AND timestamp<="2026-08-04T04:34:00Z" AND httpRequest.requestUrl!=""`

## Job
- analyze rounds: 1
- cost: $4.76
- branch: `fix/prod-blog-onfujl`
- fix commit: `3c0fde56b8a09ddc681dbece3ab46b55ff0c279b`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/833
- tests: 283 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
packages/functions/src/controllers/articleController.js  | 8 ++++++++
 packages/functions/src/services/shopifyGraphQlService.js | 2 +-
 2 files changed, 9 insertions(+), 1 deletion(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
