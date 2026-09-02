fingerprint: m2ghuu
service: resolveallredirectsubscribergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-09-01T16:37:26.915Z
status: infra
attempt: 1

# SEO · resolveallredirectsubscribergen2 · m2ghuu

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: one cold-start container of resolveallredirectsubscribergen2 (instance 00a41e8c1d367acc…, revision -00348-wuj) never bound :8080 and was killed when Cloud Run's startup TCP probe hit its configured 240s deadline — one of 5 identical startup-probe kills across 5 unrelated avada-seo services in the 16:05–16:35Z half hour, i.e. a platform-side container-start fault, not a defect in this repo.

**Mechanism.** resolveAllRedirectSubscriberGen2 is declared onMessagePublished({memory:'1GiB', timeoutSeconds:540, topic:'resolveAllRedirects', ...vpcSettings}) with no minInstances (packages/functions/src/handlers/exports/pubsubFunctions.js:192-195), so every Pub/Sub delivery that finds no warm instance pays a full cold start. At 2026-09-01T16:29:47.251459Z Cloud Run logged 'Starting new instance. Reason: AUTOSCALING' on instance 00a41e8c1d367acc…; the container never reached listen(). At 16:33:47.409010Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.158s after the instance-start line, matching startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} from `gcloud run services describe` to within the log's own granularity (P4: the latency identifies which limit fired). P3 OOM is ruled out: zero 'Memory limit' lines on this service in the full 24h against a 1024Mi limit, and the container emitted no application log at all (stderr read = 0 entries, stdout = 0 entries), consistent with a process killed before module load finished — and per P3, absence of a log near a kill is consistent with, not evidence against, a container-level kill. The fault is not service-specific: in 15:30–17:30Z the same 'STARTUP TCP probe failed' line fired 15 times across authgen2 (10), partnerintegrationsubscribergen2, retriggeroptimizepublishergen2, proxygen2, webhookpublishthemegen2 and this service, on different revisions and different images, with unchanged code — the same 2026-09-01 avada-seo/us-central1 sweep already recorded as infra under fingerprints 1up1ei8 / 9y4a2r / 1qj4dz7 / 1sc23g3 / mzokuq. Over the full day, 42 probe kills hit 12 distinct services in this project. Blast radius is bounded: the container never ran, so nothing ACKed the Pub/Sub message and Pub/Sub redelivers it; a replacement instance started 5s later at 16:33:52.259555Z. subscribeResolveAllRedirect re-slices the same chunk from lastIndexAsset and re-dispatches the next one (packages/functions/src/handlers/pubsub/subscribeResolveAllRedirect.js:101), so the self-chaining redirect-resolve fan-out resumes where it stopped — the only effect is a few minutes' delay on one shop's 404-fix chunk.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:192` — resolveAllRedirectSubscriberGen2 export — the service whose cold start failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:193` — {memory:'1GiB', timeoutSeconds:540, topic:'resolveAllRedirects'} — no minInstances, so every idle-period delivery pays a full cold start; 1GiB with zero 'Memory limit' lines that day rules out P3
- `packages/functions/src/handlers/pubsub/subscribeResolveAllRedirect.js:101` — self-chaining dispatchWork('resolveAllRedirects', {lastIndexAsset: endIndex}) — the un-ACKed message is redelivered and the chain resumes from the same index, bounding blast radius to a delay

## Evidence
- 1 matching entries: `(resource.labels.service_name="resolveallredirectsubscribergen2" OR resource.labels.function_name="resolveallredirectsubscribergen2" OR resource.labels.job_name="resolveallredirectsubscribergen2") AND timestamp>="2026-09-01T16:19:19.280Z" AND timestamp<="2026-09-01T16:49:19.280Z" AND severity>=ERROR`
- 7 matching entries: `resource.labels.service_name="resolveallredirectsubscribergen2" AND timestamp>="2026-09-01T16:25:00Z" AND timestamp<="2026-09-01T16:45:00Z"`
- 15 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T15:30:00Z" AND timestamp<="2026-09-01T17:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 42 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T00:00:00Z" AND timestamp<="2026-09-02T00:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 3 matching entries: `resource.labels.service_name="resolveallredirectsubscribergen2" AND timestamp>="2026-09-01T00:00:00Z" AND timestamp<="2026-09-02T00:00:00Z" AND ("Memory limit" OR textPayload:"STARTUP TCP probe succeeded")`

## Job
- analyze rounds: 1
- cost: $1.61

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
