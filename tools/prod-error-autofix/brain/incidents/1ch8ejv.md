fingerprint: 1ch8ejv
service: apisa
message: The request failed because the instance failed the readiness check.
app: BLOG
repo: blogs
date: 2026-08-12T19:55:21.109Z
status: infra
attempt: 1

# BLOG · apisa · 1ch8ejv

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprint f4t7mg / gtghfi (already recorded infra, no MR): the same ~6-minute Cloud Run container-startup stall in avada-blog-app/us-central1 on 2026-08-12 (containers started 09:01:11Z–09:07:06Z) kept two apisa containers from binding :8080 inside the 240s default startup TCP probe timeout, so the two GET /apiSa/shops routed to them returned 503 'The request failed because the instance failed the readiness check' — not a defect in apisa's code.

**Mechanism.** The alert text is the Cloud Run httpRequest fallback (P7), not an application error. Both 503s in the window are the request-side face of the two probe failures already recorded under f4t7mg: same revision apisa-00123-daj, same instanceIds 001548f729e2e2ba… and 001548f729d07cf3…, same referer https://blogapp.seoon.io/articles/edit/607204802842. Cloud Run's default gen2 startup probe is TCP :8080, timeout 240s, failureThreshold 1; the two requests returned 503 at latency 240.160161s and 242.238515s — P4, latency matching a configured limit to the tenth of a second — and the matching 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … Connection failed with status DEADLINE_EXCEEDED' entries landed at 09:07:49.312927Z and 09:09:53.966838Z. apisa's own baseline over the preceding 32h is n=16 cold starts, median 18.4s, p95 36.3s, 0 failures, i.e. 240s is 6.6× the observed max, and the band was not apisa-specific: 11 containers started in 09:01:11.58–09:07:06.36Z across apisa, ontokenuserwritten, authsa and knowledgebase, 6 of which failed at 240.1–240.7s, while 0 of 5 containers started at/after 09:07:50.517262Z failed (18.9–48.5s). Neither 503 has any application log line — the container died before any Koa middleware ran, so shopController.getUserShops was never entered. The 11 stderr lines in the window are unrelated: 3 '[redis.service] connected' from healthy containers that bound at 09:07:56.8–09:08:30.5Z (after the band cleared) and 8 already-handled [getCrmWidgets] HTTP 400 warnings at severity WARNING, which did not fail any request.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:36` — apiSa declared memory 1GiB / cpu 1 / maxInstances 5 / concurrency 100 with no minInstances — every traffic ramp pays a cold start and a stalled start has no warm fallback
- `packages/functions/src/functions/http.js:41` — maxInstances: 5, second-lowest ceiling of the HTTP functions; with concurrency 100 the autoscaler must start a fresh container to absorb a burst, which is what put these two starts inside the stall band
- `packages/functions/src/index.js:7` — index.js re-exports http, pubsub, scheduled and firestore, so every apisa container evaluates the whole functions import graph (koa, shopify, langchain/langgraph, ioredis, googleapis) before it can bind :8080 — the 18.4s median baseline
- `packages/functions/src/routes/api.js:55` — GET /shops → shopController.getUserShops, the endpoint behind both 503s; the handler was never entered, which is why stderr has no line for either request

## Evidence
- 2 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-12T08:52:52.465Z" AND timestamp<="2026-08-12T09:22:52.465Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-12T08:50:00Z" AND timestamp<="2026-08-12T09:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 40 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-12T08:50:00Z" AND timestamp<="2026-08-12T09:30:00Z" AND (textPayload:"Starting new instance" OR textPayload:"STARTUP TCP probe")`
- 32 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-11T00:00:00Z" AND timestamp<="2026-08-12T08:00:00Z" AND (textPayload:"Starting new instance" OR textPayload:"STARTUP TCP probe")`
- 11 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-12T08:52:52.465Z" AND timestamp<="2026-08-12T09:22:52.465Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.05

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
