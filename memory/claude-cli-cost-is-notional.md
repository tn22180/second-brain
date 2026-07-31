---
name: claude-cli-cost-is-notional
description: "total_cost_usd from `claude -p` is an API-equivalent, not money billed — Tuan runs on a subscription, so never present it as spend."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ba3e1e24-8394-4cb1-9e31-f4eb62cc21e4
  modified: 2026-07-31T04:52:30.447Z
---

`total_cost_usd` in the `claude -p --output-format json` envelope is what the run
*would* have cost on the API. Tuan runs headless jobs on a subscription plan, so
nothing is billed per run. Reporting a bare `$4.43` reads as money out the door and is
wrong.

**Why:** he corrected this directly — "chạy bằng token mà" — after a Telegram notice
showed `$2.23 · fp 1whczpb` as if it were spend. Volume is not the concern either
(~10 jobs/day is fine); the number being *mislabelled* was.

**How to apply:** keep the number — it is still the only comparable measure of how
much work a job took — but label it: `~$2.23 quy đổi (chạy trên gói)`. Same rule for
any digest, dashboard or upward report built on the CLI envelope. Real GCP/Firestore
spend is different and *is* money: see [[credit-report-bigquery-cost]] and
[[firestore-purge-cost]].

Applies to [[prod-error-autofix]].
