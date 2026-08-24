fingerprint: 1vm3ak8
service: aggregateAiReferralsSubscriber
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/functions/docs/troubleshooting#scalability>
app: AEO
repo: llm-ai-search-seo
date: 2026-08-22T07:43:42.113Z
status: infra
attempt: 1

# AEO · aggregateAiReferralsSubscriber · 1vm3ak8

**Outcome.** infra class — reported, no MR

**Root cause.** Not a code defect: the single alerted 500 is a Cloud Functions gen1 platform admission rejection — Pub/Sub push to aggregateAiReferralsSubscriber was refused at 0s latency with no container ever started, while the function's own maxInstances cap (3000) was nowhere near reached (only 20 distinct instances served the whole 15:00–15:03Z fanout burst).

**Mechanism.** aggregateAiReferralsScheduler fires */15 (packages/functions/src/index.js:83) and fans out 51 shops x 2 dates = 102 Pub/Sub messages in one Promise.allSettled (packages/functions/src/handlers/scheduled/fanoutAiReferralAggregation.js:36-40). The 15:00:25Z run published across ~80s (finished 'ok' 15:01:45.637Z). At 15:01:15.243849Z one of those pushes was answered by the GCF frontend with textPayload 'The request was aborted because there was no available instance', labels.infrastructure='error', httpRequest.latency='0s', from the Pub/Sub push URL /_ah/push-handlers/pubsub/projects/seo-on-aeo/topics/aggregateAiReferrals. No application log exists for it (stderr read = 0 entries) because no container was ever admitted — the app code in subscribeAggregateAiReferrals never ran. `gcloud functions describe aggregateAiReferralsSubscriber` reports maxInstances=3000, and only 20 distinct instance_ids appear across 15:00–15:03:30Z, so this is GCF-side scaling admission, not the function's own cap and not app code. Pub/Sub redelivers a 500'd push, and the burst completed normally (executions at 15:01:44–15:02:01Z all 'ok'). SEPARATE, co-located issue found in the same window and worth acting on: aggregateAiReferralsScheduler is declared memory:'512MB' (packages/functions/src/index.js:82) while publishTopic constructs a brand-new @google-cloud/pubsub PubSub client — its own gRPC channel and auth client — per message (packages/functions/src/helpers/pubsub/publishTopic.js:3-5), so 102 concurrent clients blow the cap: 21 'Memory limit of 512 MiB exceeded with 512-515 MiB used' kills in 24h, and 21 of 102 scheduler runs (20.6%) ended 'connection error'/'crash' instead of 'ok'. Same family as recorded fingerprint 1t43oph on this service.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/index.js:76` — aggregateAiReferralsSubscriber export — runWith({memory:'512MB', timeoutSeconds:300}), no maxInstances override, so the platform default 3000 applies; the alerted rejection is not this function's cap
- `packages/functions/src/index.js:83` — pubsub.schedule('*/15 * * * *') — the every-15-min fanout that produced the 102-message burst the alerted push belonged to
- `packages/functions/src/handlers/scheduled/fanoutAiReferralAggregation.js:36` — Promise.allSettled over shopIDs.flatMap(dates) publishes all 51x2=102 messages at once, concentrating subscriber push load into one ~80s window
- `packages/functions/src/helpers/pubsub/publishTopic.js:4` — `const pubSub = new PubSub()` inside the per-message helper — 102 clients/gRPC channels per fanout run, the mechanism behind the 21 scheduler OOM kills at 512 MiB
- `packages/functions/src/handlers/pubsub/subscribeAggregateAiReferrals.js:13` — the handler that would have logged had a container been admitted; its absence from stderr confirms the request never reached app code

## Evidence
- 1 matching entries: `(resource.labels.function_name="aggregateAiReferralsSubscriber") AND timestamp>="2026-08-21T14:46:58.090Z" AND timestamp<="2026-08-21T15:16:58.090Z" AND severity>=ERROR`
- 1 matching entries: `timestamp>="2026-08-20T15:00:00Z" AND timestamp<="2026-08-21T16:00:00Z" AND severity>=ERROR AND textPayload:"no available instance"`
- 31 matching entries: `(resource.labels.function_name="aggregateAiReferralsSubscriber") AND timestamp>="2026-08-21T15:00:00Z" AND timestamp<="2026-08-21T15:03:30Z"`
- 11 matching entries: `(resource.labels.function_name="aggregateAiReferralsScheduler") AND timestamp>="2026-08-21T14:40:00Z" AND timestamp<="2026-08-21T15:20:00Z"`
- 21 matching entries: `(resource.labels.function_name="aggregateAiReferralsScheduler") AND timestamp>="2026-08-20T15:00:00Z" AND timestamp<="2026-08-21T16:00:00Z" AND textPayload:"Memory limit"`
- 102 matching entries: `(resource.labels.function_name="aggregateAiReferralsScheduler") AND timestamp>="2026-08-20T15:00:00Z" AND timestamp<="2026-08-21T16:00:00Z" AND textPayload:"finished with status"`

## Job
- analyze rounds: 1
- cost: $1.57

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
