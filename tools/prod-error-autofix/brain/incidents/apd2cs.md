fingerprint: apd2cs
service: runbulkdatashopifyexportgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T09:37:27.946Z
status: infra
attempt: 1

# SEO · runbulkdatashopifyexportgen2 · apd2cs

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:32Z prod deploy of avada-seo created revision runbulkdatashopifyexportgen2-00315-hoc, whose cold-start container never bound :8080 and was killed when Cloud Run's default startup TCP probe hit its 240s DEADLINE_EXCEEDED — one of 593 identical probe failures across 60 distinct avada-seo services in the same 04:00–05:30Z deploy window, i.e. a platform-side container-start fault, not a defect in this repo.

**Mechanism.** runBulkDataShopifyExportGen2 is a Pub/Sub-triggered gen2 function declared onMessagePublished({memory:'1GiB', timeoutSeconds:540, topic:'runBulkDataShopifyExport', ...vpcSettings}) (packages/functions/src/handlers/exports/pubsubFunctions.js:376-378). At 2026-08-14T04:32:42.584022Z the firebase CLI deploy (principalEmail tuannv@avadagroup.com, methodName google.cloud.functions.v2.FunctionService.UpdateFunction) created revision -00315-hoc, generation 315; at 04:32:58.360637Z Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT'. The container never reached listen(): at 04:36:58.927853Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 256s after the instance-start line, matching the revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} recorded verbatim in the audit payload (P4: the latency identifies which limit fired). Cloud Run then set Ready=False reason HealthCheckContainerError at 04:37:05.100461Z and the CLI deploy failed at 04:37:07.058845525Z with code 3 'Container Healthcheck failed. Revision runbulkdatashopifyexportgen2-00315-hoc is not ready and cannot serve traffic'. The container produced zero application log lines (stderr read = 0 entries), consistent with a process killed before module load finished — expected for this app anyway, whose logger is bare console.* (P7), so the empty errors-for-app-code read is not a finding. P3 OOM is ruled out: no 'Memory limit' line on this service in the full 24h, and the failure is at container start, before any message is handled. The fault is not service-specific: the same 'failed to start and listen on the port' status fired for 60 distinct avada-seo services in 04:00–05:30Z, and 'STARTUP TCP probe failed' appears 593 times in that window across the fleet, on different revisions and different images, with unchanged source — the same platform fault already recorded under fingerprints 1jqc0d4 / 1novipc / p7he52 / 17rms13 and others in the same deploy. The build metadata quirk in the payload (build-image-uri and build-function-target pointing at changelog_triggers--shops) is not a per-service mismatch: 76 services in this same window carry that identical image tag, so it is a GCF shared build artifact, not the cause. Blast radius is zero merchant impact: latestReadyRevisionName stayed runbulkdatashopifyexportgen2-00314-den with traffic 100%, so the previous revision kept serving the runBulkDataShopifyExport topic; the service's next 4 cold starts that day (05:17:46Z, 05:34:27Z, 06:53:31Z, 07:47:05Z) all logged 'STARTUP TCP probe succeeded after 1 attempt'.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:376` — runBulkDataShopifyExportGen2 export — the service whose deploy-time cold start failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:377` — {memory:'1GiB', timeoutSeconds:540, topic:'runBulkDataShopifyExport', ...vpcSettings} — 1GiB with zero 'Memory limit' lines in 24h rules out P3; no minInstances, so every deploy rollout pays a full cold start
- `packages/functions/src/controllers/auditAgentController.js:280` — dispatchWork('runBulkDataShopifyExport', ...) — the only producers; the topic kept being served by ready revision -00314-den, bounding blast radius to the failed rollout

## Evidence
- 6 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="runbulkdatashopifyexportgen2" AND timestamp>="2026-08-14T04:22:52Z" AND timestamp<="2026-08-14T04:52:52Z"`
- 6 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="runbulkdatashopifyexportgen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 120 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND protoPayload.status.message:"failed to start and listen on the port"`
- 76 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:22:52Z" AND timestamp<="2026-08-14T04:52:52Z" AND protoPayload.response.spec.template.spec.containers.image:"changelog_triggers--shops"`

## Job
- analyze rounds: 2
- cost: $2.67

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
