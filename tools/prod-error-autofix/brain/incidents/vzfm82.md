fingerprint: vzfm82
service: ext-credit-histories-bq-export-fsexportbigquery
message: Uncaught signal: 7, pid=1, tid=1, fault_addr=94087392956178.
app: SEO
repo: seo
date: 2026-09-01T17:21:48.264Z
status: infra
attempt: 1

# SEO · ext-credit-histories-bq-export-fsexportbigquery · vzfm82

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of recorded fingerprint 1v639fk (same service, same 30-minute window, same two cold-start instances): infra, not code — a platform-side container-start fault swept avada-seo/us-central1 during 2026-09-01T17:01–17:31Z and killed two cold-start containers of the third-party Firebase extension image firebase/firestore-bigquery-export@0.3.2 with SIGBUS at pid=1 before they bound :8080, so the one Eventarc/Pub-Sub push waiting on that cold start was answered 503 'instance failed the readiness check'.

**Mechanism.** The alerted text 'Uncaught signal: 7, pid=1, tid=1, fault_addr=94087392956178.' resolves to exactly one log entry in the whole project window: 2026-09-01T17:16:26.591874170Z on service ext-credit-histories-bq-export-fsexportbigquery, instance 00a41e8c1d2273684146e86e37051a26979d384a24dfc68f6…, revision -00002-yel. Signal 7 is SIGBUS raised by the container entrypoint (pid=1, tid=1) — the process faulted on a memory-mapped read before Node reached listen(), which is why the stderr read for the window holds only DEP0040 punycode deprecation warnings from the healthy starts at 17:04:18Z–17:07:40Z and no application error line at all. Cloud Run's verdict for the same instance follows 1.03s later: 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.' at 17:16:27.625373Z. The single 503 in the requests read — POST /?__GCP_CloudEventsMode=CE_PUBSUB_BINDING, userAgent 'APIs-Google', remoteIp 74.125.212.196, latency 99.109255s at 17:14:43.731330Z — carries that same instanceId, so the Eventarc delivery was routed to the container that never came up. A second instance (00a41e8c1dc4856f52bd0794d98a91f1…) repeated the identical SIGBUS/probe pair at 17:16:51.784560359Z / 17:16:52.339115Z with fault_addr=94537921855447. This service is not this repo's code: it is the prebuilt extension image declared at firebase.json:176 (instance id credit-histories-bq-export), configured only by extensions/credit-histories-bq-export.env; nothing under packages/functions/src is loaded in that container, so no repo-side defect can produce a pid=1 SIGBUS there. The fault is not service-specific either — in the same 30-minute window the same STARTUP-probe line fired 53 times across 16 unrelated avada-seo Cloud Run services on different revisions and images, already recorded as infra under fingerprints 1v639fk, 1esj5e, 1mccpq, 15bqjgv, 1qj4dz7, 1sc23g3. P3 OOM is ruled out: zero 'Memory limit' lines on this service in the window, and a SIGBUS at pid 1 with a startup-probe verdict is a start fault, not a kill after admission. Blast radius is one Firestore→BigQuery change event; Eventarc retries it, and the service was serving 200s again from 17:18:07Z onward, so the creditHistories export self-healed with no data loss.

Confidence: `high` · infra class, not auto-fixed

## Code
- `firebase.json:176` — the alerted service is the prebuilt image of firebase/firestore-bigquery-export@0.3.2 installed as extension instance credit-histories-bq-export — third-party code, no packages/functions/src module runs in that container, so there is no repo fix
- `extensions/credit-histories-bq-export.env:5` — COLLECTION_PATH=shops/{shopId}/creditHistories — the only thing this repo controls for that service is env config, and the failure happened at container start before any config was read

## Evidence
- 2 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T17:01:29Z" AND timestamp<="2026-09-01T17:31:29Z" AND textPayload:"Uncaught signal"`
- 5 matching entries: `(resource.labels.service_name="ext-credit-histories-bq-export-fsexportbigquery") AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T17:35:00Z" AND severity>=ERROR`
- 53 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T17:01:29Z" AND timestamp<="2026-09-01T17:31:29Z" AND textPayload:"STARTUP TCP probe failed"`
- 49 matching entries: `(resource.labels.service_name="ext-credit-histories-bq-export-fsexportbigquery") AND timestamp>="2026-09-01T17:17:00Z" AND timestamp<="2026-09-01T17:35:00Z" AND httpRequest.status=200`

## Job
- analyze rounds: 1
- cost: $1.36

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
