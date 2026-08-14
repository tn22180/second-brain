fingerprint: nxz67h
service: bulkauditfixapplygen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T07:27:39.720Z
status: infra
attempt: 1

# SEO · bulkauditfixapplygen2 · nxz67h

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of the already-recorded 2026-08-14 04:0x–05:3xZ platform fault in avada-seo/us-central1 (fingerprints 1w98ui1, 6ya4nu, 1lwydlk, 16ubfhn, pva4gd, …): during a firebase deploy rollout, the new revision bulkauditfixapplygen2-00125-quw never bound :8080 and was killed by Cloud Run's 240s startup TCP probe — one of 593 identical probe failures across 78 distinct services in the same 90 minutes, with unchanged code starting fine 45 minutes later.

**Mechanism.** bulkAuditFixApplyGen2 is an onMessagePublished gen2 function declared {memory:'1GiB', timeoutSeconds:120, topic: BULK_FIX_TOPICS.APPLY} (packages/functions/src/handlers/exports/pubsubFunctions.js:500-501); nothing in that declaration or its import graph changed in the deploy. At 2026-08-14T04:25:47.749472Z revision -00125-quw was created by an UpdateFunction call from tuannv@avadagroup.com (cloudaudit activity log, insertId 153p60xd2etw). Cloud Run started instance 001548f729a80785… at 04:27:25.225588Z with 'Reason: DEPLOYMENT_ROLLOUT'. The container emitted zero application output — a JS module-load throw would print a stack to stderr and exit within seconds, but this instance produced nothing for the full probe window (the stderr read returned 0 entries). At 04:31:25.831172Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.6s after the instance-start line, matching the revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} recorded verbatim in the audit-log revision spec (P4: the latency identifies which limit fired). Cloud Run then flipped Ready=False with reason HealthCheckContainerError at 04:31:28.060663Z and the Functions API surfaced code 3 at 04:31:30.251067561Z. Not a code defect: the identical image and identical source started cleanly on the next three rollouts of the same service — -00126-zod at 05:16:28.682195Z, -00127-leq at 05:33:22.824667Z and -00128-new at 06:52:14.106601Z each logged 'STARTUP TCP probe succeeded after 1 attempt'. Not service-specific either: 04:00–05:30Z carries 593 'STARTUP TCP probe failed' lines over 78 distinct avada-seo services (authgen2, apigen2, proxygen2, extensiongen2, changelogtriggers-*, oncreateusergen2, …), while the same window also logged hundreds of successes on those same services (proxygen2 77 succeeded vs 12 failed) — a mixed, non-deterministic outcome on unchanged code, which a broken bundle cannot produce. P3 OOM is ruled out: no 'Memory limit' line on this service, and an OOM would follow a successful listen, not precede it. Blast radius is zero request impact: the failed revision never took traffic — status.latestReadyRevisionName stayed bulkauditfixapplygen2-00124-kux with 100% traffic, so Pub/Sub messages on topic bulkAuditFixApply kept being served by the previous revision; only that one deploy attempt was lost, and it succeeded on retry 45 minutes later.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:500` — bulkAuditFixApplyGen2 export — the function whose revision -00125-quw failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:501` — {memory:'1GiB', timeoutSeconds:120, topic: BULK_FIX_TOPICS.APPLY} — unchanged config; 1GiB with zero 'Memory limit' lines rules out P3, and the 120s function timeout is unrelated to the 240s startup probe that actually fired
- `packages/functions/src/const/bulkFixJob.js:12` — BULK_FIX_TOPICS.APPLY = 'bulkAuditFixApply' — the Pub/Sub topic that kept being served by revision -00124-kux while -00125-quw failed, bounding blast radius to the deploy attempt

## Evidence
- 6 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="bulkauditfixapplygen2" AND timestamp>="2026-08-14T04:25:00Z" AND timestamp<="2026-08-14T04:35:00Z"`
- 24 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="bulkauditfixapplygen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T08:00:00Z"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 400 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 4 matching entries: `(resource.labels.service_name="bulkauditfixapplygen2" OR resource.labels.function_name="bulkAuditFixApplyGen2") AND timestamp>="2026-08-14T04:16:27.789Z" AND timestamp<="2026-08-14T04:46:27.789Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.57

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
