fingerprint: 7idu8p
service: api
message: The request failed because the instance failed the readiness check.
app: BLOG
repo: blogs
date: 2026-09-01T18:13:11.861Z
status: infra
attempt: 1

# BLOG · api · 7idu8p

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the Cloud Run container filesystem in avada-blog-app/us-central1 returned `EIO: i/o error, read` on readFileSync during Node module load, so api cold-start containers died at require() time, never bound :8080, and Cloud Run answered the requests routed to them with 503 'The request failed because the instance failed the readiness check' after the default 240s startup TCP probe deadline.

**Mechanism.** Every alerted 503 was routed to an instance that never started. Instance …1d4c41 logged `Provided module can't be loaded. / Is there a syntax error in your code? / Detailed stack trace: Error: EIO: i/o error, read / at Object.readFileSync (node:fs:440:20)` at 17:40:27.378Z, with the frames landing in `/workspace/node_modules/firebase-functions/lib/common/providers/firestore.js:25` → `Could not load the function, shutting down.`; instance …1d849d logged the identical EIO at 17:43:26.288Z but through a completely different module path (`/workspace/node_modules/puppeteer/lib/cjs/puppeteer/puppeteer.js:26` via cosmiconfig ExplorerSync). Two different files failing the same read rules out a source-level module error and points at the container filesystem. Each dead container then failed the platform probe — `Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED.` — 13 times on api in the 30-minute window, at 17:29:27, 17:38:04/05/05, 17:40:28, 17:43:09, 17:43:26, 17:47:56/56, 17:48:24Z. The 5 request-log 503s map 1:1 onto those instance ids (…1d4c41, …1d849d, …1d2684, …1d7b25, …1df33e), and their latencies are the probe deadline itself: 242.211749s, 241.196871s, 241.128965s, 192.175497s, 23.116363s — the three long ones sitting on Cloud Run's 240s default startup probe timeout. It is not app-specific: the same `EIO: i/o error, read` fired 36 times across six unrelated Cloud Run services in the same project between 16:30Z and 18:30Z (proxy, embedapp, handleproderroralert, knowledgebase, api), i.e. every service that cold-started in that band, whatever its code. No application log line exists for any failed request because the process died before Koa was constructed — the only api application stderr in the window comes from the one warm instance …1d3760 (seoProxyApi 401s, fetchHtmlContent timeouts), which served fine throughout. api declares no `minInstances`, so when the autoscaler needed new capacity there was no warm reserve to absorb the platform fault. This is the same fault family already recorded for 2026-09-01 on this project (lkawju/api, kmu32w/embedapp, 14ywrzy/proxy, me5nt2/knowledgebase).

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:26` — api is declared with memory 2GiB / concurrency 10 / maxInstances 100 and no minInstances — no warm reserve, so every request during the fault depended on a cold start the platform could not complete
- `packages/functions/src/index.js:6` — index.js re-exports http, pubsub, scheduled and firestore, so every api container evaluates the whole functions import graph (firebase-functions, puppeteer, cosmiconfig) before it can bind :8080 — the exact readFileSync calls that took the EIO
- `packages/functions/src/globalOptions.js:5` — every function including api attaches a VPC connector at start; connector attach plus full module load is the pre-bind path that has to finish inside the 240s startup probe deadline

## Evidence
- 13 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-01T17:26:46Z" AND timestamp<="2026-09-01T17:56:46Z" AND textPayload:"STARTUP TCP probe"`
- 36 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T16:30:00Z" AND timestamp<="2026-09-01T18:30:00Z" AND textPayload:"EIO: i/o error"`
- 6 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-01T17:26:46.315Z" AND timestamp<="2026-09-01T17:56:46.315Z" AND httpRequest.status>=500`
- 96 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-01T17:26:46.315Z" AND timestamp<="2026-09-01T17:56:46.315Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.39

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
