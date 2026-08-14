fingerprint: 3ma0sz
service: webhookappsubscriptionupdategen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T08:32:40.296Z
status: infra
attempt: 1

# SEO · webhookappsubscriptionupdategen2 · 3ma0sz

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:25:47Z prod deploy of avada-seo created revision webhookappsubscriptionupdategen2-00319-zos, whose container never bound :8080 and was killed when Cloud Run's 240s startup TCP probe expired — one of 63 avada-seo services hit by the same platform-side container-start fault in the 04:00–05:30Z deploy window, with unchanged code and different images.

**Mechanism.** webhookAppSubscriptionUpdateGen2 is declared onRequest({timeoutSeconds: 120, memory: '1GiB', ...vpcSettings}) at packages/functions/src/handlers/exports/httpFunctions.js:117-120 — no minInstances, default startup probe. tuannv@avadagroup.com ran google.cloud.functions.v2.FunctionService.UpdateFunction (operation-1786681545609-658fa36da51f6); revision -00319-zos was created 04:25:47.839750Z. Cloud Run then logged ContainerReady at 04:27:24.241810Z ('Container image import completed in 1m35.4s') and ResourcesAvailable at 04:27:37.259869Z ('Checking container health. This will wait for up to 4m for the configured startup probe, including an initial delay of 0s'). The process never reached listen(): at 04:31:37.651443Z the run.googleapis.com/varlog/system entry fired 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.39s after ResourcesAvailable, matching the revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} to within a log tick (P4: the latency identifies which limit fired). Ready/ConfigurationsReady flipped to HealthCheckContainerError at 04:31:40.8Z and the UpdateFunction audit log failed code 3 at 04:31:43.246526Z. Not P3 OOM: the container is 1024Mi with zero 'Memory limit' lines on this service in the full 24h, and it emitted no application log at all (stderr read = 0 entries), consistent with a kill before module load finished rather than a catch block. Not app-side: in 04:00–05:30Z the identical 'failed to start and listen on the port' condition fired for 63 distinct avada-seo services (2 entries each — revision + service condition), including apigen2, authsagen2, changelogtriggers-shops and 60 others on different revisions and different images. Blast radius is zero merchant impact: status.traffic stayed 100% on latestReadyRevisionName webhookappsubscriptionupdategen2-00318-paj, the requests read returned 0 entries (no 5xx served), and the fault self-cleared — 'STARTUP TCP probe succeeded' on this service at 05:16:37.830759Z and 05:33:22.735802Z. The failure is a deploy-time rollout rejection, not a serving failure.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:117` — webhookAppSubscriptionUpdateGen2 export — the service whose revision -00319-zos failed the startup probe during the 04:25Z deploy
- `packages/functions/src/handlers/exports/httpFunctions.js:118` — {timeoutSeconds: 120, memory: '1GiB', ...vpcSettings} — 1GiB with zero 'Memory limit' lines in 24h rules out P3; no minInstances, so every rollout pays a full cold start under the default 240s probe

## Evidence
- 4 matching entries: `(resource.labels.service_name="webhookappsubscriptionupdategen2" OR resource.labels.function_name="webhookAppSubscriptionUpdateGen2") AND timestamp>="2026-08-14T04:21:29Z" AND timestamp<="2026-08-14T04:51:29Z" AND severity>=ERROR`
- 126 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND protoPayload.status.message:"failed to start and listen on the port"`
- 2 matching entries: `resource.labels.service_name="webhookappsubscriptionupdategen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 1
- cost: $1.51

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
