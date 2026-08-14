fingerprint: deue3s
service: ext-firestore-bigquery-export-fsexportbigquery
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#abort-request>
app: SEO
repo: seo
date: 2026-08-14T09:27:52.738Z
status: infra
attempt: 1

# SEO · ext-firestore-bigquery-export-fsexportbigquery · deue3s

**Outcome.** infra class — reported, no MR

**Root cause.** Not app code: the repo-managed Firebase extension instance `firestore-bigquery-export` (firebase/firestore-bigquery-export@0.3.2, firebase.json:175) runs on Cloud Run at containerConcurrency=1 / cpu 0.1666 / memory 256Mi with minInstances=0, so when three of its instances were simultaneously pinned by 43.0s, 47.9s and 52.3s requests at 04:24:42–04:25:16Z, two Eventarc Firestore-write deliveries arrived with every instance occupied and no newly-ordered instance yet serving, and Cloud Run aborted them with 'no available instance'.

**Mechanism.** The extension mirrors the whole `shops` collection (COLLECTION_PATH=shops, extensions/firestore-bigquery-export.env:4) and fires one Cloud Run invocation per Firestore write. `gcloud run services describe ext-firestore-bigquery-export-fsexportbigquery --region=us-central1 --project=avada-seo` reports revision -00002-taq with containerConcurrency: 1, cpu '0.1666', memory 256Mi, autoscaling.knative.dev/maxScale '100', no minScale annotation — matching firebaseextensions.v1beta.function/memory=256 (env:12) and minInstances=0 (env:13). containerConcurrency 1 means one in-flight request occupies an entire instance. Traffic was flat, not bursty: 142 requests in 04:20–04:30Z, 12–19 per minute, median latency 0.15s, all served by the single warm instance …f15212e. Then three requests ran two-to-three orders of magnitude longer — 47.937854926s (04:24:42.822Z, instance …640305f4e2445), 43.038686056s (04:24:46.214Z, instance …59a3b8d2f7b0c), 52.340689484s (04:25:16.102Z, instance …4735a8cc198e78) — each pinning its own instance for the duration. The autoscaler ordered new instances at 04:24:11.958868Z, 04:24:42.922123Z, 04:24:56.442588Z, 04:25:16.108767Z, 04:25:20.554753Z and 04:25:27.050066Z, with STARTUP TCP probes succeeding at 04:24:54.788633Z, 04:25:19.738028Z, 04:25:39.816085Z and 04:26:02.5–6Z. Both 500s land exactly in the gaps between an order and the next probe success: 04:24:59.552456Z (after the 04:24:56.44 order, next probe 04:25:19.73) and 04:25:23.041847Z (after the 04:25:20.55 order, next probe 04:25:39.81). Both carry latency '0s' and the 04:25:23 one carries no instanceId at all — they never reached a container. maxScale 100 was never approached (6 distinct instanceIds in the window), so the instance cap is not the constraint; scale-up latency under concurrency:1 is. What made the three requests take 43–52s is not provable from this project: the extension is configured with TRANSFORM_FUNCTION=https://us-central1-avada-fs-bg-transformer.cloudfunctions.net/handler (env:20), an inline HTTP hop to a Cloud Function in a different GCP project, and `gcloud logging read --project=avada-fs-bg-transformer` returns PERMISSION_DENIED for tony-cli@avada-seo.iam.gserviceaccount.com. That hop is the only unbounded external call on the path and is where I would look next, but it is stated as pointing-at, not proven. No application log exists at all for this service — 11 entries in 04:20–04:35Z, all run.googleapis.com/varlog/system, zero stdout/stderr — because the container is Google's extension image, not repo code, and LOG_LEVEL=warn (env:10). This is rare and marginal: exactly 2 HTTP 500s in the 25h 2026-08-13T04:00Z–2026-08-14T05:00Z against 1356 HTTP 200s in the 04:00–05:00Z hour alone (99.85% success).

Confidence: `high` · infra class, not auto-fixed

## Code
- `firebase.json:175` — declares the failing service: extension instance `firestore-bigquery-export` pinned to firebase/firestore-bigquery-export@0.3.2 — the container is Google's, not this repo's src/
- `extensions/firestore-bigquery-export.env:13` — firebaseextensions.v1beta.function/minInstances=0 — the one knob in this repo that would remove the capacity gap; every abort falls in a scale-up window
- `extensions/firestore-bigquery-export.env:12` — firebaseextensions.v1beta.function/memory=256 → Cloud Run cpu 0.1666, confirmed by services describe; a 1/6-vCPU container recovers slowly from a stall
- `extensions/firestore-bigquery-export.env:4` — COLLECTION_PATH=shops — one Cloud Run invocation per write to any shop doc, which is what produces the steady 12–19 req/min stream
- `extensions/firestore-bigquery-export.env:20` — TRANSFORM_FUNCTION points at an inline HTTP hop into project avada-fs-bg-transformer — the only unbounded external call that could explain the 43–52s requests, unverifiable from avada-seo (PERMISSION_DENIED)
- `bigquery/README.md:12` — records that this `shops` mirror instance was installed via the Firebase Console, i.e. it is infra config, not application code — no src/ fix exists

## Evidence
- 1 matching entries: `(resource.labels.service_name="ext-firestore-bigquery-export-fsexportbigquery") AND timestamp>="2026-08-14T04:22:34.638Z" AND timestamp<="2026-08-14T04:52:34.638Z" AND textPayload:"no available instance"`
- 142 matching entries: `(resource.labels.service_name="ext-firestore-bigquery-export-fsexportbigquery") AND timestamp>="2026-08-14T04:20:00Z" AND timestamp<="2026-08-14T04:30:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Frequests"`
- 11 matching entries: `(resource.labels.service_name="ext-firestore-bigquery-export-fsexportbigquery") AND timestamp>="2026-08-14T04:20:00Z" AND timestamp<="2026-08-14T04:35:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Fvarlog%2Fsystem"`
- 1358 matching entries: `(resource.labels.service_name="ext-firestore-bigquery-export-fsexportbigquery") AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Frequests"`
- 2 matching entries: `(resource.labels.service_name="ext-firestore-bigquery-export-fsexportbigquery") AND timestamp>="2026-08-13T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 2
- cost: $2.68

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
