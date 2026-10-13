---
name: seo-checklist-adoption-dashboard
description: "Dashboard đo checklist FAL-837 (usage/value/CS/reviews) — artifact 8hzEayipNeZMtvnswjiBF4, data từ tools/checklist-dashboard/collect.py, refresh tay"
metadata:
  node_type: memory
  type: reference
  originSessionId: d9f700f9-18f8-43eb-8852-b9f16cc1d3b7
  modified: 2026-10-13T05:17:09.096Z
---

Artifact (type Dashboard): https://claude.ai/artifact/8hzEayipNeZMtvnswjiBF4 — 9 dataset file JSON, không live query (không có connector BigQuery).

Refresh: `python3 -I ~/Documents/second-brain/tools/checklist-dashboard/collect.py <out>` → upload từng JSON (Artifact asset) → `update` `datasets/<id>` url/name/updated. Chỉ chạy được trong session (bq + Crisp .env.local local).

Nguồn:
- BigQuery `falcon-ecb55.product_analytics.events` (KHÔNG phải plaza-staging-3 như doc cũ ghi). `app_id='seoSuite'`; checklist cũ = `card='checklist'`, bản FAL-837 = `card='checklist-v2'` (seo 86fff84e75). Score event có `payload.system=true` để Nexus không đếm là usage.
- Score event `payload.element='checklist_scan_result'` từ `Runner.finishAudit` (seo dbfa965f3d, !2396) — rỗng tới khi lên prod.
- Staging không bắn event: CI var `GOOGLE_CLOUD_CREDENTIALS_JSON` là protected, chỉ master/tag nhận.
- Crisp: token seo `.env.local` đọc được; lọc segment `app_seo`, chỉ tin `from=user`; text lặp ≥5 lần = quick-reply.
- Reviews: scrape apps.shopify.com/avada-seo-suite/reviews?sort_by=newest.

Baseline prod 30 ngày trước release: 4.193 shop active, 1.651 mở checklist (39%), 1.286 bấm Fix/Enable.

Related: [[credit-not-tokens]], [[crisp-plugin-lost-prod-dead]]
