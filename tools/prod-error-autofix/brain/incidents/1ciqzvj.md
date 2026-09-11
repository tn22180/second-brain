fingerprint: 1ciqzvj
service: resolveallredirectsubscribergen2
message: 'Memory limit of 1024 MiB exceeded with 1031 MiB used. Consider increasing the memory limit, see <https://cloud.google.com/functions/docs/configuring/memory>'
app: SEO
repo: seo
date: 2026-09-11T09:54:28.615Z
status: infra
attempt: 2

# SEO · resolveallredirectsubscribergen2 · 1ciqzvj

**Outcome.** infra class — reported, no MR

**Root cause.** resolveAllRedirectSubscriberGen2 is deployed at memory '1GiB' with no `concurrency` override — Cloud Run runs it at the gen2 default containerConcurrency 80 — while every message on the `resolveAllRedirects` topic carries the shop's entire unresolved-404 list (p99 message size 3,105,544 bytes on that topic), so one instance held 22 concurrent executions each retaining a ~3 MB payload plus its parsed object graph and crossed 1024 MiB.

**Mechanism.** redirectController.resolve publishes the whole filtered 404 list as the Pub/Sub payload (`data: filteredData`, redirectController.js:437). subscribeResolveAllRedirect JSON.parses that entire payload (subscribeResolveAllRedirect.js:76), processes only 30 items (REDIRECT_CHUNK slice at :82), then sleeps `delay(20000)` and re-dispatches the *same full list* for the next chunk (:100-:108) — so `data` (base64 string + Buffer + decoded string + parsed array of thousands of redirect objects) is retained for the entire invocation, including the 20 s sleep and the ~45 s of paced Shopify calls (ITEM_DELAY_MS 1500 × 30). pubsubFunctions.js:193 declares only `{memory: '1GiB', timeoutSeconds: 540}`; `gcloud run services describe resolveallredirectsubscribergen2` reports containerConcurrency 80, so Cloud Run stacks messages on one container. On instance 00a41e8c1d42f05c at 09:46:17Z, 22 distinct execution_ids were logging concurrently (each THROTTLED-retrying its own Shopify call, attempts 6/50 → 50/50), i.e. ≈22 live copies of a 3.1 MB payload and its heap expansion → 'Memory limit of 1024 MiB exceeded with 1031 MiB used'. The pile-up is self-feeding: the catch block's Firestore writes (:119-:122, stack frame `finishResolveRedirectLog … subscribeResolveAllRedirect.js:155` in lib/) themselves throw `4 DEADLINE_EXCEEDED` (20 occurrences in the window) on the CPU-starved container, and wrapPubSub (pubsubFunctions.js:89) has no catch and no dedupe claim, so the throw nacks the message; Pub/Sub redelivers the same chunk, which re-dispatches the next chunk again and forks the supposedly-sequential chain. Container memory utilization p99 stayed 0.85–0.97 for the whole hour 09:00–10:00Z, so this is chronic, not a one-off spike.

Confidence: `high`

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:193` — Only {memory: '1GiB', timeoutSeconds: 540, topic: 'resolveAllRedirects'} — no concurrency override, so the deployed Cloud Run service runs containerConcurrency 80 on a 1 GiB container
- `packages/functions/src/controllers/redirectController.js:437` — dispatchWork('resolveAllRedirects', {data: filteredData, ids, settings}) puts the shop's entire unresolved-404 list in the Pub/Sub payload (p99 3.1 MB) instead of a docId
- `packages/functions/src/handlers/pubsub/subscribeResolveAllRedirect.js:76` — JSON.parse of the whole base64 payload on every chunk — allocates base64 string + Buffer + decoded string + parsed array per concurrent execution
- `packages/functions/src/handlers/pubsub/subscribeResolveAllRedirect.js:100` — delay(20000) then re-dispatch of the full `data` keeps the entire list reachable for the whole invocation; 30 items × ITEM_DELAY_MS 1500 means each copy lives ~65 s+
- `packages/functions/src/handlers/pubsub/subscribeResolveAllRedirect.js:119` — The catch's Firestore writes are the frames that threw 4 DEADLINE_EXCEEDED (prod stack: lib/handlers/pubsub/subscribeResolveAllRedirect.js:155 → finishResolveRedirectLog); the throw escapes wrapPubSub, nacks the message and makes Pub/Sub redeliver, forking the chain and multiplying live payloads
- `packages/functions/src/handlers/exports/pubsubFunctions.js:89` — wrapPubSub neither catches nor dedupes (unlike recursiveSubscriberGen2's claimPubSubEvent noted at :97), so a redelivered chunk re-runs and re-dispatches

## Evidence
- 1 matching entries: `(resource.labels.service_name="resolveallredirectsubscribergen2") AND timestamp>="2026-09-11T09:31:31Z" AND timestamp<="2026-09-11T10:01:31Z" AND textPayload:"Memory limit"`
- 22 matching entries: `(resource.labels.service_name="resolveallredirectsubscribergen2") AND timestamp>="2026-09-11T09:44:00Z" AND timestamp<="2026-09-11T09:46:18Z" AND labels.instanceId:"00a41e8c1d42f05c"`
- 4000 matching entries: `(resource.labels.service_name="resolveallredirectsubscribergen2") AND timestamp>="2026-09-11T09:31:31Z" AND timestamp<="2026-09-11T10:01:31Z" AND textPayload:"THROTTLED"`
- 2000 matching entries: `(resource.labels.service_name="resolveallredirectsubscribergen2") AND timestamp>="2026-09-11T09:31:31Z" AND timestamp<="2026-09-11T10:01:31Z" AND textPayload:"Exceeded 2 calls per second"`
- 20 matching entries: `(resource.labels.service_name="resolveallredirectsubscribergen2") AND timestamp>="2026-09-11T09:31:31Z" AND timestamp<="2026-09-11T10:01:31Z" AND textPayload:"DEADLINE_EXCEEDED"`
- 1 matching entries: `(resource.labels.service_name="resolveallredirectsubscribergen2") AND timestamp>="2026-09-11T09:31:31Z" AND timestamp<="2026-09-11T10:01:31Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $3.30

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
