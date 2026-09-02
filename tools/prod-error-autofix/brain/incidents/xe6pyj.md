fingerprint: xe6pyj
service: api
message: HTTP 504 GET /api/knowledge-base/existing
app: BLOG
repo: blogs
date: 2026-09-01T19:31:54.894Z
status: infra
attempt: 1

# BLOG · api · xe6pyj

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: one api container (instance 00a41e8c1d37609ee7bc…6591570d, revision api-00163-mox) lost its outbound dependency I/O at 2026-09-01T18:21:30Z and never recovered — every request that reaches a Firestore/Redis/Shopify call on that instance hangs until Cloud Run cuts it at the configured 540s timeout, which is the alerted GET /api/knowledge-base/existing 504. Duplicate of the recorded 2026-09-01 BLOG api family (1sob2ko / 11ovwfj / 1904bct / hqnw25 / 5nlg6v / 1hwr0fe / jgz6px / 1posgwo / l1sgx5 / z87lko / dp63np).

**Mechanism.** All 12 request-log 5xx entries in the alert window carry instanceId 00a41e8c1d37609ee7bc…6591570d and revision api-00163-mox — a single instance, while three other api instances (…1a04a71a1c, …4a5d6a1315, …e30c81e270) served normally and emitted 35 stderr lines in the same window with zero errors. That instance's last successful response was 202 at 18:21:30.109700Z (0.397s); from 18:22:39Z onward every request it accepted terminated at exactly 540.000s latency, matching `timeoutSeconds: 540` declared for `api` at packages/functions/src/functions/http.js:30 to the millisecond (P4). The alerted GET /api/knowledge-base/existing ended 18:38:04.991721Z at 539.999916257s, i.e. it started ~18:29:05Z, 7.5 min after the wedge. The process is not dead and the event loop is not blocked: the same instance still answered 401 in 0.003–0.005s at 18:48:27Z, 18:49:22–24Z and 19:20:55Z — the auth-reject path returns no-I/O, so only requests that issue outbound I/O hang. No application log line exists from that instance after 18:21:30Z, so nothing in-process observed the failure. The endpoint is irrelevant to the cause: 13 distinct paths (/api/options, /api/articles, /api/shopify/products, /api/track-event, /api/gen-ai-suggested/recommendBlogPost, /api/knowledge-base/existing …) all 504 on this one instance, so knowledgeBaseController.getExisting (routes/api.js:169) is a symptom, not the fault. Amplifier: with `timeoutSeconds: 540` and `concurrency: 10` (http.js:32) each wedged request pins a slot for 9 minutes, Cloud Run never fails the instance out, and it kept receiving traffic for at least 60 more minutes (last observed 504 at 19:21:05.278220Z).

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 for `api` — the limit every failed request matched to the millisecond (540.000s), identifying Cloud Run's own request deadline as what fired, not an upstream cap
- `packages/functions/src/functions/http.js:32` — concurrency: 10 — each hung request holds a slot for the full 9 minutes, so one wedged instance keeps absorbing and killing traffic instead of being drained
- `packages/functions/src/routes/api.js:169` — the alerted route registration; getExisting is one of 13 unrelated paths that 504ed on this instance, confirming the cause is not in this handler
- `packages/functions/src/controllers/knowledgeBaseController.js:20` — handler for the alerted endpoint — its catch at line 37 never ran, no [getExisting] line exists in the window, consistent with the request hanging in outbound I/O rather than throwing

## Evidence
- 12 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T18:32:06.444Z" AND timestamp<="2026-09-01T19:02:06.444Z" AND httpRequest.status>=500`
- 31 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T18:10:00Z" AND timestamp<="2026-09-01T20:00:00Z" AND httpRequest.status>=500 AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d"`
- 6 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T18:10:00Z" AND timestamp<="2026-09-01T18:22:00Z" AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d"`
- 35 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T18:32:06.444Z" AND timestamp<="2026-09-01T19:02:06.444Z" AND logName:"stderr"`
- 6 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T18:45:00Z" AND timestamp<="2026-09-01T19:25:00Z" AND httpRequest.status=401 AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d"`

## Job
- analyze rounds: 1
- cost: $1.62

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
