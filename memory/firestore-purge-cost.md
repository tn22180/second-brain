---
name: firestore-purge-cost
description: "The shop-data purge bills mostly Firestore reads, not deletes; reads are 3x the price and 76% of the spike"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c530a18-e6a5-49ce-9a53-e3c0cec30190
---

`handleprocessbatchpurgedeadshopsgen2` in `avada-seo` drives visible daily cost spikes. Measured on 2026-07-08 from the billing export at SKU level:

```
Cloud Firestore Read Ops        $27.01 -> $70.63   (+$43.63)  117,774,748 reads
Cloud Firestore Entity Deletes   $7.13 -> $20.76   (+$13.63)  103,804,689 deletes
```

Reads are **76% of the increase**: Firestore charges $0.06 per 100K reads against $0.02 per 100K deletes, and the job reads roughly 1.13 documents for every one it removes. Optimising the delete path would barely help; the read path is where the money is.

Two numbers that mislead:
- A job's `docsDeleted` counter (39,999,765 for the 07-07→07-09 run) counts only the shop documents it walks. GCP billed 103.8M entity deletes on 07-08 alone, because subcollection documents go with them — about 2.6x the counter.
- Idle Firestore-ops baseline for `avada-seo` is **$5.21/day** (19 non-purge days, 2026-06-09..07-09). Do not take a baseline from the daily report's `dodCauses`: that list is the report's own *top-N movers*, not a per-service breakdown, so a service absent from it moved less, it did not cost zero. Reading absolute cost out of it produces a wrong baseline (it suggested $33/day).

Total purge excess over 12 purge days: **$204**. That explains the 07-08 spike, **not** the ~$700/month budget overrun — those are separate questions. Wave 3 (~8,564 shops remaining) should cost roughly $15–35, extrapolating from $0.0017–0.0041 per shop across the two big runs.

Query the SKU detail with a `_PARTITIONTIME` filter on `avada-seo.gcp_billing_export.gcp_billing_export_v1_01BDCA_07A8E0_293FF2` — 11.5 MB with it, 421 MB without. Related: [[daily-manager-page]], [[credit-report-bigquery-cost]].
