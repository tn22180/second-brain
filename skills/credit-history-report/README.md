# credit-history-report

Query AI credit usage from the BigQuery view
`avada-seo.firestore_export.creditHistories_daily_long` (mirror of Firestore
`shops/{shopId}/creditHistories`) and produce daily/weekly/range reports.

## Setup

Only the local `bq` CLI and `gcloud` auth are needed — **no service-account JSON,
no `npm install`**.

```bash
gcloud auth list      # an ACTIVE account with read access to project avada-seo
bq --project_id=avada-seo query --quiet --use_legacy_sql=false 'SELECT 1'   # smoke test
```

## Usage

Single shop:

```bash
python3 scripts/query.py --shop <shopId> --date 2026-05-26
python3 scripts/query.py --shop <shopId> --week 2026-W21
python3 scripts/query.py --shop <shopId> --from 2026-05-01 --to 2026-05-26
```

All shops (aggregate, top N):

```bash
python3 scripts/query.py --all --date 2026-05-26
python3 scripts/query.py --all --week 2026-W21
python3 scripts/query.py --all --from 2026-05-01 --to 2026-05-26 --top 20
```

## Output

- Markdown table to stdout (paste to Slack/doc)
- `reports/<prefix>-<range>.json`
- `reports/<prefix>-<range>.csv`

Reports contain `shopify_domain` — do not share externally without review.

## Env overrides

- `BQ_PROJECT` — billing project for bq jobs (default `avada-seo`).
- `BQ_VIEW` — fully-qualified view name (default `avada-seo.firestore_export.creditHistories_daily_long`).
- `BQ_SHOPS_TABLE` — fully-qualified shops changelog (default `avada-seo.firestore_export.shops_raw_changelog`).

## Troubleshooting

- **Access Denied** — the active gcloud account can't read `avada-seo`. Check
  `gcloud auth list` / `gcloud auth login`.
- **Empty results for a shop you expect data on** — dates are UTC. A shop in
  Vietnam timezone running at 07:00 local on 2026-02-17 logs against UTC
  `2026-02-17`, not `2026-02-16`. Try widening with `--from/--to`.
- **A new AI action is missing** — add it to the view's `exploded` CTE in the
  Avada SEO repo (`bigquery/views/credit_histories_daily_long.sql`) and run
  `bash bigquery/deploy-views.sh`. No code change needed in this skill.

## What changed (2026-05-28)

This skill switched from a Node.js + firebase-admin + service-account-JSON path
to a Python + `bq` CLI + gcloud auth path. Same CLI surface (`--shop / --all`,
`--date / --week / --from-to`, `--top`), same output (markdown + JSON + CSV).
The underlying source is the BigQuery mirror of Firestore created by the
`firestore-bigquery-export` extension — see `bigquery/README.md` in the SEO repo
for the pipeline.
