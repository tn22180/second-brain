fingerprint: 13ufuhv
service: api
message: [fetchHtmlContent] null Error fetching html content FetchError: network timeout at: <https://tameko.dk/blogs/journal/collection-002-by-norm-architects>
app: BLOG
repo: blogs
date: 2026-08-12T14:38:09.727Z
status: mr_open
attempt: 1

# BLOG · api · 13ufuhv

**Outcome.** duplicate of mmxvm4 — MR https://gitlab.com/avada/blogs/-/merge_requests/836

**Root cause.** fetchHtmlContent logs an already-handled, transient merchant-storefront fetch timeout at logger.error (severity ERROR), so the sink pages a human on a condition that fails no request — every /api/articles call carrying these timeouts returned HTTP 200.

**Mechanism.** articleController.list fans out one getSeoAnalysisPage per article in an unbounded Promise.all (articleController.js:733), each calling fetchHtmlContent, which fetches the merchant's public storefront URL with node-fetch and timeout: 8000 (articleController.js:112). When the storefront does not answer inside 8s node-fetch throws FetchError type 'request-timeout' ('network timeout at:' on connect, 'Response timeout ... (over 8000ms)' on body). The catch logs it at logger.error (articleController.js:122) and returns null (articleController.js:137); getSeoAnalysisPage treats null as a normal outcome and returns {fetchFailed: true} (seoService.js:190), so list still answers 200. Proof of the join: GET /api/articles?limit=10 started 2026-08-07T12:15:17.521Z with latency 13.410s → ends 12:15:30.93Z, exactly the tameko.dk 'Response timeout' log at 12:15:30.926Z; GET /api/articles?...page=2 started 12:23:05.856Z with latency 11.484s → ends 12:23:17.34Z, exactly the tonnesen1937.no log at 12:23:17.319Z. Both status 200, and httpRequest.status>=500 matched 0 entries in the whole window. So the user-visible effect is +8s latency, not a failure; the alert itself is log-severity misclassification.

Confidence: `high`

## Code
- `packages/functions/src/controllers/articleController.js:112` — timeout: 8000 on the storefront fetch — the 8000ms in both log messages
- `packages/functions/src/controllers/articleController.js:122` — logger.error for a transient network timeout — this line emits the alert
- `packages/functions/src/controllers/articleController.js:137` — returns null; failure is swallowed, no throw reaches the request
- `packages/functions/src/services/seoService.js:190` — null is a handled outcome (fetchFailed: true), so list still returns 200
- `packages/functions/src/controllers/articleController.js:733` — unbounded Promise.all issuing one storefront fetch per article — drives the burst volume (19 timeouts in a single second on 2026-08-06T18:01:13Z)

## Evidence
- 116 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-06T12:00:00Z" AND timestamp<="2026-08-07T13:00:00Z" AND jsonPayload.tag="[fetchHtmlContent]"`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-07T12:00:28.313Z" AND timestamp<="2026-08-07T12:30:28.313Z" AND jsonPayload.tag="[fetchHtmlContent]"`
- 15 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-07T12:10:00Z" AND timestamp<="2026-08-07T12:25:00Z" AND httpRequest.requestUrl:"/api/articles"`

## Job
- analyze rounds: 2
- cost: $2.44
- MR: https://gitlab.com/avada/blogs/-/merge_requests/836

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
