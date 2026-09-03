fingerprint: 1jir04o
service: api
message: [getShopifyArticleById] viKH2hMHuRtfLQx5EuD1 572072919074 Error: Article not found
app: BLOG
repo: blogs
date: 2026-09-02T13:18:03.557Z
status: fix_disabled
attempt: 1

# BLOG · api · 1jir04o

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Not a request failure: article 572072919074 no longer resolves in Shopify for shop viKH2hMHuRtfLQx5EuD1, and getShopifyArticleById logs that expected miss at logger.error (severity ERROR) before swallowing it and returning {} — the two GET /api/article/572072919074?primary=en requests behind the two alerted lines both answered HTTP 200.

**Mechanism.** The Blog editor issued GET /api/article/572072919074?primary=en twice (13:12:25.729Z, 0.910s and 13:12:27.017Z, 1.167s — both status 200, the only two requests for that path in the window). articleController.getOne passes the numeric id through the ARTICLE_ID_PATTERN guard at articleController.js:214 (id is all digits, so the guard cannot help), then calls getShopifyArticleById inside Promise.all at articleController.js:234 — matching the prod frames 'async Promise.all (index 0)' and 'getOne (/workspace/lib/controllers/articleController.js:226:97)' (src :234; babel output, line numbers differ). Inside the service the gid guard at shopifyGraphQlService.js:757 passes, the article(id:) query is issued, Shopify answers data.article: null, processJSONMetafield returns falsy at :866 and :868 throws Error('Article not found') — prod frame lib/services/shopifyGraphQlService.js:959 (src :868). The single catch at :888 logs the exact alert text '[getShopifyArticleById] viKH2hMHuRtfLQx5EuD1 572072919074 Error: Article not found' at severity ERROR (:889) and returns {} (:890). Nothing rethrows: getOne's own catch at :331 never fired (no '[getOne]' line in the window) and the handler returned its normal 200 body with an empty article. Proof the request path never failed: the requests read (httpRequest.status>=500) matched 0 entries for the whole 30-minute window, and the two matching /api/article/572072919074 request logs are both 200. Scope: 27 '[getShopifyArticleById] ... Article not found' lines on api in the preceding 24h, of which only these 2 come from getOne — the other 25 all come from list (articleController.js:785, recentOpenedArticles fan-out), the already-recorded family. Same defect and same catch block as recorded fingerprints 7u4qve / 1dosxzi / 9m7zmo / 14ydm3m / hhp84a; this occurrence adds no new cause, only a new caller (getOne).

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:889` — logger.error('[getShopifyArticleById]', shop?.id, id, e) — emits the exact alert line at severity ERROR for a handled, expected miss. The defect.
- `packages/functions/src/services/shopifyGraphQlService.js:868` — throw new Error('Article not found') when processJSONMetafield(resp.data?.article) is falsy — source of the alerted message, prod frame lib/...:959
- `packages/functions/src/services/shopifyGraphQlService.js:866` — const data = processJSONMetafield(resp.data?.article) — Shopify returned data.article: null for a deleted/unresolvable article gid
- `packages/functions/src/services/shopifyGraphQlService.js:890` — return {} instead of rethrowing — why nothing propagates to a 5xx and both requests stayed 200
- `packages/functions/src/controllers/articleController.js:234` — the getShopifyArticleById call inside Promise.all — the call site named by the stack frame 'async Promise.all (index 0)' / getOne
- `packages/functions/src/controllers/articleController.js:214` — ARTICLE_ID_PATTERN guard — 572072919074 is all digits so it passes; a shape check cannot prevent this miss, only a Shopify round trip can
- `packages/functions/src/controllers/articleController.js:331` — getOne's catch logs '[getOne]' — no such line exists in the window, proving no error escaped the service catch
- `packages/functions/src/services/__tests__/shopifyGraphQlService.nullArticle.test.js:55` — existing test asserts the not-found path is reported through logger.error — the assertion any log-level fix must change

## Evidence
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-09-02T12:57:30.418Z" AND timestamp<="2026-09-02T13:27:30.418Z" AND severity>=ERROR`
- 2 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-02T12:57:30Z" AND timestamp<="2026-09-02T13:27:30Z" AND httpRequest.requestUrl:"/api/article/572072919074"`
- 27 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-01T13:30:00Z" AND timestamp<="2026-09-02T13:30:00Z" AND jsonPayload.tag="[getShopifyArticleById]"`
- 30 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-02T13:12:20Z" AND timestamp<="2026-09-02T13:12:35Z" AND httpRequest.requestMethod!=""`
- 113 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-09-02T12:57:30.418Z" AND timestamp<="2026-09-02T13:27:30.418Z" AND logName:"stderr"`

## Job
- analyze rounds: 2
- cost: $2.68

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
