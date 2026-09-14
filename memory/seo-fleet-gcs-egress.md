---
name: seo-fleet-gcs-egress
description: "Fleet boxes are outside GCP — every GCS read is internet egress at $0.12/GiB; legacy FILE_PAGE recursive re-downloads the whole fileImageJsonl per 20-image batch, so one big shop on the fleet burns 60+ GiB/day"
metadata: 
  node_type: memory
  type: project
  originSessionId: e0222051-26c7-4ac1-af78-01667ed14443
  modified: 2026-09-14T05:11:54.043Z
---

Found 2026-09-14 from billing SKU `Network Data Transfer GAE/Firebase Storage` (avada-seo): $0 → $24–38/day
from 2026-09-06 (200–320 GiB/day out of `avada-seo.appspot.com`). Cause: `recursive` jobs (workerJobs toggle)
running on box1/box2/central (home machines, Tailscale) via the LEGACY_PUBSUB `FILE_PAGE` branch —
`prepareFileImagesBatch` (optimizeImageJobLoop.js) re-downloads the full `fileImageJsonl/<shop>/*.jsonl`
on every 20-image batch when no manifest exists. 40 MB file × 1685 iterations/day = 67 GB for one shop.
Same reads from GCF us-central1 are free (US multi-region → US region).

**Why:** report script buckets this SKU under "Firestore / Storage", so it hides as "Firestore tăng".
**How to apply:** when fleet cost jumps, check that SKU first, then `metrics:jobs:*` in central Redis and
Loki `{job="recursive"} |= "LEGACY_PUBSUB FILE_PAGE iter"` per shop. Fix = cache JSONL per fileUrl on the
worker (or build the manifest/shard worklist for the legacy path); don't resize anything.
Related: [[seo-fleet-gcf-spill]], [[seo-fleet-idle-is-gate2]], [[seo-central-box-access]].
