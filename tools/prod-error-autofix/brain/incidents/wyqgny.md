fingerprint: wyqgny
service: changelogtriggers-shopinfos
message: HTTP 500 POST /
app: SEO
repo: seo
date: 2026-08-14T08:21:48.210Z
status: infra
attempt: 1

# SEO · changelogtriggers-shopinfos · wyqgny

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the same platform-side container-start/filesystem fault that swept avada-seo/us-central1 during the 2026-08-14 04:00–05:00Z hour — every changelogtriggers-shopinfos cold start either failed its Cloud Run STARTUP TCP probe on :8080 with DEADLINE_EXCEEDED or died at module load with `Error: EIO: i/o error, read` on a readFileSync of a node_modules JSON file, so Eventarc's Pub/Sub delivery POST / was answered 500/503 by the platform before any application code ran. Duplicate of the already-recorded infra fingerprints 220y3n / 1t6fr9s for this same service and window.

**Mechanism.** Eventarc delivers the Firestore `shopInfos` changelog event as POST /?__GCP_CloudEventsMode=CE_PUBSUB_BINDING to changelogtriggers-shopinfos. Cloud Run must cold-start a container; 11 of those starts logged `Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.` — the container never bound :8080, so the runtime was killed before firebase-functions could load packages/functions/lib/config/changelog.js (src at packages/functions/src/config/changelog.js:12, the `{collectionId: 'shopInfos'}` entry that names this Cloud Run service; re-exported at packages/functions/src/app.js:20). One start got further and shows *why* the container could not come up: at 04:26:12.104Z the runtime printed `Provided module can't be loaded. / Is there a syntax error in your code? / Detailed stack trace: Error: EIO: i/o error, read` with the frame `at Object.readFileSync (node:fs:440:20) → node:internal/modules/cjs/loader:1808 loadSource → Object..json → /workspace/node_modules/har-validator/lib/schemas/index.js:13 → har-validator/lib/runner.js:3` then `Could not load the function, shutting down.` That is a read of a static, unchanged JSON schema file inside node_modules (har-validator, pulled in by request-promise, packages/functions/package.json:109) failing with EIO — a disk/gVisor-layer read error on the container image, not a syntax error and not anything this repo's code does. Cloud Run then answered the queued deliveries itself: 8× 503 `The request failed because the instance failed the readiness check` with latencies clamped at 194.11/241.15/241.15/241.17/243.22/244.13/250.10s, and 3× 500 `The request failed because the instance could not start successfully` at 0s latency (04:21:40.527Z, 04:34:03.235Z, 04:34:12.127Z — one of these is the alert). Those 0s and 241s+ latencies are platform-side wait/kill numbers, not handler work; there is no application log line in the whole 30-minute window. It is not specific to this function: 613 identical probe failures hit 25+ distinct avada-seo Cloud Run services in the same 04:00–05:00Z hour (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44, extensiongen2 31, embedappgen2 24, changelogtriggers-shops 19, changelogtriggers-shopinfos 11 …), and the EIO read fault hit 9 distinct services (authgen2 8, onupdateshopgen2 3, embedappgen2 3, handleproderroralertgen2 2, changelogtriggers-shops 2, apigen2 1, extensiongen2 1, handleprocessinternallinkreportgen2 1, changelogtriggers-shopinfos 1). A fault that lands on a different node_modules file path across 9 unrelated services in one hour rules out this service's own import graph.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:12` — the {collectionId: 'shopInfos'} entry — the only thing that names the alerting Cloud Run service changelogtriggers-shopinfos; no code path in it executed because the container never bound :8080
- `packages/functions/src/config/changelog.js:8` — changelog.registerV2({memory: '1GiB', collections: [...]}) — sole definition of the alerting function; memory is not the fault (no OOM line anywhere in the window)
- `packages/functions/src/app.js:20` — export {changelogTriggers} from '@functions/config/changelog' — the module load that would have run had the container started; nothing in it executed
- `packages/functions/package.json:109` — request-promise 4.2.6 — the dependency that drags in har-validator, whose lib/schemas/*.json readFileSync hit EIO; the file is static and unchanged, so the failure is the container filesystem, not this dep

## Evidence
- 11 matching entries: `(resource.labels.service_name="changelogtriggers-shopinfos" OR resource.labels.function_name="changelogtriggers-shopinfos") AND timestamp>="2026-08-14T04:21:18.847Z" AND timestamp<="2026-08-14T04:51:18.847Z" AND textPayload:"STARTUP TCP probe failed"`
- 11 matching entries: `(resource.labels.service_name="changelogtriggers-shopinfos" OR resource.labels.function_name="changelogtriggers-shopinfos") AND timestamp>="2026-08-14T04:21:18.847Z" AND timestamp<="2026-08-14T04:51:18.847Z" AND httpRequest.status>=500`
- 32 matching entries: `(resource.labels.service_name="changelogtriggers-shopinfos" OR resource.labels.function_name="changelogtriggers-shopinfos") AND timestamp>="2026-08-14T04:21:18.847Z" AND timestamp<="2026-08-14T04:51:18.847Z" AND logName:"stderr"`
- 613 matching entries: `resource.type="cloud_run_revision" AND resource.labels.location="us-central1" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 22 matching entries: `resource.type="cloud_run_revision" AND resource.labels.location="us-central1" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"EIO: i/o error"`

## Job
- analyze rounds: 1
- cost: $1.16

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
