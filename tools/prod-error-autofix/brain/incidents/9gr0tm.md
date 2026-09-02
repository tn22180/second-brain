fingerprint: 9gr0tm
service: api
message: HTTP 504 GET /api/shops
app: BLOG
repo: blogs
date: 2026-09-01T19:41:57.071Z
status: infra
attempt: 1

# BLOG · api · 9gr0tm

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of the recorded 2026-09-01 BLOG api family (1sob2ko / 11ovwfj / 1904bct / hqnw25 / 5nlg6v / 1hwr0fe / xe6pyj / dp63np / z87lko / ds0z0c / 1posgwo / l1sgx5 / jgz6px / 1x259rc / lkawju): the same single api container — instance 00a41e8c1d37609ee7bc…6591570d, revision api-00163-mox — stopped completing any work at 2026-09-01T18:21:2xZ, and every request Cloud Run kept routing to it thereafter, including the alerted GET /api/shops, hung until the function's own timeoutSeconds: 540 cut it off with a 504.

**Mechanism.** The instance's last application output is 2026-09-01T18:21:06.260185Z ([fetchGhConfig] GH config fetch failed — failing open); it then emits nothing for the next 99 minutes while three sibling instances log normally (36 + 13 + 1 = 50 stderr lines in the alert window, 0 from this one). Its last successful response starts at 18:21:20.589686Z (200, 1.078s). Every request it accepts from 18:22:39.108561Z onward returns 504 at 540.000s ±0.0004 — 41 of them in the 18:00–20:00Z sample, request starts spanning 18:22:39 → 19:27:50, spread over an hour because concurrency: 10 only frees a slot when an older request hits the 540s cap. The 540.00s figure matches `timeoutSeconds: 540` at packages/functions/src/functions/http.js:30 to the millisecond, which identifies the Cloud Run request-timeout as the limit that fired — not a Shopify or Firestore deadline. The container never exits and never stops accepting TCP, so Cloud Run keeps it in rotation; nothing in the app enforces a per-request deadline that would fail fast instead (packages/functions/src/helpers/api.js:9 creates the shared axios client with no timeout, and packages/functions/src/services/redis.service.js:10 sets connectTimeout but no commandTimeout, so a stalled outbound socket parks the handler indefinitely).

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 — the configured limit the 41 x 540.000s 504 latencies match exactly (P4)
- `packages/functions/src/functions/http.js:32` — concurrency: 10 — why one wedged container absorbs a slow trickle of 41 requests over an hour instead of failing all at once
- `packages/functions/src/helpers/api.js:9` — axios.create() with no timeout: no client-side deadline, so a stalled outbound call rides to the 540s Cloud Run cap
- `packages/functions/src/services/redis.service.js:24` — connectTimeout: 5000 set but no commandTimeout — a half-open Memorystore socket blocks a command with no ceiling

## Evidence
- 300 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-01T18:00:00Z" AND timestamp<="2026-09-01T20:00:00Z" AND labels."instanceId"="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND httpRequest.status!=null`
- 11 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-01T19:15:07.386Z" AND timestamp<="2026-09-01T19:45:07.386Z" AND httpRequest.status>=500`
- 127 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-01T17:30:00Z" AND timestamp<="2026-09-01T20:00:00Z" AND labels."instanceId"="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND logName:"stderr"`
- 50 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-01T19:15:07.386Z" AND timestamp<="2026-09-01T19:45:07.386Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $2.01

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
