fingerprint: 1t97xtj
service: subscribebatcharticlesummary
message: 'Memory limit of 512 MiB exceeded with 518 MiB used. Consider increasing the memory limit, see <https://cloud.google.com/functions/docs/configuring/memory>'
app: BLOG
repo: blogs
date: 2026-10-14T15:45:24.118Z
status: infra
attempt: 2

# BLOG · subscribebatcharticlesummary · 1t97xtj

**Outcome.** infra class — reported, no MR

**Root cause.** subscribeBatchArticleSummary is configured at the minimum tier (memory: '512MiB', cpu: 0.5) but every gen2 container loads the whole src/index.js module graph, so its baseline RSS right after boot is already ~512 MiB; the first invocation pushed it 6 MiB over and Cloud Run killed the container. Infra class — no code defect in the handler.

**Mechanism.** Instance started 15:41:47 (AUTOSCALING, cold). The startup TCP probe only succeeded at 15:42:10 — 23s of boot, consistent with a heavy module graph: src/index.js re-exports functions/http.js, pubsub.js, scheduled.js and firestore.js, so a pubsub container loads every controller/service (openai, shopify-api-node, redis, graphql) even though it runs one subscriber. redis.service connected at 15:42:10.375. At 15:42:16.364, 6s later, the system log reports 'Memory limit of 512 MiB exceeded with 518 MiB used' against the memory: '512MiB' set at functions/pubsub.js:83, with cpu: 0.5 at pubsub.js:84 slowing both boot and GC. Zero application log lines from the handler exist in the whole hour — the first one (packages/functions/src/handlers/pubsub/subscribeHandleBatchArticleSummary.js:36, 'Processing | Cursor: …') never printed, so the process died before the Shopify articles query and before the 100-wide publishTopic fan-out at line 89. The unbounded Promise.all is therefore NOT implicated in this kill. Per P3 the absence of an application log near the OOM timestamp is expected: the container dies before any catch block runs, so the catch at line 115 never wrote its updateAISummaryLastRun — the shop's aiSummary doc is left with isRunning: true and the self-chaining batch silently stops.

Confidence: `medium` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/pubsub.js:83` — memory: '512MiB' — the exact limit named in the kill message (518 MiB used, 1.2% over)
- `packages/functions/src/functions/pubsub.js:84` — cpu: 0.5 — half a vCPU, which both lengthens the 23s cold boot and starves GC; the sibling summaryNewPublishedArticle subscriber runs the same 512MiB at cpu: 1 (pubsub.js:72-73)
- `packages/functions/src/index.js:6` — export * from './functions/http' — every container, including this pubsub subscriber, loads the full http controller/service graph, which is what makes 512 MiB a near-miss baseline
- `packages/functions/src/handlers/pubsub/subscribeHandleBatchArticleSummary.js:36` — first handler log line; its total absence in the window bounds the death to before the GraphQL call and before the fan-out
- `packages/functions/src/handlers/pubsub/subscribeHandleBatchArticleSummary.js:115` — catch that clears isRunning never ran — an OOM kill leaves the aiSummary process stuck isRunning: true with no error recorded

## Evidence
- 1 matching entries: `resource.labels.service_name="subscribebatcharticlesummary" AND timestamp>="2026-10-13T00:00:00Z" AND timestamp<="2026-10-14T16:00:00Z" AND textPayload:"Memory limit"`
- 5 matching entries: `resource.labels.service_name="subscribebatcharticlesummary" AND timestamp>="2026-10-14T15:00:00Z" AND timestamp<="2026-10-14T16:00:00Z"`
- 1 matching entries: `(resource.labels.service_name="subscribebatcharticlesummary" OR resource.labels.function_name="subscribebatcharticlesummary") AND timestamp>="2026-10-14T15:27:18.189Z" AND timestamp<="2026-10-14T15:57:18.189Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $0.76

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
