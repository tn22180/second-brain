fingerprint: 1mccpq
service: bulkauditfixapplygen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-09-01T17:08:47.461Z
status: infra
attempt: 1

# SEO · bulkauditfixapplygen2 · 1mccpq

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a bounded platform-side container-start fault in avada-seo/us-central1 during 2026-09-01T15:00–17:30Z made bulkauditfixapplygen2 cold starts miss Cloud Run's 240s startup TCP probe, so the two Pub/Sub push deliveries of topic bulkAuditFixApply waiting on those cold starts were answered 503 'instance failed the readiness check'.

**Mechanism.** bulkAuditFixApplyGen2 is declared onMessagePublished({memory: '1GiB', timeoutSeconds: 120, topic: BULK_FIX_TOPICS.APPLY}) with no minInstances (packages/functions/src/handlers/exports/pubsubFunctions.js:500-503), so every Pub/Sub delivery arriving at zero warm instances pays a full cold start. Both alerted requests are POST https://bulkauditfixapplygen2-…run.app/?__GCP_CloudEventsMode=CUSTOM_PUBSUB_projects/avada-seo/topics/bulkAuditFixApply from APIs-Google (Pub/Sub push), same requestSize 1934, on revision bulkauditfixapplygen2-00158-fam, on two distinct instanceIds (…b47c34…, …fa3c5c…). Latency is 241.361392s and 244.117901s — the 240s startup-probe deadline plus scheduling (P4: the number identifies which limit fired), not the function's own timeoutSeconds: 120. Each 503 is preceded/followed by 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED.' (17:02:22.695147Z, 17:06:36.981491Z). Not this service's code: the identical probe-failure line fired 64 times across 16 distinct avada-seo services in 15:00–17:30Z (authgen2 29, handleoptimizeimagegen2 8, webhookpublishthemegen2 6, bulkauditfixapplygen2 2, …) against 0 entries in the whole 00:00–15:00Z stretch of the same day — a bounded platform window, the same one already recorded for this date under 15bqjgv, 1qj4dz7, 9y4a2r, 1up1ei8, 1sc23g3, 1nmx045, m2ghuu. P3 OOM ruled out: zero 'Memory limit' lines on this service in 24h. The image itself boots — the same revision logged 'STARTUP TCP probe succeeded after 1 attempt' at 09:49:32.399604Z and 11:27:03.110084Z and served 200s (18.3s, 16.8s), and the handler's own line '[subscribeBulkAuditFixApply] apply chain dispatched …' appears on those runs. stderr=0 for the alert window because the container dies before module load, so no application code ran: subscribeBulkAuditFixApply was never entered, no partial Shopify writes, and Pub/Sub redelivers the message (no failure after 17:06:55Z).

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:500` — bulkAuditFixApplyGen2 export — the Cloud Run service whose cold starts failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:501` — {memory: '1GiB', timeoutSeconds: 120, topic: BULK_FIX_TOPICS.APPLY} — no minInstances, so each Pub/Sub delivery at zero warm instances pays a full cold start; 1GiB with zero 'Memory limit' lines rules out P3, and timeoutSeconds 120 is not the 241–244s latency observed
- `packages/functions/src/const/bulkFixJob.js:12` — APPLY: 'bulkAuditFixApply' — the topic named in both failed request URLs

## Evidence
- 2 matching entries: `(resource.labels.service_name="bulkauditfixapplygen2") AND timestamp>="2026-09-01T16:48:25.847Z" AND timestamp<="2026-09-01T17:18:25.847Z" AND httpRequest.status>=500`
- 4 matching entries: `(resource.labels.service_name="bulkauditfixapplygen2") AND timestamp>="2026-09-01T16:48:25.847Z" AND timestamp<="2026-09-01T17:18:25.847Z" AND severity>=ERROR`
- 64 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T15:00:00Z" AND timestamp<="2026-09-01T17:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 200 matching entries: `resource.labels.service_name="bulkauditfixapplygen2" AND timestamp>="2026-09-01T00:00:00Z" AND timestamp<="2026-09-02T00:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.51

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
