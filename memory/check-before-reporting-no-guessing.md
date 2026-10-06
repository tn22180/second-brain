---
name: check-before-reporting-no-guessing
description: "Never report system state (deployed? running? which code?) from memory or inference — check the live system first, then report."
metadata:
  node_type: memory
  type: feedback
  originSessionId: 3a04477f-9b0f-4df0-9025-3c4f5af76847
  modified: 2026-10-06T04:49:20.921Z
---

Before stating any system state — what a box runs, whether a deploy happened, what a config points to — run the check and report its output. Memory and MEMORY.md index lines are hints, not evidence; label anything unchecked as unchecked.

**Why:** 2026-10-06 I told Tuan the seo worker fleet "still runs old code" because a stale MEMORY.md index line said worker deploys only on a `[deploy-worker]` title. The tag pipeline had a `deploy_worker` job (success) and `docker ps` on central showed `seo-worker:50fae5be` — both one command away. Same session I said gcloud needed reauth when `--account=tony-cli@…` worked fine. His words: "lần sau kiểm tra rồi mới báo không được đoán".

**How to apply:** for deploy state check pipeline jobs + the running artifact (container image tag, Cloud Run `status.traffic[0].revisionName`); for credentials try the documented path (`--account=<SA>`) before saying it is blocked. See [[seo-master-no-detect-worker]], [[gcloud-sa-config-no-reauth]].
