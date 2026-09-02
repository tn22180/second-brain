fingerprint: 1ombwxy
service: apisagen2
message: HTTP 500 GET /apiSa/history-optimize/count
app: SEO
repo: seo
date: 2026-09-01T17:49:49.118Z
status: infra
attempt: 1

# SEO · apisagen2 · 1ombwxy

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of recorded fingerprints 10y5ot5 / 1st9nfu: infra, not code — the Cloud Run container filesystem in avada-seo/us-central1 returned `EIO: i/o error, read` to Node's `readFileSync` during module load, so apisagen2 cold-start containers of revision apisagen2-00346-xoh died at import time and Cloud Run answered the queued requests, including the alerted GET /apiSa/history-optimize/count, with admission 500/503 before any app code ran.

**Mechanism.** 14 distinct apisagen2 cold-start instances (all revision apisagen2-00346-xoh) logged `Provided module can't be loaded. / Is there a syntax error in your code? / Detailed stack trace: Error: EIO: i/o error, read at Object.readFileSync (node:fs:440:20)` between 17:34:15.906Z and 17:43:23.086Z, each followed by `Could not load the function, shutting down.` The failing require is a different third-party module every time — googleapis/build/src/apis/{index,logging,calendar,analyticsdata,billingbudgets,drive}/…, @avada/shopify-api/dist/utils/index.js:5 and :10, @shopify/koa-shopify-webhooks/…/@shopify/network, @avada/core/build/services/authService.js:88 — i.e. random blocks of the read-only container image, not one bad file, which rules out a code or bundle defect. Container death at import means :8080 is never bound, producing the 60 `Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080` entries and the 103 `The request failed because the instance could not start successfully` + 13 readiness + 8 `no available instance` request errors. All 4 alerted GET /apiSa/history-optimize/count 500s have latency `0s` and carry Cloud Run admission text (`no available instance` ×2, `instance could not start successfully` ×1, blank ×1) — no controller ran. Application stderr in the whole 30-minute window contains exactly one non-startup line, `[fleetHealth] fleet health false → true (ok:6w)` at 17:46:57Z, which is recovery, not a fault.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:53` — apiSaGen2 is declared minInstances:1 / concurrency:10 in prod, so a burst above one warm instance forces cold starts — the exact path the platform EIO fault killed; the declaration is correct, nothing to change.

## Evidence
- 14 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-09-01T17:17:55.748Z" AND timestamp<="2026-09-01T17:47:55.748Z" AND logName:"stderr" AND textPayload:"EIO: i/o error, read"`
- 60 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-09-01T17:17:55.748Z" AND timestamp<="2026-09-01T17:47:55.748Z" AND severity>=ERROR AND textPayload:"STARTUP TCP probe failed"`
- 129 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-09-01T17:17:55.748Z" AND timestamp<="2026-09-01T17:47:55.748Z" AND httpRequest.status>=500`
- 4 matching entries: `(resource.labels.service_name="apisagen2") AND timestamp>="2026-09-01T17:17:55.748Z" AND timestamp<="2026-09-01T17:47:55.748Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"/apiSa/history-optimize/count"`

## Job
- analyze rounds: 1
- cost: $1.56

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
