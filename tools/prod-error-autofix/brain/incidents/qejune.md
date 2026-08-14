fingerprint: qejune
service: subscribeupdatenewsubscribercreditshandlergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:32:03.926Z
status: infra
attempt: 1

# SEO · subscribeupdatenewsubscribercreditshandlergen2 · qejune

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:42:31Z prod deploy of avada-seo created revision subscribeupdatenewsubscribercreditshandlergen2-00141-vif, whose cold-start container never bound :8080 and was killed at the 240s startup-probe deadline — one of 60 distinct avada-seo services hit by the same platform-side container-start fault in the 04:00–05:30Z window; the identical image started fine at 05:23Z and 05:39Z.

**Mechanism.** subscribeUpdateNewSubscriberCreditsHandlerGen2 is declared onMessagePublished({timeoutSeconds:540, memory:'2GiB', topic:'updateSubscriberCredits', ...vpcSettings}) at packages/functions/src/handlers/exports/pubsubFunctions.js:301-304. The 04:42Z deploy (Firebase CLI, principalEmail tuannv@avadagroup.com, methodName google.cloud.functions.v2.FunctionService.UpdateFunction) created revision -00141-vif at 2026-08-14T04:42:31.297301Z. Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' at 04:42:39.902101Z; the container never reached listen(), and at 04:46:41.203050Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 241.3s after instance start, matching the revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} recorded in the same audit payload (P4: the latency identifies which limit fired). The rollout was then rejected: 'Ready condition status changed to False ... HealthCheckContainerError' at 04:46:42.475524Z, and the CFv2 UpdateFunction operation ended code 3 at 04:46:44.775Z. This is not repo code: (a) latestReadyRevisionName stayed subscribeupdatenewsubscribercreditshandlergen2-00140-bof with traffic 100%, so no updateSubscriberCredits Pub/Sub message was ever routed to the dead revision — requests read = 0, stderr read = 0, and there is no application log line at all, consistent with a process killed before module load finished; (b) the same 'failed to start and listen on the port' message fired across 60 distinct avada-seo/us-central1 services in 04:00–05:30Z, on different revisions and different images, with unchanged code — the fleet-wide fault already recorded under fingerprints 1qfuynm / i4yn7s / 1qtihyi and ~50 others for this deploy window; (c) subsequent rollouts of the same build for this service succeeded — 'Default STARTUP TCP probe succeeded after 1 attempt' at 05:23:24.118748Z and 05:39:51.229244Z. P3 OOM is ruled out: zero 'Memory limit' lines on this service in the window, and the container never ran user code.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:301` — subscribeUpdateNewSubscriberCreditsHandlerGen2 export — the service whose 04:42Z rollout revision failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:302` — {timeoutSeconds:540, memory:'2GiB', topic:'updateSubscriberCredits'} — 2GiB with zero 'Memory limit' lines rules out P3; no minInstances/concurrency override, so the config is untouched by this failure
- `packages/functions/src/handlers/pubsub/subscribeUpdateNewSubscriberCredits.js:85` — the handler body — never entered: no [updateSubscriberCredits] log line exists in the window, confirming the kill happened before user code ran
- `packages/functions/src/handlers/pubsub/subscribeActiveCharge.js:45` — the only publisher of topic 'updateSubscriberCredits' — its messages kept landing on the still-serving revision -00140-bof, so no credit reset was lost

## Evidence
- 4 matching entries: `(resource.labels.service_name="subscribeupdatenewsubscribercreditshandlergen2" OR resource.labels.function_name="subscribeupdatenewsubscribercreditshandlergen2") AND timestamp>="2026-08-14T04:31:42.371Z" AND timestamp<="2026-08-14T05:01:42.371Z" AND severity>=ERROR`
- 18 matching entries: `resource.labels.service_name="subscribeupdatenewsubscribercreditshandlergen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T06:00:00Z"`
- 120 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND protoPayload.status.message:"failed to start and listen on the port"`
- 2 matching entries: `resource.labels.service_name="subscribeupdatenewsubscribercreditshandlergen2" AND timestamp>="2026-08-14T05:00:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 1
- cost: $1.45

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
