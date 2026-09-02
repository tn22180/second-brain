fingerprint: hicizs
service: authsa
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: BLOG
repo: blogs
date: 2026-09-01T18:36:01.984Z
status: infra
attempt: 1

# BLOG · authsa · hicizs

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-start fault swept avada-blog-app/us-central1 during 2026-09-01T16:34–18:14Z, and two authsa cold-start containers on revision authsa-00160-quq took 242.3s and 240.3s to bind :8080 — past Cloud Run's 240s default STARTUP TCP probe deadline — so both were killed and their queued GET /authSa/a/login requests returned 503 'instance failed the readiness check'.

**Mechanism.** authSa is declared with no minInstances and maxInstances: 3 (packages/functions/src/functions/http.js:53-54), and setGlobalOptions declares no minInstances either (packages/functions/src/globalOptions.js:5), so authsa runs at zero warm instances — it logged only 19 cold starts in 3 days. Every /authSa/a/login therefore pays a full cold start. Baseline for that cold start on this revision is 11.5–24.0s over 17 consecutive successful starts (2026-08-30T20:35 → 2026-09-01T09:24, all 'STARTUP TCP probe succeeded after 1 attempt'). During the fault window two starts blew that by 10–20×: instance 00a41e8c1db6…'Starting new instance. Reason: AUTOSCALING' at 18:08:35.365658Z → probe DEADLINE_EXCEEDED at 18:12:37.680108Z = 242.3s; instance 00a41e8c1d1f… started 18:10:54.998039Z → probe failed at 18:14:55.310943Z = 240.3s. Both match Cloud Run's default startup TCP probe deadline of 240s, which is what 'Connection failed with status DEADLINE_EXCEEDED' names. The two 503s in the requests read are the queued requests for exactly those two instanceIds, with latencies 243.099454s and 241.281768s — i.e. the request sat for the whole probe deadline and was then failed by the frontend, not by any handler. It is not a code or memory defect on this revision: the identical image on the same revision started clean 22.7s later (instance 00a41e8c1dad…, started 18:11:55.363649Z, probe succeeded 18:12:18.037898Z, then '[redis.service] connected 34.60.93.33'), and a third start took 145.2s (00a41e8c1dbe…, 18:12:44.714715Z → 18:15:09.905279Z) — 6× baseline, still under the deadline. It is not OOM: zero 'Memory limit' entries exist anywhere in avada-blog-app for the entire 24h of 2026-09-01 (this corrects the round-1 hypothesis). The fault is project-wide: 103 'STARTUP TCP probe failed' entries across 8 distinct services (handleproderroralert 34, proxy 30, embedapp 16, api 10, syncsubscribeactivecharge 4, knowledgebase 4, ontokenuserwritten 3, authsa 2) between 16:34Z and 18:14Z, alongside 36 'EIO: i/o error, read' container-filesystem errors, all confined to the 17:00Z hour, on api/proxy/embedapp/knowledgebase/handleproderroralert. Same family as recorded fingerprints lkawju, 14ywrzy, srjhey, 7idu8p and kmu32w on this project and date. authsa's 2 failures are its only two in 7 days (2026-08-26 → 2026-09-02, 47 probe events, 45 succeeded).

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:54` — authSa runtime config — memory '512MiB', cpu 1, maxInstances 3, concurrency 80, and no minInstances, so every request after idle is a cold start and a platform startup stall is user-visible as a 503
- `packages/functions/src/functions/http.js:53` — the authSa export itself — the function behind Cloud Run service `authsa`, revision authsa-00160-quq, that served the alerted 503s
- `packages/functions/src/globalOptions.js:5` — setGlobalOptions declares only region and VPC — no global minInstances floor, so nothing keeps an authsa instance warm

## Evidence
- 4 matching entries: `resource.labels.service_name="authsa" AND timestamp>="2026-09-01T17:30:00Z" AND timestamp<="2026-09-01T18:40:00Z" AND textPayload:"STARTUP TCP probe"`
- 47 matching entries: `resource.labels.service_name="authsa" AND timestamp>="2026-08-26T00:00:00Z" AND timestamp<="2026-09-02T00:00:00Z" AND textPayload:"STARTUP TCP probe"`
- 103 matching entries: `resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T16:00:00Z" AND timestamp<="2026-09-01T19:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 36 matching entries: `resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T00:00:00Z" AND timestamp<="2026-09-02T00:00:00Z" AND textPayload:"EIO: i/o error"`
- 2 matching entries: `resource.labels.service_name="authsa" AND timestamp>="2026-09-01T17:58:42.634Z" AND timestamp<="2026-09-01T18:28:42.634Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 2
- cost: $2.73

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
