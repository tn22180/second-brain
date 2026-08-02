fingerprint: 1xqxz29
service: apiv2
message: HTTP 500 POST /apiv2/apiV2/langgraph/blog
app: BLOG
repo: blogs
date: 2026-08-01T13:32:33.917Z
status: mr_open
attempt: 2

# BLOG · apiv2 · 1xqxz29

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/815

**Root cause.** Every apiv2 500 on POST /apiv2/apiV2/langgraph/blog is an unhandled promise rejection from `avada-feature-request`'s EventLogService constructor: it stores an un-awaited Firestore query in `this.appGidPromise`, and because `logEvent` throws in `validateEvent` first (`shopName must be a non-empty string`, since eventLogService.js passes `shop.shopName` which this repo never sets — the field is `shop.name`), nothing ever consumes `appGidPromise`, so its cold-instance `16 UNAUTHENTICATED` rejection reaches the GCF runtime, which answers the in-flight request with 500.

**Mechanism.** langGraphController.generate line 51 fires `void logCreateBlogByGenAIEvent(shop)`. That calls logEvent (eventLogService.js:36-39), which calls getEventLogger() → createEventLogService() (line 13). The library constructor (node_modules/avada-feature-request/dist/event-analytics/index.js: `this.appGidPromise=this.fetchAppGid(e.appId)`) fires a Firestore `apps` collection query and stores the promise on the instance; nothing awaits it. The payload built at eventLogService.js:65-71 sets `shopName: shop.shopName`, a field this repo never writes (elsewhere the field is `shop.name`, e.g. subscribeExportSelectedArticles.js:66), so the library's `validateEvent` throws synchronously inside `logEvent` before `formatEvent` — which is the only place that would have awaited `appGidPromise`. The library catches its own throw and prints `Failed to log event for domain <domain>: Error: shopName must be a non-empty string`, then returns. On a cold instance the Firestore credential is not yet available, `appGidPromise` rejects with `16 UNAUTHENTICATED`, no handler is attached, and the GCF Node runtime's unhandledRejection hook terminates the currently-executing request with HTTP 500. The `.catch` at eventLogService.js:39 and the try/catch at lines 12-22 only cover the logEvent chain and a synchronous constructor throw — neither can reach `appGidPromise`. Tie to this alert: on 2026-08-01 apiv2 returned exactly 2 HTTP 500s, both on this endpoint, and each has a `16 UNAUTHENTICATED` stderr entry in the SAME spanId, logged less than 1 ms before the response ended — 13:23:10.883875 + 1.059438893s = 13:23:11.943 vs UNAUTHENTICATED at 13:23:11.942425 (spanId 0xeff199184deb53e0 = 17289768774117577696), and 04:36:25.374550 + 1.145010233s = 04:36:26.520 vs UNAUTHENTICATED at 04:36:26.518913 (spanId 0x73e05249c2c32db6 = 8349764185898560950). Both stacks end at `at getEventLogger (/workspace/lib/services/eventLogService.js:19:61)` / `at /workspace/lib/services/eventLogService.js:43:29`, which is the deployed babel output of src lines 13 and 38.

Confidence: `high`

## Code
- `packages/functions/src/controllers/langGraphController.js:51` — `if (isProduction) void logCreateBlogByGenAIEvent(shop)` — the only call into eventLogService on this endpoint; it is the pre-stream section, the only place a 500 can originate since ctx.status is set to 200 at line 88
- `packages/functions/src/services/eventLogService.js:13` — `createEventLogService({...})` — the constructor that fires the un-awaited `this.appGidPromise = this.fetchAppGid(appId)` Firestore query; deployed as lib/services/eventLogService.js:19:61, the frame named in the UNAUTHENTICATED stack
- `packages/functions/src/services/eventLogService.js:39` — `.catch(e => logger.warn(...))` covers only the logEvent chain; the constructor's `appGidPromise` is a separate, unheld promise, so its rejection stays unhandled — deployed as lib/services/eventLogService.js:43
- `packages/functions/src/services/eventLogService.js:70` — `shopName: shop.shopName` — always undefined, so `validateEvent` throws before `formatEvent` awaits `appGidPromise`; this is what leaves the rejection unhandled
- `packages/functions/src/handlers/pubsub/subscribeExportSelectedArticles.js:66` — `shopName: shop.name` — the same value read from the correct field elsewhere in this repo, showing `shop.shopName` is the wrong field name
- `packages/functions/src/services/__tests__/eventLogService.unhandledRejection.test.js:74` — existing suite already mocks `shopName must be a non-empty string`; it asserts the caller does not reject but never asserts the constructor's promise is held, which is why the bug survived the previous fix

## Evidence
- 2 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-01T14:00:00Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-01T14:00:00Z" AND logName:"stderr" AND textPayload:"16 UNAUTHENTICATED"`
- 4 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-01T14:00:00Z" AND logName:"stderr" AND textPayload:"shopName must be a non-empty string"`
- 4 matching entries: `(resource.labels.service_name="apiv2") AND timestamp>="2026-08-01T04:36:20Z" AND timestamp<="2026-08-01T04:36:30Z" AND logName:"stderr"`

## Job
- analyze rounds: 2
- cost: $3.68
- branch: `fix/prod-blog-1xqxz29-a2`
- fix commit: `99db32153c22403ad40d886c7e9b37808674dca5`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/815
- tests: 256 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
.../eventLogService.unhandledRejection.test.js     | 41 ++++++++++++++++++++++
 packages/functions/src/services/eventLogService.js | 17 ++++++---
 2 files changed, 53 insertions(+), 5 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
