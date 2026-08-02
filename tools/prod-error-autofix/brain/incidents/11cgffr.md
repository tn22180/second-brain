fingerprint: 11cgffr
service: internalgen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-01T17:02:44.545Z
status: infra
attempt: 1

# SEO · internalgen2 · 11cgffr

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprints zmdt9 and 7auk44 (same three OOM kills, same instance IDs, both already reported as infra on 2026-08-01): internalGen2 is declared memory: '512MiB' (packages/functions/src/handlers/exports/httpFunctions.js:95) while a gen2 container in this repo needs 514-546 MiB just to boot the shared src/ import graph, so cold-start containers are OOM-killed before the startup TCP probe and Cloud Run answers 503 'instance failed the readiness check'.

**Mechanism.** Anonymous scanner traffic (curl/8.7.1 from 66.249.93.196 / 142.250.32.36 / 66.249.93.37) hit GET /internal/.env.staging on a service with no minInstances, forcing cold starts. setGlobalOptions({invoker: 'public'}) at httpFunctions.js:23 is what lets an unauthenticated scanner trigger those boots at all. Every gen2 container in this repo loads packages/functions/src/app.js, which `export *`s all four handler modules (app.js:13-19), so an internalGen2 instance boots the whole src/ tree — Firestore SDK, shopifyService, ioredis, koa, plus the Elasticsearch client internalTools.js:18 pulls in — regardless of which single function it serves. Boot RSS crossed the 512 MiB cap declared at httpFunctions.js:95 three times in this window: 'Memory limit of 512 MiB exceeded with 526/520/523 MiB used' at 16:56:51.941628Z, 16:57:03.941928Z, 16:57:15.942037Z. Each kill is followed within 300µs by 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. / Connection failed with status CANCELLED' at 16:56:51.941835Z, 16:57:03.942274Z, 16:57:15.942246Z — 3/3 exact pairing. The three in-flight requests got 503 at 18.019s / 12.016s / 11.018s latency. The kill lands during module load, so no application code runs — which is why the stderr read is 0 entries rather than P7 severity-blindness. Overshoot is only 8-14 MiB over the cap in this window (514-546 MiB across 8 kills in 7 days), so the failure is probabilistic, not total: the 4th boot in the same burst survived and returned a correct 401. The repo already diagnosed this identical failure on a sibling function and wrote it into the source: pubsubFunctions.js:553-557 records that the shared src/ graph 'needs ~531MiB just to boot, so 512MiB OOM'd on cold start BEFORE the readiness probe', and raised that function to 1GiB at :558. internalGen2 is the only sub-1GiB gen2 HTTP export left in httpFunctions.js — proxyGen2 (:100) and resetGen2 (:104) are both 1GiB on the identical Koa/vpcSettings shape. This is the third alert fingerprint generated from the same three kills; the fingerprint differs only because the sender picked a different log line as the message.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:95` — memory: '512MiB' with no minInstances — the cap the 520/523/526 MiB boots exceeded; the only sub-1GiB gen2 HTTP export in the file
- `packages/functions/src/handlers/exports/httpFunctions.js:94` — export const internalGen2 = onRequest — the function whose container is being killed
- `packages/functions/src/app.js:13` — export * of every handler module: an internalGen2 container boots the whole src/ import graph, not just internalTools
- `packages/functions/src/handlers/exports/pubsubFunctions.js:555` — the repo's own recorded measurement of this exact failure — '512MiB OOM'd on cold start BEFORE the readiness probe'
- `packages/functions/src/handlers/exports/pubsubFunctions.js:558` — memory: '1GiB' — the fix already applied to the sibling that hit the identical boot-floor OOM
- `packages/functions/src/handlers/exports/httpFunctions.js:100` — proxyGen2 at memory: '1GiB' on the same vpcSettings + Koa handler shape — 1GiB is this repo's floor, 512MiB is the outlier
- `packages/functions/src/handlers/exports/httpFunctions.js:23` — setGlobalOptions({invoker: 'public'}) — why an anonymous .env scanner can force cold starts on this function
- `packages/functions/src/handlers/internalTools.js:18` — createElasticsearchService import — a heavy dep resident at boot on a function whose routes may never touch it

## Evidence
- 3 matching entries: `resource.labels.service_name="internalgen2" AND timestamp>="2026-08-01T16:41:53.385Z" AND timestamp<="2026-08-01T17:11:53.385Z" AND textPayload:"Memory limit of 512 MiB exceeded"`
- 3 matching entries: `resource.labels.service_name="internalgen2" AND timestamp>="2026-08-01T16:41:53.385Z" AND timestamp<="2026-08-01T17:11:53.385Z" AND textPayload:"STARTUP TCP probe failed"`
- 3 matching entries: `resource.labels.service_name="internalgen2" AND timestamp>="2026-08-01T16:41:53.385Z" AND timestamp<="2026-08-01T17:11:53.385Z" AND httpRequest.status>=500`
- 8 matching entries: `resource.labels.service_name="internalgen2" AND timestamp>="2026-07-25T00:00:00Z" AND timestamp<="2026-08-01T17:11:53Z" AND textPayload:"Memory limit of 512 MiB exceeded"`

## Job
- analyze rounds: 1
- cost: $0.99

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
