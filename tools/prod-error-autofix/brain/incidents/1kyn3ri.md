fingerprint: 1kyn3ri
service: handlerevertallinternallinksgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T08:20:07.032Z
status: infra
attempt: 1

# SEO · handlerevertallinternallinksgen2 · 1kyn3ri

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the deploy of revision handlerevertallinternallinksgen2-00318-xuw at 2026-08-14T04:31:47Z landed inside the same fleet-wide container-start fault in avada-seo/us-central1 (593 startup-probe failures across 78 distinct services in 03:30–06:00Z), so the new container never bound :8080 and Cloud Run killed it at the configured 240s startup TCP probe deadline — the identical code deployed 45 minutes later as -00319-fal came up in 21.94s.

**Mechanism.** handleRevertAllInternalLinksGen2 is a Pub/Sub gen2 function declared onMessagePublished({memory:'1GiB', timeoutSeconds:540, topic:'revertAllInternalLinks', ...vpcSettings}) (packages/functions/src/handlers/exports/pubsubFunctions.js:469-472); it carries no custom startup config, so Cloud Run applies the default startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} confirmed by `gcloud run services describe`. tuannv@avadagroup.com ran a FunctionService.UpdateFunction deploy; revision -00318-xuw was created at 04:31:47.324Z and Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' on it at 04:31:52.905116Z. The container emitted no application log at all — the revision-scoped read returns only 4 platform lines, zero stderr, zero request logs (the alert's own stderr and requests reads are 0/0 for the same reason: a Pub/Sub function that never started serves no HTTP request and writes no app line). At 04:35:53.249187Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.34s after the instance-start line, matching the 240s probe deadline to the granularity of the log (P4: the latency names which limit fired). That propagated upward 1.2s later as 'Ready condition status changed to False' on the revision (04:35:54.408669Z) and on the service (04:35:54.547497Z), then as the deploy's own audit-log failure, code 3 'Container Healthcheck failed', at 04:35:56.624125736Z. Not this repo's defect, on three counts: (1) the same 'STARTUP TCP probe failed' line fired 593 times across 78 distinct avada-seo services in 03:30–06:00Z — apigen2, authgen2, proxygen2, changelogtriggers-*, handleproderroralertgen2, and 73 others, on unrelated revisions and images; (2) the unchanged deploy pipeline produced ready revisions -00319-fal (05:16:42Z, 'Deploying revision succeeded in 21.94s', 'STARTUP TCP probe succeeded' at 05:17:04.072737Z), -00320-kub (05:33:40Z, 33.38s) and -00321-tiv (06:52:34Z, 26.82s) — a module-load throw or a port misconfiguration in src/ would have failed those too; (3) P3 OOM is ruled out — zero 'Memory limit' lines on this service across the full 24h against its declared 1GiB. Blast radius is nil at runtime: the failed revision never took traffic, the previous ready revision -00317-rin kept serving the revertAllInternalLinks topic, and the only cost was one aborted deploy.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:469` — handleRevertAllInternalLinksGen2 export — the function whose deploy-time container start failed the probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:470` — {memory:'1GiB', timeoutSeconds:540, topic:'revertAllInternalLinks'} — no startup/port override, so the platform default 240s TCP probe on :8080 applies; 1GiB with zero 'Memory limit' lines that day rules out P3

## Evidence
- 4 matching entries: `resource.type="cloud_run_revision" AND resource.labels.revision_name="handlerevertallinternallinksgen2-00318-xuw" AND timestamp>="2026-08-14T04:20:00Z" AND timestamp<="2026-08-14T04:50:00Z"`
- 593 matching entries: `resource.type="cloud_run_revision" AND textPayload:"STARTUP TCP probe failed" AND timestamp>="2026-08-14T03:30:00Z" AND timestamp<="2026-08-14T06:00:00Z"`
- 2 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="handlerevertallinternallinksgen2" AND timestamp>="2026-08-14T04:20:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 4 matching entries: `(resource.labels.service_name="handlerevertallinternallinksgen2" OR resource.labels.function_name="handlerevertallinternallinksgen2" OR resource.labels.job_name="handlerevertallinternallinksgen2") AND timestamp>="2026-08-14T04:21:11.626Z" AND timestamp<="2026-08-14T04:51:11.626Z" AND severity>=ERROR`

## Job
- analyze rounds: 2
- cost: $2.65

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
