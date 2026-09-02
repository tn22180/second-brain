fingerprint: kmu32w
service: embedapp
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: BLOG
repo: blogs
date: 2026-09-01T17:31:49.025Z
status: infra
attempt: 1

# BLOG · embedapp · kmu32w

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the Cloud Run container filesystem in avada-blog-app/us-central1 returned EIO on readFileSync during Node module load, so embedapp cold-start containers died before binding :8080 and Cloud Run logged the alerted STARTUP TCP probe failure.

**Mechanism.** Every alerted line is downstream of a container that never finished `require`. In the 30-minute window 17 distinct embedapp instances on one revision (embedapp-00160-siq) logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080'. Five of them also emitted the functions-framework module-load failure first: "Provided module can't be loaded." → "Is there a syntax error in your code?" → "Detailed stack trace: Error: EIO: i/o error, read" → `at Object.readFileSync (node:fs:440:20)` → `defaultLoadImpl` → `Module.load` → `require`, then 'Could not load the function, shutting down.' The file that failed to read is different on every instance and the five have nothing in common: `/workspace/node_modules/crisp-api/lib/crisp.js:764` (00a41e8c1d99, 17:29:00.326Z), `/workspace/lib/services/crisp/initCrisp.js:8` (00a41e8c1d3f, 17:28:12.872Z), `/workspace/lib/helpers/optimize/optimizeHelper.js:18` (00a41e8c1d37, 17:18:33.951Z), `/workspace/node_modules/graphql/error/syntaxError.js:8` (00a41e8c1dc5, 17:17:08.627Z), `/workspace/node_modules/firebase-admin/lib/app/index.js:27` (00a41e8c1daa, 17:07:24.834Z) — two vendor modules and three app modules, on paths with no dependency relation. A code defect fails at the same module every time; a random per-instance EIO on unrelated files is the disk under the container, not the bundle. Same-project confirmation: the identical 'EIO: i/o error, read' module-load kill hit two other unrelated services in the same 40 minutes — proxy (14 lines) and handleproderroralert (6 lines) — while embedapp logged 0 EIO lines in the whole preceding 24h. The 20 alerted 5xx are the pure consequence of the failed starts: 13× 500 'The request failed because the instance could not start successfully' and 6× 500 'The request was aborted because there was no available instance', all at latency 0s (Cloud Run rejected at admission, nothing reached Koa), plus one 503 'instance failed the readiness check' at 249.1s on instance 00a41e8c1da6, whose own probe failure is logged at 17:07:56.704Z. Nothing in packages/functions/src ran.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/embed.js:9` — the alerted service's Koa app — module scope only builds an App and registers one middleware; deployed as lib/handlers/embed.js, and it never appears in any of the five EIO stacks, so nothing here caused the failed start
- `packages/functions/src/services/crisp/initCrisp.js:5` — src of /workspace/lib/services/crisp/initCrisp.js:8 in the 17:28:12.872Z stack — `new Crisp()` is where the crisp-api require chain enters; the read of crisp-api's own file, not this line, is what returned EIO
- `packages/functions/src/helpers/optimize/optimizeHelper.js:18` — src of /workspace/lib/helpers/optimize/optimizeHelper.js:18 in the 17:18:33.951Z stack — a module unrelated to initCrisp, showing the failing read is random per instance
- `packages/functions/src/functions/http.js:13` — embedApp's onRequest declaration — the runtime config the alert is scoped to; no memory/timeout value here is implicated, the container died in module load before serving

## Evidence
- 17 matching entries: `resource.labels.service_name="embedapp" AND textPayload:"STARTUP TCP probe" AND timestamp>="2026-09-01T17:05:32.916Z" AND timestamp<="2026-09-01T17:35:32.916Z"`
- 6 matching entries: `resource.labels.service_name="embedapp" AND textPayload:"EIO: i/o error" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T17:40:00Z"`
- 26 matching entries: `textPayload:"EIO: i/o error" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T17:40:00Z"`
- 20 matching entries: `(resource.labels.service_name="embedapp" OR resource.labels.function_name="embedapp") AND timestamp>="2026-09-01T17:05:32.916Z" AND timestamp<="2026-09-01T17:35:32.916Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.50

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
