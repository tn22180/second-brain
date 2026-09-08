fingerprint: 2wf7hx
service: syncsubscribeactivecharge
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#abort-request>
app: BLOG
repo: blogs
date: 2026-09-08T02:46:06.573Z
status: infra
attempt: 1

# BLOG · syncsubscribeactivecharge · 2wf7hx

**Outcome.** infra class — reported, no MR

**Root cause.** Not code: the 2026-09-07T13:00:23Z Cloud Scheduler tick for syncSubscribeActiveCharge was rejected at the Cloud Run frontend before any container was assigned — the function is declared maxInstances: 1 and scales to zero between its 30-minute ticks, so the single instance slot was unavailable at admission and the request was aborted with latency 0s.

**Mechanism.** packages/functions/src/functions/scheduled.js:7-16 declares syncSubscribeActiveCharge as onSchedule('*/30 * * * *') with {memory:'512MiB', cpu:0.5, timeoutSeconds:300, maxInstances:1}, and globalOptions.js sets only region/VPC — grep for minInstances across packages/functions/src returns zero hits, so nothing keeps a warm instance. Every tick therefore cold-starts: the 12:30:06.736867Z tick logged 'Starting new instance. Reason: AUTOSCALING' at 12:30:06.781685Z, probe succeeded 12:30:18.721491Z, request returned 200 in 13.689842397s on instance 00a41e8c1dbc06b8…a012c5. At 13:00:23.384371Z the next tick (POST /, userAgent Google-Cloud-Scheduler, requestSize 1324, revision syncsubscribeactivecharge-00164-jom) got status 500, latency '0s', no instanceId label, textPayload 'The request was aborted because there was no available instance' — and there is NO 'Starting new instance' system-log entry at that second, i.e. Cloud Run never attempted a container for it. The start it did eventually make came 144s later (13:02:47.507221Z AUTOSCALING, probe succeeded 13:03:15.301650Z, container logged '[redis.service] connected 34.60.93.33' at 13:03:15.340681Z) and served no request at all — zero request-log entries between 13:00:23Z and 13:30:11Z. That pattern — instant admission rejection under a cap of 1 while the previous instance was being reclaimed, then a late orphan start — is a platform capacity/teardown race at the maxInstances:1 boundary, not application behaviour. The handler cannot produce this: subscribeActiveCharge (packages/functions/src/handlers/pubsub/subcribeActiveCharge.js:6-16) wraps its entire body in try/catch and returns undefined, so no code path emits a 500, and no stderr line exists for the failed tick. Consequence: onSchedule is declared with no retryConfig, so the tick was dropped outright — one 30-minute updateSubscriberTokens fan-out window skipped (the following 13:30:11.975740Z run took 36.013756557s vs the 10-14s norm).

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/scheduled.js:13` — maxInstances: 1 — the cap the aborted request was rejected against; one slot means a reclaiming instance leaves no capacity for the next tick
- `packages/functions/src/functions/scheduled.js:9` — schedule '*/30 * * * *' — 30-minute gap far exceeds Cloud Run idle retention, so every tick is a cold start with no warm instance to accept it
- `packages/functions/src/functions/scheduled.js:11` — cpu: 0.5 — half a vCPU loading the full @functions import graph, which is why each cold start costs 10-14s and why the start/teardown window is wide
- `packages/functions/src/functions/scheduled.js:7` — the onSchedule declaration carries no retryConfig, so a tick rejected at admission is lost rather than re-fired
- `packages/functions/src/globalOptions.js:5` — setGlobalOptions supplies only region and VPC connector — confirms no fleet-wide minInstances warm floor exists
- `packages/functions/src/handlers/pubsub/subcribeActiveCharge.js:13` — the handler body is entirely inside try/catch and swallows every error, so application code cannot emit the alerted 500 — the failure is pre-handler, at container admission

## Evidence
- 96 matching entries: `resource.labels.service_name="syncsubscribeactivecharge" AND timestamp>="2026-09-06T00:00:00Z" AND timestamp<="2026-09-08T00:00:00Z" AND logName="projects/avada-blog-app/logs/run.googleapis.com%2Frequests"`
- 1 matching entries: `resource.labels.service_name="syncsubscribeactivecharge" AND timestamp>="2026-09-07T12:46:41.450Z" AND timestamp<="2026-09-07T13:16:41.450Z" AND severity>=ERROR`
- 4 matching entries: `resource.labels.service_name="syncsubscribeactivecharge" AND timestamp>="2026-09-07T12:20:00Z" AND timestamp<="2026-09-07T13:20:00Z" AND logName="projects/avada-blog-app/logs/run.googleapis.com%2Fvarlog%2Fsystem"`
- 1 matching entries: `resource.labels.service_name="syncsubscribeactivecharge" AND timestamp>="2026-09-07T12:46:41.450Z" AND timestamp<="2026-09-07T13:16:41.450Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.52

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
