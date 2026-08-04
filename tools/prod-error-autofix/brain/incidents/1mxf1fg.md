fingerprint: 1mxf1fg
service: apigen2
message: The request failed because either the HTTP response was malformed or connection to the instance had an error. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#malformed-response-or-connection-error>
app: SEO
repo: seo
date: 2026-08-04T11:28:33.820Z
status: infra
attempt: 1

# SEO · apigen2 · 1mxf1fg

**Outcome.** infra class — reported, no MR

**Root cause.** One apigen2 container (instance 001548f72906707e3195) exceeded its declared 2GiB limit — 'Memory limit of 2048 MiB exceeded with 2060 MiB used' at 2026-08-04T10:33:21.448786Z — and Cloud Run terminated it, killing the 3 requests it had in flight; this is the same kill already recorded as fingerprint 19yp12q, not a new cause.

**Mechanism.** apigen2 is declared memory: '2GiB' with concurrency: 3 (packages/functions/src/handlers/exports/httpFunctions.js:42,45). The instance started ~10:21:20Z and served ~180 ordinary embedded-admin requests in ~12 minutes (54 /api/track-event, 15 /api/settings, 10 /api/shops, 6 /api/analysis/collection, 5 /api/analysis/product, 5 /api/historyAudit ...) with no single outsized request. RSS crossed 2048 MiB at 10:33:21.448Z and the container was killed. Because the kill happens in the kernel, no application catch block runs — which is why the three victim requests carry only the Cloud Run malformed-response text and no stack: 503 GET /api/scanFeatureWorking/pageSpeed at 10:33:13.516 (8.11s), 503 GET /api/optimize/preview at 10:33:18.922 (2.70s), 500 POST /api/historyAudit at 10:33:20.828 (0.70s) — all three carrying instanceId 001548f72906707e3195, all within the 8s before the kill. The 4th 500 in the window (POST /api/aiChat/faqs, 10:25:53) is on a different instance (001548f729335d5e...) and is unrelated to this kill. Last application log from the dying instance is [redisCache:get] settings:O4ZwXwnZ5wRCMVcE3rsI Command timed out at 10:31:22.416 — the known 200ms client-side budget, not a Redis fault.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:42` — apiGen2 declared memory: '2GiB' — the limit named in the kill message (2048 MiB)
- `packages/functions/src/handlers/exports/httpFunctions.js:45` — concurrency: 3 — why one kill takes out up to 3 unrelated in-flight requests, matching the 3 alert occurrences
- `packages/functions/src/handlers/exports/httpFunctions.js:46` — minInstances: 3 in production — the tier/cost multiplier on any memory bump

## Evidence
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-03T11:00:00Z" AND timestamp<="2026-08-04T11:00:00Z" AND textPayload:"Memory limit of"`
- 180 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-04T10:20:00Z" AND timestamp<="2026-08-04T10:34:00Z" AND labels.instanceId:"001548f72906707e3195" AND logName:"requests"`
- 4 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-04T10:18:22.629Z" AND timestamp<="2026-08-04T10:48:22.629Z" AND httpRequest.status>=500`
- 90 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-04T10:28:00Z" AND timestamp<="2026-08-04T10:34:00Z" AND labels.instanceId:"001548f72906707e3195"`

## Job
- analyze rounds: 1
- cost: $1.18

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
