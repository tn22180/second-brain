fingerprint: srjhey
service: api
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: BLOG
repo: blogs
date: 2026-09-01T18:04:30.456Z
status: infra
attempt: 1

# BLOG · api · srjhey

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the Cloud Run container filesystem in avada-blog-app/us-central1 returned `EIO: i/o error, read` on readFileSync during Node module load, so 10 `api` cold-start containers on revision api-00163-mox died before binding :8080 and each failed its 240s startup TCP probe.

**Mechanism.** The alerted line is the platform consequence, not the cause. Two of the ten failing instances left an application log before dying: instance 00a41e8c1d849d… at 17:43:26.288Z logged `Provided module can't be loaded. / Detailed stack trace: Error: EIO: i/o error, read / at Object.readFileSync (node:fs:440:20) / at #readConfiguration (/workspace/node_modules/cosmiconfig/dist/ExplorerSync.js:83:39) / at getConfiguration (/workspace/node_modules/puppeteer/lib/cjs/puppeteer/getConfiguration.js:96:8)` then `Could not load the function, shutting down.`, and instance 00a41e8c1d4c41… at 17:40:27.378Z logged the same EIO at `defaultLoadImpl (node:internal/modules/cjs/loader:1122:17)` under `/workspace/node_modules/firebase-functions/lib/common/providers/firestore.js:25:19`. Both stacks are reads of files inside /workspace/node_modules — different files, same errno — so the fault is the disk read, not any one module: `src/index.js:6-9` re-exports the whole http/pubsub/scheduled/firestore graph, and that graph pulls in puppeteer (handlers/cron/handleReviewUpdates.js:1, reached from devZoneController) and firebase-functions, which is why those two files are what the loader happened to be reading. With the module load dead the container never listens, so Cloud Run's startup probe (revision api-00163-mox spec: tcpSocket 8080, timeoutSeconds=240, failureThreshold=1) expires and emits `Default STARTUP TCP probe failed 1 time consecutively … Connection failed with status DEADLINE_EXCEEDED`. The requests parked on those cold starts then answer 503 `The request failed because the instance failed the readiness check.` at latencies of 241.20s, 242.21s, 192.18s and 23.12s — the two 24x values pinned to the 240s probe timeout, P4. Not OOM: zero `Memory limit` entries anywhere in avada-blog-app between 16:30Z and 18:30Z, and the revision is declared memory 2Gi. Not a bad deploy either: api-00163-mox was created 2026-09-01T00:41:45Z, ~17h before, and served normally in between. Not api-specific: in the same 2h window the identical EIO stack hit 5 services (proxy, embedapp, knowledgebase, handleproderroralert, api) and 97 startup-probe failures spread over 7 services, matching the already-recorded 2026-09-01 blog fingerprints kmu32w / 1ocmru / y8dc6e / 29rvxn / 14ywrzy / h47mgc and the same-hour EIO sweep in avada-seo and app-plaza-image-optimizer.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:26` — The `api` onRequest declaration for the alerted service — memory 2GiB, concurrency 10; deployed spec confirms 2Gi, so the startup failure is not a memory-tier problem
- `packages/functions/src/index.js:6` — index.js re-exports http/pubsub/scheduled/firestore, so every `api` container evaluates the full import graph before the functions framework can bind :8080 — that whole graph is the read surface the EIO hit
- `packages/functions/src/handlers/cron/handleReviewUpdates.js:1` — `import puppeteer from 'puppeteer'` — puppeteer is in the api container's graph (via devZoneController), which is why one failing instance's EIO stack lands in puppeteer's cosmiconfig getConfiguration

## Evidence
- 10 matching entries: `resource.labels.service_name="api" AND textPayload:"STARTUP TCP probe failed" AND timestamp>="2026-09-01T17:21:52.329Z" AND timestamp<="2026-09-01T17:51:52.329Z"`
- 36 matching entries: `textPayload:"EIO: i/o error" AND timestamp>="2026-09-01T16:30:00Z" AND timestamp<="2026-09-01T18:30:00Z"`
- 97 matching entries: `textPayload:"STARTUP TCP probe failed" AND timestamp>="2026-09-01T16:30:00Z" AND timestamp<="2026-09-01T18:30:00Z"`
- 6 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-01T17:21:52.329Z" AND timestamp<="2026-09-01T17:51:52.329Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $2.18

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
