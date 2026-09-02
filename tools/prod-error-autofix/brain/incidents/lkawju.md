fingerprint: lkawju
service: api
message: HTTP 500 GET /api/articles
app: BLOG
repo: blogs
date: 2026-09-01T18:11:32.078Z
status: infra
attempt: 2

# BLOG · api · lkawju

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the Cloud Run container filesystem in avada-blog-app/us-central1 returned `EIO: i/o error, read` on readFileSync during Node module load, so api revision api-00163-mox cold-start containers died before binding :8080; the alerted `HTTP 500 GET /api/articles` is a Cloud Run admission rejection (latency 0s, no application log) collateral to that container-start fault.

**Mechanism.** Between 17:29:27Z and 17:48:24Z, 10 distinct api instances on revision api-00163-mox each logged `Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.` Two of them left the reason in stderr before dying: instance 00a41e8c1d4c41fe83 at 17:40:27.378Z and 00a41e8c1d849da1c5 at 17:43:26.288Z both printed `Provided module can't be loaded.` / `Detailed stack trace: Error: EIO: i/o error, read` / `at Object.readFileSync (node:fs:440:20)` / `Could not load the function, shutting down.` The two stacks fail on different files — `/workspace/node_modules/firebase-functions/lib/common/providers/firestore.js:25` and `/workspace/node_modules/puppeteer/lib/cjs/puppeteer/getConfiguration.js:96` via cosmiconfig — so it is the container filesystem, not one corrupt module. api is declared with no `minInstances` (packages/functions/src/functions/http.js:26), so every request arriving while the warm pool is exhausted needs a cold start; with cold starts failing, Cloud Run answered 5 of the 6 window 5xx with `503 The request failed because the instance failed the readiness check` (latencies 23.1s–242.2s) and rejected the alerted `GET /api/articles?after=&author=&before=&blog=&getRecentPosts=true&limit=10&order=UPDATED_AT+desc&page=1&searchKey=&status=&tag=` at admission on instance 00a41e8c1dba0b74f4 with latency 0s and an empty jsonPayload `{}` — that instance emitted zero stderr lines, i.e. no application code ever ran. Same-day, same-region family already recorded: srjhey (BLOG api EIO), 14ywrzy/h47mgc (BLOG proxy), kmu32w/1ocmru/y8dc6e/29rvxn (BLOG embedapp), plus the avada-seo and image-optimizer EIO set.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:26` — api is declared with memory 2GiB / concurrency 10 / maxInstances 100 and no minInstances, so every request beyond the warm pool needs a cold start — which is exactly what the platform could not complete in this window

## Evidence
- 10 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-01T17:26:06.110Z" AND timestamp<="2026-09-01T17:56:06.110Z" AND severity>=ERROR AND textPayload:"STARTUP TCP probe failed"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-01T17:26:06.110Z" AND timestamp<="2026-09-01T17:56:06.110Z" AND logName:"stderr" AND textPayload:"EIO: i/o error, read"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-01T17:26:06.110Z" AND timestamp<="2026-09-01T17:56:06.110Z" AND logName:"stderr" AND textPayload:"Could not load the function, shutting down."`
- 6 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-01T17:26:06.110Z" AND timestamp<="2026-09-01T17:56:06.110Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.58

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
