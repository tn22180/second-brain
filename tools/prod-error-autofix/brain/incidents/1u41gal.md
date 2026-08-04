fingerprint: 1u41gal
service: apigen2
message: HTTP 500 POST /api/historyAudit
app: SEO
repo: seo
date: 2026-08-04T11:30:39.392Z
status: infra
attempt: 1

# SEO · apigen2 · 1u41gal

**Outcome.** infra class — reported, no MR

**Root cause.** The POST /api/historyAudit 500 is collateral from an OOM kill: apigen2 instance 001548f72906707e3195 exceeded its declared 2GiB limit (2060 MiB used) at 2026-08-04T10:33:21.448Z, and the three requests it had in flight under concurrency:3 — historyAudit plus two others — all failed in the 8s before the kill. Duplicate of already-recorded fingerprints 1mxf1fg and 19yp12q (same date, same service, same instance id).

**Mechanism.** apiGen2 is declared memory: '2GiB', concurrency: 3, minInstances: 3 (packages/functions/src/handlers/exports/httpFunctions.js:42,45). Cloud Run packs up to 3 concurrent requests per container. Instance 001548f72906707e3195 crossed 2048 MiB and was killed at 10:33:21.448786Z ('Memory limit of 2048 MiB exceeded with 2060 MiB used'). Exactly three requests were in flight on that instanceId and all three failed immediately before the kill: 503 GET /api/scanFeatureWorking/pageSpeed at 10:33:13.516 (8.11s latency), 503 GET /api/optimize/preview at 10:33:18.922 (2.70s), 500 POST /api/historyAudit at 10:33:20.827 (0.70s) — 3 of 3, matching concurrency:3 exactly. That instance emitted zero stderr lines in the whole 30-minute window (stderr instance distribution: 001548f72916579ca172=94, 001548f729335d5e7d04=75, 001548f729ab222446f1=29, 001548f72931724683e6=2, 001548f72906707e3195=0), which is the expected signature of an OOM kill (P3): the container dies before any catch block or logger runs. The historyAudit request itself is not the allocator — it ran only 0.70s; the memory was already at the ceiling when it landed. The two 503s carry Cloud Run's 'HTTP response was malformed or connection to the instance had an error' payload; historyAudit got the 500 because its response was already partially committed when the container went away.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:42` — apiGen2 declared memory: '2GiB' — matches the kill message 'Memory limit of 2048 MiB exceeded with 2060 MiB used' exactly
- `packages/functions/src/handlers/exports/httpFunctions.js:45` — concurrency: 3 — explains why exactly 3 unrelated requests died on the one killed instance
- `packages/functions/src/routes/api.js:518` — POST /api/historyAudit -> historyAuditController.createHistory; the handler named in the alert, a Firestore write with no large allocation, ran 0.70s and is a victim not the cause

## Evidence
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-04T10:18:22.632Z" AND timestamp<="2026-08-04T10:48:22.632Z" AND severity>=ERROR AND textPayload:"Memory limit of 2048 MiB exceeded"`
- 3 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-04T10:18:22.632Z" AND timestamp<="2026-08-04T10:48:22.632Z" AND httpRequest.status>=500 AND labels.instanceId="001548f72906707e3195bf8eba3c03ad13e966c8dedea2e029a08bff0c42127ca4906cb1b63a98066e13bf088cc0f09f50fe11a42b48dbdc17f865fcdfce7cd5e142fd3b9d6d0f6727bb683ab6a11d"`
- 200 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-04T10:18:22.632Z" AND timestamp<="2026-08-04T10:48:22.632Z" AND logName:"stderr"`
- 4 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-04T10:18:22.632Z" AND timestamp<="2026-08-04T10:48:22.632Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.17

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
