fingerprint: jgz6px
service: api
message: HTTP 504 GET /api/articles/report/all
app: BLOG
repo: blogs
date: 2026-09-01T19:29:27.231Z
status: infra
attempt: 1

# BLOG · api · jgz6px

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of the recorded 2026-09-01 BLOG api family (1sob2ko / 11ovwfj / 1904bct / hqnw25 / 5nlg6v / 1hwr0fe / z87lko / 1posgwo / l1sgx5 / dp63np): one api container — instance 00a41e8c1d37609ee7…6591570d, revision api-00163-mox — stopped completing any request that performs outbound I/O after its last 2xx at 2026-09-01T18:21:30.110Z, so every request routed to it, including the alerted GET /api/articles/report/all?period=3, ran to the function's own timeoutSeconds: 540 and was cut by Cloud Run as a 504.

**Mechanism.** All 20 of the 20 5xx entries in the window are 504s, all on the single instance 00a41e8c1d37609ee7…6591570d / revision api-00163-mox, with latency 539.999764–540.001294s — i.e. the configured `timeoutSeconds: 540` at packages/functions/src/functions/http.js:30, to the millisecond (pattern P4). The container was not dead and its event loop was not blocked: the same instance kept answering unauthenticated requests 401 in 2.9–4.7 ms throughout (18:48:27Z, 18:49:22–18:49:24Z, 19:20:55Z), because that path returns from the auth middleware before any Firestore/Redis/Shopify call. What it never did again was finish an I/O-bearing request — zero httpRequest.status<400 entries on that instance between 18:21:30.110Z and 20:00Z. Request start times, derived from timestamp minus latency, span 18:23:02.32Z to 18:40:41.87Z, so the instance went on accepting new work for ~18 minutes after it went dark and completed none of it. It also emitted no application log line at all in the 30-minute window: every stderr entry belongs to sibling instances …1d1a04, …1d4a5d, …1de30c, …1d8cc4, which were serving normally the whole time (redis.service connected 34.60.93.33 at 18:50:40Z, seoProxyApi 401 warnings throughout). One instance dark while four siblings are healthy on the same revision is not a code path — the alerted endpoint is only one of 9 distinct paths that hung identically (/api/options, /api/settings, /api/shopify/products, /api/shopify/pdf-files, /api/shopify/block, /api/blockLoader, /api/knowledge-base/existing, /api/track-event, /api/articles). The route itself resolves at packages/functions/src/routes/api.js:86.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 — the exact limit every one of the 20 alerted requests hit (539.999764–540.001294s), identifying which deadline fired
- `packages/functions/src/functions/http.js:32` — concurrency: 10 on api — one wedged instance takes down up to 10 concurrent unrelated requests, which is why 9 endpoints beyond the alerted one appear as 504s
- `packages/functions/src/routes/api.js:86` — router.get('/articles/report/:type', articleController.report) — the alerted path; cited to show it is an ordinary handler with nothing endpoint-specific, one of 9 that hung identically

## Evidence
- 20 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-01T18:26:05.294Z" AND timestamp<="2026-09-01T18:56:05.294Z" AND httpRequest.status>=500`
- 6 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND httpRequest.status<400 AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T20:00:00Z"`
- 8 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND httpRequest.status<500 AND timestamp>="2026-09-01T17:50:00Z" AND timestamp<="2026-09-01T19:30:00Z"`
- 42 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-01T18:26:05.294Z" AND timestamp<="2026-09-01T18:56:05.294Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.56

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
