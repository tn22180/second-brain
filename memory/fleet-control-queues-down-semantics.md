---
name: fleet-control-queues-down-semantics
description: "fleet-control \"Queues DOWN\" = totalFailedRecent>0 in 24h window, cosmetic — not an outage; worker liveness is separate."
metadata: 
  node_type: memory
  type: reference
  originSessionId: a3f0f490-5c60-457e-82b7-5860fe12e2f5
  modified: 2026-08-12T07:28:47.669Z
---

fleet-control cockpit health card row "Queues" renders **DOWN** purely when
`queues.ok === false`, and `getClusterHealth` sets `queues.ok = !queuesProbeFailed && totalFailedRecent === 0`
(`core/fleet.mjs:473`). `totalFailedRecent` = failed jobs whose `finishedOn` is within
`FAILED_WINDOW_MS` (default 24h, `fleet.mjs:293`). So **one recent failed job → "Queues DOWN"**,
even while queues consume fine (backlog 0, workers up, not paused).

DOWN there is **cosmetic**, not an outage. It self-clears when the failed jobs age past 24h, or
immediately if you retry/remove them from the `bull:worker-<tier>:failed` zset.

Worker liveness is a separate row: `up` = heartbeat key whose JSON `lastBeat` is `< HB_TTL_MS`
(30s) old — read the value, not just PTTL. `up===0` → status critical. Live fleet on prod =
8 workers heartbeating (box1.1/1.2, box2.1/2.2 over Tailscale + central-leader + central-worker1 + one more).

"Số đã làm" (usage totals) come from `metrics:jobs:<hour>` / `metrics:fail:<hour>` hashes
(counts, no PII) — independent of the `bull:*` job hashes, so purging jobs keeps the report.
See [[seo-prod-error-slack-pipeline]], [[seo-fleet-tailscale-staging4]].
