fingerprint: ie0sn4
service: handlerevertinternallinkbatchgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T08:13:39.837Z
status: infra
attempt: 1

# SEO · handlerevertinternallinkbatchgen2 · ie0sn4

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the same platform-side container-start fault that hit avada-seo/us-central1 during 2026-08-14T04:00–05:30Z killed the cold start of revision handlerevertinternallinkbatchgen2-00316-git during a firebase deploy, so Cloud Run failed the deploy health check at its 240s startup-probe deadline; traffic never left the healthy revision -00315-zow and no request or Pub/Sub message failed.

**Mechanism.** handleRevertInternalLinkBatchGen2 is declared onMessagePublished({memory:'1GiB', timeoutSeconds:540, topic:'revertInternalLinkBatch', ...vpcSettings}) at packages/functions/src/handlers/exports/pubsubFunctions.js:474-477, with no minInstances, so a deploy must cold-start a fresh container to pass the health check. At 2026-08-14T04:31:47.534282Z Cloud Run created revision -00316-git (UpdateFunction by tuannv@avadagroup.com, operation e3c1a303-36ce-418b-a629-2df17ef02004); at 04:31:52.749336Z it logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT'. The container never bound :8080: at 04:35:52.976970Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 ... DEADLINE_EXCEEDED' — 240.227s after the instance-start line, matching the revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} to within log granularity (P4: the latency names which limit fired). That rolled up into HealthCheckContainerError on the Service at 04:35:54.224666Z / 04:35:54.375610Z and the UpdateFunction audit failure at 04:35:56.710516414Z. The fault is not this service's: in 04:00–05:30Z the identical 'STARTUP TCP probe failed' line fired 593 times across 40+ unrelated avada-seo services (authgen2 103, handleproderroralertgen2 79, apigen2 52, onupdateshopgen2 45, proxygen2 37 …), versus 4 in the whole 06:00–24:00Z remainder of the day — a region-wide window, already recorded as infra under fingerprints 1i16r90 / 220y3n / q19goa and others. P3 OOM is ruled out: zero 'Memory limit' lines on this service in 24h and the container emitted no application log at all (stderr read = 0 entries), consistent with a process killed before module load finished. Blast radius is zero: the Service status kept latestReadyRevisionName=handlerevertinternallinkbatchgen2-00315-zow with 100% traffic, the requests read returned 0 entries with httpRequest.status>=500, and the next three deploys the same day (-00317-sof 05:17:14.841Z, -00318-car 05:34:14.747Z, -00319-qic 06:53:06.754Z) each logged 'STARTUP TCP probe succeeded after 1 attempt' with no code change to this handler.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:474` — handleRevertInternalLinkBatchGen2 — the export whose Cloud Run revision -00316-git failed the deploy startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:475` — {memory:'1GiB', timeoutSeconds:540, topic:'revertInternalLinkBatch', ...vpcSettings} — no minInstances, so every deploy pays a full cold start; 1GiB with zero 'Memory limit' lines in 24h rules out P3 OOM
- `packages/functions/src/handlers/exports/pubsubFunctions.js:3` — vpcSettings spread into the declaration — puts the container behind the seo-connector VPC egress the failed revision was configured with (run.googleapis.com/vpc-access-connector), i.e. the config is repo-declared and unchanged, not a per-deploy anomaly

## Evidence
- 4 matching entries: `(resource.labels.service_name="handlerevertinternallinkbatchgen2" OR resource.labels.function_name="handlerevertinternallinkbatchgen2") AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND (textPayload:"Memory limit" OR textPayload:"STARTUP TCP probe" OR httpRequest.status>=500)`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 4 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T06:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 4 matching entries: `(resource.labels.service_name="handlerevertinternallinkbatchgen2" OR resource.labels.function_name="handlerevertinternallinkbatchgen2" OR resource.labels.job_name="handlerevertinternallinkbatchgen2") AND timestamp>="2026-08-14T04:21:09.171Z" AND timestamp<="2026-08-14T04:51:09.171Z" AND severity>=ERROR`

## Job
- analyze rounds: 2
- cost: $3.32

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
