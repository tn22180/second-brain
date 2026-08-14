fingerprint: 1db4z7z
service: optimizestoresubscribergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T06:34:53.030Z
status: infra
attempt: 1

# SEO · optimizestoresubscribergen2 · 1db4z7z

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-start fault in avada-seo/us-central1 during the 04:00–05:00Z hour on 2026-08-14 stopped optimizestoresubscribergen2 cold-start containers from binding :8080, so Cloud Run's 240s startup TCP probe killed each of 5 consecutive instances and answered the Pub/Sub push deliveries of topic optimizeStore with 503.

**Mechanism.** optimizeStoreSubscriberGen2 is declared onMessagePublished({timeoutSeconds: 540, memory: '2GiB', topic: 'optimizeStore', ...vpcSettings}) with no minInstances (packages/functions/src/handlers/exports/pubsubFunctions.js:104-105), so every optimizeStore delivery that arrives with no warm instance pays a full cold start. Revision optimizestoresubscribergen2-00309-sal carries startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} (gcloud run revisions describe). Five push deliveries from Pub/Sub (userAgent 'APIs-Google', remoteIp 74.125.212.1 / 66.102.6.192 / 64.233.172.4 / 66.102.6.165 / 74.125.215.99) each triggered 'Starting new instance. Reason: AUTOSCALING' on a distinct instanceId, the container never reached listen(), and exactly ~240s later Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … DEADLINE_EXCEEDED' and returned 503 'The request failed because the instance failed the readiness check'. Latencies were 241.110s, 246.082s, 242.083s, 242.079s, 241.102s — the 240s probe window plus scheduling, so P4 identifies which limit fired. The chain is self-driving: instance start 04:15:40.166Z → probe fail 04:19:40.616Z (240.45s later) → 503 at 04:19:56.331Z → next redelivery starts the next instance, repeating 5×. Not code and not this service: in the same 04:00–05:00Z hour the identical probe-failure line fired 593 times across 78 distinct avada-seo services on different revisions and different images with unchanged code, against 2 in the preceding hour and 0 in the following hour — the same platform-side window already recorded as infra under fingerprints 1lwydlk / 16ubfhn / 1r74ll6 / muzsov / 1470mjt / 8g3u6t. Not a bad deploy: revision -00309-sal was created 2026-08-13T09:18:30Z, ~19h earlier, and the same revision logged 'STARTUP TCP probe succeeded' at 02:20Z and 03:55Z before the window and again at 04:39Z, 04:43Z, 05:07Z after it. P3 OOM is ruled out: zero 'Memory limit' lines on this service in the full 24h, and no application log of any kind was emitted — the only logNames in the window are run.googleapis.com/varlog/system (14), run.googleapis.com/requests (6) and cloudaudit (4), with zero stdout/stderr entries, consistent with a process killed before module load reached subscribeOptimizeStore. Blast radius is delay only: Pub/Sub push retries on 503, and the same topic recovered on its own — POST returned 200 at 04:37:39.177Z (172.350s, a slow but successful cold start) and 200 at 05:06:51.783Z (17.785s).

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:104` — optimizeStoreSubscriberGen2 export — the Cloud Run service whose cold starts failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:105` — {timeoutSeconds: 540, memory: '2GiB', topic: 'optimizeStore'} — no minInstances, so every optimizeStore delivery on an idle service pays a full cold start; 2GiB with zero 'Memory limit' lines that day rules out P3
- `packages/functions/src/handlers/exports/pubsubFunctions.js:89` — wrapPubSub is the only thing between the HTTP entry and the handler; it never ran — no application log line exists for any of the 5 failed instances
- `packages/functions/src/handlers/pubsub/subscribeOptimizeStore.js:46` — subscribeOptimizeStore, the handler that would have logged on any in-process failure; its absence from the logs places the fault before module load

## Evidence
- 10 matching entries: `(resource.labels.service_name="optimizestoresubscribergen2" OR resource.labels.function_name="optimizestoresubscribergen2" OR resource.labels.job_name="optimizestoresubscribergen2") AND timestamp>="2026-08-14T04:14:09.151Z" AND timestamp<="2026-08-14T04:44:09.151Z" AND severity>=ERROR`
- 5 matching entries: `(resource.labels.service_name="optimizestoresubscribergen2") AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 7 matching entries: `(resource.labels.service_name="optimizestoresubscribergen2") AND timestamp>="2026-08-14T04:14:09Z" AND timestamp<="2026-08-14T04:44:09Z" AND textPayload:"Starting new instance"`
- 593 matching entries: `resource.type="cloud_run_revision" AND resource.labels.location="us-central1" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 2 matching entries: `resource.type="cloud_run_revision" AND resource.labels.location="us-central1" AND timestamp>="2026-08-14T03:00:00Z" AND timestamp<="2026-08-14T04:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 2 matching entries: `(resource.labels.service_name="optimizestoresubscribergen2") AND timestamp>="2026-08-14T04:35:00Z" AND timestamp<="2026-08-14T05:10:00Z" AND httpRequest.requestMethod="POST"`

## Job
- analyze rounds: 2
- cost: $2.41

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
