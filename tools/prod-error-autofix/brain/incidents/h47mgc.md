fingerprint: h47mgc
service: proxy
message: The request failed because the instance could not start successfully.
app: BLOG
repo: blogs
date: 2026-09-01T17:35:51.111Z
status: infra
attempt: 2

# BLOG · proxy · h47mgc

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of recorded fingerprint 14ywrzy: infra, not code — the Cloud Run container filesystem in avada-blog-app/us-central1 returned `EIO: i/o error, read` on readFileSync during Node module load, so 16 distinct proxy cold-start containers on revision proxy-00161-kas died before binding :8080 during 2026-09-01T17:06–17:29Z, and the platform answered every request routed to them with `The request failed because the instance could not start successfully.`

**Mechanism.** Each dying instance logs `Provided module can't be loaded. / Is there a syntax error in your code? / Detailed stack trace: Error: EIO: i/o error, read at Object.readFileSync (node:fs:440:20)` then `Could not load the function, shutting down.` (13 EIO stacks, 14 shutdown lines, 16 distinct instanceIds, all on the single revision proxy-00161-kas created 2026-09-01T00:42:03Z — no deploy in the window). The frame under readFileSync is a DIFFERENT file every time: zod/v4/locales/index.cjs (3× at :84, 2× at :120), @avada/shopify-api/dist/utils/index.js (2), zod/v4/core/index.cjs, firebase-admin/lib/auth/base-auth.js, firebase-admin/lib/auth/tenant.js, firebase-functions/lib/common/providers/database.js, puppeteer/lib/cjs/puppeteer/puppeteer.js, google-ads-api/build/src/parserRest.js. A code or dependency defect fails at the same require every time; a read error at a random offset of a random file is the storage layer under the container image, not the module graph. Because the process never listens, Cloud Run fires `Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080` (25 entries) and the frontend synthesises the 5xx: 140 `instance could not start`, 5 `readiness check`, 7 `no available instance`. 148 of the 153 5xx have latency exactly 0s and there is not one application log line behind them, across four unrelated routes (/proxy/shop/blog 99, /proxy/posts-by-tag 24, /proxy/tags 21, /proxy/seoOn-preview 6) — one infra cause, four symptoms. proxy is declared with no minInstances (packages/functions/src/functions/http.js:60-63), so storefront traffic is served entirely by cold starts and every one is exposed to the fault. Same revision also served normally in the same window (5 requests with real latency 34–245s), which rules out the build.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:61` — proxy declared {memory:'512MiB', cpu:1, timeoutSeconds:60, maxInstances:10, concurrency:80} with no minInstances — every storefront request in this window landed on a cold start, which is what the EIO fault kills
- `packages/functions/src/index.js:6` — this file is the deployed /workspace/lib/index.js whose require chain pulls in every node_modules file that appears in the EIO stacks (zod, firebase-admin, puppeteer, google-ads-api) at container start

## Evidence
- 13 matching entries: `resource.labels.service_name="proxy" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T17:05:37Z" AND timestamp<="2026-09-01T17:35:37Z" AND logName:"stderr" AND textPayload:"EIO: i/o error, read"`
- 14 matching entries: `resource.labels.service_name="proxy" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T17:05:37Z" AND timestamp<="2026-09-01T17:35:37Z" AND logName:"stderr" AND textPayload:"Could not load the function, shutting down."`
- 140 matching entries: `resource.labels.service_name="proxy" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T17:05:37Z" AND timestamp<="2026-09-01T17:35:37Z" AND severity>=ERROR AND textPayload:"instance could not start successfully"`
- 25 matching entries: `resource.labels.service_name="proxy" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T17:05:37Z" AND timestamp<="2026-09-01T17:35:37Z" AND severity>=ERROR AND textPayload:"STARTUP TCP probe failed"`
- 153 matching entries: `resource.labels.service_name="proxy" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T17:05:37Z" AND timestamp<="2026-09-01T17:35:37Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.48

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
