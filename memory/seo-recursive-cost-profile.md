---
name: seo-recursive-cost-profile
description: recursiveSubscriberGen2 cost is CPU not memory; splitting by memory saves ≤$5/mo; legacy FILE_PAGE is the real burn
metadata:
  node_type: memory
  type: project
  originSessionId: da002b6e-0b7b-4883-af1f-4ad205d18c36
  modified: 2026-10-15T07:36:12.321Z
---

Measured 2026-10-15 (30d, avada-seo): recursivesubscribergen2 = $84.4 — CPU $69 (82%), memory $14 (17%). 4GiB/2vCPU, concurrency 80, so the 4GiB is shared by up to ~28 concurrent messages; peak hourly-p99 mem 73.8% (~3GiB). Requests ≥400s are 6% of count but 53% of request-time.

**Why:** Tuan asked to split it by per-action memory; numbers showed that saves ≤$5/mo, and breaks fleet Gate 2 if the topic name changes (`workerJobs.includes('recursive')`).
**How to apply:** for recursive cost, look at legacy FILE_PAGE first (one shop 9YslB2n0… = $42 on 09-29/30, JSONL re-read every 20-image batch — see [[seo-fleet-gcs-egress]]). Fix in graph seo-recursive-cleanup-1015 (branch fix/recursive-cost-cleanup). App logs carry no trace id, so per-action cost can't be joined from request logs.

Decision 2026-10-15: !2416 merged (f11185c286); !2421 makes `[subscribeRecursive] start/finish action` warn-level (action, type, shopId, …, executionTime). After it ships, wait 2 weeks, count `finish action` per action → delete zero-hit actions; split into recursiveImage (4GiB) / recursiveLight (1GiB) only if per-group $ is needed, keeping the `dispatchWork('recursive')` key.
