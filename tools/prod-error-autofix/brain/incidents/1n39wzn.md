fingerprint: 1n39wzn
service: api
message: [whatsNew.list] E9mJbY6UvNhRhOPwniPk Error: Falcon whats-new ?appId=blog&limit=50 failed with 500
app: BLOG
repo: blogs
date: 2026-09-23T13:54:48.022Z
status: fix_disabled
attempt: 1

# BLOG · api · 1n39wzn

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint 136b48l (same app, service, endpoint and the same three requests, no fix on master): Falcon Nexus answered HTTP 500 to GET https://falcon.avada.net/api/public/whats-new?appId=blog&limit=50 three times in 13.1s, and because falconRequest throws on any non-ok response with no retry and getFeed has no fail-open path, GET /api/whats-new returned 500 instead of degrading to an empty feed.

**Mechanism.** falconRequest does `if (!response.ok) throw new Error(`Falcon whats-new ${path} failed with ${response.status}`)` (packages/functions/src/services/whatsNew.service.js:32) — the logged message 'Falcon whats-new ?appId=blog&limit=50 failed with 500' is that exact template with response.status=500, so the upstream returned a real HTTP 500 body in 0.42–0.50s, not a transport error or timeout. The throw escapes the single unretried page call in fetchAllEntries (whatsNew.service.js:58, cursor null so only the first page is ever issued), rejects the Promise.all in getFeed (whatsNew.service.js:70 — the stack frame 'async Promise.all (index 0)' is this array's first element) and discards the successful readRepository.getReadIds result, then lands in whatsNew.controller.js:12-14 which logs at severity ERROR and sets ctx.status = 500. All 3 of the 3 GET /api/whats-new 500s in the window carry this stack; the same shop retried at 13:50:29.864916Z and got 200 in 1.096s from the same instance, so the fault was transient — one retry or a fail-open to {entries: [], readIds} would have produced no 500. It was not isolated to Falcon: in the same 3 minutes the api service logged 3× [seoProxyApi] POST /updateOvrList error 500, 2× [getCrmWidgets] status 500 'Internal Error' and 2× [fetchGhConfig] failure, i.e. an Avada-side platform wobble — and of those callers only whatsNew.list turns it into a 500, because fetchGhConfig fails open and whatsNew.markRead already .catch()es the identical falconRequest failure (whatsNew.service.js:89). Secondary: falconRequest passes no timeout/AbortSignal, and one /api/whats-new in the same window took 59.68s to return 200.

Confidence: `high`

## Code
- `packages/functions/src/services/whatsNew.service.js:32` — throw on !response.ok with no retry and no status classification — produces the exact logged message 'Falcon whats-new ?appId=blog&limit=50 failed with 500'
- `packages/functions/src/services/whatsNew.service.js:31` — the fetch has no timeout/AbortSignal — same call path served one 200 at 59.68s in this window
- `packages/functions/src/services/whatsNew.service.js:58` — the single unretried falconRequest page call in fetchAllEntries; stack frame 'async fetchAllEntries' resolves here
- `packages/functions/src/services/whatsNew.service.js:70` — Promise.all in getFeed — 'async Promise.all (index 0)' is this array's first element; the rejection throws away the successful getReadIds result
- `packages/functions/src/services/whatsNew.service.js:89` — markRead already .catch()es the identical falconRequest failure and continues — the read path is the inconsistent one
- `packages/functions/src/controllers/whatsNew.controller.js:13` — ctx.status = 500 — turns a transient upstream changelog-feed outage into a failed admin API request

## Evidence
- 3 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-23T13:45:00Z" AND timestamp<="2026-09-23T14:05:00Z" AND jsonPayload.error.message:"Falcon whats-new"`
- 6 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-23T13:45:00Z" AND timestamp<="2026-09-23T14:05:00Z" AND httpRequest.requestUrl:"whats-new"`
- 8 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-23T13:45:00Z" AND timestamp<="2026-09-23T14:05:00Z" AND (jsonPayload.tag="[seoProxyApi]" OR jsonPayload.tag="[getCrmWidgets]" OR jsonPayload.tag="[fetchGhConfig]")`

## Job
- analyze rounds: 1
- cost: $1.62

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
