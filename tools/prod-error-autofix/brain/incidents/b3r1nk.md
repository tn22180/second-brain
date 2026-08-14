fingerprint: b3r1nk
service: handlehooksubscribergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:46:19.524Z
status: infra
attempt: 1

# SEO · handlehooksubscribergen2 · b3r1nk

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:42:30Z prod deploy of avada-seo created revision handlehooksubscribergen2-00310-juv, and its first cold-start container never bound :8080 within the 240s Cloud Run startup TCP probe deadline, so Cloud Run killed it at 04:46:38.937613Z — one of 593 identical startup-probe failures across 40+ unrelated avada-seo/us-central1 services in the same 04:00–05:30Z window, i.e. a platform-side container-start fault, not a defect in this repo.

**Mechanism.** handleHookSubscriberGen2 is declared onMessagePublished({memory: '2GiB', timeoutSeconds: 540, topic: 'handleHook', minInstances: 1, ...vpcSettings}) at packages/functions/src/handlers/exports/pubsubFunctions.js:344-347. minInstances:1 means the deploy of a new revision immediately starts one container without waiting for traffic. `gcloud run revisions describe handlehooksubscribergen2-00310-juv` gives metadata.creationTimestamp 2026-08-14T04:42:30.224261Z and startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1}. The ERROR line fired at 04:46:38.937613Z — 248.7s after revision creation, matching the configured 240s probe deadline plus scheduling (P4: the latency identifies which limit fired), with the log's own text 'Connection failed with status DEADLINE_EXCEEDED'. P3 OOM is ruled out: the query textPayload:"Memory limit" on this service over the full 24h of 2026-08-14 returns 0 entries, and the container emitted no application stderr at all before the kill — consistent with a process killed before module load finished. The fault is not service-specific: in 2026-08-14T04:00–05:30Z the same 'STARTUP TCP probe failed' line fired 593 times across 40+ distinct avada-seo services (authgen2 103, handleproderroralertgen2 79, apigen2 52, onupdateshopgen2 45, proxygen2 37, extensiongen2 31, …, handlehooksubscribergen2 1), on different revisions and different images with unchanged code — the same window already recorded as infra under fingerprints dw8unc / 1udmr73 / hp9jv6 and ~60 others. Blast radius is nil: Cloud Run retried and the same revision logged 'STARTUP TCP probe succeeded after 1 attempt' at 04:47:51.699672Z (73s later), while the outgoing revision -00309-guw stayed healthy through 04:46:53.426845Z, and the subscriber kept draining the handleHook topic normally either side of the gap — [handleHook] bulkOp 9sJwi1SYMfJLYX1NKuly COMPLETED at 04:37:36Z on -00309-guw and [handleHook] bulkOp Ue4XKY8PpzEP2tqbYW0i COMPLETED at 05:00:46Z on -00310-juv. Pub/Sub redelivers anything not acked during the gap, so no bulk_operations/finish hook was lost.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:344` — handleHookSubscriberGen2 export — the service whose cold-start container failed the startup TCP probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:345` — {memory: '2GiB', timeoutSeconds: 540, topic: 'handleHook', minInstances: 1} — minInstances:1 is why a deploy alone starts a container with no traffic waiting on it; 2GiB with zero 'Memory limit' lines in 24h rules out P3 OOM

## Evidence
- 3 matching entries: `(resource.labels.service_name="handlehooksubscribergen2") AND timestamp>="2026-08-14T04:31:46Z" AND timestamp<="2026-08-14T05:01:46Z" AND textPayload:"STARTUP TCP probe"`
- 593 matching entries: `resource.type="cloud_run_revision" AND resource.labels.project_id="avada-seo" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 8 matching entries: `(resource.labels.service_name="handlehooksubscribergen2") AND timestamp>="2026-08-14T04:31:46.242Z" AND timestamp<="2026-08-14T05:01:46.242Z" AND logName:"stderr"`

## Job
- analyze rounds: 2
- cost: $2.05

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
