fingerprint: i9jsmj
service: apisagen2
message: HTTP 500 GET /apiSa/dev
app: SEO
repo: seo
date: 2026-08-14T02:45:53.230Z
status: mr_open
attempt: 2

# SEO · apisagen2 · i9jsmj

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2196

**Root cause.** packages/functions/src/controllers/devController.js calls `resolveBrokenLinks(ctx, shop)` in the `resolve_broken_links` case but never imports it from redirectController, so every GET /apiSa/dev?x=resolve_broken_links throws ReferenceError; a second, unrelated cause shares this fingerprint — GET /apiSa/dev?x=worker_test_echo fails with Pub/Sub `5 NOT_FOUND: Resource not found (resource=testEcho)`.

**Mechanism.** testOnly(ctx) is the single handler behind GET /apiSa/dev and switches on ctx.query.x. (1) 8 of the 12 500s in the window carry x=resolve_broken_links. The case body at packages/functions/src/controllers/devController.js:1245 is `await resolveBrokenLinks(ctx, shop);`, but grep over the whole file finds no import naming redirectController — the only other occurrence of the identifier in the repo is its definition, `export async function resolveBrokenLinks(ctx, shop)` at packages/functions/src/controllers/redirectController.js:765. Babel emits a bare identifier read, so V8 throws `ReferenceError: resolveBrokenLinks is not defined` at the call site; the prod stack confirms it lands inside the switch — `at /workspace/lib/controllers/devController.js:1267:9 … at async testOnly (/workspace/lib/controllers/devController.js:144:14)` — with no redirectController/service frame beneath it, i.e. the function was never entered. errorHandler logged `[unhandledError] GET /apiSa/dev 500 resolveBrokenLinks is not defined` plus `[apiSa] cu0A44KcTqmjRb6j2t0O resolveBrokenLinks is not defined` and returned 500 in 0.07–0.14s. This is the same defect family as fingerprint i9jsmj attempt 1 (`appConfig is not defined`) and xg7e5b (`shopifyConfig` undefined) — devController.js accumulates call sites whose imports were dropped. (2) The remaining 4 500s carry x=worker_test_echo and a different message entirely: `Error: 5 NOT_FOUND: Resource not found (resource=testEcho)` thrown from @google-cloud/pubsub's grpc client. That case at devController.js:884-892 calls `dispatchWork('testEcho', …, shop)`; `testEcho` is in MIGRATED_TOPICS (packages/functions/src/helpers/worker/dispatchWork.js:48) and in worker.config.yml:51, so when a gate fails (shop's workerJobs[] lacks testEcho, or the fleet is unhealthy) dispatchWork falls back to publishTopic('testEcho'), and no Pub/Sub topic named `testEcho` exists in project avada-seo — the fallback path was never provisioned because testEcho is a fleet-only smoke-test job. Both requests come from the DevZone UI (referer https://seo.apps.avada.io/dev_zone), one shop, cu0A44KcTqmjRb6j2t0O.

Confidence: `high`

## Code
- `packages/functions/src/controllers/devController.js:1245` — The `resolve_broken_links` case calls resolveBrokenLinks(ctx, shop) — the undefined identifier named in the prod stack frame; 8 of 12 500s in the window.
- `packages/functions/src/controllers/redirectController.js:765` — The only definition of resolveBrokenLinks in the repo; proves the identifier is a module export that devController must import, not a global.
- `packages/functions/src/controllers/devController.js:60` — Inside devController's import block (repositories/optimizeStoreRepository …). No import from @functions/controllers/redirectController exists anywhere in the block — the missing binding.
- `packages/functions/src/controllers/devController.js:886` — The second cause behind the same fingerprint: dispatchWork('testEcho', …) whose Pub/Sub fallback targets a topic that does not exist in avada-seo; 4 of 12 500s.
- `packages/functions/src/helpers/worker/dispatchWork.js:48` — testEcho is registered in MIGRATED_TOPICS, so a failed gate/unhealthy fleet routes it to publishTopic('testEcho') → grpc 5 NOT_FOUND.

## Evidence
- 12 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-08-13T20:29:30.151Z" AND timestamp<="2026-08-13T20:59:30.151Z" AND logName:"stderr" AND textPayload:"resolveBrokenLinks is not defined"`
- 8 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-08-13T20:29:30.151Z" AND timestamp<="2026-08-13T20:59:30.151Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"x=resolve_broken_links"`
- 12 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-08-13T20:29:30.151Z" AND timestamp<="2026-08-13T20:59:30.151Z" AND httpRequest.status>=500`
- 8 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-08-13T20:29:30.151Z" AND timestamp<="2026-08-13T20:59:30.151Z" AND logName:"stderr" AND textPayload:"resource=testEcho"`

## Job
- analyze rounds: 1
- cost: $3.45
- branch: `fix/prod-seo-i9jsmj-a2`
- fix commit: `198a94f4bf3ddf5321a80eeed5561ff9245e5f5d`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2196
- tests: 1038 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix

```
.../functions/src/controllers/devController.js     | 30 +++++++++++++++-------
 1 file changed, 21 insertions(+), 9 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
