fingerprint: i9jsmj
service: apisagen2
message: HTTP 500 GET /apiSa/dev
app: SEO
repo: seo
date: 2026-08-12T18:03:50.118Z
status: inconclusive
attempt: 1

# SEO · apisagen2 · i9jsmj

**Outcome.** fix blocked at only_tests_changed

**Root cause.** The merge of feat/worker-pubsub-migration (d71f665015, master 2026-08-11T08:49:48Z) deleted the `import appConfig from '@functions/config/app'` line in devController.js while leaving testOnly's first statement `const {hookUrl} = appConfig;`, so every GET /apiSa/dev call threw ReferenceError before reaching the action switch — already fixed on master by 8e06eab2dd + 8de1543ebb, both merged after this alert.

**Mechanism.** testOnly(ctx) is the single handler behind GET /apiSa/dev. At the deployed revision (master ca19ab02b1, the tip at alert time) its body opened with `const {hookUrl} = appConfig;` at packages/functions/src/controllers/devController.js:194 with no appConfig binding in module scope — babel emits a bare identifier read, so V8 throws `ReferenceError: appConfig is not defined` on the first statement. Stack confirms it: `at testOnly (/workspace/lib/controllers/devController.js:127:7)`, one frame below koa-router dispatch, no service/repository frame under it — the function never reached `getCurrentShop(ctx)` or the `switch (x)`. The `x=done_optimize` in the URL is therefore irrelevant to the failure; any x value 500s identically. errorHandler logged `[unhandledError] GET /apiSa/dev 500 appConfig is not defined` and `[apiSa] TqWdqjW0ZJnrevcIDJdG appConfig is not defined`, and returned 500. On current master the line is gone: 8e06eab2dd (2026-08-12T02:52Z) restored the import, 8de1543ebb (2026-08-12T04:37Z) deleted both the import and the now-commented hookUrl line, so devController.js:194 is now `export async function testOnly(ctx) {` with `const shopID = getCurrentShop(ctx);` as the first statement.

Confidence: `high`

## Code
- `packages/functions/src/controllers/devController.js:194` — testOnly — the /apiSa/dev handler named in the prod stack frame. At deployed revision ca19ab02b1 this same line was `const {hookUrl} = appConfig;` with no import; on current master the appConfig read is removed.
- `packages/functions/src/controllers/devController.js:10` — Import block that at the failing revision carried no appConfig import — the deletion introduced by merge d71f665015 three hours before the alert; line 10 is the MIGRATED_TOPICS import added by the follow-up fix 8de1543ebb that landed in the same block.
- `packages/functions/src/config/app.js:1` — The module whose default export the missing import bound; proves the identifier was module-scoped, not a global.

## Evidence
- 24 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-08-11T12:09:30.800Z" AND timestamp<="2026-08-11T12:39:30.800Z" AND logName:"stderr" AND textPayload:"appConfig is not defined"`
- 12 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-08-11T12:09:30.800Z" AND timestamp<="2026-08-11T12:39:30.800Z" AND httpRequest.status>=500`
- 12 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-08-11T12:09:30.800Z" AND timestamp<="2026-08-11T12:39:30.800Z" AND textPayload:"testOnly"`

## Job
- analyze rounds: 1
- cost: $3.95

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
