fingerprint: y8dc6e
service: embedapp
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#abort-request>
app: BLOG
repo: blogs
date: 2026-09-01T17:37:41.737Z
status: infra
attempt: 1

# BLOG · embedapp · y8dc6e

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of recorded fingerprint kmu32w (same service, same revision embedapp-00160-siq, same 30-minute window, same instance IDs): infra, not code — a platform-side container-filesystem fault returned EIO on readFileSync during Node module load in avada-blog-app/us-central1, so every embedapp cold start died before binding :8080 and Cloud Run rejected the alerted 6 requests at admission with 'no available instance'.

**Mechanism.** The alerted message is the zero-ready-instance symptom of failed cold starts, not a request that reached the app. In the window, 14 STARTUP TCP probe failures on 13 distinct instances, all on one revision embedapp-00160-siq. Six of them logged the functions-framework module-load kill first: "Provided module can't be loaded." → "Is there a syntax error in your code?" → "Detailed stack trace: Error: EIO: i/o error, read" → `at Object.readFileSync (node:fs:440:20)` → defaultLoadImpl → Module.load → require → 'Could not load the function, shutting down.' The file that failed to read differs per instance and the six share no dependency relation: /workspace/node_modules/google-ads-node/build/src/v24/ad_parameter_service_client.js:28 (00a41e8c1d27, 17:32:53.216Z), /workspace/node_modules/crisp-api/lib/crisp.js:764 (00a41e8c1d99 17:29:00.326Z and 00a41e8c1dfc 17:28:38.532Z), /workspace/lib/services/crisp/initCrisp.js:8 (00a41e8c1d3f, 17:28:12.872Z), /workspace/lib/helpers/optimize/optimizeHelper.js:18 (00a41e8c1d37, 17:18:33.951Z), /workspace/node_modules/graphql/error/syntaxError.js:8 (00a41e8c1dc5, 17:17:08.627Z), /workspace/node_modules/firebase-admin/lib/app/index.js:27 (00a41e8c1daa, 17:07:24.834Z). A code defect fails at the same module every time; a random per-instance EIO on unrelated vendor and app files is the disk under the container. Same-project confirmation: identical 'EIO: i/o error' module-load kills hit two unrelated services in the same 40 minutes — proxy (16 lines) and handleproderroralert (8 lines) — 31 EIO lines project-wide. With every cold start dying, the service had zero ready instances at 17:05:56–17:06:57Z and Cloud Run aborted 6 GET /embed/articles/edit/worker-html.js at latency 0s with the alerted 'no available instance'; nothing in packages/functions/src ran (embed.js's Koa middleware never executed, no application log line for any of the 6).

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/embed.js:9` — the alerted service's Koa app — module scope only builds App + one middleware; it appears in none of the six EIO stacks, so no code here caused the failed starts
- `packages/functions/src/functions/http.js:13` — embedApp onRequest declaration (memory 512MiB, timeoutSeconds 60, maxInstances 10, concurrency 80) — no value here is implicated; containers died in module load before serving, and maxInstances was never approached
- `packages/functions/src/services/crisp/initCrisp.js:5` — src of /workspace/lib/services/crisp/initCrisp.js:8 in the 17:28:12.872Z stack — `new Crisp()` enters the crisp-api require chain; the read of the file, not this line, returned EIO
- `packages/functions/src/helpers/optimize/optimizeHelper.js:18` — src of /workspace/lib/helpers/optimize/optimizeHelper.js:18 in the 17:18:33.951Z stack — a module with no relation to initCrisp or google-ads-node, showing the failing read is random per instance

## Evidence
- 6 matching entries: `resource.labels.service_name="embedapp" AND textPayload:"no available instance" AND timestamp>="2026-09-01T17:05:50Z" AND timestamp<="2026-09-01T17:35:50Z"`
- 31 matching entries: `textPayload:"EIO: i/o error" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T17:40:00Z"`
- 14 matching entries: `resource.labels.service_name="embedapp" AND textPayload:"STARTUP TCP probe" AND timestamp>="2026-09-01T17:05:50.163Z" AND timestamp<="2026-09-01T17:35:50.163Z"`
- 20 matching entries: `(resource.labels.service_name="embedapp" OR resource.labels.function_name="embedapp") AND timestamp>="2026-09-01T17:05:50.163Z" AND timestamp<="2026-09-01T17:35:50.163Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.58

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
