fingerprint: 1xqxz29
service: apiv2
message: HTTP 500 POST /apiv2/apiV2/langgraph/blog
app: BLOG
repo: blogs
date: 2026-07-30T11:17:05.102Z
status: inconclusive
attempt: 1

# BLOG · apiv2 · 1xqxz29

**Outcome.** smoke gate no_baseline

**Root cause.** The fire-and-forget analytics call `void logCreateBlogByGenAIEvent(shop)` in langGraphController.generate creates a detached, never-caught promise inside avada-feature-request's `createEventLogService` constructor (`fetchAppGid` → Firestore Query.get); on a cold instance that query rejects with `16 UNAUTHENTICATED` and the unhandled rejection terminates the in-flight POST /apiV2/langgraph/blog request as a 500.

**Mechanism.** generate() at packages/functions/src/controllers/langGraphController.js:51 calls logCreateBlogByGenAIEvent(shop) with `void` — no await, no .catch(). That reaches getEventLogger() (packages/functions/src/services/eventLogService.js:5-15), which on first use per process calls createEventLogService (eventLogService.js:7). The library constructor kicks off an unawaited Firestore query (`at s.fetchAppGid ... at new s ... at exports.createEventLogService ... at getEventLogger (/workspace/lib/services/eventLogService.js:11:61) at generate (/workspace/lib/controllers/langGraphController.js:70:73)`). On a freshly started instance the credential fetch fails: `Error: 16 UNAUTHENTICATED: Request had invalid authentication credentials` through google-gax/grpc (pattern P6). Because that promise is detached from the request chain, nothing handles the rejection and the request dies with 500 instead of continuing. Timing is exact, not approximate: request start 2026-07-30T11:02:42.013150Z + latency 1.169663609s = 11:02:43.1828, and the UNAUTHENTICATED stderr line is stamped 11:02:43.182597Z, in the same span (request spanId 096e0f40254b86cf = decimal 679497361957553871 = the stderr spanId, execution_id 7emwkuui4m9i). The same alignment holds for all four 500s of the day: 05:25:19.230899+1.262685821 → 05:25:20.493211; 07:42:59.019904+1.099166271 → 07:43:00.119734; 08:53:59.924345+1.318315757 → 08:54:01.241889. Four 500s, four UNAUTHENTICATED lines, one-to-one. A second, harmless defect rides the same call: `shopName: shop.shopName` (eventLogService.js:54) is undefined for shop bolacarbon.com, so the library logs `shopName must be a non-empty string` (8 in the same period); that one is caught inside the library and does not fail the request. The retry 2.2s later on the replacement instance (execution_id 7emyxmzfyl0g) produced only the shopName line and no 500, confirming the UNAUTHENTICATED — not the validation error — is what kills the request.

Confidence: `high`

## Code
- `packages/functions/src/controllers/langGraphController.js:51` — `if (isProduction) void logCreateBlogByGenAIEvent(shop);` — fire-and-forget with no .catch(); the only pre-stream call that can produce a detached rejection, and the frame named in every stack (`at generate (/workspace/lib/controllers/langGraphController.js:70:73)`).
- `packages/functions/src/services/eventLogService.js:7` — `eventLogger = createEventLogService({...})` — the constructor synchronously starts an unawaited Firestore query (fetchAppGid) whose rejection has no handler; stack frame `at getEventLogger (/workspace/lib/services/eventLogService.js:11:61)`.
- `packages/functions/src/services/eventLogService.js:54` — `shopName: shop.shopName` — undefined for bolacarbon.com, source of the 8 `shopName must be a non-empty string` lines (secondary, non-fatal).
- `packages/functions/src/controllers/langGraphController.js:88` — `ctx.status = 200` before SSE — proves a 500 on this endpoint can only originate above it, i.e. lines 41-88, which contains the line-51 call.

## Evidence
- 4 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-07-30T00:00:00Z" AND timestamp<="2026-07-30T11:17:45Z" AND httpRequest.status>=500`
- 4 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-07-30T00:00:00Z" AND timestamp<="2026-07-30T11:17:45Z" AND logName:"stderr" AND textPayload:"16 UNAUTHENTICATED"`
- 8 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-07-30T00:00:00Z" AND timestamp<="2026-07-30T11:17:45Z" AND logName:"stderr" AND textPayload:"shopName must be a non-empty string"`

## Job
- analyze rounds: 2
- cost: $4.43
- tests: jest did not run · baseline 0 failing · reproduce check did not pass

```
.../src/controllers/langGraphController.js         |  6 ++-
 packages/functions/src/index.js                    |  8 +++
 packages/functions/src/services/eventLogService.js | 63 ++++++++++------------
 3 files changed, 40 insertions(+), 37 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
