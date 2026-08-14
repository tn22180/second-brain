fingerprint: 3tnrcs
service: updatesitemapssubscribergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T09:57:16.064Z
status: infra
attempt: 1

# SEO · updatesitemapssubscribergen2 · 3tnrcs

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:35Z prod deploy of avada-seo created revision updatesitemapssubscribergen2-00315-cer, whose container never bound :8080 within Cloud Run's 240s default startup TCP probe, so the deploy's health check failed — one of 120 identical container-start failures across 60 distinct avada-seo/us-central1 services in the same 04:00–05:30Z window, i.e. a platform-side fault, and the same image started fine on retry at 05:17Z and 05:34Z with unchanged code.

**Mechanism.** updateSitemapsSubscriberGen2 is declared onMessagePublished({memory:'1GiB', timeoutSeconds:120, topic:'updateSitemaps', ...vpcSettings}) at packages/functions/src/handlers/exports/pubsubFunctions.js:229-232 — no minInstances, so every revision rollout pays a full cold start. At 2026-08-14T04:35:31.955493Z Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' for revision -00315-cer (created 04:35:26.953284Z, generation 315, firebase-functions-hash 6a1603c9106996c7b9e56035239dcab1ab44f4f1). The container never reached listen(): at 04:39:32.955194Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 241.000s after the instance-start line, matching the revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} from logs.json to within log granularity (P4: the latency identifies which limit fired). Two seconds later the Knative Ready condition flipped to False with reason HealthCheckContainerError (04:39:34.913904Z) and the Cloud Functions v2 UpdateFunction call by tuannv@avadagroup.com returned code 3, 'Container Healthcheck failed. Revision updatesitemapssubscribergen2-00315-cer is not ready and cannot serve traffic.' P3 OOM is ruled out: zero 'Memory limit' lines on this service and the container emitted no application log at all (stderr read = 0 entries), consistent with a process killed before module load finished. The fault is not service-specific — in 04:00–05:30Z the same 'failed to start and listen on the port' status fired 120 times across 60 distinct avada-seo services, on different revisions and different images, the same platform window already recorded under fingerprints 145obvc / 13wx2gk / w3e84n / 2pbd9 and ~40 others. Blast radius is zero merchant impact: status.latestReadyRevisionName stayed updatesitemapssubscribergen2-00314-tis with 100% of traffic, so the old revision kept serving the updateSitemaps Pub/Sub topic throughout; zero requests and zero 5xx on this service in 04:00–06:00Z. The rollout self-healed on the retries — 'Default STARTUP TCP probe succeeded after 1 attempt' twice, at 05:17:36.842290Z and 05:34:48.562344Z, same code, same build.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:229` — updateSitemapsSubscriberGen2 export — the service whose deploy-time cold start failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:230` — {memory:'1GiB', timeoutSeconds:120, topic:'updateSitemaps', ...vpcSettings} — no minInstances so every rollout pays a full cold start; 1GiB with zero 'Memory limit' lines rules out P3, and the 120s function timeout is not the limit that fired (241s probe window is)
- `packages/functions/src/handlers/exports/pubsubFunctions.js:231` — wrapPubSub(subscribeUpdateSitemaps) is the only handler code in the failing container; it never executed — no application log line exists for revision -00315-cer

## Evidence
- 1 matching entries: `resource.labels.service_name="updatesitemapssubscribergen2" AND timestamp>="2026-08-14T04:24:37Z" AND timestamp<="2026-08-14T04:54:37Z" AND textPayload:"STARTUP TCP probe failed"`
- 120 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND protoPayload.status.message:"failed to start and listen on the port"`
- 2 matching entries: `resource.labels.service_name="updatesitemapssubscribergen2" AND timestamp>="2026-08-14T05:00:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 4 matching entries: `(resource.labels.service_name="updatesitemapssubscribergen2" OR resource.labels.function_name="updateSitemapsSubscriberGen2") AND timestamp>="2026-08-14T04:24:37.303Z" AND timestamp<="2026-08-14T04:54:37.303Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.65

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
