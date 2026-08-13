fingerprint: f4t7mg
service: apisa
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: BLOG
repo: blogs
date: 2026-08-12T19:53:47.944Z
status: infra
attempt: 1

# BLOG · apisa · f4t7mg

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprint gtghfi (already recorded infra, no MR): the same ~6-minute Cloud Run container-startup stall in avada-blog-app/us-central1 on 2026-08-12 (containers started 09:01:11Z–09:07:06Z) kept two apisa containers from binding :8080 inside the 240s default startup TCP probe timeout — not a defect in apisa's code, since every container of four unrelated services started inside that band was degraded and every container started after 09:07:50Z was normal.

**Mechanism.** Cloud Run's default startup probe for a gen2 function is TCP :8080, timeout 240s, failureThreshold 1. The two apisa instances that failed logged 'STARTUP TCP probe failed … Connection failed with status DEADLINE_EXCEEDED' at 240.54s (start 09:03:48.770552Z → fail 09:07:49.312927Z) and 240.63s (start 09:05:53.337471Z → fail 09:09:53.966838Z) — P4, latency matching a configured limit to the tenth of a second. apisa's own baseline over the preceding 32h is n=16 cold starts, median 18.4s, p95 36.3s, max 36.3s, 0 failures, so 240s is 6.6× the observed max. The band is not apisa-specific: 11 containers started in 09:01:11.58–09:07:06.36Z across apisa, ontokenuserwritten, authsa and knowledgebase, of which 6 failed at 240.1–240.7s and the 5 that survived were still 3–8× baseline (authsa 75.1s, apisa 62.9s, ontokenuserwritten 112.4s and 152.3s — the last two bound :8080 at 09:07:17.009709Z and 09:07:17.026486Z, 17 ms apart despite starting 40s apart, i.e. blocked on the same external thing and released together, not on their own module load). 0 of 5 containers started at/after 09:07:50.517262Z failed; they bound in 18.9–48.5s. Consequence for the app: two GET /apiSa/shops from the standalone editor (referer https://blogapp.seoon.io/articles/edit/607204802842) were routed to those two never-started containers and returned 503 'The request failed because the instance failed the readiness check' after 240.160161s and 242.238515s, so the standalone editor could not load its shop list for ~4 minutes. No application log line exists for either request — the container died before any Koa middleware ran.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:36` — apiSa is declared memory 1GiB / cpu 1 / maxInstances 5 / concurrency 100 with no minInstances, so every traffic ramp pays a cold start and a stalled start has no warm fallback
- `packages/functions/src/functions/http.js:41` — maxInstances: 5 is the second-lowest ceiling of the HTTP functions; with concurrency 100 the autoscaler must start a fresh container to absorb a burst, which is what put these two starts inside the stall band
- `packages/functions/src/index.js:7` — index.js re-exports http, pubsub, scheduled and firestore, so every apisa container evaluates the whole functions import graph (koa, shopify, langchain/langgraph, ioredis, googleapis) before it can bind :8080 — the 18.4s median baseline
- `packages/functions/src/routes/api.js:55` — GET /shops → shopController.getUserShops, the endpoint behind both 503s; the handler was never entered, which is why stderr has no line for either request

## Evidence
- 2 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-12T08:50:00Z" AND timestamp<="2026-08-12T09:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 10 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-12T08:50:00Z" AND timestamp<="2026-08-12T09:30:00Z" AND (textPayload:"Starting new instance" OR textPayload:"STARTUP TCP probe")`
- 32 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-11T00:00:00Z" AND timestamp<="2026-08-12T08:00:00Z" AND (textPayload:"Starting new instance" OR textPayload:"STARTUP TCP probe")`
- 40 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-12T08:50:00Z" AND timestamp<="2026-08-12T09:30:00Z" AND (textPayload:"Starting new instance" OR textPayload:"STARTUP TCP probe")`
- 2 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-12T08:52:52.122Z" AND timestamp<="2026-08-12T09:22:52.122Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.34

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
