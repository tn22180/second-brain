fingerprint: 145obvc
service: toolsgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T09:52:35.820Z
status: infra
attempt: 1

# SEO · toolsgen2 · 145obvc

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:25:46Z prod deploy of avada-seo created revision toolsgen2-00318-kuc, whose container never bound :8080 before Cloud Run's 240s startup TCP probe deadline — one of 593 identical probe failures across 78 distinct avada-seo/us-central1 services in the same 90 minutes, i.e. a platform-side container-start fault during the deploy sweep, not a defect in this repo.

**Mechanism.** toolsGen2 is a plain onRequest gen2 function (packages/functions/src/handlers/exports/httpFunctions.js:90, memory '1GiB', no minInstances, VPC connector seo-connector via config/vpcSettings). tuannv@avadagroup.com issued FunctionService.UpdateFunction on projects/avada-seo/locations/us-central1/functions/toolsGen2 at 2026-08-14T04:25:46.694Z. Cloud Run built revision toolsgen2-00318-kuc (creationTimestamp 04:25:47.664Z), imported the container in 1m34.34s (ContainerReady 04:27:24.226Z), provisioned it in 5.7s and logged 'Checking container health. This will wait for up to 4m for the configured startup probe' at 04:27:29.925Z. The probe never passed: at 04:31:42.415Z the revision emitted 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 252s after the health-check start line, matching the revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} to within scheduling granularity (P4: the latency identifies which limit fired). Cloud Run then flipped Ready=False with reason HealthCheckContainerError at 04:31:49.513Z (revision) and 04:31:50.553Z (service), and the deploy failed with status code 3 at 04:31:53.583Z. No application log exists for the instance — the stderr read is 0 entries — consistent with a process killed before module load finished; P3 OOM is ruled out (zero 'Memory limit' lines on this service, and an OOM at 1024Mi would still be an app-side kill, not a probe DEADLINE_EXCEEDED). The fault is not toolsgen2-specific: in 04:00–05:30Z the same 'STARTUP TCP probe failed' line fired 593 times across 78 distinct avada-seo services (authgen2 103, handleproderroralertgen2 79, apigen2 52, onupdateshopgen2 45, proxygen2 37 …), on different revisions, different images and unchanged code — the same sweep already recorded as infra under fingerprints 5dup6h / q12jxx / 1e908f9 and ~50 siblings. Blast radius is zero merchant impact: the failed revision never took traffic (status.latestReadyRevisionName stayed toolsgen2-00317-tij with traffic 100%), the requests read matched 0 entries with httpRequest.status>=500, and the deploy self-healed on retry — revisions toolsgen2-00319-jey (probe succeeded 05:16:27.473Z) and toolsgen2-00320-zud (05:33:44.413Z) both started clean from the same source, with their UpdateFunction audit entries carrying no error status.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:90` — toolsGen2 = onRequest({memory: '1GiB', ...vpcSettings}, toolHandler.callback()) — the service whose deploy revision failed the startup probe; 1GiB with zero 'Memory limit' lines rules out P3, and no minInstances/no custom startupProbe means the platform Default 240s probe is what fired
- `packages/functions/src/handlers/exports/httpFunctions.js:22` — import {vpcSettings} — the seo-connector VPC egress config baked into revision toolsgen2-00318-kuc; identical on toolsgen2-00319-jey/-00320-zud which started fine 45 min later, so the config is not the fault

## Evidence
- 3 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="toolsgen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND textPayload:"STARTUP TCP probe"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 6 matching entries: `protoPayload.resourceName="projects/avada-seo/locations/us-central1/functions/toolsGen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T06:00:00Z"`
- 4 matching entries: `(resource.labels.service_name="toolsgen2" OR resource.labels.function_name="toolsGen2") AND timestamp>="2026-08-14T04:23:39.488Z" AND timestamp<="2026-08-14T04:53:39.488Z" AND severity>=ERROR`

## Job
- analyze rounds: 2
- cost: $2.86

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
