fingerprint: hhp84a
service: apisa
message: [getShopifyArticleById] 29p3Gw5R8xBczLIBMyQI 706327773484 Error: Article not found
app: BLOG
repo: blogs
date: 2026-08-02T13:37:34.089Z
status: mr_open
attempt: 1

# BLOG · apisa · hhp84a

**Outcome.** duplicate of 14ydm3m — MR https://gitlab.com/avada/blogs/-/merge_requests/798

**Root cause.** getShopifyArticleById swallows its own `throw new Error('Article not found')` and returns `{}` (shopifyGraphQlService.js:874), so articleController.getOne treats article 706327773484 of shop 29p3Gw5R8xBczLIBMyQI (www.vivaplancha.com) — which no longer resolves in Shopify — as a valid-but-empty article, answers HTTP 200 with an empty article body and writes an empty article version to Firestore; the alert is the swallowed log line, not a request failure. Same defect and same line as fingerprints 9m7zmo / at2cvw / 14ydm3m / 1zjaa5 / hqfte0 (MR https://gitlab.com/avada/blogs/-/merge_requests/798 open, unmerged) and 3349gs / 1m8run2 (MR 802 open), reached from a third caller.

**Mechanism.** GET /apiSa/article/706327773484 → articleController.getOne:181 → Promise.all index 0 → getShopifyArticleById (articleController.js:197). normalizeShopifyGid succeeds (the logged error is `name: 'Error'`, not `InvalidArticleIdError`), so the query `article(id: "gid://shopify/Article/706327773484")` is issued; Shopify resolves it to null, processJSONMetafield(resp.data?.article) is falsy at shopifyGraphQlService.js:850 and :852 throws 'Article not found'. The catch at :873 logs the exact prod line — `[getShopifyArticleById] 29p3Gw5R8xBczLIBMyQI 706327773484 Error: Article not found` — and :874 returns `{}` instead of rethrowing, so the caller cannot tell 'deleted' from 'valid article'. getOne then runs to completion on `{}`: with no `locale` in the query getTranslatedArticle returns it unchanged (articlesHelper.js:228), getSeoAnalysisPage builds `https://www.vivaplancha.com/blogs/undefined/undefined` (articleController.js:240), isFirstTimeGet is true so createArticle writes an empty origin version into Firestore (:256), and :265 returns `{success: true, article: {}}` with HTTP 200. Proof the success path ran and not the catch: logUpdateBlogEvent(shop) at :264 sits after the last await and only on the success return, and its failure line `Failed to log event for domain www.vivaplancha.com: Error: shopName must be a non-empty string` carries the SAME execution_id buccyudlpc9c and spanId 12033770063061988050 as the 'Article not found' line, 0.33s later. Corroborating: the pulled requests read (httpRequest.status>=500 on apisa in the window) is empty, and `jsonPayload.tag="[getOne]"` — getOne's own catch at :278 — matched 0 entries in the whole 24h. The eventLogService shopName failure is a separate, already-tracked defect (1efiw8j / 1xqxz29, MR 815); it is used here only as an execution-order marker, not merged into this cause.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:852` — throw new Error('Article not found') when processJSONMetafield(resp.data?.article) is falsy — the message and frame in the alert stack
- `packages/functions/src/services/shopifyGraphQlService.js:873` — catch logs '[getShopifyArticleById]' shop.id 29p3Gw5R8xBczLIBMyQI id 706327773484 e — the exact prod log line and the only thing the alert saw
- `packages/functions/src/services/shopifyGraphQlService.js:874` — returns {} instead of rethrowing — the defect; every caller loses the ability to distinguish 'article gone' from a real article
- `packages/functions/src/controllers/articleController.js:197` — getOne's call site, Promise.all index 0 as named in the stack; no emptiness guard on the returned object
- `packages/functions/src/controllers/articleController.js:240` — builds the SEO analysis URL from translatedArticle?.blog?.handle on {} → https://www.vivaplancha.com/blogs/undefined/undefined
- `packages/functions/src/controllers/articleController.js:256` — isFirstTimeGet is true for {}, so createArticle persists an empty origin article version to Firestore
- `packages/functions/src/controllers/articleController.js:264` — logUpdateBlogEvent(shop) on the success path only — its failure line shares execution_id buccyudlpc9c, proving getOne returned 200 rather than entering its catch
- `packages/functions/src/controllers/articleController.js:265` — returns success: true with article: {} — merchant gets a blank editor instead of a 404
- `packages/functions/src/controllers/articleController.js:278` — getOne's catch, which logs tag [getOne] — matched 0 entries in 24h, confirming it never ran
- `packages/functions/src/controllers/articleController.js:670` — second unguarded caller (list) — 10 of the 23 'Article not found' logs in 24h come from here
- `packages/functions/src/controllers/appProxyController.js:123` — third unguarded caller (getPreview) — 12 of the 23 in 24h; the MR-798 family
- `packages/functions/src/helpers/articlesHelper.js:228` — getTranslatedArticle returns the {} unchanged when no locale is supplied, so nothing downstream ever notices the article is empty

## Evidence
- 1 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-08-02T13:18:46.285Z" AND timestamp<="2026-08-02T13:48:46.285Z" AND severity>=ERROR`
- 2 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-08-02T13:18:46.285Z" AND timestamp<="2026-08-02T13:48:46.285Z" AND labels.execution_id="buccyudlpc9c"`
- 1 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-08-02T13:18:46.285Z" AND timestamp<="2026-08-02T13:48:46.285Z" AND labels.execution_id="buccyudlpc9c" AND textPayload:"Failed to log event for domain www.vivaplancha.com"`
- 1 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-08-01T13:48:46Z" AND timestamp<="2026-08-02T13:48:46Z" AND jsonPayload.tag="[getShopifyArticleById]" AND jsonPayload.error.stack:"async getOne"`
- 23 matching entries: `timestamp>="2026-08-01T13:48:46Z" AND timestamp<="2026-08-02T13:48:46Z" AND jsonPayload.tag="[getShopifyArticleById]" AND jsonPayload.error.message="Article not found"`

## Job
- analyze rounds: 1
- cost: $1.40
- MR: https://gitlab.com/avada/blogs/-/merge_requests/798

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
