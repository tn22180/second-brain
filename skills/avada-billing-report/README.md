# avada-billing-report

A Claude Code skill: the **daily multi-app GCP cost report** (Vietnamese
`gcp-cost-<date>.md`) from the `avada-seo` BigQuery billing export
(`gcp_billing_export_v1_01BDCA_07A8E0_293FF2`), via the local `bq` CLI (gcloud auth).

Two stages:

```bash
# 1) deterministic data
python3 scripts/billing_data.py                 # yesterday (UTC)
python3 scripts/billing_data.py --date 2026-05-26 --tz Asia/Ho_Chi_Minh --budget 3500
#    flags: --all-projects  (include *-staging)
#    -> writes reports/billing-data-<d1>.json

# 2) Claude authors reports/gcp-cost-<d1>.md from that JSON + config/, per SKILL.md
```

- "App" = GCP project; production only by default. Cost basis = gross `SUM(cost)`.
- Service names are normalized (Firestore/Storage, Cloud Functions, Cloud Run, …);
  function cost comes from the `goog-drz-cloudfunctions-id` label.
- Curated app metadata in `config/apps.json`; budget/thresholds in `config/settings.json`;
  optimization templates in `config/suggestions.json`. Target layout: `docs/example-report.md`.

Requires `bq` (authenticated gcloud) + `python3` (stdlib only). Read-only. `reports/` is gitignored.
See `SKILL.md` for the full authoring guide.
