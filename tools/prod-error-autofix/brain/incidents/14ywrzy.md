fingerprint: 14ywrzy
service: proxy
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: BLOG
repo: blogs
date: 2026-09-01T17:33:32.050Z
status: infra
attempt: 2

# BLOG · proxy · 14ywrzy

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the Cloud Run container filesystem in avada-blog-app/us-central1 returned `EIO: i/o error, read` on readFileSync during Node module load, so 12 distinct proxy cold-start containers on revision proxy-00161-kas died before binding :8080 during 2026-09-01T17:06–17:29Z.

**Mechanism.** Each failing instance logs `Provided module can't be loaded. / Is there a syntax error in your code? / Detailed stack trace: Error: EIO: i/o error, read at Object.readFileSync (node:fs:440:20)` and then `Could not load the function, shutting down.` The frame under readFileSync is a DIFFERENT file on every occurrence — zod/v4/locales/index.cjs (5), @avada/shopify-api/dist/utils/index.js (2), zod/v4/core/index.cjs, firebase-admin/lib/auth/base-auth.js, firebase-admin/lib/auth/tenant.js, firebase-functions/lib/common/providers/database.js, puppeteer/lib/cjs/puppeteer/puppeteer.js, google-ads-api/build/src/parserRest.js, and /workspace/lib/index.js itself (the deployed babel output of packages/functions/src/index.js). A code or dependency defect would fail at the same require every time; a read error at a random offset of a random file is the storage layer under the container image, not the module graph. Because the process never listens, Cloud Run's `Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080` fires (24 entries) and every request routed to that instance is answered by the platform with `The request failed because the instance could not start successfully.` — 101 of 114 5xx in the window, all latency 0s, with zero application log lines. Same revision proxy-00161-kas also started successfully in the same window (instance 00a41e8c1d86 serves normally at 17:14:47Z and 17:26:52Z), which rules the build itself out. proxy is declared with no minInstances (packages/functions/src/functions/http.js:60-63), so storefront traffic is served entirely by cold starts and every one of them is exposed to the fault.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:61` — proxy is declared {memory:'512MiB', cpu:1, timeoutSeconds:60, maxInstances:10, concurrency:80} with no minInstances — every storefront request in this window landed on a cold start, which is what the EIO fault kills
- `packages/functions/src/index.js:6` — this file is the deployed /workspace/lib/index.js whose require chain appears in one of the EIO stacks (17:27:23.704Z), showing the fault hit the app's own entry module too, not only node_modules

## Evidence
- 13 matching entries: `resource.labels.service_name="proxy" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T17:05:35Z" AND timestamp<="2026-09-01T17:35:35Z" AND logName:"stderr" AND textPayload:"EIO: i/o error, read"`
- 14 matching entries: `resource.labels.service_name="proxy" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T17:05:35Z" AND timestamp<="2026-09-01T17:35:35Z" AND logName:"stderr" AND textPayload:"Could not load the function, shutting down."`
- 24 matching entries: `resource.labels.service_name="proxy" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T17:05:35Z" AND timestamp<="2026-09-01T17:35:35Z" AND severity>=ERROR AND textPayload:"STARTUP TCP probe failed"`
- 114 matching entries: `resource.labels.service_name="proxy" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T17:05:35Z" AND timestamp<="2026-09-01T17:35:35Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.47

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
