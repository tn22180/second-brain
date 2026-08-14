---
name: seo-fleet-gcf-spill
description: "How dispatchWork routes worker-fleet vs GCF — the 3 gates + the memory-based spill (MR2204), and that spill is OFF in prod until FLEET_SPILL_ENABLED."
metadata: 
  node_type: memory
  type: reference
  originSessionId: a3f0f490-5c60-457e-82b7-5860fe12e2f5
  modified: 2026-08-14T10:35:33.020Z
---

`dispatchWork(topic, data, shop)` (`seo` packages/functions/src/helpers/worker/dispatchWork.js) is the ONLY correct way to queue fleet work — `publishTopic` directly = always GCF. It routes to the self-hosted fleet only past gates, and **every failure path falls back to GCF (Pub/Sub)** so a dispatch is never lost:

- **Gate 1** topic ∈ `MIGRATED_TOPICS` (22 jobs, worker handler exists).
- **Gate 2** shop lists the topic in its `workerJobs[]` (per-shop Firestore toggle).
- **Gate A** `isFleetHealthy()` — redis reachable + ≥1 live worker + APP_ENV/REDIS_DB isolation OK.
- **Gate B (spill)** only when `FLEET_SPILL_ENABLED=true`.

**There is NO "total queue = N → GCF" threshold.** Spill is per-job by memory (MR !2204, merged 2026-08-14): a job spills to GCF when **no live worker has free memory budget ≥ its memoryMb** (`decideSpill`: `job.memoryMb > maxFreeMb`). Before MR2204 it counted tier slots (`FLEET_SLOTS_*`, default 2/5/10) — wrong point, because the real admission limit is memory: worker.mjs admits while `sum(running memoryMb) ≤ memoryBudgetMb` (=4096). `maxFreeMb` comes from `getFleetLoad` reading the **`worker:mem`** redis hash (`<workerId>` → `"<reservedMb>:<budgetMb>"`, published by worker.mjs `syncMem`); a telemetry gap → `Infinity` = fail toward the fleet (never divert all traffic to GCF on a probe hiccup).

**Prod state 2026-08-14: spill is OFF** — `FLEET_SPILL_ENABLED` unset in PRODUCTION_ENV_FILE (verified via `glab variable get`). So a full worker just queues on BullMQ `wait`, never spills. To turn overflow on: set `FLEET_SPILL_ENABLED=true` + deploy functions (publisher-side / GCF — no worker redeploy). All this runs on the GCF publisher, not the worker box.

Tier↔RAM rule (drift-tested, `tierMemoryBand.test.js`): heavy ≥4096, medium 2048–4095, light <2048. `JOB_TIERS`/`JOB_MEM` in spillPolicy.js mirror worker.config.yml.

Also in redis for the fleet dashboard: `worker:active`, `worker:running:<id>`, `worker:history:<id>`, `metrics:jobs:<hour>`/`metrics:fail:<hour>` (hourly buckets, TTL 15d — the raw data for a daily activity/top-job view). See [[fleet-control-public-hosting]], [[seo-gen2-follower-fleet-deploy]].
