fingerprint: e1s6di
service: proxy
message: [updateArticleSummaryData] 8bHFUwCQoMuylgGBsD7Z 123 Metafield Save Errors [{"field":["metafields","0","ownerId"],"message":"Owner does not exist."}]
app: BLOG
repo: blogs
date: 2026-08-22T07:18:48.088Z
status: fix_disabled
attempt: 1

# BLOG · proxy · e1s6di

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The alerted ERROR is not a request failure: POST /proxy/ai-summary/vote/:id passes the unvalidated `:id` path param straight into updateArticleSummaryData, and when that id is not a real Shopify article (a curl probe sent id=123 for shop manucurist-us), Shopify's metafieldsSet answers the handled userError "Owner does not exist." which the code logs at logger.error (severity=ERROR) while the request itself returns HTTP 200.

**Mechanism.** curl/8.7.1 sent POST /proxy/ai-summary/vote/123?action=up&domain=manucurist-us.myshopify.com at 07:54:33.400876Z and 07:54:35.089369Z, both answered 200 (requests query below). settingsController.voteAISummary reads `const {id} = ctx.params` and hands it to updateArticleSummaryData({shop, articleId: id}) with no existence or format check (settingsController.js:208, 226-228). updateArticleSummaryData builds `gid://shopify/Article/123` (shopifyGraphQlService.js:2511) and uses it as `ownerId` in metafieldsSet (shopifyGraphQlService.js:2603). Shopify resolves no such article and returns userErrors [{"field":["metafields","0","ownerId"],"message":"Owner does not exist."}]; the branch at shopifyGraphQlService.js:2616-2624 logs that expected miss via logger.error — the only logger in this repo that emits `severity` — and returns null. Promise.all in voteAISummary resolves, so the handler still writes {success: true} and Cloud Run logs 200. The two ERROR lines at 07:54:33.922186Z and 07:54:35.620579Z sit ~0.5s after each 200, one per probe request, same execution_ids' service (proxy-00143-roy). requests read with status>=500 is empty (0 entries) precisely because nothing failed.

Confidence: `high`

## Code
- `packages/functions/src/controllers/settingsController.js:208` — `const {id} = ctx.params` — the storefront-supplied article id is taken with no validation
- `packages/functions/src/controllers/settingsController.js:226` — voteAISummary passes that raw id as articleId into updateArticleSummaryData inside Promise.all
- `packages/functions/src/services/shopifyGraphQlService.js:2511` — builds gid://shopify/Article/123 from the raw param without checking the article exists
- `packages/functions/src/services/shopifyGraphQlService.js:2603` — that gid is sent as metafieldsSet ownerId — the field Shopify names in the userError
- `packages/functions/src/services/shopifyGraphQlService.js:2617` — logger.error on a handled Shopify userError is what raised this severity=ERROR alert; the function returns null and the caller still answers 200
- `packages/functions/src/routes/proxy.js:27` — route has validateIpRateLimit + validatePlan only — no verifyAppProxySignature, so any client (here curl) can drive this path with an arbitrary :id

## Evidence
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-21T07:39:35.302Z" AND timestamp<="2026-08-21T08:09:35.302Z" AND jsonPayload.tag="[updateArticleSummaryData]"`
- 6 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-21T07:39:35.302Z" AND timestamp<="2026-08-21T08:09:35.302Z" AND httpRequest.requestUrl:"ai-summary/vote"`

## Job
- analyze rounds: 2
- cost: $2.13

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
