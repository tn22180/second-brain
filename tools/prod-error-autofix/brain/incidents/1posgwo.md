fingerprint: 1posgwo
service: api
message: HTTP 504 GET /api/settings
app: BLOG
repo: blogs
date: 2026-09-01T19:22:54.927Z
status: infra
attempt: 1

# BLOG · api · 1posgwo

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of the recorded 2026-09-01 BLOG api family (1sob2ko / 11ovwfj / 1904bct / hqnw25 / 5nlg6v / 1hwr0fe / l1sgx5 / z87lko): a single api container — instance 00a41e8c1d37609ee7bc…, revision api-00163-mox — wedged its event loop at ~18:21:35Z and kept accepting requests for another 17.6 minutes, so every request Cloud Run routed to it hung until the function's own timeoutSeconds: 540 fired and returned 504; the alerted GET /api/settings is one of those 20, not a defect in the settings handler.

**Mechanism.** All 20 5xx in the window are 504s carrying latency 539.999764s–540.001295s — a 1.53 ms spread around the timeoutSeconds: 540 declared for `api` at packages/functions/src/functions/http.js:30 (P4: the latency identifies which limit fired). All 20 carry the same resource.labels.revision_name=api-00163-mox and the same labels.instanceId 00a41e8c1d37609ee7bc…, across 12 distinct endpoints (/api/settings, /api/articles, /api/articles/report/{posts,all}, /api/options, /api/track-event, PUT /api/article/29002956911, /api/shopify/{products,pdf-files,block}, /api/blockLoader, /api/knowledge-base/existing) and 3 distinct browser user agents (Windows/Mac/Android) — one instance, not one route. In the same 30-minute window the api service wrote 42 stderr lines, and zero of them came from the wedged instance: 33 from …1a04a71a1c, 7 from …4a5d6a1315, 1 from …e30c81e270, 1 from …8cc4fb5933. A wedged event loop emits nothing, so the absence is the signature. Subtracting each 540s latency, the first hung request entered at 18:23:02.3Z and the last at 18:40:41.9Z — Cloud Run kept the instance in rotation and, at concurrency: 10 (http.js:32), it held 10 request slots hostage at a time. Not OOM: an OOM kill terminates the container so in-flight requests fail immediately (503, sub-second), not at a clean 540.000s, and the instance would not have gone on accepting traffic for 17.6 more minutes.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 for the `api` function — the limit all 20 latencies match to within 1.53 ms, identifying the 504 as this function's own deadline rather than an edge cap
- `packages/functions/src/functions/http.js:32` — concurrency: 10 — the wedged instance held 10 request slots at a time, which is why one bad container produced 20 unrelated 504s across 12 endpoints
- `packages/functions/src/functions/http.js:31` — maxInstances: 100 with no minInstances — nothing evicts a wedged-but-listening container, so it stayed in the routing pool for 17.6 minutes

## Evidence
- 20 matching entries: `resource.labels.service_name="api" AND resource.labels.revision_name="api-00163-mox" AND httpRequest.status=504 AND timestamp>="2026-09-01T18:26:05Z" AND timestamp<="2026-09-01T18:56:05Z"`
- 42 matching entries: `resource.labels.service_name="api" AND logName:"stderr" AND timestamp>="2026-09-01T18:26:05Z" AND timestamp<="2026-09-01T18:56:05Z"`
- 2 matching entries: `resource.labels.service_name="api" AND jsonPayload.tag="[redis.service]" AND timestamp>="2026-09-01T18:26:05Z" AND timestamp<="2026-09-01T18:56:05Z"`

## Job
- analyze rounds: 1
- cost: $1.55

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
