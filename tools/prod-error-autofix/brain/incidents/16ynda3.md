fingerprint: 16ynda3
service: api
message: HTTP 504 GET /api/article/566611542207
app: BLOG
repo: blogs
date: 2026-09-01T19:49:23.248Z
status: infra
attempt: 2

# BLOG · api · 16ynda3

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: one warm api container (instance 00a41e8c1d37609ee7bc…6591570d, revision api-00163-mox) stopped completing outbound dependency I/O at 2026-09-01T18:21:30Z and Cloud Run kept routing to it for 71 more minutes, so every request it accepted — including the alerted GET /api/article/566611542207?primary=en — hung until the function's own timeoutSeconds: 540 fired.

**Mechanism.** The instance served normally up to 2026-09-01T18:21:30.109Z (last 2xx, latency 0.397s) and emitted its last application log line at 18:21:06.260Z ([fetchGhConfig] warning). After that it produced zero application log lines through 21:00Z while still accepting connections: 60 requests on that one instanceId ended 504 with latency 540.000–540.010s, an exact match to `timeoutSeconds: 540` declared for `api` at packages/functions/src/functions/http.js:30 (P4). The process was not dead — 8 requests on the same instance during the wedge returned 401 in 0.003–0.005s from auth middleware, i.e. any path that answers without an outbound call still completed. Only paths that await Firestore/Redis/Shopify hung. The alerted 6 occurrences are one merchant opening the blog editor (referer https://avada-blog-app.web.app/embed/blogEditor?type=edit&id=566611542207): 6 panel-load GETs (/api/article/566611542207, /api/recentBlogs, /api/components, /api/element-settings, /api/options, /api/competitors) all landed on the wedged instance at 19:22:34 and all 504'd 540s later at 19:31:34. concurrency: 10 (http.js:32) means each wedged slot is held for the full 540s, so the container never sheds load and Cloud Run has no signal to evict it — gen2 firebase-functions declare no liveness probe. This is a duplicate of the already-recorded 2026-09-01 BLOG api family (1sob2ko / 11ovwfj / 1904bct / hqnw25 / 5nlg6v / 1hwr0fe / z87lko / dp63np / xe6pyj / ds0z0c / 1nhj0su / jgz6px / 1posgwo / l1sgx5 / 9gr0tm / 1x259rc): same instanceId, same revision, same wedge.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 for the api function — the exact value all 60 hung requests' latency matches (540.000–540.010s)
- `packages/functions/src/functions/http.js:32` — concurrency: 10 — each wedged request holds a slot for the full 540s, so one bad container fails up to 10 unrelated in-flight requests at a time
- `packages/functions/src/helpers/api.js:9` — the shared axios client is created with no `timeout`, so an outbound call that never returns is bounded only by the 540s Cloud Run limit — this is what turns the wedge into 540s hangs instead of fast 5xx

## Evidence
- 603 matching entries: `resource.labels.service_name="api" AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T23:59:00Z" AND logName:"requests"`
- 197 matching entries: `resource.labels.service_name="api" AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T21:00:00Z" AND logName:"stderr"`
- 10 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-01T19:25:41.724Z" AND timestamp<="2026-09-01T19:55:41.724Z" AND httpRequest.status>=500`
- 11 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-01T19:25:41.724Z" AND timestamp<="2026-09-01T19:55:41.724Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.93

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
