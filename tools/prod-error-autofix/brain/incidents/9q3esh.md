fingerprint: 9q3esh
service: aiapi
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-09-01T16:45:25.468Z
status: infra
attempt: 1

# IMG-OPT · aiapi · 9q3esh

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the Cloud Run container filesystem in app-plaza-image-optimizer/us-central1 returned EIO on readFileSync during Node module load, so aiapi cold-start containers aborted before binding :8080 and Cloud Run answered 503 to the requests waiting on them.

**Mechanism.** Every aiapi container loads the shared packages/functions/src/index.js import graph on cold start (exports.aiApi at packages/functions/src/index.js:66). In the alert window three cold starts of revision aiapi-00129-neh died inside that require chain with 'Provided module can't be loaded. ... Detailed stack trace: Error: EIO: i/o error, read / at Object.readFileSync (node:fs:448:20)' followed by 'Could not load the function, shutting down.' — at 16:39:08.768 on /workspace/node_modules/googleapis/build/src/apis/websecurityscanner/index.js:20, at 16:40:34.071 on /workspace/lib/services/downgrade/index.js:12 (babel output of packages/functions/src/services/downgrade/index.js), at 16:40:58.648 on /workspace/node_modules/clean-css/lib/clean.js:26. Three different files, three different instance ids (…1aa236b3, …85810640, …1e7a03f8) — a per-file read fault, not one bad module: the same source file loads fine on every warm instance and the same build was serving before and after. The failed loads left the container without a listener, so all 5 STARTUP TCP probe entries in the window report 'The instance was not started' (2 DEADLINE_EXCEEDED, 3 CANCELLED), and the 3 OPTIONS /sidekick/v1/speed/features requests parked on those starting instances returned 503 'The request failed because the instance failed the readiness check' with latencies 246.12s / 254.04s / 229.13s — the Cloud Run 240s startup-probe deadline plus routing. Not OOM: aiApi is declared memory '512MiB' but no 'Memory limit exceeded' entry exists in the window and the process dies in module load, not under heap pressure. Same fault swept two sibling services in the same project and hour — scanspeedscoresubscriberv2 (2 entries, recorded fingerprint 1n2wy73) and handleproderroralertgen2 (2 entries) — which rules out anything specific to aiapi's code.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/index.js:66` — exports.aiApi = onRequest({timeoutSeconds: 540, memory: '512MiB'}, aiApiHandler.callback()) — the alerted service; every cold start loads this whole index.js graph
- `packages/functions/src/index.js:48` — import aiApiHandler from '@functions/handlers/aiApi' — entry into the import graph that was being read when readFileSync returned EIO
- `packages/functions/src/services/downgrade/index.js:2` — src原 of /workspace/lib/services/downgrade/index.js:12 in the 16:40:34 EIO stack — the top-level import block that fails to read; app code is correct, the read is not
- `packages/functions/src/handlers/aiApi.js:4` — the Koa app whose route module tree (routes/aiApi, routes/sidekickApi) is pulled in on the same cold-start path serving /sidekick/v1/speed/features

## Evidence
- 3 matching entries: `resource.labels.service_name="aiapi" AND textPayload:"EIO: i/o error, read" AND timestamp>="2026-09-01T16:22:12Z" AND timestamp<="2026-09-01T16:52:12Z"`
- 5 matching entries: `resource.labels.service_name="aiapi" AND textPayload:"STARTUP TCP probe failed" AND timestamp>="2026-09-01T16:22:12Z" AND timestamp<="2026-09-01T16:52:12Z"`
- 3 matching entries: `resource.labels.service_name="aiapi" AND httpRequest.status>=500 AND timestamp>="2026-09-01T16:22:12Z" AND timestamp<="2026-09-01T16:52:12Z"`
- 10 matching entries: `(textPayload:"EIO: i/o error" OR textPayload:"Provided module can't be loaded") AND timestamp>="2026-09-01T16:00:00Z" AND timestamp<="2026-09-01T17:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.46

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
