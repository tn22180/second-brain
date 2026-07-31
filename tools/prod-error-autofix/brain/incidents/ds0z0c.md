fingerprint: ds0z0c
service: api
message: HTTP 500 PUT /api/article/568321507371
app: BLOG
repo: blogs
date: 2026-07-31T09:17:20.233Z
status: mr_open
attempt: 1

# BLOG · api · ds0z0c

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/806

**Root cause.** getEventLogger() lazily calls createEventLogService() inside the request, and that constructor fires an un-awaited Firestore Query.get() (fetchAppGid) whose promise nothing holds; on a cold instance that query rejects with `16 UNAUTHENTICATED`, and the untethered rejection terminates the in-flight PUT /api/article/568321507371 with a 500 that never reaches update()'s catch or the Koa errorHandler.

**Mechanism.** PUT /api/article/568321507371 (span 55117bf7682c5975, latency 1.378080211s from 08:17:30.874517Z → ends 08:17:32.2526Z). update() reaches packages/functions/src/controllers/articleController.js:550 `jobs.push(logPublishBlogEvent(shop))`. logPublishBlogEvent (eventLogService.js:33-38) calls getEventLogger(); this instance is cold, so eventLogService.js:7 runs createEventLogService(), whose constructor calls `fetchAppGid()` → `Query.get()` on Firestore. The constructor returns synchronously and logPublishBlogEvent returns only the `logEvent()` promise, so nobody holds the fetchAppGid promise. logEvent() itself resolves at 08:17:32.134657Z (same span — the library swallows its own `shopName must be a non-empty string` validation error). 123ms later, at 08:17:32.257786Z — 5.2ms after the request's computed end and in the SAME span (spanId 6129816870362831221 == 0x55117bf7682c5975, the request's spanId) — the fetchAppGid query rejects with `16 UNAUTHENTICATED` through google-gax/grpc, stack `Caused by: at s.fetchAppGid → new s → exports.createEventLogService → getEventLogger (lib/services/eventLogService.js:11) → logPublishBlogEvent → update (lib/controllers/articleController.js:575)`. Because the rejection is untethered, the functions-framework aborts the live request with 500: articleController.js:614 `logger.error('[update]', …)` never fired and errorHandler.js:17 `[unhandledError]` never fired — the errors read for the window contains 10 entries (5 httpRequest 500s, 4 genSuggested JSON.parse, 1 getRedirectTracer) and zero of either tag. The same rejection appears 3 more times in the window prefixed `Exception from a finished function:` (08:12:13.897, 08:19:53.829, 08:20:20.717) — identical fault landing after the response was already sent, therefore harmless. This one landed in-flight. Trigger is P6 (cold-instance Firestore credential fetch; revision api-00105-mol had just rolled out — the 08:14:38 request still ran on api-00104-gib), but the defect that converts it into a 500 is the untethered constructor promise. The four gen-ai-suggested 500s in the same window are a separate, unrelated cause (P1, JSON.parse of truncated completions).

Confidence: `high`

## Code
- `packages/functions/src/services/eventLogService.js:7` — createEventLogService() is invoked lazily on first use inside a request; its constructor starts fetchAppGid()'s Firestore query and no caller ever holds that promise
- `packages/functions/src/services/eventLogService.js:34` — logPublishBlogEvent returns only getEventLogger().logEvent(...) — the constructor's fetchAppGid promise is not part of the returned chain, so update()'s await cannot observe its rejection
- `packages/functions/src/controllers/articleController.js:550` — the call site named in the prod stack (`at update (lib/controllers/articleController.js:575)`): jobs.push(logPublishBlogEvent(shop)) — reached only when payload.isPublished, matching the logPublishBlogEvent entry in the same span
- `packages/functions/src/controllers/articleController.js:614` — the catch that logs '[update]' and returns 200 {success:false}; it produced zero entries in the window, proving the rejection escaped update() rather than being caught by it
- `packages/functions/src/middleware/errorHandler.js:17` — the Koa catch-all that would log '[unhandledError]' on any 5xx; zero entries in the window, proving the 500 was produced by the runtime, not by Koa

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-31T08:02:34.140Z" AND timestamp<="2026-07-31T08:32:34.140Z" AND httpRequest.status=500 AND httpRequest.requestMethod="PUT"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-31T08:02:34.140Z" AND timestamp<="2026-07-31T08:32:34.140Z" AND textPayload:"fetchAppGid"`
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-31T08:02:34.140Z" AND timestamp<="2026-07-31T08:32:34.140Z" AND spanId="6129816870362831221"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-31T08:02:34.140Z" AND timestamp<="2026-07-31T08:32:34.140Z" AND textPayload:"16 UNAUTHENTICATED"`
- 29 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-31T08:02:34.140Z" AND timestamp<="2026-07-31T08:32:34.140Z" AND textPayload:"shopName must be a non-empty string"`

## Job
- analyze rounds: 2
- cost: $5.30
- branch: `fix/prod-blog-ds0z0c`
- fix commit: `4b0d7ec06d173c4d89c87eda6f362b6ee27d793b`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/806
- tests: 237 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
packages/functions/src/index.js                    |  3 +++
 packages/functions/src/services/eventLogService.js | 28 +++++++++++++++++-----
 2 files changed, 25 insertions(+), 6 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
