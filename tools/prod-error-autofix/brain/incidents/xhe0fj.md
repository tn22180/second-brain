fingerprint: xhe0fj
service: api
message: [getShopLocales] FqpPuSM3XKz0LLkZXe24 Error: AxiosError: Request failed with status code 503
app: BLOG
repo: blogs
date: 2026-07-31T14:15:51.129Z
status: mr_open
attempt: 1

# BLOG · api · xhe0fj

**Outcome.** duplicate of rq3qf8 — MR https://gitlab.com/avada/blogs/-/merge_requests/810

**Root cause.** Duplicate of fingerprint rq3qf8 / 1w64e0z (MR 810 open, unmerged): Shopify Admin GraphQL answered one transient HTTP 503 to shop FqpPuSM3XKz0LLkZXe24's shopLocales query, and shopifyRetryGraphQL calls logger.error unconditionally in its catch — before any retryability check — so a failure the user never saw (the /api/settings request finished 200) was emitted at severity ERROR and paged.

**Mechanism.** settingsController.getOne puts getShopLocales into a Promise.all (settingsController.js:45, Promise.all index 4 in the prod stack). getShopLocales -> makeGraphQlApi (helpers/api.js:128) -> shopifyRetryGraphQL (helpers/api.js:147). Shopify returned 503 to POST /admin/api/*/graphql.json; axios rejected with an AxiosError carrying response.status=503. shopifyRetryGraphQL's catch runs logger.error('[shopifyRetryGraphQL]', e) at helpers/api.js:151 unconditionally, the structured logger stamps severity=ERROR, and the prod-error-alerts sink (severity>=ERROR) forwards it to Slack. The deployed revision is api-00107-wet, built before the retry-classifier fix c791df167 landed on master, so it still reads the pre-fix `e.statusCode` — a field axios 0.27 never sets — isRetryError was false and it rethrew immediately: exactly one [shopifyRetryGraphQL] line exists for that request (13:01:52.356410Z) against maxRetries=5, and the [getShopLocales] rethrow log is 518us later at 13:01:52.356928Z. Master already carries the classifier fix and helpers/api.js:145 now lists 503 in RETRYABLE_STATUSES, so once that deploys the 503 will be retried — but line 151 still fires at ERROR on every attempt, so each retried-and-recovered 503 will keep paging. User impact is nil either way: getShopLocales catches the rethrow and returns [] (shopifyGraphQlService.js:2455), so getOne answered 200 — the matching request is 13:01:47.230885Z GET /api/settings, revision api-00107-wet, latency 5.125315830s, status 200, ending at 13:01:52.356, the exact millisecond of the error. Only 2 [shopifyRetryGraphQL] lines exist in 24h (this 503 and one read ECONNRESET at 09:34:14Z), so this is a one-off upstream blip, not a Shopify outage. The window also contains an unrelated second cause the fingerprint does not cover: 1 request-log 503 on POST /api/gen-ai-suggested/recommendBlogPost at 12:48:27.568464Z, which is P1 (CompletionTruncatedError, finish_reason=error, google/gemini-2.5-flash) — not this alert.

Confidence: `high`

## Code
- `packages/functions/src/helpers/api.js:151` — logger.error fires on every caught attempt, before the retryability check — this is the line that produced the Slack page for a request that returned 200
- `packages/functions/src/helpers/api.js:154` — retryability check; on master it reads e.response?.status (correct), but deployed revision api-00107-wet predates commit c791df167 and still reads e.statusCode, which axios never sets
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES includes 503 — on master this 503 would be retried, leaving the unconditional ERROR log as the only remaining defect
- `packages/functions/src/helpers/api.js:128` — makeGraphQlApi delegates to shopifyRetryGraphQL with maxRetries=5 — frame 2 of the prod stack
- `packages/functions/src/services/shopifyGraphQlService.js:2455` — getShopLocales catches the rethrow and returns [], which is why the endpoint stayed 200 and no user-facing failure sits behind this alert
- `packages/functions/src/controllers/settingsController.js:45` — call site: getShopLocales sits in getOne's Promise.all (index 4 in the prod stack), degrading only aiSummary locales
- `packages/functions/src/helpers/api.js:102` — seoProxyApi's warn-for-expected-upstream-rejection pattern — the same shape shopifyRetryGraphQL should use for non-final attempts

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T13:01:40Z" AND timestamp<="2026-07-31T13:02:10Z" AND jsonPayload.tag="[shopifyRetryGraphQL]"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T13:20:00Z" AND timestamp<="2026-07-31T13:20:00Z" AND jsonPayload.tag="[shopifyRetryGraphQL]"`
- 1 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-31T13:01:40Z" AND timestamp<="2026-07-31T13:02:10Z" AND httpRequest.requestUrl:"/api/settings"`
- 6 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-07-31T12:46:53.745Z" AND timestamp<="2026-07-31T13:16:53.745Z" AND severity>=ERROR`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-07-31T12:46:53.745Z" AND timestamp<="2026-07-31T13:16:53.745Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $0.77
- MR: https://gitlab.com/avada/blogs/-/merge_requests/810

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
