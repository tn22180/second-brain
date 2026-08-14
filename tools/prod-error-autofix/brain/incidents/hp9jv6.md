fingerprint: hp9jv6
service: bulkauditfixproductgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:40:56.165Z
status: infra
attempt: 1

# SEO · bulkauditfixproductgen2 · hp9jv6

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:42:39Z prod deploy of avada-seo created revision bulkauditfixproductgen2-00119-vuf, whose DEPLOYMENT_ROLLOUT cold-start container never bound :8080 and was killed when Cloud Run's startup TCP probe hit its configured 240s deadline — one of 593 identical startup-probe failures across ~64 unrelated avada-seo services in the same 90 minutes, i.e. a platform-side container-start fault with zero blast radius here (no 5xx, work continued on revision -00118-jek).

**Mechanism.** bulkAuditFixProductGen2 is declared onMessagePublished({memory: '2GiB', timeoutSeconds: 540, topic: BULK_FIX_TOPICS.PRODUCT}) at packages/functions/src/handlers/exports/pubsubFunctions.js:495-497 with no minInstances, so every rollout pays a full cold start. At 2026-08-14T04:42:39.636986Z Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' on revision bulkauditfixproductgen2-00119-vuf (instance 001548f7298c5ca8…). The container never reached listen(): at 04:46:42.987608Z it logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 243.35s after the instance-start line, matching startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} from `gcloud run services describe bulkauditfixproductgen2` (P4: the latency identifies which limit fired). P3 OOM is ruled out: zero 'Memory limit' lines on this service in the full 24h against its declared 2GiB, and the dying container emitted no application log at all — consistent with a kill before module load finished. The fault is not this service's: in 04:00–05:30Z the same 'STARTUP TCP probe failed' line fired 593 times across ~64 distinct avada-seo services (authgen2 79, handleproderroralertgen2 61, apigen2 47, proxygen2 27, …), different revisions, different images, unchanged code — the same 2026-08-14 deploy-window platform fault already recorded under fingerprints 1qfuynm / yg48ak / dw8unc and ~60 others. Blast radius is nil: 5 seconds after the probe kill, at 04:46:47.697170Z, Cloud Run started a replacement instance on the previous revision bulkauditfixproductgen2-00118-jek (Reason: AUTOSCALING), whose probe succeeded at 04:48:20.420679Z; that instance (001548f729eae9798dd1…) then ran the queued bulk-fix work to completion — 92 stderr lines ending '[checkJobCompletion] qKkfDQcCAsu2v5wRAmVZ bulk fix job complete {bulkJobId: yixRK3w1wLRaAM47K4NZ, total: 10, succeeded: 10, failed: 0}' at 04:50:46.544046Z. Zero httpRequest.status>=500 on the service in 04:00–06:00Z, so no Pub/Sub delivery was lost; the rollout finished normally on -00120-rud (05:22:53Z) and -00121-cam (05:39:35Z), both probes succeeding on the first attempt.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:495` — bulkAuditFixProductGen2 export — the service whose rollout cold start failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:496` — {memory: '2GiB', timeoutSeconds: 540} with no minInstances — every deploy rollout pays a full cold start; 2GiB with zero 'Memory limit' lines in 24h rules out P3 OOM

## Evidence
- 1 matching entries: `resource.labels.service_name="bulkauditfixproductgen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND (textPayload:"STARTUP TCP probe failed" OR textPayload:"Memory limit")`
- 10 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="bulkauditfixproductgen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND (textPayload:"STARTUP TCP probe" OR textPayload:"Starting new instance" OR textPayload:"Memory limit")`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 92 matching entries: `(resource.labels.service_name="bulkauditfixproductgen2" OR resource.labels.function_name="bulkauditfixproductgen2") AND timestamp>="2026-08-14T04:31:44.179Z" AND timestamp<="2026-08-14T05:01:44.179Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.39

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
