fingerprint: 1fgksqk
service: optimizestoresubscribergen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-14T07:32:39.434Z
status: infra
attempt: 1

# SEO · optimizestoresubscribergen2 · 1fgksqk

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the same platform-side container-start fault in avada-seo/us-central1 during the 04:00–05:00Z hour on 2026-08-14 (already recorded as fingerprint 1db4z7z, and fleet-wide as 1r74ll6/muzsov/1470mjt/8g3u6t) made optimizestoresubscribergen2 cold starts fail Cloud Run's 240s startup TCP probe, so the 4 Pub/Sub push deliveries for topic optimizeStore waiting on those cold starts were answered 503 'instance failed the readiness check'.

**Mechanism.** All 4 failed requests in the window are POST https://optimizestoresubscribergen2-pihimpufva-uc.a.run.app/?__GCP_CloudEventsMode=CUSTOM_PUBSUB_projects%2Favada-seo%2Ftopics%2FoptimizeStore — Pub/Sub push deliveries of the optimizeStore topic, all on one revision optimizestoresubscribergen2-00309-sal, at 04:19:56.330799Z, 04:24:18.172694Z, 04:28:39.310994Z, 04:33:07.264202Z. Latency is 246.082s / 242.083s / 242.079s / 241.102s — the 240s Cloud Run startup-probe deadline plus scheduling (P4: the latency identifies which limit fired, and nothing in this repo has a 240s setting; optimizeStoreSubscriberGen2 is declared timeoutSeconds: 540). The other 5 of 9 error entries are 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. / Connection failed with status DEADLINE_EXCEEDED.' at 04:19:40.616273Z, 04:23:56.463227Z, 04:28:18.385526Z, 04:32:39.458830Z, 04:37:07.412768Z, across 5 distinct instanceIds — each probe failure is ~16-22s before the matching 503, i.e. the container never bound :8080, so wrapPubSub(subscribeOptimizeStore) (packages/functions/src/handlers/exports/pubsubFunctions.js:106) was never entered and subscribeOptimizeStore (packages/functions/src/handlers/pubsub/subscribeOptimizeStore.js:46) never ran. Not this service's code: the same probe-failure line fired 593 times across 46 avada-seo services in that one hour (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44, extensiongen2 31, … optimizestoresubscribergen2 only 5) against 2 entries in the whole preceding 03:00Z hour — a bounded platform window, not a deploy and not a code change. The same service logged 10 successful startup probes on the same day, so the image boots. P3 OOM ruled out: zero 'Memory limit' lines on this service that day; stderr is 0 entries for the window because the container dies before module load, which is the expected state on this app anyway (P7 — SEO's logger is bare console.*, so an empty errors read for app errors is normal; here the errors read is purely Cloud Run platform lines). Blast radius: 4 optimizeStore messages nacked; Pub/Sub redelivers, and subscribeOptimizeStore never started, so no partial writes.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:104` — optimizeStoreSubscriberGen2 export — the Cloud Run service whose cold starts failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:105` — {timeoutSeconds: 540, memory: '2GiB', topic: 'optimizeStore', ...vpcSettings} — no minInstances, so each optimizeStore message at zero warm instances pays a full cold start; timeoutSeconds 540 ≠ the observed 241-246s, confirming the 240s startup probe fired, not a handler timeout
- `packages/functions/src/handlers/pubsub/subscribeOptimizeStore.js:46` — the handler behind topic optimizeStore — never entered; container died before listen(), so no application log and no partial work

## Evidence
- 9 matching entries: `(resource.labels.service_name="optimizestoresubscribergen2") AND timestamp>="2026-08-14T04:16:31.900Z" AND timestamp<="2026-08-14T04:46:31.900Z" AND severity>=ERROR`
- 4 matching entries: `(resource.labels.service_name="optimizestoresubscribergen2") AND timestamp>="2026-08-14T04:16:31.900Z" AND timestamp<="2026-08-14T04:46:31.900Z" AND httpRequest.status>=500`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 2 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:00:00Z" AND timestamp<="2026-08-14T03:59:59Z" AND textPayload:"STARTUP TCP probe failed"`
- 10 matching entries: `resource.labels.service_name="optimizestoresubscribergen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 2
- cost: $2.12

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
