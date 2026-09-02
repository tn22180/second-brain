fingerprint: a2sfer
service: api
message: HTTP 504 GET /api/recentBlogs
app: BLOG
repo: blogs
date: 2026-09-01T19:53:42.120Z
status: infra
attempt: 1

# BLOG · api · a2sfer

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: one warm api container (instance 00a41e8c1d37609ee7bc…6591570d, revision api-00163-mox) stopped completing any request, so all 12 requests Cloud Run routed to it — the alerted GET /api/recentBlogs included — hit the function's own timeoutSeconds: 540 and returned 504; it is the same wedged instance already recorded for this app on 2026-09-01 (1sob2ko / 11ovwfj / 1904bct family), still wedged an hour later.

**Mechanism.** All 12 httpRequest.status>=500 entries in the 19:25:41–19:55:41Z window carry latency exactly 540.000xxx s and instanceId 00a41e8c1d37609ee7bc…6591570d on revision api-00163-mox, and every one is a Cloud Run platform message 'The request has been terminated because it has reached the maximum request timeout', not an application error. 540 s is the api function's declared limit (packages/functions/src/functions/http.js:30), so the requests were never answered by app code at all — they sat until the platform cut them. The alerted GET /api/recentBlogs?excludeId=566611542207&limit=4 (ended 19:31:34.615Z, started ~19:22:34Z) is one of six requests that entered that instance in the same second and all timed out together, spread over 10 unrelated endpoints (/api/articles, /api/settings, /api/tags, /api/options, /api/components, /api/element-settings, /api/article/:id, /api/blockLoader, /api/competitors, /api/track-event) — a per-endpoint code defect cannot produce that. The handler articleController.getRecentBlogsWithLimit logs any failure at logger.error (packages/functions/src/controllers/articleController.js:1104) and this app's logger emits severity, so a handler-level fault would have appeared in the errors read; the wedged instance emitted zero application log lines in the whole 30-minute window. Meanwhile two other api instances (…6d69910361, …f9470ca6f5) served normally throughout, producing all 61 stderr lines and one unrelated getShopifyArticleById 'Article not found'.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 — matches the 540.000s latency on all 12 504s to the millisecond, identifying which limit fired
- `packages/functions/src/functions/http.js:32` — concurrency: 10 — one wedged container holds up to 10 unrelated in-flight requests, which is why 10 different endpoints failed together
- `packages/functions/src/routes/api.js:105` — the alerted route GET /api/recentBlogs → articleController.getRecentBlogsWithLimit
- `packages/functions/src/controllers/articleController.js:1104` — handler's own catch logs at logger.error; nothing from this instance reached the errors read, so the handler never got to fail

## Evidence
- 12 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-01T19:25:41.762Z" AND timestamp<="2026-09-01T19:55:41.762Z" AND httpRequest.status=504`
- 13 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-01T19:25:41.762Z" AND timestamp<="2026-09-01T19:55:41.762Z" AND severity>=ERROR`
- 61 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-01T19:25:41.762Z" AND timestamp<="2026-09-01T19:55:41.762Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.39

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
