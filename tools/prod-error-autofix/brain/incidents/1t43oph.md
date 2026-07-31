fingerprint: 1t43oph
service: aggregateAiReferralsScheduler
message: Memory limit of 256 MiB exceeded with 256 MiB used. Consider increasing the memory limit, see <https://cloud.google.com/functions/docs/configuring/memory>
app: AEO
repo: llm-ai-search-seo
date: 2026-07-31T06:23:27.501Z
status: infra
attempt: 1

# AEO · aggregateAiReferralsScheduler · 1t43oph

**Outcome.** infra class — reported, no MR

**Root cause.** publishTopic constructs a brand-new @google-cloud/pubsub PubSub client (with its own gRPC channel and auth client) on every call, and fanoutAiReferralAggregation fires 2 calls per shop concurrently through Promise.allSettled, so one scheduled run builds ~20 simultaneous gRPC clients inside a 256 MiB gen1 function and the container is killed.

**Mechanism.** aggregateAiReferralsScheduler runs every 15 min at memory 256MB (packages/functions/src/index.js:76; gcloud functions describe → availableMemoryMb=256). fanoutAiReferralAggregation lists the aiReferrals collection, logs the shop count, then flatMaps shopIDs × 2 dates into publishTopic calls all awaited together (packages/functions/src/handlers/scheduled/fanoutAiReferralAggregation.js:36-40). publishTopic does `const pubSub = new PubSub()` per invocation (packages/functions/src/helpers/pubsub/publishTopic.js:4), so each of the ~18-20 in-flight publishes allocates its own gRPC subchannel + GoogleAuth client on top of the already-loaded @google-cloud/firestore gRPC stack. Both kills in the last 24h show the same ordering inside one execution_id: 'Function execution started' → '[fanoutAiReferralAggregation] … -> N shops' → 'Memory limit of 256 MiB exceeded' — i.e. the OOM lands after the Firestore listDocuments and during the publish fan-out, never before it. Per-publish cost is visible in latency too: median run 21.7s for ~18-20 messages (~1.1s each), consistent with a fresh client doing an auth handshake per message rather than reusing one channel.

Confidence: `medium`

## Code
- `packages/functions/src/helpers/pubsub/publishTopic.js:4` — new PubSub() per call — one gRPC channel + auth client allocated per message, never reused
- `packages/functions/src/handlers/scheduled/fanoutAiReferralAggregation.js:36` — Promise.allSettled over shopIDs.flatMap(dates) — all shops × 2 dates published concurrently, no batching or concurrency cap
- `packages/functions/src/handlers/scheduled/fanoutAiReferralAggregation.js:34` — the shop-count log line that appears in both OOM executions, proving listDocuments completed and the kill happened in the publish phase
- `packages/functions/src/index.js:76` — aggregateAiReferralsScheduler configured at memory '256MB' — the limit named in the error, and the smallest gen1 tier

## Evidence
- 2 matching entries: `(resource.labels.function_name="aggregateAiReferralsScheduler") AND timestamp>="2026-07-30T06:15:00Z" AND timestamp<="2026-07-31T06:15:00Z" AND textPayload:"Memory limit"`
- 4 matching entries: `(resource.labels.function_name="aggregateAiReferralsScheduler") AND timestamp>="2026-07-31T05:55:00Z" AND timestamp<="2026-07-31T06:05:00Z"`
- 96 matching entries: `(resource.labels.function_name="aggregateAiReferralsScheduler") AND timestamp>="2026-07-30T06:15:00Z" AND timestamp<="2026-07-31T06:15:00Z" AND textPayload:"Function execution took"`
- 94 matching entries: `(resource.labels.function_name="aggregateAiReferralsScheduler") AND timestamp>="2026-07-30T06:15:00Z" AND timestamp<="2026-07-31T06:15:00Z" AND textPayload:"fanoutAiReferralAggregation"`

## Job
- analyze rounds: 1
- cost: $0.75

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
