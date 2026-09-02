fingerprint: 1ocmru
service: embedapp
message: The request failed because the instance could not start successfully.
app: BLOG
repo: blogs
date: 2026-09-01T17:39:36.629Z
status: infra
attempt: 1

# BLOG · embedapp · 1ocmru

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the Cloud Run container filesystem in avada-blog-app/us-central1 returned EIO on readFileSync during Node module load, so 9 embedapp cold-start containers on revision embedapp-00160-siq died before binding :8080 during 2026-09-01T17:07-17:32Z, and the platform answered every request routed to them with 'The request failed because the instance could not start successfully.' Duplicate of recorded fingerprints kmu32w / y8dc6e (same service, same revision, same window).

**Mechanism.** Each dying instance logs 'Provided module can't be loaded. / Is there a syntax error in your code? / Detailed stack trace: Error: EIO: i/o error, read at Object.readFileSync (node:fs:440:20)' then 'Could not load the function, shutting down.' — 7 EIO stacks, 7 shutdown lines, 9 distinct instanceIds, all on the single revision embedapp-00160-siq created 2026-09-01T00:42:03Z (no deploy in the window). The frame under readFileSync is a DIFFERENT file each time: firebase-admin/lib/app/index.js:27, graphql/error/syntaxError.js:8, lib/helpers/optimize/optimizeHelper.js:18, lib/services/crisp/initCrisp.js:8, crisp-api/lib/crisp.js:764 (2x), google-ads-node/build/src/v24/ad_parameter_service_client.js:28. A code or dependency defect fails at the same require every time; a read error at a random offset of a random file — including two files inside the app's own babel output — is the storage layer under the container image, not the module graph. Because the process never listens, Cloud Run fires 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080' (16 entries) and the frontend synthesises the 5xx: 13 'instance could not start', 1 'readiness check', 2 'no available instance'. 15 of the 16 5xx have latency exactly 0s with no application log line behind them, across three unrelated paths (/embed/articles/edit/* 13, /embed/blog 2, one 503 at 249.1s waiting on a readiness check) — one infra cause, several symptoms. embedApp is declared with no minInstances (packages/functions/src/functions/http.js:13-22), so admin iframe traffic is served entirely by cold starts and every one is exposed to the fault. The same revision also served HTTP 200 in the same window (0.10-0.16s, e.g. 17:30:30Z, 17:34:39Z), which rules out the build.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:13` — embedApp declared {memory:'512MiB', cpu:1, timeoutSeconds:60, maxInstances:10, concurrency:80} with no minInstances — every request in this window landed on a cold start, which is what the EIO fault kills
- `packages/functions/src/helpers/optimize/optimizeHelper.js:18` — one of the EIO stack frames is /workspace/lib/helpers/optimize/optimizeHelper.js:18 — the app's own babel output, read-faulted at container start, not a code defect
- `packages/functions/src/services/crisp/initCrisp.js:8` — another EIO frame is /workspace/lib/services/crisp/initCrisp.js:8, a different file in the same require chain — random file, random offset, storage layer

## Evidence
- 7 matching entries: `resource.labels.service_name="embedapp" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T17:06:01Z" AND timestamp<="2026-09-01T17:36:01Z" AND logName:"stderr" AND textPayload:"EIO: i/o error, read"`
- 7 matching entries: `resource.labels.service_name="embedapp" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T17:06:01Z" AND timestamp<="2026-09-01T17:36:01Z" AND logName:"stderr" AND textPayload:"Could not load the function, shutting down."`
- 16 matching entries: `resource.labels.service_name="embedapp" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T17:06:01Z" AND timestamp<="2026-09-01T17:36:01Z" AND severity>=ERROR AND textPayload:"STARTUP TCP probe failed"`
- 16 matching entries: `resource.labels.service_name="embedapp" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T17:06:01Z" AND timestamp<="2026-09-01T17:36:01Z" AND httpRequest.status>=500`
- 5 matching entries: `resource.labels.service_name="embedapp" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T17:06:01Z" AND timestamp<="2026-09-01T17:36:01Z" AND logName:"requests" AND httpRequest.status<500`

## Job
- analyze rounds: 1
- cost: $1.53

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
