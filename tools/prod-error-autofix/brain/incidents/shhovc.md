fingerprint: shhovc
service: oncreatecouponusagesgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T09:43:55.050Z
status: infra
attempt: 1

# SEO · oncreatecouponusagesgen2 · shhovc

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:25:47Z prod deploy of avada-seo created revision oncreatecouponusagesgen2-00319-bid, whose cold-start container never bound :8080 within Cloud Run's 240s Default startup TCP probe deadline, so the revision was marked Ready=False and the UpdateFunction call failed — one of 593 identical startup-probe failures across 60+ unrelated avada-seo services in the same 90 minutes, i.e. a platform-side container-start fault, not a defect in this repo.

**Mechanism.** onCreateCouponUsagesGen2 is declared onDocumentCreated({memory:'1GiB', document:'crmCouponUsage/{couponUsageId}', ...vpcSettings}) at packages/functions/src/handlers/exports/firestoreFunctions.js:18-21 — no code change touched it, and the deployed image label firebase-functions-hash=6a1603c9106996c7b9e56035239dcab1ab44f4f1 is carried by the revision that failed. Timeline on that single revision: Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' for oncreatecouponusagesgen2-00319-bid at 04:27:35.994578Z; the container never reached listen(), and at 04:31:41.751294Z — 245.757s later — Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED', matching the Default startup TCP probe (startupProbeType='Default' on the revision labels: tcpSocket:8080, timeoutSeconds=240, periodSeconds=240, failureThreshold=1) to within the log's granularity — P4: the latency identifies which limit fired. 2.1s later the Revision Ready condition flipped False, then the Service Ready condition, then the audit log recorded google.cloud.functions.v2.FunctionService.UpdateFunction status code 3 'Could not create or update Cloud Run service oncreatecouponusagesgen2, Container Healthcheck failed'. Not P3 OOM: zero 'Memory limit' lines on this service in the full 24h, and the container emitted no application log at all (stderr read = 0 entries), consistent with a process killed before module load finished. Not code: the same unchanged source deployed cleanly three times later the same morning — revisions -00320-fil (05:16:37.937761Z), -00321-tox (05:33:22.744957Z) and -00322-yiv (06:52:35.475110Z) each logged 'Default STARTUP TCP probe succeeded after 1 attempt'. Not service-specific either: in 04:00–05:30Z the identical 'STARTUP TCP probe failed' line fired 593 times across 60+ distinct avada-seo services on different revisions and different images (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44, …) — the same window already recorded as infra under fingerprints 58n8b8 / 1nne8x3 / q19goa and many others. Blast radius is nil for merchants: traffic never shifted to the failed revision, so the previously-serving revision -00318 kept handling crmCouponUsage/{couponUsageId} creates, and the next deploy at 05:14Z rolled the new code out successfully. The only casualty was the deploy step for this one function.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/firestoreFunctions.js:18` — onCreateCouponUsagesGen2 export — the Firestore-trigger function whose deploy-time cold start failed the startup probe
- `packages/functions/src/handlers/exports/firestoreFunctions.js:19` — {memory: '1GiB', document: 'crmCouponUsage/{couponUsageId}', ...vpcSettings} — 1GiB with zero 'Memory limit' lines that day rules out P3 OOM; the VPC connector is the only non-default start dependency and it was unchanged
- `packages/functions/src/handlers/onCreateCouponUsage.js:10` — the handler body never ran — no application log line exists for the failed revision, confirming the kill happened before module init completed

## Evidence
- 4 matching entries: `(resource.labels.service_name="oncreatecouponusagesgen2" OR resource.labels.function_name="oncreatecouponusagesgen2") AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND severity>=ERROR`
- 27 matching entries: `(resource.labels.service_name="oncreatecouponusagesgen2" OR resource.labels.function_name="oncreatecouponusagesgen2") AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T08:00:00Z"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`

## Job
- analyze rounds: 1
- cost: $1.38

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
