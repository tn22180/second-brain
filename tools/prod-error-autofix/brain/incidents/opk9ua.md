fingerprint: opk9ua
service: aiapi
message: The request failed because the instance failed the readiness check.
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-09-01T16:47:16.857Z
status: infra
attempt: 1

# IMG-OPT · aiapi · opk9ua

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of recorded fingerprint 9q3esh (same revision aiapi-00129-neh, same 5 instances, same 3 EIO stacks, same 3 OPTIONS 503s): infra, not code — the Cloud Run container filesystem in app-plaza-image-optimizer/us-central1 returned EIO on readFileSync during Node module load, so aiapi cold-start containers exited before binding :8080 and Cloud Run answered the queued requests with 503 'instance failed the readiness check'.

**Mechanism.** The alerted 503s are OPTIONS https://aiapi-sppsm4oxga-uc.a.run.app/sidekick/v1/speed/features at 16:33:09.608939Z (246.121612s, instance …1d75ce), 16:34:12.470601Z (254.035011s, …1dacd3) and 16:35:09.621063Z (229.131114s, …1d8581) — each parked on a cold-start container of revision aiapi-00129-neh that never came up. Every aiapi container loads the whole packages/functions/src/index.js import graph on start (exports.aiApi, packages/functions/src/index.js:66). Three of the five failed starts left a stderr trace, all identical in shape: 'Provided module can't be loaded.' → 'Is there a syntax error in your code?' → 'Detailed stack trace: Error: EIO: i/o error, read' → 'at Object.readFileSync (node:fs:448:20)' → 'at loadSource (node:internal/modules/cjs/loader:1548:17)' → a frame → 'Could not load the function, shutting down.' The failing frame is a different file each time: 16:39:08.768946Z /workspace/node_modules/googleapis/build/src/apis/websecurityscanner/index.js:20 (instance …1d1aa2), 16:40:34.071657Z /workspace/lib/services/downgrade/index.js:12 (…1d8581, babel output of packages/functions/src/services/downgrade/index.js), 16:40:58.648241Z /workspace/node_modules/clean-css/lib/clean.js:26 (…1d1e7a). Three different files on three different instances of one unchanged build is a per-read storage fault, not a JS defect — the same modules load on the warm instances, which served 200/204 on /sidekick/v1/speed/features and /sidekick/v1/image/results throughout the same minutes (instance …1d27d573 at 16:34:09/16:35:12/16:36:09/16:36:12/16:37:12, instance …1da058c4 at 16:42:19/16:42:48/16:45:25/16:45:26). All 5 STARTUP TCP probe entries report 'The instance was not started' (3 CANCELLED, 2 DEADLINE_EXCEEDED); the two probe-only instances (…1d75ce, …1dacd3) wrote no stderr because the container died before any log. Not OOM: aiApi is declared memory '512MiB' but no 'Memory limit exceeded' line exists in the window and the process dies inside module load, not under heap pressure. Project-wide in 16:00–17:30Z there are exactly 5 EIO entries and 7 startup-probe failures across three unrelated services — aiapi (3 EIO), scanspeedscoresubscriberv2 16:23:56.343626Z and handleproderroralertgen2 16:23:53.708555Z, both on unrelated files — which rules out anything specific to aiapi's code and matches the already-recorded 1n2wy73 / u7yyss / 9q3esh family from the same hour.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/index.js:66` — exports.aiApi = onRequest({timeoutSeconds: 540, memory: '512MiB'}, aiApiHandler.callback()) — the alerted service; every cold start loads this whole index.js graph, which is where the EIO reads landed
- `packages/functions/src/index.js:48` — import aiApiHandler from '@functions/handlers/aiApi' — entry into the import graph being read when readFileSync returned EIO
- `packages/functions/src/services/downgrade/index.js:2` — src source of /workspace/lib/services/downgrade/index.js:12 named in the 16:40:34.071657Z EIO frame — an ordinary top-level import block; the file's content is valid, the read of the compiled copy failed
- `packages/functions/src/handlers/aiApi.js:4` — Koa app whose route tree (routes/aiApi, routes/sidekickApi) is pulled in on the same cold-start path that serves the 503'd /sidekick/v1/speed/features

## Evidence
- 3 matching entries: `resource.labels.service_name="aiapi" AND textPayload:"EIO: i/o error, read" AND timestamp>="2026-09-01T16:22:18.323Z" AND timestamp<="2026-09-01T16:52:18.323Z"`
- 5 matching entries: `resource.labels.service_name="aiapi" AND textPayload:"STARTUP TCP probe failed" AND timestamp>="2026-09-01T16:22:18.323Z" AND timestamp<="2026-09-01T16:52:18.323Z"`
- 3 matching entries: `resource.labels.service_name="aiapi" AND httpRequest.status>=500 AND timestamp>="2026-09-01T16:22:18.323Z" AND timestamp<="2026-09-01T16:52:18.323Z"`
- 5 matching entries: `resource.type="cloud_run_revision" AND textPayload:"EIO: i/o error" AND timestamp>="2026-09-01T16:00:00Z" AND timestamp<="2026-09-01T17:30:00Z"`
- 11 matching entries: `resource.labels.service_name="aiapi" AND httpRequest.status<500 AND timestamp>="2026-09-01T16:22:00Z" AND timestamp<="2026-09-01T16:55:00Z"`

## Job
- analyze rounds: 1
- cost: $1.53

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
