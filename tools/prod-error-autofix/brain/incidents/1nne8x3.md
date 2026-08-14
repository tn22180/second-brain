fingerprint: 1nne8x3
service: oncreateusergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T07:58:14.630Z
status: infra
attempt: 1

# SEO · oncreateusergen2 · 1nne8x3

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the same platform-side container-start fault that hit avada-seo/us-central1 during 2026-08-14T04:00–05:30Z killed 7 oncreateusergen2 cold starts on the 240s startup TCP probe, so 4 Eventarc shops/{shopId} create deliveries were answered 503 'instance failed the readiness check'.

**Mechanism.** onCreateUserGen2 is declared onDocumentCreated({memory:'1GiB', document:'shops/{shopId}', ...vpcSettings}) with no minInstances (packages/functions/src/handlers/exports/firestoreFunctions.js:8-11), so every shop-create event arrives at zero warm instances and pays a full cold start. In 04:21–04:40Z, 4 Eventarc POSTs (userAgent 'APIs-Google', __GCP_CloudEventsMode=CE_PUBSUB_BINDING) got HTTP 503 with latencies 242.309162s / 242.402260s / 243.161716s / 245.129078s — all within ~5s of the Cloud Run default 240s startup TCP probe deadline, which is what the paired log line names: 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … DEADLINE_EXCEEDED' (7 such lines, 04:25:40Z–04:39:45Z). The container never bound :8080, so nothing in src/ ran: the stderr read is 0 entries and no application log exists for these requests. Not code: the SAME unchanged revision oncreateusergen2-00318-mis that failed also passed its startup probe at 04:35:26.860161Z and 04:35:32.130870Z and served 200s at 04:33:18Z (35.6s) and 04:34:43Z (48.7s), and both revisions present in the window (-00318-mis, -00319-jod, distinct firebase-functions-hash) failed identically. Not P3 OOM: zero 'Memory limit' lines on this service in the full 24h. Not service-specific: in the 04:00–05:30Z window the same 'STARTUP TCP probe failed' line fired 593 times across ~80 distinct avada-seo services (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44 … oncreateusergen2 only 7), which is the fault already recorded as infra under fingerprints muzsov / 1e908f9 / 1r74ll6 / e9i6k0 and others on this date. Blast radius is bounded: Eventarc retries the shops/{shopId} create delivery, and the two 200s at 04:33:18Z and 04:34:43Z on the same revision are those retries landing — the onCreateShop handler (packages/functions/src/handlers/onCreateShop.js) did run, only 4 minutes late.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/firestoreFunctions.js:8` — onCreateUserGen2 export — the service whose cold starts failed the startup probe
- `packages/functions/src/handlers/exports/firestoreFunctions.js:9` — {memory:'1GiB', document:'shops/{shopId}', ...vpcSettings} — no minInstances, so every shop-create event pays a full cold start; 1GiB with zero 'Memory limit' lines that day rules out P3 OOM
- `packages/functions/src/handlers/onCreateShop.js:1` — the handler body that never executed — the container died before module load, which is why stderr=0 for all 4 failed requests
- `packages/functions/src/config/vpcSettings.js:12` — prod attaches vpcConnector 'seo-connector' on this function; it is the only prod-only startup dependency, and it is shared by every failing service in the window, consistent with a platform-side fault rather than a code defect

## Evidence
- 7 matching entries: `resource.labels.service_name="oncreateusergen2" AND timestamp>="2026-08-14T04:20:50Z" AND timestamp<="2026-08-14T04:50:50Z" AND textPayload:"STARTUP TCP probe failed"`
- 8 matching entries: `resource.labels.service_name="oncreateusergen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND httpRequest.status>0`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 8 matching entries: `resource.labels.service_name="oncreateusergen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 1
- cost: $1.43

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
