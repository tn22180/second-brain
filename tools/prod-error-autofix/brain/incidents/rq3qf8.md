fingerprint: rq3qf8
service: api
message: [shopifyRetryGraphQL] AxiosError: Request failed with status code 503
app: BLOG
repo: blogs
date: 2026-07-31T14:13:59.540Z
status: mr_open
attempt: 1

# BLOG · api · rq3qf8

**Outcome.** duplicate of 1w64e0z — MR https://gitlab.com/avada/blogs/-/merge_requests/810

**Root cause.** Shopify Admin GraphQL answered one transient HTTP 503 to shop FqpPuSM3XKz0LLkZXe24's shopLocales query, and shopifyRetryGraphQL logs every caught failure at logger.error before it decides retryability — so a failure that never reached the user (the /api/settings request finished 200) was emitted at severity ERROR and paged; the deployed revision api-00107-wet was built 6 minutes before the retry-classifier fix landed on master, so it also did not retry.

**Mechanism.** settingsController.getOne puts getShopLocales into a Promise.all (settingsController.js:45). getShopLocales → makeGraphQlApi (helpers/api.js:126) → shopifyRetryGraphQL (helpers/api.js:147). Shopify returned 503 to the POST /admin/api/*/graphql.json; axios rejected with an AxiosError carrying response.status=503. shopifyRetryGraphQL's catch runs logger.error('[shopifyRetryGraphQL]', e) unconditionally at helpers/api.js:151 — before any retryability check — and the structured logger stamps severity=ERROR, which the prod-error-alerts sink (severity>=ERROR) forwards to Slack. The deployed code in revision api-00107-wet (created 2026-07-31T10:27:47Z) is the pre-fix classifier `[502,503,520].includes(e.statusCode)`; axios never sets e.statusCode, so isRetryError was false and it rethrew immediately: the two ERROR lines are 518µs apart (13:01:52.356410Z and .356928Z) and only one [shopifyRetryGraphQL] line exists for that request, i.e. zero retries against maxRetries=5. Master already carries the classifier fix (c791df167, merged 2026-07-31T10:33:57Z, 6m21s after the revision was built — hence prod is still on the old shape), and helpers/api.js:145 now lists 503 in RETRYABLE_STATUSES. What master does NOT fix is the log level: line 151 still fires at ERROR on every attempt, so once this deploys, each retried-and-recovered 503 will still page. User impact is nil in either case — getShopLocales catches and returns [] (shopifyGraphQlService.js:2455), so getOne answered 200; the matching request is 13:01:47.230885Z /api/settings, latency 5.125s, status 200, which ends at 13:01:52.356 — the exact millisecond of the error. Only 2 [shopifyRetryGraphQL] lines exist in 24h (this 503 and one read ECONNRESET at 09:34:14Z), so this is a one-off upstream blip, not a Shopify outage.

Confidence: `high`

## Code
- `packages/functions/src/helpers/api.js:151` — logger.error fires on every caught attempt, before the retryability check — this is the line that produced the Slack page for a request that returned 200
- `packages/functions/src/helpers/api.js:154` — retryability check; on master it reads e.response?.status (correct), but the deployed revision predates this commit and still reads e.statusCode, which axios never sets
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES includes 503 — on master this 503 would have been retried, so the ERROR log is the only remaining defect
- `packages/functions/src/services/shopifyGraphQlService.js:2455` — getShopLocales swallows the rethrow and returns [], which is why the endpoint stayed 200 and the alert has no user-facing failure behind it
- `packages/functions/src/controllers/settingsController.js:45` — call site: getShopLocales sits in getOne's Promise.all (Promise.all index 4 in the prod stack), degrading only aiSummary locales
- `packages/functions/src/helpers/api.js:103` — seoProxyApi's warn-for-expected-upstream-rejection pattern shipped 2026-07-31 (48ad0ba57) — the same shape shopifyRetryGraphQL should use

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T13:00:00Z" AND timestamp<="2026-07-31T13:20:00Z" AND jsonPayload.tag="[shopifyRetryGraphQL]"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T12:46:53.676Z" AND timestamp<="2026-07-31T13:16:53.676Z" AND jsonPayload.tag="[getShopLocales]"`
- 30 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T12:46:00Z" AND timestamp<="2026-07-31T13:20:00Z" AND httpRequest.requestUrl:"/api/settings"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T12:46:53.676Z" AND timestamp<="2026-07-31T13:16:53.676Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.09
- MR: https://gitlab.com/avada/blogs/-/merge_requests/810

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
