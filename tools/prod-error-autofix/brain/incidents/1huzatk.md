fingerprint: 1huzatk
service: updatespeedupexpiretimepublishergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:42:43.323Z
status: infra
attempt: 1

# SEO · updatespeedupexpiretimepublishergen2 · 1huzatk

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:42:31Z prod deploy of avada-seo created revision updatespeedupexpiretimepublishergen2-00310-yiq, whose container never bound :8080 before the 240s default startup TCP probe deadline, so Cloud Run rejected the revision with HealthCheckContainerError — one of 138 identical healthcheck failures across 69 distinct avada-seo/us-central1 services in the same 04:00–05:30Z deploy window, i.e. a platform-side container-start fault, not a defect in this repo.

**Mechanism.** updateSpeedUpExpireTimePublisherGen2 is declared onSchedule({timeoutSeconds: 540, memory: '2GiB', schedule: '0 0 */2 * *', ...vpcSettings}) at packages/functions/src/handlers/exports/cronFunctions.js:88-91. The CI deploy (principalEmail tuannv@avadagroup.com, methodName google.cloud.functions.v2.FunctionService.UpdateFunction, operation-id 7a45f6fb-3712-48d8-ae04-e309c5deab65) created revision -00310-yiq at 2026-08-14T04:42:31.696591Z from image us-central1-docker.pkg.dev/avada-seo/gcf-artifacts/avada--seo__us--central1__api_gen2:version_1. The revision spec carries startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1}; at 04:46:42.610599Z — 250.9s after revision creation, i.e. the 240s probe window plus scheduling — Cloud Run flipped Ready/ConfigurationsReady to False with reason 'HealthCheckContainerError' and message 'The user-provided container failed to start and listen on the port defined provided by the PORT=8080 environment variable within the allocated timeout', which the alert sink rendered as the 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080' line (P4: the latency identifies which limit fired). The container emitted no application log at all — stderr read = 0 entries for the whole window — consistent with a process killed before module load finished; P3 OOM is ruled out because there is no 'Memory limit' line and the container is declared cpu:1 / memory:2Gi. The fault is not this service's: the same HealthCheckContainerError fired 138 times across 69 distinct avada-seo services in 04:00–05:30Z (apigen2, proxygen2, sidekickgen2, every webhook*/handle*/subscribe* gen2), all from unchanged code and the same shared image, which is the same platform window already recorded as infra under fingerprints hp9jv6 / 1e1njfe / yg48ak / dw8unc and ~50 others. Blast radius is zero merchant impact: status.traffic stayed pinned 100% to the previously-ready revision -00309-kes, and the very next deploy attempt succeeded — -00311-xir became latestReadyRevision at 05:23:44.510508Z, then -00312-cob at 05:40:01Z and -00313-cez at 06:59:10Z. The cron itself never lost a tick either: schedule '0 0 */2 * *' fires at 00:00Z, not inside the 04:4xZ failure window.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/cronFunctions.js:88` — updateSpeedUpExpireTimePublisherGen2 export — the service whose deploy revision failed the Cloud Run startup healthcheck
- `packages/functions/src/handlers/exports/cronFunctions.js:89` — {timeoutSeconds: 540, memory: '2GiB', schedule: '0 0 */2 * *'} — 2GiB with zero 'Memory limit' lines rules out P3 OOM, and the every-2-days 00:00Z schedule means no cron tick was lost in the 04:4xZ window

## Evidence
- 4 matching entries: `(resource.labels.service_name="updatespeedupexpiretimepublishergen2" OR resource.labels.function_name="updateSpeedUpExpireTimePublisherGen2") AND timestamp>="2026-08-14T04:31:44Z" AND timestamp<="2026-08-14T05:01:44Z" AND severity>=ERROR`
- 138 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND protoPayload.response.status.conditions.reason="HealthCheckContainerError"`
- 3 matching entries: `resource.labels.service_name="updatespeedupexpiretimepublishergen2" AND timestamp>="2026-08-14T05:00:00Z" AND timestamp<="2026-08-14T07:30:00Z" AND protoPayload.response.status.latestReadyRevisionName!=""`
- 32 matching entries: `(resource.labels.service_name="updatespeedupexpiretimepublishergen2" OR resource.labels.function_name="updateSpeedUpExpireTimePublisherGen2") AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.47

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
