fingerprint: 1a9ls8s
service: apigen2
message: HTTP 500 POST /api/dev/optimize/repair-bulk
app: SEO
repo: seo
date: 2026-09-11T17:40:06.214Z
status: fix_disabled
attempt: 1

# SEO · apigen2 · 1a9ls8s

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** POST /api/dev/optimize/repair-bulk returns 500 on every call because repairBulkOptimize calls `ctx.rest(result)` — a Koa helper this app does not have (no middleware anywhere in packages/functions/src defines `ctx.rest`), so the success path throws `TypeError: ctx.rest is not a function` after finalizeBulkOptimize has already run.

**Mechanism.** Route packages/functions/src/routes/api.js:399 maps POST /dev/optimize/repair-bulk to devOptimizeJobController.repairBulkOptimize. At packages/functions/src/controllers/devOptimizeJobController.js:35 the await on finalizeBulkOptimize resolves, then line 36 invokes ctx.rest(result). `ctx.rest` is undefined — grep over packages/functions/src finds exactly one use of `ctx.rest` (this line) and no middleware assigning it; every other controller, including getStatus in the same file (:13), answers with `ctx.body = {success, data}`. The TypeError is caught by the controller's own catch at :37, logged as `[repairBulkOptimize] DDUzxmyqI2ATrTq7GqkV ctx.rest is not a function` (prod stack: /workspace/lib/controllers/devOptimizeJobController.js:43), and re-thrown as ctx.throw(500, e.message) at :39 (prod stack :46), which the error handler emits as `[unhandledError] POST /api/dev/optimize/repair-bulk 500`. The unit test hides it: packages/functions/src/controllers/__tests__/devOptimizeJobController.repair.test.js:19 builds `const ctx = {rest: jest.fn()}`, fabricating the helper prod lacks, so the test asserts the exact call that breaks in prod.

Confidence: `high`

## Code
- `packages/functions/src/controllers/devOptimizeJobController.js:36` — `ctx.rest(result)` — the undefined helper; prod stack frame devOptimizeJobController.js:43 in lib/
- `packages/functions/src/controllers/devOptimizeJobController.js:39` — catch re-throws as ctx.throw(500, e.message), converting the TypeError into the alerted HTTP 500; prod stack frame :46
- `packages/functions/src/controllers/devOptimizeJobController.js:13` — getStatus in the same file uses the real convention `ctx.body = {success: true, data}` — shows ctx.rest is not this app's response helper
- `packages/functions/src/routes/api.js:399` — router.post('/dev/optimize/repair-bulk', devOptimizeJobController.repairBulkOptimize) — ties the alerted path to the throwing controller
- `packages/functions/src/controllers/__tests__/devOptimizeJobController.repair.test.js:19` — `const ctx = {rest: jest.fn()}` fabricates ctx.rest, so the suite is green while prod 500s
- `packages/functions/src/const/jobRegistry.js:108` — job registry wires this endpoint as the STALE-job resume action, so the Job Dock UI is the caller that produced both 500s

## Evidence
- 6 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-09-11T17:22:21Z" AND timestamp<="2026-09-11T17:52:21Z" AND logName:"stderr" AND textPayload:"ctx.rest is not a function"`
- 2 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-09-11T17:22:21Z" AND timestamp<="2026-09-11T17:52:21Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-09-04T00:00:00Z" AND logName:"stderr" AND textPayload:"[repairBulkOptimize]"`
- 2 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-09-11T17:22:21Z" AND timestamp<="2026-09-11T17:52:21Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.75

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
