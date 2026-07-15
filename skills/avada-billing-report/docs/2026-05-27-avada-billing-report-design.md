# Avada Billing Report — Design

**Date:** 2026-05-27
**Status:** Built

## Goal

A Claude skill that produces the **daily multi-app GCP cost report** (Vietnamese, the
`gcp-cost-<date>.md` format in `docs/example-report.md`) from the BigQuery billing export
of project `avada-seo`, using the operator's **local gcloud/bq CLI** (no service-account
JSON). "App" = a GCP project.

## Architecture — data script + guided authoring

1. **Data (deterministic):** `scripts/billing_data.py` runs ONE granular `bq` query over
   the window `min(month_start, yesterday−29) … yesterday`, then computes every slice and
   writes `reports/billing-data-<d1>.json`:
   - per app: MTD / Rolling-30 totals, daily avg, monthly estimate, day-over-day (d1 vs d2)
     with per-service & per-function root-cause deltas, cost-by-service (Rolling-30),
     top Cloud Functions (Rolling-30);
   - cross-app totals + budget gap.
2. **Authoring (Claude, per `SKILL.md`):** reads the JSON + `config/*`, renders the styled
   markdown to `reports/gcp-cost-<d1>.md`.

This split keeps the numbers deterministic while letting Claude handle the judgment parts
(emoji/app metadata, function camelCase, optimization suggestions, the target deep-dive).

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Data source | `avada-seo.gcp_billing_export.gcp_billing_export_v1_01BDCA_07A8E0_293FF2` |
| Auth | Local gcloud (`bq`), not a service account |
| App = | GCP project; production only by default (`--all-projects` to include staging) |
| Cost basis | Gross `SUM(cost)` (before credits) |
| Output | `reports/gcp-cost-<d1>.md` (skill folder, gitignored) |
| App roster | Curated `config/apps.json` (emoji/name/desc) + auto-fallback `defaultEmoji` |
| Function names | Source casing recovered from `packages/functions/src` exports (avada-seo) |

## Key data facts (verified against the export)

- **Service buckets** are normalized in SQL: Firestore bills under the **"App Engine"**
  service (SKUs `Cloud Firestore *`) → bucket **"Firestore / Storage"** (with Cloud
  Storage / GCS Storage); "Cloud Run Functions" → **"Cloud Functions"**; plus Cloud Run,
  Logging, Pub/Sub, Scheduler; everything else keeps its raw name.
- **Function identity** = label `goog-drz-cloudfunctions-id` (lowercased, e.g.
  `lighthouseauditrunnergen2`); rows lacking it are `(untagged)` — currently the largest
  function bucket for avada-seo, shown honestly.
- **Estimates:** MTD = `mtd / mtdDays × daysInMonth`; Rolling-30 estimate = the 30-day total.
- **Day attribution** by `DATE(usage_start_time, tz)` (UTC default); `_PARTITIONTIME ≥ from−1`
  bounds the scan (table is ~MB/day).

## Components

```
SKILL.md                  authoring guide (format spec + maps + rules)
scripts/billing_data.py   bq query + aggregation → reports/billing-data-<d1>.json
config/apps.json          project_id -> {emoji, name, description, functionsRepo?}
config/settings.json      budgetTarget, otherThreshold, marketplace rule, defaultEmoji, tz
config/suggestions.json   optimization-suggestion templates (functions + services)
docs/example-report.md    the target layout
reports/                  output (.json + .md), gitignored
README.md, .gitignore
```

## Report sections (per `docs/example-report.md`)

Header (Thời gian / DoD / MTD / Rolling-30 / Nguồn) → per-app section (Tổng quan, Biến động
ngày + Nguyên nhân chính, Chi phí theo Service, Top Cloud Functions with 🔴🟡🟠⚪ ranking,
Gợi ý Optimize) for each production project with `r30 ≥ otherThreshold` → "Other apps" table
→ 🎯 target section (gap to budget, per-app target allocation, deep-dive when over budget)
→ total summary. Marketplace pseudo-projects ("Use of …") are grouped, not treated as apps.

## Out of scope (YAGNI)

- Automated/scheduled delivery (could be added via `/schedule` later).
- A fully deterministic renderer (the chosen approach is guided authoring).
