fingerprint: yg48ak
service: handlesyncurlredirectsgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:35:36.306Z
status: infra
attempt: 1

# SEO · handlesyncurlredirectsgen2 · yg48ak

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:42Z prod deploy of avada-seo created revision handlesyncurlredirectsgen2-00310-dog, whose cold-start container never bound :8080 and was killed when Cloud Run's startup TCP probe hit DEADLINE_EXCEEDED — one of 593 identical startup-probe failures across 40+ unrelated avada-seo services in the same 04:00–05:30Z window, and the identical source deployed cleanly as revision -00311-nuf 37 minutes later.

**Mechanism.** handleSyncUrlRedirectsGen2 is a Pub/Sub-triggered gen2 function (packages/functions/src/handlers/exports/pubsubFunctions.js:207) declared {memory:'2GiB', timeoutSeconds:540, topic:'syncUrlRedirects', ...vpcSettings} with no minInstances, so a deploy rollout must cold-start a fresh container to health-check the new revision. At 2026-08-14T04:42:40.076330Z Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' on instance 001548f729d4a83eb741…; the container never reached listen(). At 04:46:40.295239Z the same instance logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.219s after the instance-start line, matching the default gen2 startup-probe deadline of 240s (P4: the latency identifies which limit fired, and the message is the probe's own, not an application error). Two seconds later the Ready condition flipped False for revision handlesyncurlredirectsgen2-00310-dog (04:46:42.441491Z) and for the service (04:46:42.549737Z), and the Cloud Functions v2 UpdateFunction audit entry at 04:46:46.142751821Z (principal tuannv@avadagroup.com, methodName google.cloud.functions.v2.FunctionService.UpdateFunction) failed with code 3, 'Could not create or update Cloud Run service handlesyncurlredirectsgen2, Container Healthcheck failed. Revision handlesyncurlredirectsgen2-00310-dog is not ready and cannot serve traffic.' The alert therefore fires on a failed deploy attempt, not on merchant traffic: the whole-day service read shows 0 stderr entries and 0 httpRequest 5xx, i.e. no application log line and no failed request — the process died before module load finished, so nothing in src/ ran. Code is exonerated by the retries: the same firebase build rolled out as handlesyncurlredirectsgen2-00311-nuf at 05:22:56.671923Z, -00312-pub at 05:39:36.043532Z and -00313-riz at 06:58:51.255816Z, each logging 'Default STARTUP TCP probe succeeded after 1 attempt' within ~15–20s of instance start — unchanged source, same 2GiB, same VPC connector. The fault is region-wide, not service-specific: in 04:00–05:30Z the identical 'STARTUP TCP probe failed' line fired 593 times across 40+ distinct avada-seo services (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44 …), on different revisions and different images — the same platform-side container-start fault already recorded for this window under fingerprints 1qfuynm / i4yn7s / lisw3f and others. Blast radius here is zero merchant impact: onMessagePublished keeps traffic on the previous healthy revision until the new one passes, syncUrlRedirects messages stayed queued in Pub/Sub, and the retry at 05:22Z shipped the same code.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:207` — handleSyncUrlRedirectsGen2 export — the service whose deploy-time cold start failed the startup TCP probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:208` — {memory:'2GiB', timeoutSeconds:540, topic:'syncUrlRedirects', ...vpcSettings} — no minInstances, so a rollout must cold-start a container to health-check; 2GiB with no 'Memory limit' line anywhere that day rules out P3 OOM

## Evidence
- 6 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="handlesyncurlredirectsgen2" AND timestamp>="2026-08-14T04:31:00Z" AND timestamp<="2026-08-14T05:01:00Z"`
- 1 matching entries: `resource.labels.function_name="handleSyncUrlRedirectsGen2" AND timestamp>="2026-08-14T04:31:43Z" AND timestamp<="2026-08-14T05:01:43Z" AND severity>=ERROR`
- 3 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="handlesyncurlredirectsgen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`

## Job
- analyze rounds: 2
- cost: $2.54

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
