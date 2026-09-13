fingerprint: yfww8s
service: apisagen2
message: HTTP 500 POST /apiSa/dev/optimize/repair-bulk
app: SEO
repo: seo
date: 2026-09-13T07:11:59.147Z
status: fix_disabled
attempt: 1

# SEO · apisagen2 · yfww8s

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** POST /apiSa/dev/optimize/repair-bulk returns 500 on every call because repairBulkOptimize calls `ctx.rest(result)`, and this Koa app has no `ctx.rest` helper — the TypeError is caught by its own catch and re-thrown as ctx.throw(500).

**Mechanism.** routes/api.js:399 registers POST /dev/optimize/repair-bulk -> devOptimizeJobController.repairBulkOptimize; handlers/apiSa.js:10 mounts that same router, so the route is reachable under /apiSa too. At devOptimizeJobController.js:36 the handler answers with `ctx.rest(result)`. `ctx.rest` is not defined anywhere in this codebase — packages/functions/CLAUDE.md states plainly 'there is no ctx.rest() helper', the convention is `return (ctx.body = {success, data})`. So after finalizeBulkOptimize resolves, the property access throws `TypeError: ctx.rest is not a function`, the catch at :37 logs '[repairBulkOptimize] rpNcSgwRkmRwTrS6LVxd ctx.rest is not a function TypeError: ctx.rest is not a function' (prod stack /workspace/lib/controllers/devOptimizeJobController.js:43, babel-shifted from src:36) and calls ctx.throw(500, e.message) at :39, producing '[unhandledError] POST /apiSa/dev/optimize/repair-bulk 500 ctx.rest is not a function' (prod stack lib:46 = src:39) and the alerted httpRequest 500 at 0.080s latency. The 80ms latency proves finalizeBulkOptimize succeeded — the failure is purely in writing the response, so the repair actually ran and the merchant is told it failed.

Confidence: `high`

## Code
- `packages/functions/src/controllers/devOptimizeJobController.js:36` — ctx.rest(result) — the undefined helper; prod stack lib:43 maps here
- `packages/functions/src/controllers/devOptimizeJobController.js:39` — catch rethrows as ctx.throw(500, e.message); prod stack lib:46 maps here
- `packages/functions/src/controllers/devOptimizeJobController.js:13` — sibling getStatus in the same file uses the correct ctx.body = {success, data} convention
- `packages/functions/src/routes/api.js:399` — route registration for POST /dev/optimize/repair-bulk
- `packages/functions/src/handlers/apiSa.js:10` — apiSa mounts routes/api, so the same defect is reachable on both /api and /apiSa

## Evidence
- 3 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-09-13T06:55:31.417Z" AND timestamp<="2026-09-13T07:25:31.417Z" AND logName:"stderr" AND textPayload:"ctx.rest is not a function"`
- 1 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-09-13T06:55:31.417Z" AND timestamp<="2026-09-13T07:25:31.417Z" AND httpRequest.status>=500`
- 1 matching entries: `resource.labels.project_id="avada-seo" AND timestamp>="2026-09-11T00:00:00Z" AND logName:"stderr" AND textPayload:"[repairBulkOptimize]" AND textPayload:"ctx.rest"`

## Job
- analyze rounds: 1
- cost: $1.40

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
