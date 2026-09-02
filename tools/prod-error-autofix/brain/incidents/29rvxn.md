fingerprint: 29rvxn
service: embedapp
message: The request failed because the instance failed the readiness check.
app: BLOG
repo: blogs
date: 2026-09-01T17:41:14.710Z
status: infra
attempt: 1

# BLOG · embedapp · 29rvxn

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of recorded fingerprints kmu32w / y8dc6e / 1ocmru: infra, not code — the Cloud Run container filesystem in avada-blog-app/us-central1 returned EIO on readFileSync during Node module load, so embedapp cold-start containers (revision embedapp-00160-siq) died before binding :8080, and the alerted 503 readiness-check failure is the same 17:07:58.162303Z / 249.106246s request already recorded under kmu32w.

**Mechanism.** Nothing in packages/functions/src ran. In the 30-minute window 16 distinct embedapp instances, all on one revision embedapp-00160-siq, logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.' Seven of them emitted the functions-framework module-load kill first: 'Provided module can't be loaded.' → 'Is there a syntax error in your code?' → 'Detailed stack trace: Error: EIO: i/o error, read' → `at Object.readFileSync (node:fs:440:20)` → defaultLoadImpl → Module.load → require → 'Could not load the function, shutting down.' The file that failed to read differs on every instance and the seven share no dependency relation: /workspace/node_modules/firebase-admin/lib/app/index.js:27 (00a41e8c1daa, 17:07:24.834Z), /workspace/node_modules/graphql/error/syntaxError.js:8 (00a41e8c1dc5, 17:17:08.627Z), /workspace/lib/helpers/optimize/optimizeHelper.js:18 (00a41e8c1d37, 17:18:33.951Z), /workspace/lib/services/crisp/initCrisp.js:8 (00a41e8c1d3f, 17:28:12.872Z), /workspace/node_modules/crisp-api/lib/crisp.js:764 twice (00a41e8c1dfc 17:28:38.532Z, 00a41e8c1d99 17:29:00.326Z), and a .json load at /workspace/node_modules/google-ads-node/build/src/v24/ad_parameter_service_client.js:28 (00a41e8c1d27, 17:32:53.216Z) — five vendor modules, two app modules, one of them a JSON require (Object..json frame). A code defect fails at the same module on every start; a random per-instance EIO across unrelated paths on one revision is the disk under the container. The 14 alerted 5xx are the pure consequence: 13× 500 'The request failed because the instance could not start successfully' at latency 0s (Cloud Run rejected at admission, Koa never entered) on /embed/blog and /embed/articles/edit/*, plus the single 503 'The request failed because the instance failed the readiness check' at 249.106246s — the readiness deadline, not any handler's work.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/embed.js:9` — the alerted service's Koa app; module scope only builds an App, registers koa-ejs and one error-handler middleware, and it appears in none of the seven EIO stacks — nothing here caused the failed start
- `packages/functions/src/services/crisp/initCrisp.js:5` — src of /workspace/lib/services/crisp/initCrisp.js:8 in the 17:28:12.872Z stack — `new Crisp()` is where the crisp-api require chain enters; the read of crisp-api's own file, not this line, returned EIO
- `packages/functions/src/helpers/optimize/optimizeHelper.js:18` — src of /workspace/lib/helpers/optimize/optimizeHelper.js:18 in the 17:18:33.951Z stack — an import of the logger, unrelated to initCrisp or crisp-api, showing the failing read is random per instance
- `packages/functions/src/functions/http.js:13` — embedApp's onRequest declaration — the runtime config the alert is scoped to; no memory or timeout value here is implicated, the container died in module load before serving

## Evidence
- 16 matching entries: `resource.labels.service_name="embedapp" AND textPayload:"STARTUP TCP probe" AND timestamp>="2026-09-01T17:07:06.034Z" AND timestamp<="2026-09-01T17:37:06.034Z"`
- 7 matching entries: `resource.labels.service_name="embedapp" AND textPayload:"EIO: i/o error" AND timestamp>="2026-09-01T17:07:06.034Z" AND timestamp<="2026-09-01T17:37:06.034Z"`
- 26 matching entries: `textPayload:"EIO: i/o error" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T17:40:00Z"`
- 14 matching entries: `(resource.labels.service_name="embedapp" OR resource.labels.function_name="embedapp") AND timestamp>="2026-09-01T17:07:06.034Z" AND timestamp<="2026-09-01T17:37:06.034Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.38

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
