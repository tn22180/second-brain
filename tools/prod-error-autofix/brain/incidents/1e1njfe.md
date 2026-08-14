fingerprint: 1e1njfe
service: handleexportbrokenurlsgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:38:59.015Z
status: infra
attempt: 1

# SEO · handleexportbrokenurlsgen2 · 1e1njfe

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:42:30Z prod deploy of avada-seo rolled out revision handleexportbrokenurlsgen2-00310-qem, whose container never bound :8080 within the 240s default startup TCP probe, so Cloud Run failed the revision and the Cloud Functions UpdateFunction call errored — one of 593 identical startup-probe failures across 30+ unrelated avada-seo services in the same 04:00–05:30Z deploy window, and the same unchanged image deployed clean minutes later as -00311/-00312/-00313.

**Mechanism.** handleExportBrokenUrlsGen2 is declared onMessagePublished({memory:'2GiB', timeoutSeconds:540, topic:'exportBrokenUrls', ...vpcSettings}) at packages/functions/src/handlers/exports/pubsubFunctions.js:181-183 with no minInstances and no startup-probe override, so Cloud Run applies the gen2 default startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} — that exact object is in the ReplaceInternalService response body of the second errors entry in logs.json. Deploy trace on one instance: 04:42:29.679891Z/04:42:30.635377Z NOTICE deploy lines, 04:42:42.704386Z 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' on revision -00310-qem, then 04:46:42.926531Z 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … DEADLINE_EXCEEDED' — 240.222s after the instance-start line, matching the configured 240s probe timeout to the log's own granularity (P4: the latency identifies which limit fired). Cloud Run then flipped Ready=False on the revision (04:46:46.102237Z) and the service (04:46:46.220593Z), and the Cloud Functions v2 UpdateFunction issued by tuannv@avadagroup.com failed with status code 3, 'Could not create or update Cloud Run service handleexportbrokenurlsgen2, Container Healthcheck failed' (04:46:48.549420358Z). Not a code defect, on three independent grounds. (1) The same source tree, same image tag us-central1-docker.pkg.dev/avada-seo/gcf-artifacts/avada--seo__us--central1__api_gen2:version_1, started fine on the retries: 'STARTUP TCP probe succeeded after 1 attempt' at 05:23:25.669444Z (-00311-tor), 05:40:01.703591Z (-00312-vup) and 06:59:10.527380Z / 09:29:28.547095Z (-00313-vis) — 4 successes vs 1 failure that day. (2) The fault is fleet-wide, not service-specific: 'STARTUP TCP probe failed' fired 593 times across 30+ distinct avada-seo services in 04:00–05:30Z (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44 …), on different revisions and different triggers. (3) P3 OOM is ruled out: zero 'Memory limit' lines on this service in the full 24h, and the container emitted no application log at all (stderr read = 0 entries, requests read = 0 entries) — consistent with a process killed before module load finished, and consistent with a Pub/Sub-triggered function that serves no HTTP traffic, which is why the round-1 httpRequest.status>=500 query correctly matched nothing. Blast radius is zero merchant impact: no exportBrokenUrls message was in flight (0 request entries), the failed revision never took traffic, and Pub/Sub kept delivering to the previous serving revision until -00311 rolled out at 05:23Z.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:181` — handleExportBrokenUrlsGen2 export — the function whose deploy-time revision -00310-qem failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:182` — {memory:'2GiB', timeoutSeconds:540, topic:'exportBrokenUrls', ...vpcSettings} — no minInstances and no startup-probe override, so the Cloud Run default 240s TCP probe applies; 2GiB with zero 'Memory limit' lines that day rules out P3

## Evidence
- 6 matching entries: `resource.labels.service_name="handleexportbrokenurlsgen2" AND timestamp>="2026-08-14T04:31:43Z" AND timestamp<="2026-08-14T05:01:43Z"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 4 matching entries: `resource.labels.service_name="handleexportbrokenurlsgen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 1 matching entries: `resource.labels.service_name="handleexportbrokenurlsgen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND (textPayload:"Memory limit" OR textPayload:"STARTUP TCP probe failed")`

## Job
- analyze rounds: 2
- cost: $2.50

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
