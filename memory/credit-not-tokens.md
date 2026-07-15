---
name: credit-not-tokens
description: "Avada credit histories count credits per feature, never tokens; no token data exists upstream"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 9c530a18-e6a5-49ce-9a53-e3c0cec30190
---

Avada's AI usage is measured in **credits**, not tokens. Tuan corrected this explicitly on 2026-07-09.

The Firestore document at `shops/{shopId}/creditHistories/{YYYY-MM-DD}` is a flat map with one key per feature plus a total — e.g. `{date: ..., seoOnPageAudit: 4, totalUsage: 4, updatedAt: ...}`. The BigQuery view `creditHistories_daily_long` unpivots it to `(event_date, shop_id, action, usage, total_usage)`. There is no `inputTokens` / `outputTokens` field anywhere in the pipeline, so no report can break usage down by tokens — only by feature.

Features seen in the SEO app: `imageAltText` (dominant, ~84% of credits), `seoOnPageAudit`, `generateAnchorText`, `generateFaqsInBulk`, `bulkAIFix`.

Blog (`avada-blog-app`) and APC (`ai-product-copy`) have no BigQuery mirror of credit data; `scripts/app_credit_report.py` reads their Firestore directly. Blog's features live in `creditLogs.feature` (free text: `Audit Agent Fix Issue`, `AI Inline Rewrite`, `LangGraph Blog Stream`, …); APC's live in `bulkGenerateProcesses.aiCreditAction` (`generateProductDescription`, `generateProductSeoDescription`, `generateCollectionSeoDescription`, `generateCollectionDescription`).

APC's `resultGen` collection has been unwritten since **2026-06-11** while generation continued. The report counted it and returned zero shops for 29 days without erroring. Corrected 2026-07-10 to read `bulkGenerateProcesses`. Its `creditCost` is `totalCount × rate` stamped at creation, not work actually completed. Related: [[credit-report-bigquery-cost]], [[firestore-purge-cost]].
