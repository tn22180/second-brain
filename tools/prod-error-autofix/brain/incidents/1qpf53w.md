fingerprint: 1qpf53w
service: api
message: HTTP 504 GET /api/tags
app: BLOG
repo: blogs
date: 2026-09-01T19:56:07.789Z
status: infra
attempt: 1

# BLOG · api · 1qpf53w

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of the recorded 2026-09-01 BLOG api family (1sob2ko / 11ovwfj / 1904bct / hqnw25 / 5nlg6v / 1hwr0fe / 1nhj0su / a2sfer / 51ju23 / xe6pyj / dp63np / z87lko / ds0z0c / 16ynda3): one api container — instance 00a41e8c1d37609ee7bc…6591570d, revision api-00163-mox — stopped completing work at 2026-09-01T18:21:30Z and thereafter absorbed every request routed to it until Cloud Run's own timeoutSeconds:540 cut it, so the alerted GET /api/tags 504 is collateral, not a defect in the tags path.

**Mechanism.** Last request that instance finished was 200 GET /api/blogPageContent at 18:21:20.589Z (1.078s) and the last two 202 /api/track-event at 18:21:30.10-30.11Z; its last application stderr line is [fetchGhConfig] at 18:21:06.260Z. After that timestamp it emits zero application log lines while still accepting traffic — every subsequent request hangs with no handler-side log, no catch block, no error. Cloud Run terminates each at the function's own declared ceiling: 70 requests on that instance carried httpRequest.status=504 with latency 540.000xxxs, matching `timeoutSeconds: 540` on the `api` onRequest declaration (packages/functions/src/functions/http.js:30) to the millisecond — P4. All 20 500-class entries in the alert window are on that one instanceId, spread over 13 unrelated endpoints (/api/tags, /api/options ×3, /api/components ×2, /api/element-settings ×2, /api/competitors ×2, /api/recentBlogs ×2, /api/article/:id ×2, /api/track-event ×2, /api/articles, /api/settings, /api/blockLoader, /api/shop), which is one cause with many symptoms, not 13 bugs. `concurrency: 10` (http.js:32) is why they arrive in tight clusters of up to 10 sharing one 540s expiry (19:31:34.4-34.6Z ×6, 19:44:02.8-02.9Z ×7). Meanwhile the two other warm instances in the same window — 00a41e8c1dac0f… and 00a41e8c1d993b… — logged 66 stderr lines normally and served without a single 5xx, so the app build is fine and the fault is confined to one container. Last 504 on the wedged instance is 19:44:02.925Z; it was then retired, wedge duration ~83 minutes.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 on the api function — the exact limit every one of the 70 504s hit (540.000xxxs), identifying which deadline fired
- `packages/functions/src/functions/http.js:32` — concurrency: 10 — why one wedged container fails up to 10 unrelated in-flight requests at a time, producing the 6- and 7-request clusters sharing one expiry timestamp

## Evidence
- 70 matching entries: `resource.labels.service_name="api" AND labels."instanceId"="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND httpRequest.status=504 AND timestamp>="2026-09-01T18:21:00Z" AND timestamp<="2026-09-02T02:00:00Z"`
- 3 matching entries: `resource.labels.service_name="api" AND labels."instanceId"="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND httpRequest.status<400 AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T23:00:00Z"`
- 5 matching entries: `resource.labels.service_name="api" AND labels."instanceId"="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND logName:"stderr" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T23:00:00Z"`
- 20 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-01T19:26:36.800Z" AND timestamp<="2026-09-01T19:56:36.800Z" AND httpRequest.status>=500`
- 66 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-01T19:26:36.800Z" AND timestamp<="2026-09-01T19:56:36.800Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.72

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
