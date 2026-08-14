fingerprint: l1ix4v
service: revertimagessubscribergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T09:42:11.618Z
status: infra
attempt: 1

# SEO · revertimagessubscribergen2 · l1ix4v

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:31–04:32Z prod deploy of avada-seo rolled out revision revertimagessubscribergen2-00315-wok into a platform-side container-start fault in avada-seo/us-central1, and that one cold-start container never bound :8080 within the service's own 240s startup TCP probe deadline, so Cloud Run killed it and logged the alerted ERROR.

**Mechanism.** revertImagesSubscriberGen2 is declared onMessagePublished({timeoutSeconds: 540, memory: '1GiB', topic: 'revertImages', ...vpcSettings}) at packages/functions/src/handlers/exports/pubsubFunctions.js:135-138. At 2026-08-14T04:32:06.900282Z Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT - Instance started due to traffic shifting between revisions due to deployment' on revision revertimagessubscribergen2-00315-wok (instance 001548f729b44036101579437c8fd673…). The container never reached listen(): at 04:36:07.305408Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.405s after the instance-start line, matching startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} from `gcloud run services describe` to within the log's granularity (P4: the latency identifies which limit fired). No application code ran: the stderr read returned 0 entries and the requests read 0 entries for the whole 30-minute window, and this app's logger is bare console (P7), so an app-side fault would have shown in stderr. P3 OOM is ruled out — 0 'Memory limit' lines on this service across the full 24h against its declared 1024Mi. The fault is not this service's: in 04:00–05:30Z the identical 'STARTUP TCP probe failed' line fired 593 times across ~40 distinct avada-seo services (authgen2 103, handleproderroralertgen2 79, apigen2 52, onupdateshopgen2 45, proxygen2 37, extensiongen2 31, … revertimagessubscribergen2 1), on different revisions and different images, with unchanged code — the same sweep already recorded as infra under fingerprints e9i6k0 / 1e908f9 / 5dup6h and ~30 others. Recovery was automatic and complete: the next three rollouts of this same service (-00316-qug 05:17:14Z, -00317-kom 05:34:24Z, -00318-mex 06:53:30Z) all logged 'Default STARTUP TCP probe succeeded after 1 attempt'. Blast radius is nil for merchants: no request was in flight (requests=0), and a Pub/Sub 'revertImages' message that could not be delivered to a starting instance is retried by Pub/Sub against a healthy instance.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:135` — revertImagesSubscriberGen2 export — the service whose cold-start container failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:136` — {timeoutSeconds: 540, memory: '1GiB', topic: 'revertImages'} — the declared 1GiB against which zero 'Memory limit' lines were logged in 24h, ruling out P3 OOM; no minInstances, so every delivery pays a cold start
- `packages/functions/src/handlers/exports/pubsubFunctions.js:137` — wrapPubSub(subscribeRevertImage) — the handler body never executed; container died before module load, consistent with stderr=0 and requests=0

## Evidence
- 24 matching entries: `(resource.labels.service_name="revertimagessubscribergen2") AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 4 matching entries: `(resource.labels.service_name="revertimagessubscribergen2") AND timestamp>="2026-08-14T04:23:00.030Z" AND timestamp<="2026-08-14T04:53:00.030Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.20

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
