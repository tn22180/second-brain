fingerprint: ioi4d9
service: syncelasticsearchchunkgen2
message: 'Memory limit of 1024 MiB exceeded with 1025 MiB used. Consider increasing the memory limit, see <https://cloud.google.com/functions/docs/configuring/memory>'
app: SEO
repo: seo
date: 2026-08-03T10:42:39.182Z
status: infra
attempt: 1

# SEO · syncelasticsearchchunkgen2 · ioi4d9

**Outcome.** infra class — reported, no MR

**Root cause.** syncElasticsearchChunkGen2 is declared memory: '1GiB' with no `concurrency` override, so Cloud Run runs it at the gen2 default containerConcurrency=80 (measured on prod), and syncToElasticsearch dispatches every chunk of a shop's job in one uncapped Promise.all — 14 concurrent processElasticsearchChunk executions for the same shop landed on a single 1 GiB container and OOM-killed it at 1025 MiB.

**Mechanism.** syncToElasticsearch slices the bulk result into CHUNK_SIZE=100 chunks (jobDataMigrate.service.js:47) and publishes all of them at once — `await Promise.all(chunks.map(... dispatchWork('syncElasticsearchChunk', ...)))` (jobDataMigrate.service.js:212-214) with no p-limit, unlike the in-chunk pLimit(CRAWL_CONCURRENCY=5) at :292. `gcloud run services describe syncelasticsearchchunkgen2` returns containerConcurrency=80, memory=1024Mi, maxScale=5, because pubsubFunctions.js:382-391 sets memory/maxInstances but never `concurrency` — the same file already fixed this exact failure mode on a sibling function at :255-257 with the comment "the default (80 concurrent messages/instance) packed ~4k shops onto one 1GiB instance, OOM-killed it". Each concurrent execution holds: the 100-item chunk JSON read from GCS, the shop doc, the settings doc, the full `templates/<type>.json` theme asset string (:279), and a 5-wide fan-out of getProduct/prepareAnalysisPage/calculateScore result objects (:292-294). Counted on the killed container: 14 distinct execution_ids all carrying instanceId 001548f729781c1af2, logging within 2.0s of each other (10:33:46.895 → 10:33:48.934), and 13 of those 14 logged `Error getting theme asset Response code 429 (Too Many Requests)` inside a 481 ms span (10:33:48.453–10:33:48.934) — same shop 7Zg4G0gaM9prq3rEgqVH in the redis lines, i.e. 14 chunks of one shop's job in flight on one container simultaneously, and the simultaneity is itself what throttled Shopify. Cloud Run scaled to the full maxInstances=5 at 10:33:15.5 (4 'Starting new instance' entries in 76 ms) and 15 requests failed with 'The request failed because either the HTTP response was malformed or connection to the instance had an error', all labelled with the same instanceId; 2m31s later that container reported 'Memory limit of 1024 MiB exceeded with 1025 MiB used' at 10:36:19.639 and a replacement instance started at 10:36:22.089. The overshoot is 1 MiB over the cap, so the working set sits exactly at the ceiling: at 14 executions that is ~73 MiB each before subtracting this repo's gen2 boot floor of 516-533 MiB (measured in incident zd4n21), leaving ~35 MiB per chunk of headroom.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:384` — memory: '1GiB' — the 1024 MiB cap that was exceeded
- `packages/functions/src/handlers/exports/pubsubFunctions.js:386` — maxInstances: 5 declared, but no `concurrency` key — so Cloud Run applies the gen2 default 80 messages per instance (confirmed containerConcurrency=80 on prod)
- `packages/functions/src/handlers/exports/pubsubFunctions.js:255` — the repo already hit and fixed this identical failure mode on updateSpeedUpExpireTimeSubscriberGen2 with concurrency: 1 — the comment names the 80-per-instance default as the OOM cause
- `packages/functions/src/services/jobDataMigrate.service.js:212` — uncapped Promise.all publishes every chunk of the job at once — the burst that put 14 executions on one container
- `packages/functions/src/services/jobDataMigrate.service.js:47` — CHUNK_SIZE = 100 — each concurrent execution holds a 100-item chunk resident
- `packages/functions/src/services/jobDataMigrate.service.js:279` — shopify.asset.get of templates/<type>.json — the call that logged 429 in 13 of the 14 concurrent executions, and whose value string stays resident per execution
- `packages/functions/src/services/jobDataMigrate.service.js:292` — pLimit(CRAWL_CONCURRENCY=5) caps work inside one chunk but nothing caps how many chunks share a container

## Evidence
- 1 matching entries: `(resource.labels.service_name="syncelasticsearchchunkgen2") AND timestamp>="2026-08-03T10:23:00Z" AND timestamp<="2026-08-03T10:53:07Z" AND textPayload:"Memory limit of 1024 MiB exceeded"`
- 13 matching entries: `(resource.labels.service_name="syncelasticsearchchunkgen2") AND timestamp>="2026-08-03T10:23:00Z" AND timestamp<="2026-08-03T10:53:07Z" AND textPayload:"Error getting theme asset"`
- 15 matching entries: `(resource.labels.service_name="syncelasticsearchchunkgen2") AND timestamp>="2026-08-03T10:23:00Z" AND timestamp<="2026-08-03T10:53:07Z" AND textPayload:"the HTTP response was malformed"`
- 53 matching entries: `(resource.labels.service_name="syncelasticsearchchunkgen2") AND timestamp>="2026-08-03T10:23:00Z" AND timestamp<="2026-08-03T10:53:07Z"`
- 3 matching entries: `(resource.labels.service_name="syncelasticsearchchunkgen2") AND timestamp>="2026-07-27T00:00:00Z" AND timestamp<="2026-08-03T10:53:07Z" AND textPayload:"Memory limit of 1024 MiB exceeded"`

## Job
- analyze rounds: 1
- cost: $1.95

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
