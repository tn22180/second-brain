fingerprint: 1nhj0su
service: api
message: HTTP 504 GET /api/competitors
app: BLOG
repo: blogs
date: 2026-09-01T19:46:15.458Z
status: infra
attempt: 1

# BLOG · api · 1nhj0su

**Outcome.** infra class — reported, no MR

**Root cause.** The alerted 504 on GET /api/competitors is collateral from one wedged api container: instance 00a41e8c1d37609ee7bc…6591570d (revision api-00163-mox) stopped producing any application log output after 2026-09-01T18:21:06.260185Z yet kept being routed traffic, and every request it received from then on hung until Cloud Run's configured 540s request timeout.

**Mechanism.** 60 of 60 504s in avada-blog-app/api between 17:00Z and 21:00Z came from that single instance, each with latency exactly 540.000xxx s — the `timeoutSeconds: 540` declared for `api` in packages/functions/src/functions/http.js:30. The instance's last stdout/stderr line is 18:21:06.260185Z; from 18:21:07Z to 20:00Z it emitted zero application log lines while still answering 60 requests with 504. Sibling instances …1d993b and …1dac0f logged normally throughout the alert window (50 stderr lines, 19:25–19:55Z), so this is one container, not the revision. The rolling pattern matches `concurrency: 10` (http.js:32): once all 10 slots hold requests parked on an outbound call that never returns, no new work can run — hence no further logs — and Cloud Run can only admit a replacement request each time a slot frees at 540s, giving ~10 new 504s per 9-minute round (60 over 70 minutes). Which dependency stopped answering is not in the logs; the container died silent, so the internal cause is unproven. The alerted endpoint is not implicated: competitorsController.list wraps its whole body in try/catch and answers 200 `{success:false}` on any thrown error (packages/functions/src/controllers/competitorsController.js:39), so it cannot produce a 504 through its own code path. The code-side amplifier is that nothing in the request path carries its own deadline — the shared axios client is created with no `timeout` (packages/functions/src/helpers/api.js:9) and shopify-api-node is constructed with no `timeout` (packages/functions/src/services/shopifyService.js:26) — so a hung socket holds a concurrency slot for the full 540s instead of failing fast and letting the instance drain.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 — the limit every one of the 60 failures matched to the millisecond
- `packages/functions/src/functions/http.js:32` — concurrency: 10 — explains the ~10-per-540s rolling cadence of the 504s once all slots were parked
- `packages/functions/src/controllers/competitorsController.js:39` — list() catches everything and returns 200 {success:false}, so the alerted 504 cannot originate in this handler
- `packages/functions/src/helpers/api.js:9` — shared axios client created with no timeout — an outbound call that never answers parks its concurrency slot for the whole 540s
- `packages/functions/src/services/shopifyService.js:26` — initShopify builds shopify-api-node with no timeout, same slot-parking exposure on the Shopify call path

## Evidence
- 66 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T21:00:00Z" AND httpRequest.status>=500`
- 60 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T21:00:00Z" AND httpRequest.status=504 AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d"`
- 21 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T18:00:00Z" AND timestamp<="2026-09-01T18:22:00Z" AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND (logName:"stdout" OR logName:"stderr")`
- 50 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T19:25:35.756Z" AND timestamp<="2026-09-01T19:55:35.756Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $2.08

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
