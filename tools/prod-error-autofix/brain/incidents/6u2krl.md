fingerprint: 6u2krl
service: bulkauditfixproductgen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-09-01T18:08:29.017Z
status: infra
attempt: 1

# SEO · bulkauditfixproductgen2 · 6u2krl

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a bounded platform-side container-start fault swept avada-seo/us-central1 during the 2026-09-01T17:00–18:00Z hour, so three bulkauditfixproductgen2 cold-start containers never bound :8080 and failed Cloud Run's 240s startup TCP probe — the three Pub/Sub push deliveries waiting on them were answered 503 'instance failed the readiness check'.

**Mechanism.** All 3 alerted 503s are POST https://bulkauditfixproductgen2-pihimpufva-uc.a.run.app/?__GCP_CloudEventsMode=CUSTOM_PUBSUB_projects/avada-seo/topics/bulkAuditFixProduct at 17:36:24.127525Z, 17:40:39.254278Z, 17:44:57.105314Z, on one revision (bulkauditfixproductgen2-00152-ziy), on three distinct instances (00a41e8c1d52bc…, 00a41e8c1da59a…, 00a41e8c1de27a…). Latencies are 240.271914s / 241.115599s / 245.126404s — the Cloud Run 240s startup-probe deadline plus scheduling, which identifies exactly which limit fired (P4). Each 503 is paired ~14–18s later with 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.' on the same instanceId. The container died before module load, so no application line exists for those three instances — the entire 42-entry stderr read comes from a fourth, warm instance (00a41e8c1df361…, same revision) that ran normally through the whole window ([processProduct] product fix complete, [checkJobCompletion] bulk fix job complete at 17:50:43Z). So the image boots and the handler works: 10 'STARTUP TCP probe succeeded' entries for this service the same day. Not this service's code: fleet-wide the same probe-failure line fired 270 times across ≥25 avada-seo services in the 17:00Z hour (apisagen2 63, authsagen2 30, handlehooksubscribergen2 20, changelogtriggers-subscriptions 17, partnerintegrationsubscribergen2 16, … bulkauditfixproductgen2 only 3) against 13 in the whole 16:00Z hour — the same bounded window already recorded as txdvop, vtubke, 1gbu5l7, 1esj5e, 1mccpq, 15bqjgv, 1qj4dz7. P3 OOM ruled out: zero 'Memory limit' lines on this service in the hour, and it is declared memory '2GiB'. Blast radius: three bulkAuditFixProduct messages were nacked; Pub/Sub redelivers, and the warm instance drained the same jobs to completion in the window, so no data loss. The declaration (packages/functions/src/handlers/exports/pubsubFunctions.js:495-498) carries no minInstances, so every burst at zero warm capacity pays a cold start and is exposed to the platform fault.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:495` — bulkAuditFixProductGen2 export — the Cloud Run service whose cold starts failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:496` — {memory: '2GiB', timeoutSeconds: 540, topic: BULK_FIX_TOPICS.PRODUCT} — no minInstances, so each Pub/Sub burst pays a full cold start; 2GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/handlers/pubsub/subscribeBulkAuditFixProduct.js:4` — the handler for the three failed deliveries — never entered, container died before listen(), so no partial writes

## Evidence
- 3 matching entries: `(resource.labels.service_name="bulkauditfixproductgen2") AND timestamp>="2026-09-01T17:25:25.567Z" AND timestamp<="2026-09-01T17:55:25.567Z" AND httpRequest.status>=500`
- 6 matching entries: `(resource.labels.service_name="bulkauditfixproductgen2") AND timestamp>="2026-09-01T17:25:25.567Z" AND timestamp<="2026-09-01T17:55:25.567Z" AND severity>=ERROR`
- 270 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T18:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 13 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T16:00:00Z" AND timestamp<="2026-09-01T16:59:59Z" AND textPayload:"STARTUP TCP probe failed"`
- 10 matching entries: `resource.labels.service_name="bulkauditfixproductgen2" AND timestamp>="2026-09-01T00:00:00Z" AND timestamp<="2026-09-02T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 42 matching entries: `(resource.labels.service_name="bulkauditfixproductgen2") AND timestamp>="2026-09-01T17:25:25.567Z" AND timestamp<="2026-09-01T17:55:25.567Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.57

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
