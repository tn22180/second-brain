fingerprint: 1efiw8j
service: apisav2
message: HTTP 500 POST /apisav2/apiSaV2/langgraph/blog
app: BLOG
repo: blogs
date: 2026-08-01T22:44:36.561Z
status: inconclusive
attempt: 1

# BLOG · apisav2 · 1efiw8j

**Outcome.** fix blocked at no_changes

**Root cause.** The un-awaited Firestore query (fetchAppGid) fired inside avada-feature-request's createEventLogService() constructor rejected with 16 UNAUTHENTICATED on a cold apisav2 instance, and because prod (master) has no process-level unhandledRejection listener, that untethered rejection aborted the in-flight POST /apiSaV2/langgraph/blog with a 500 before the SSE stream opened.

**Mechanism.** POST /apisav2/apiSaV2/langgraph/blog starts 2026-08-01T22:38:30.998520Z, span 2c9514af2a053f59, latency 0.473643180s → ends 22:38:31.4722Z. The instance had just opened its Redis socket at 22:38:30.694861Z ('[redis.service] connected 10.68.191.235'), i.e. cold. Route packages/functions/src/routes/api.js:273 → langGraphController.generate; shop loads at langGraphController.js:43, then line 51 runs `if (isProduction) void logCreateBlogByGenAIEvent(shop)`. That reaches eventLogService.js:13 createEventLogService(), whose constructor calls fetchAppGid() → Firestore Query.get() and returns synchronously; nothing holds that promise (stack: `at s.fetchAppGid → new s → exports.createEventLogService → getEventLogger (/workspace/lib/services/eventLogService.js:19:61) → /workspace/lib/services/eventLogService.js:43:29`). At 22:38:31.405346Z the library swallows its own 'shopName must be a non-empty string' validation failure for clayproductsshop.com (shop doc has no shopName — noise, not the 500). Then at 22:38:31.471863Z — the request's exact computed end, and in the SAME span (stderr spanId 3212496651755536217 == 0x2c9514af2a053f59) — the untethered fetchAppGid promise rejects with 16 UNAUTHENTICATED through google-gax/grpc. Prod master has neither guard: `git ls-tree master packages/functions/src/helpers/unhandledRejectionHandler.js` is empty and master's src/index.js has no process.on('unhandledRejection'), so the functions-framework kills the live request → HTTP 500, responseSize 237, and no handler-side log (generate() writes no error, the SSE headers/ctx.status=200 at langGraphController.js:88 were never reached). Fleet-wide the same defect owns 6 of 6 fetchAppGid rejections in 24h and every langgraph/blog 500: 5 on apiv2 (each fetchAppGid landing at request-start+latency, e.g. 21:28:56.219790 + 1.210999s = 21:28:57.4308 vs rejection at 21:28:57.429085) and this 1 on apisav2, which was apisav2's only 500 in the whole day. Fix commit 4b0d7ec06 exists on fix/prod-blog-1xqxz29-a2 (MR 815) but is NOT an ancestor of master — unmerged, undeployed.

Confidence: `high`

## Code
- `packages/functions/src/controllers/langGraphController.js:51` — `if (isProduction) void logCreateBlogByGenAIEvent(shop)` — the pre-stream call that triggers the constructor; runs before ctx.status=200, so its failure can still be a 500
- `packages/functions/src/services/eventLogService.js:13` — createEventLogService() — its constructor fires the un-awaited fetchAppGid Firestore query that rejects 16 UNAUTHENTICATED on cold instances
- `packages/functions/src/services/eventLogService.js:6` — the in-repo comment stating this exact defect: the internal promise cannot be attached to, only the caller side was guarded
- `packages/functions/src/index.js:5` — process.on('unhandledRejection', handleUnhandledRejection) — present only on this branch (commit 4b0d7ec06); absent from master, so prod still lets the rejection kill the request
- `packages/functions/src/routes/api.js:273` — router.post('/langgraph/blog', langGraphController.generate) — the alerted endpoint, mounted under '/apiSaV2' by handlers/apiSaV2.js:26
- `packages/functions/src/helpers/unhandledRejectionHandler.js:8` — logger.error('[unhandledRejection]', reason) — the log line that would have appeared instead of the 500; file does not exist on master

## Evidence
- 1 matching entries: `(resource.labels.service_name="apisav2") AND timestamp>="2026-08-01T22:23:45Z" AND timestamp<="2026-08-01T22:53:45Z" AND textPayload:"fetchAppGid"`
- 1 matching entries: `(resource.labels.service_name="apisav2") AND timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-02T00:00:00Z" AND httpRequest.status>=500`
- 6 matching entries: `timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-02T00:00:00Z" AND textPayload:"fetchAppGid"`
- 5 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-02T00:00:00Z" AND httpRequest.status>=500`
- 4 matching entries: `(resource.labels.service_name="apisav2") AND timestamp>="2026-08-01T22:23:45Z" AND timestamp<="2026-08-01T22:53:45Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $2.39

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
