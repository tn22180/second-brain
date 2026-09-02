fingerprint: l1sgx5
service: api
message: HTTP 504 GET /api/shopify/block
app: BLOG
repo: blogs
date: 2026-09-01T19:20:44.641Z
status: infra
attempt: 1

# BLOG · api · l1sgx5

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of the recorded 2026-09-01 BLOG api family (1sob2ko / 11ovwfj / 1904bct / hqnw25 / 5nlg6v / 1hwr0fe / z87lko): one api container — instance 00a41e8c1d37609ee7…6591570d on revision api-00163-mox — lost outbound I/O at 18:21:30.109Z while its Node process stayed alive, so every request needing an external dependency hung until Cloud Run's own 540s cap; the alerted GET /api/shopify/block is one of 40 such 504s. Refines the earlier 'wedged event loop' reading: the event loop was NOT wedged.

**Mechanism.** Last request this instance ever completed was 202 POST /api/track-event at 2026-09-01T18:21:30.109700Z (0.397s). From then on 40 requests on this instance returned 504 with latency 540.000028–540.001294s — the api function's own `timeoutSeconds: 540` (packages/functions/src/functions/http.js:30), so Cloud Run's frontend, not the app, ended them. They arrive in strict batches of 10 (starts 18:13:39, 18:23:02, 18:38:22, 18:53:41), each new batch entering only as the previous batch's 540s timeouts free slots — that is `concurrency: 10` (packages/functions/src/functions/http.js:32) gating, and it kept the dead container in the serving pool ~100 minutes bleeding 504s. The process was alive throughout: the same instance answered 6 requests with 401 in 0.0029–0.0047s at 18:48:22–18:49:24, on the same GET /api/articles path that was 504ing, via the pure-JWT `verifyEmbedRequest` reject at packages/functions/src/handlers/api.js:90 — a path that touches no external dependency. So the HTTP server, event loop and CPU were fine and only awaited outbound calls (Firestore / Memorystore / Shopify) never settled. No application log line came from this instance after 18:21:06: no catch block ran, nothing threw — consistent with promises that never settle, not with an app error. Meanwhile 4 other api instances wrote 42 stderr lines in the same 30-minute window, so the fault is scoped to this one container, not to the code or the revision.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 — exactly the 540.000s latency on all 40 504s, identifying Cloud Run's request cap as what ended them
- `packages/functions/src/functions/http.js:32` — concurrency: 10 — explains the batches of exactly 10 hung requests and why the dead instance kept absorbing traffic for ~100 min
- `packages/functions/src/handlers/api.js:90` — verifyEmbedRequest reject path does JWT verification only, no outbound I/O — the 3ms 401s that prove the process and event loop were alive while I/O requests hung

## Evidence
- 40 matching entries: `resource.labels.service_name="api" AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND logName:"requests" AND httpRequest.status=504`
- 6 matching entries: `resource.labels.service_name="api" AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND logName:"requests" AND httpRequest.status=401 AND timestamp>="2026-09-01T18:22:00Z" AND timestamp<="2026-09-01T19:10:00Z"`
- 42 matching entries: `resource.labels.service_name="api" AND logName:"stderr" AND timestamp>="2026-09-01T18:26:05Z" AND timestamp<="2026-09-01T18:56:05Z"`

## Job
- analyze rounds: 2
- cost: $4.21

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
