fingerprint: ri5pmt
service: apisagen2
message: HTTP 500 POST /apiSa/dev
app: SEO
repo: seo
date: 2026-08-12T18:40:46.685Z
status: inconclusive
attempt: 1

# SEO · apisagen2 · ri5pmt

**Outcome.** fix blocked at only_tests_changed

**Root cause.** Merge d71f665015 (feat/worker-pubsub-migration, master 2026-08-11T08:49:48Z) deleted `import appConfig from '@functions/config/app'` from devController.js while leaving `const {hookUrl} = appConfig;` as the first statement of testOnly(), so every /apiSa/dev Dev Zone action — including x=ai_credit — threw ReferenceError before reaching the switch.

**Mechanism.** POST /apiSa/dev?x=ai_credit routes to devController.testOnly (routes/api.js:381). In the deployed bundle testOnly's opening statement destructures the module-scope binding `appConfig`, which no longer exists after d71f665015 removed the import: `git show d71f665015^1:...devController.js` has `import appConfig` at line 1 plus `const {hookUrl} = appConfig` at line 204, while `git show d71f665015:...devController.js` has the destructure at line 194 and no import. Babel keeps the free reference, so at runtime V8 raises `ReferenceError: appConfig is not defined` at lib/controllers/devController.js:127:7 (= testOnly, src line 194). @avada/core's error middleware logs `[unhandledError] POST /apiSa/dev 500 appConfig is not defined` and returns 500 — the alert. Already fixed on master: 8e06eab2dd (2026-08-12T02:52Z) restored the import, 8de1543ebb (2026-08-12T04:37Z) deleted the dead destructure and the import; HEAD has zero `appConfig` occurrences in the file.

Confidence: `high`

## Code
- `packages/functions/src/controllers/devController.js:194` — testOnly() — the function whose first statement was `const {hookUrl} = appConfig;` in the deployed build (lib:127); line now holds the function signature after fix 8de1543ebb removed the destructure
- `packages/functions/src/routes/api.js:381` — router.post('/dev', devController.testOnly) — the route the 3 failing requests hit
- `packages/functions/src/config/app.js:6` — hookUrl lives here; this is the module whose import d71f665015 dropped

## Evidence
- 6 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-08-12T00:48:05.187Z" AND timestamp<="2026-08-12T01:18:05.187Z" AND logName:"stderr" AND textPayload:"appConfig is not defined"`
- 3 matching entries: `(resource.labels.service_name="apisagen2" OR resource.labels.function_name="apisagen2") AND timestamp>="2026-08-12T00:48:05.187Z" AND timestamp<="2026-08-12T01:18:05.187Z" AND httpRequest.status>=500`
- 190 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-08-11T00:00:00Z" AND timestamp<="2026-08-13T00:00:00Z" AND logName:"stderr" AND textPayload:"appConfig is not defined"`

## Job
- analyze rounds: 1
- cost: $4.89

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
