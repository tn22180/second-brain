---
name: seo-fleet-gcf-spill
description: "How dispatchWork routes worker-fleet vs GCF — the 3 gates + the memory-based spill (MR2204); spill is ON in prod on the FUNCTIONS side only, OFF inside worker containers."
metadata: 
  node_type: memory
  type: reference
  originSessionId: a3f0f490-5c60-457e-82b7-5860fe12e2f5
  modified: 2026-08-27T00:00:00.000Z
---

`dispatchWork(topic, data, shop)` (`seo` packages/functions/src/helpers/worker/dispatchWork.js) is the ONLY correct way to queue fleet work — `publishTopic` directly = always GCF. It routes to the self-hosted fleet only past gates, and **every failure path falls back to GCF (Pub/Sub)** so a dispatch is never lost:

- **Gate 1** topic ∈ `MIGRATED_TOPICS` (22 jobs, worker handler exists).
- **Gate 2** shop lists the topic in its `workerJobs[]` (per-shop Firestore toggle).
- **Gate A** `isFleetHealthy()` — redis reachable + ≥1 live worker + APP_ENV/REDIS_DB isolation OK.
- **Gate B (spill)** only when `FLEET_SPILL_ENABLED=true`.

**There is NO "total queue = N → GCF" threshold.** Spill is per-job by memory (MR !2204, merged 2026-08-14): a job spills to GCF when **no live worker has free memory budget ≥ its memoryMb** (`decideSpill`: `job.memoryMb > maxFreeMb`). Before MR2204 it counted tier slots (`FLEET_SLOTS_*`, default 2/5/10) — wrong point, because the real admission limit is memory: worker.mjs admits while `sum(running memoryMb) ≤ memoryBudgetMb` (=4096). `maxFreeMb` comes from `getFleetLoad` reading the **`worker:mem`** redis hash (`<workerId>` → `"<reservedMb>:<budgetMb>"`, published by worker.mjs `syncMem`); a telemetry gap → `Infinity` = fail toward the fleet (never divert all traffic to GCF on a probe hiccup).

**Prod state 2026-08-27: spill is ON, but only half the fleet's dispatches see it.** Verified against the running services, not the env file: `gcloud functions describe apiGen2 --gen2 --project=avada-seo` and `optimizeProductSubscriberGen2` both show `FLEET_SPILL_ENABLED=true`; `docker inspect` on the central worker containers shows **no `FLEET_*` env at all**.

| dispatcher | `SPILL_ENABLED` | job that fits no worker |
|---|---|---|
| Cloud Functions (publisher) | `true` | spills to GCF |
| inside a worker container (child dispatch) | `false` | queues on BullMQ `wait` |

Self-chaining fan-outs run on the second row and have no overflow valve — `recursive` re-dispatching itself, `optimizeStore` → `optimizeProduct`, the bulkAuditFixProduct chain. Closing it = add the var to the worker compose env = worker redeploy, not a functions deploy. `FLEET_MAX_BACKLOG` unset everywhere (default 0 = disabled), so queue length alone never falls back.

Older notes (and `docs/features/worker-fleet-spill.md` before 2026-08-27) said spill was OFF in prod; that was stale. Check the deployed service, not the doc and not `PRODUCTION_ENV_FILE`.

Tier↔RAM rule (drift-tested, `tierMemoryBand.test.js`): heavy ≥4096, medium 2048–4095, light <2048. `JOB_TIERS`/`JOB_MEM` in spillPolicy.js mirror worker.config.yml. See [[seo-worker-memory-measured]] — the `memoryMb` numbers are GCF copies and measured RSS is 2–8x smaller; FAL-748 (MR !2204 on git.avada.net) retunes `recursive` 4096→768 and `bulkAuditFixProduct` 2048→1024, and drops `NEW_SHOP_WORKER_JOBS` from an 11-job cohort to all of `MIGRATED_TOPICS`.

Also in redis for the fleet dashboard: `worker:active`, `worker:running:<id>`, `worker:history:<id>`, `metrics:jobs:<hour>`/`metrics:fail:<hour>` (hourly buckets, TTL 15d — the raw data for a daily activity/top-job view). See [[fleet-control-public-hosting]], [[seo-gen2-follower-fleet-deploy]].
