fingerprint: 15bqjgv
service: scanissuessubscribergen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-09-01T17:06:57.323Z
status: infra
attempt: 1

# SEO · scanissuessubscribergen2 · 15bqjgv

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a bounded platform-side container-start fault in avada-seo/us-central1 during the 2026-09-01 15:00–17:59Z window made one scanissuessubscribergen2 cold-start container (instance 00a41e8c1da985fa…, revision -00343-fup) fail Cloud Run's 240s startup TCP probe, so the single Pub/Sub push waiting on that cold start was answered 503 'instance failed the readiness check'.

**Mechanism.** The alerted 503 is one POST to https://scanissuessubscribergen2-…run.app/?__GCP_CloudEventsMode=CUSTOM_PUBSUB_projects/avada-seo/topics/scanIssues from userAgent 'APIs-Google' (the Pub/Sub push subscription), started 16:58:01.009Z with latency 242.135369s — the 240s startup-probe deadline plus scheduling (P4: the latency identifies which limit fired). Its instanceId 00a41e8c1da985fa… is the same instance that logged, at 17:02:01.579Z, 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED.' The container never bound :8080, so subscribeScanIssues (packages/functions/src/handlers/pubsub/subscribeScanIssues.js:12) was never entered — no partial writes, and Pub/Sub redelivers. Not this service's code: on the same revision -00343-fup (created 2026-08-28T10:49:28Z, i.e. no deploy rollout in the window) the same service logged 21 successful startup probes on 2026-09-01 against this 1 failure, and a different instance (00a41e8c1d7155…) ran a full manual scan for shop QOMGNTqsYq1kj9YqehBG start-to-finish 17:00:03.5Z→17:02:52.1Z while the failed delivery was still hanging — the image boots. Fleet-wide the same probe-failure line fired 62 times across 15 avada-seo services in 15:00–17:59Z (authgen2 29, handleoptimizeimagegen2 8, webhookpublishthemegen2 6, …, scanissuessubscribergen2 1) against 0 in the 13:00Z hour and 0 in the 18:00Z hour — a bounded platform window, same family already recorded on this date as 9y4a2r / 1up1ei8 / 1qj4dz7 / m2ghuu / 1nmx045. P3 OOM ruled out: zero 'Memory limit' lines for the service in 16:00–18:00Z, and the function is declared memory '4GiB'. scanIssuesSubscriberGen2 carries no minInstances (packages/functions/src/handlers/exports/pubsubFunctions.js:234-237), so every scanIssues message arriving at zero warm instances pays a full cold start and is exposed to a platform start fault; that is the only code-side lever and it is a cost decision, not a defect.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:234` — scanIssuesSubscriberGen2 export — the Cloud Run service whose cold start failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:235` — {memory: '4GiB', timeoutSeconds: 540, topic: 'scanIssues'} — no minInstances, so each scanIssues burst pays a cold start; 4GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/handlers/pubsub/subscribeScanIssues.js:12` — the handler behind the topic — never entered, the container died before listen(), so no partial work

## Evidence
- 2 matching entries: `(resource.labels.service_name="scanissuessubscribergen2" OR resource.labels.function_name="scanissuessubscribergen2" OR resource.labels.job_name="scanissuessubscribergen2") AND timestamp>="2026-09-01T16:48:24.492Z" AND timestamp<="2026-09-01T17:18:24.492Z" AND severity>=ERROR`
- 1 matching entries: `(resource.labels.service_name="scanissuessubscribergen2") AND timestamp>="2026-09-01T16:48:24.492Z" AND timestamp<="2026-09-01T17:18:24.492Z" AND httpRequest.status>=500`
- 62 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T15:00:00Z" AND timestamp<="2026-09-01T17:59:59Z" AND textPayload:"STARTUP TCP probe failed"`
- 21 matching entries: `resource.labels.service_name="scanissuessubscribergen2" AND timestamp>="2026-09-01T00:00:00Z" AND timestamp<="2026-09-02T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 25 matching entries: `(resource.labels.service_name="scanissuessubscribergen2") AND timestamp>="2026-09-01T16:48:24.492Z" AND timestamp<="2026-09-01T17:18:24.492Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.92

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
