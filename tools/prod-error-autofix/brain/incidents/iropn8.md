fingerprint: iropn8
service: api
message: [seoProxyApi] <http://gianbighand-swadle.myshopify.com|gianbighand-swadle.myshopify.com> POST /updateOvrList error undefined socket hang up
app: BLOG
repo: blogs
date: 2026-08-12T06:41:36.842Z
status: mr_open
attempt: 1

# BLOG · api · iropn8

**Outcome.** duplicate of q012sa — MR https://gitlab.com/avada/blogs/-/merge_requests/803

**Root cause.** seoProxyApi's catch classifies severity solely from `e.response?.status`, so a transport-level failure (axios 'socket hang up', no HTTP response) falls through the 4xx guard into logger.error and pages the severity>=ERROR sink, even though the call is a fire-and-forget arm of a Promise.all and no request failed.

**Mechanism.** articleController.update fires seoProxyApi({url: '/updateOvrList', method: 'POST'}) as one arm of a Promise.all (articleController.js:584; genAIBlogService.js:188 is the second call site with identical shape). The POST goes through `const client = axios.create()` (api.js:9) — no agent passed, so Node 22 uses https.globalAgent with keepAlive:true and pooled TLS sockets to seo.apps.avada.io are reused. At 2026-08-05T07:25:08.512337Z one pooled socket was closed by the remote before the response, and axios raised `Error: socket hang up` with no `.response`. At api.js:99 `status` is therefore `undefined` — that literal `undefined` is the token in the alert text between 'error' and 'socket hang up'. The 4xx guard at api.js:100 evaluates `undefined >= 400` → false, so control reaches logger.error at api.js:104, which emits severity=ERROR (BLOG is the only app whose logger sets severity) and the sink pages. The catch has no rethrow and no return value, so the promise resolves undefined, Promise.all completes, and the article write succeeded: the `requests` read (httpRequest.status>=500) over the 30-minute window returned 0 entries, and a re-query at status>=400 also returned 0 — nothing user-facing failed. This is the transport half of the same defect recorded as q012sa/15ca22n: MR 803's 4xx→warn downgrade is on disk here (api.js:100-102) and is working in prod (2 'rejected 403' warn lines in 24h), but a socket-level error still has no branch. The repo already carries the correct pattern for exactly this class one directory over: redis.service.js:30 defines TRANSIENT_CODES = ECONNRESET/EPIPE/ETIMEDOUT/ECONNREFUSED and redis.service.js:46 logs them at warn, escalating to error only on sustained failure.

Confidence: `high`

## Code
- `packages/functions/src/helpers/api.js:99` — `const status = e.response?.status` — undefined for a socket-level error; this is the `undefined` printed in the alert
- `packages/functions/src/helpers/api.js:100` — the only non-error branch is the 4xx guard, which a transport error can never satisfy (`undefined >= 400` is false)
- `packages/functions/src/helpers/api.js:104` — logger.error emits severity=ERROR — the exact line that produced this alert message
- `packages/functions/src/helpers/api.js:9` — axios.create() with no agent → Node 22 https.globalAgent keepAlive:true, so idle pooled TLS sockets are reused and can be closed mid-flight ('socket hang up')
- `packages/functions/src/controllers/articleController.js:584` — call site: fire-and-forget arm of Promise.all; the swallowed error does not fail the PUT, so the alert has no user-facing counterpart
- `packages/functions/src/services/genAIBlogService.js:188` — second call site, same fire-and-forget /updateOvrList shape — a fix must live in the helper, not the caller
- `packages/functions/src/services/redis.service.js:30` — in-repo precedent: TRANSIENT_CODES set naming the exact socket error classes to treat as transient
- `packages/functions/src/services/redis.service.js:46` — the warn-then-escalate handler seoProxyApi should mirror
- `packages/functions/src/helpers/__tests__/seoProxyApi.severity.test.js:30` — existing severity regression suite covers only the 403 case; the transport case is the untested gap

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-05T07:10:10.420Z" AND timestamp<="2026-08-05T07:40:10.420Z" AND jsonPayload.tag="[seoProxyApi]"`
- 5 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-04T07:25:08Z" AND timestamp<="2026-08-05T07:55:08Z" AND jsonPayload.tag="[seoProxyApi]"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-04T07:25:08Z" AND timestamp<="2026-08-05T07:55:08Z" AND jsonPayload.tag="[seoProxyApi]" AND jsonPayload.message:"rejected"`
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-05T07:10:10.420Z" AND timestamp<="2026-08-05T07:40:10.420Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.07
- MR: https://gitlab.com/avada/blogs/-/merge_requests/803

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
