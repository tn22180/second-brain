fingerprint: 14yc9bw
service: updatespeedupexpiretimesubscribergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T09:55:28.853Z
status: infra
attempt: 1

# SEO · updatespeedupexpiretimesubscribergen2 · 14yc9bw

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:35Z prod deploy of avada-seo created revision updatespeedupexpiretimesubscribergen2-00316-xaf, whose single cold-start container never bound :8080 and was killed when Cloud Run's default startup TCP probe hit its configured 240s deadline — one of 593 identical startup-probe failures across 78 unrelated avada-seo services in the same 90 minutes, i.e. a platform-side container-start fault; traffic never left the healthy -00315-seg revision, so no Pub/Sub message failed.

**Mechanism.** updateSpeedUpExpireTimeSubscriberGen2 is declared onMessagePublished({memory:'1GiB', timeoutSeconds:540, concurrency:1, topic:'updateSpeedUpExpireTimePubsub', ...vpcSettings}) at packages/functions/src/handlers/exports/pubsubFunctions.js:258-267, so every deploy rolls a new Cloud Run revision that must pass a health check before receiving traffic. The audit log (cloudaudit .../activity, principalEmail tuannv@avadagroup.com, methodName google.cloud.functions.v2.FunctionService.UpdateFunction, status.code 3) records revision -00316-xaf created at 2026-08-14T04:35:27.057590Z. Cloud Run started the probe container at 04:35:32.840817Z ('Starting new instance. Reason: DEPLOYMENT_ROLLOUT'). The container emitted no application log line at all, and at 04:39:33.074515Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.23s after the instance-start line, matching the revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} to within log granularity (P4: the latency identifies which limit fired). The service then went Ready=False/HealthCheckContainerError at 04:39:34.028187Z. P3 OOM is ruled out: zero 'Memory limit' lines on this service, and resources.limits were cpu:1 / memory:1024Mi with no allocation logged — consistent with a process killed before it ever bound the port. The fault is not this service's code: in 04:00–05:30Z the same 'STARTUP TCP probe failed' line fired 593 times across 78 distinct avada-seo services (authgen2 79, handleproderroralertgen2 61, apigen2 47, proxygen2 27 …), on different revisions and different images, unchanged code — the same window already recorded as infra under fingerprints 145obvc / 13wx2gk / w3e84n and dozens more. Proof the bundle itself is fine: at 05:17:42.076651Z the same service's next rollout logged 'Default STARTUP TCP probe succeeded after 1 attempt for container "worker" on port 8080', ~23.6s after its instance start. Blast radius is zero merchant impact: status.latestReadyRevisionName stayed updatespeedupexpiretimesubscribergen2-00315-seg with traffic 100%, so the failed revision never served, and requests=0 / no Pub/Sub delivery error appears in the window.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:258` — updateSpeedUpExpireTimeSubscriberGen2 export — the service whose deploy-time cold start failed the startup TCP probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:260` — memory:'1GiB' — declared limit matching the revision's resources.limits memory 1024Mi; zero 'Memory limit' lines in the window rules out P3 OOM
- `packages/functions/src/handlers/exports/pubsubFunctions.js:262` — concurrency:1 — matches the revision's containerConcurrency:1, so at most one in-flight message could ever have been affected; none was, traffic stayed on -00315-seg

## Evidence
- 12 matching entries: `resource.labels.service_name="updatespeedupexpiretimesubscribergen2" AND timestamp>="2026-08-14T04:20:00Z" AND timestamp<="2026-08-14T05:30:00Z"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 1 matching entries: `resource.labels.service_name="updatespeedupexpiretimesubscribergen2" AND timestamp>="2026-08-14T05:10:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 4 matching entries: `(resource.labels.service_name="updatespeedupexpiretimesubscribergen2" OR resource.labels.function_name="updateSpeedUpExpireTimeSubscriberGen2") AND timestamp>="2026-08-14T04:24:34.475Z" AND timestamp<="2026-08-14T04:54:34.475Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.42

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
