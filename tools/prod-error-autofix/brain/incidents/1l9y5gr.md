fingerprint: 1l9y5gr
service: apigen2
message: HTTP 500 GET /api/dev
app: SEO
repo: seo
date: 2026-08-12T18:59:31.242Z
status: inconclusive
attempt: 1

# SEO · apigen2 · 1l9y5gr

**Outcome.** fix blocked at only_tests_changed

**Root cause.** The merge of feat/worker-pubsub-migration (d71f665015, master 2026-08-11T08:49:48Z) deleted the `import appConfig from '@functions/config/app'` line from devController.js while keeping `const {hookUrl} = appConfig;` as the first statement of testOnly(), so every Dev Zone /api/dev?x=... call threw ReferenceError before reaching the switch.

**Mechanism.** DevZone page for minhpt-store-15.myshopify.com issued 6 GET /api/dev calls (4× x=get_worker_health, 2× x=get_worker_jobs) at 02:41:44–02:41:53Z. All 6 route to testOnly (packages/functions/src/controllers/devController.js:194). At the deployed revision the function's first statement destructured `appConfig`, an identifier no longer imported after d71f665015 — prod stack: `ReferenceError: appConfig is not defined at testOnly (/workspace/lib/controllers/devController.js:127:7)` (lib line ≠ src line; symbol match). The throw happens before the `switch (x)`, so neither `case 'get_worker_jobs'` (:1792) nor `case 'get_worker_health'` (:1801) ever ran — the worker fleet was never contacted. Koa's unhandledError handler returned 500. Latency 0.20–1.12s, consistent with failing immediately after getShopById/initShopify, not with a fleet timeout. Already fixed on master: 8e06eab2dd (2026-08-12T02:52:16Z, 11 min after this alert) restored the import; 8de1543ebb then deleted the dead `hookUrl` line plus the import and added the missing MIGRATED_TOPICS import. Current HEAD c271bfc0df contains both.

Confidence: `high`

## Code
- `packages/functions/src/controllers/devController.js:194` — testOnly(ctx) — the Dev Zone action dispatcher named in the prod stack (lib/controllers/devController.js:127). At the deployed revision its first line was `const {hookUrl} = appConfig;` with no import; that line is gone at HEAD (removed by 8de1543ebb).
- `packages/functions/src/controllers/devController.js:1792` — case 'get_worker_jobs' — the branch the 2 failing get_worker_jobs requests never reached.
- `packages/functions/src/controllers/devController.js:1801` — case 'get_worker_health' — the branch the 4 failing get_worker_health requests never reached.

## Evidence
- 12 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-08-12T02:26:48.306Z" AND timestamp<="2026-08-12T02:56:48.306Z" AND logName:"stderr" AND textPayload:"appConfig is not defined"`
- 6 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-08-12T02:26:48.306Z" AND timestamp<="2026-08-12T02:56:48.306Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $9.17

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
