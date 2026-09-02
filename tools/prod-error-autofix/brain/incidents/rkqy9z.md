fingerprint: rkqy9z
service: api
message: HTTP 504 GET /api/review
app: BLOG
repo: blogs
date: 2026-09-01T20:07:17.472Z
status: infra
attempt: 1

# BLOG · api · rkqy9z

**Outcome.** infra class — reported, no MR

**Root cause.** Not a code defect: one warm api container (instance 00a41e8c1d37609ee7bc…6591570d, revision api-00163-mox) lost its outbound I/O at 2026-09-01T18:21:35Z and Cloud Run kept routing to it, so every request landing there — including the alerted GET /api/review — hung until the function's own timeoutSeconds: 540 and was cut to 504.

**Mechanism.** Last successful response on that instance is 2026-09-01T18:21:30.109Z (202 /api/track-event). From 18:21:35Z onward it returned 80 consecutive 504s, every one at 540.000–540.015s, matching `timeoutSeconds: 540` declared for the api function at packages/functions/src/functions/http.js:30. The process was not dead and the event loop was not blocked: requests rejected by auth middleware before any I/O still answered 401 in 0.003–0.005s at 18:48:27Z, 18:49:22Z and 19:20:55Z. Only paths that issue an outbound call (Firestore/Redis/Shopify) hung. The alerted GET /api/review (routes/api.js:247 → reviewCrispController.checkAndSendMessage) is one of 9 requests in the alert window that all died on that one instance at 19:53:52–19:56:20Z; the other 8 (/api/articles, /api/competitors, /api/shopify/products, /api/gen-ai-suggested/recommendBlogPost, /api/knowledge-base/existing, /api/shopify/pdf-files, /api/shopify/block, /api/components) are the same cause, not eight bugs. Meanwhile two other api instances (…ac0fb8250d, …993b382794) served 136 sub-400 responses in the same 30-minute window, so this is one container, not a service-wide or code-wide fault. No application log line exists from the wedged instance in the window — the 9 entries in the errors read are the Cloud Run request logs themselves, with empty payloads.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 for the api function — the exact latency (540.000–540.015s) every one of the 80 stalled requests was cut at, which identifies which limit fired
- `packages/functions/src/routes/api.js:247` — the alerted endpoint GET /api/review → reviewCrispController.checkAndSendMessage; it is collateral on the wedged instance, not the source of the failure

## Evidence
- 9 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T19:49:34.663Z" AND timestamp<="2026-09-01T20:19:34.663Z" AND httpRequest.status>=500`
- 80 matching entries: `resource.labels.service_name="api" AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND timestamp>="2026-09-01T18:21:35Z" AND timestamp<="2026-09-02T02:00:00Z" AND httpRequest.status=504`
- 5 matching entries: `resource.labels.service_name="api" AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND timestamp>="2026-09-01T17:30:00Z" AND timestamp<="2026-09-01T22:00:00Z" AND httpRequest.status<400`
- 136 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T19:49:34Z" AND timestamp<="2026-09-01T20:19:34Z" AND httpRequest.status<400`
- 21 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-01T19:49:34.663Z" AND timestamp<="2026-09-01T20:19:34.663Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.74

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
