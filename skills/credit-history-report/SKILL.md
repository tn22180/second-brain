---
name: credit-history-report
description: Use when the user asks for a credit usage / credit history report, daily/weekly/monthly AI credit totals, per-shop credit breakdown, or top shops by credit usage. SEO app via BigQuery view `avada-seo.firestore_export.creditHistories_daily_long`; Blog (avada-blog-app) and APC (ai-product-copy) via direct Firestore REST (scripts/app_credit_report.py). Supports single-shop and aggregate modes.
---

# Credit History Report

Generates credit usage reports from the BigQuery mirror of Firestore
`shops/{shopId}/creditHistories`. Two modes: **single-shop** (drill-down for one
shop) and **aggregate** (top N shops in the project).

Data source: BigQuery view `avada-seo.firestore_export.creditHistories_daily_long`
— populated in realtime by the `firestore-bigquery-export` Firebase Extension. See
the Avada SEO repo's `bigquery/README.md` for the pipeline details.

## Units: credits, never tokens

`usage` counts **credits**. The underlying Firestore document is a per-shop,
per-day map — `{seoOnPageAudit: 4, imageAltText: 120, totalUsage: 124}` — with one
key per feature. There are no token counts anywhere upstream, so no report can
show them. Report per-feature credits instead.

## Never join the shops tables

Resolving shop domains through `shops_raw_changelog` or `shops_raw_latest` reads
their `data` column, which makes BigQuery scan the entire JSON blob: measured at
**139 GB, ~$0.70 per run** against **216 MB** for the credit view alone. Both
scripts resolve domains with a free Firestore `:batchGet` after the query instead.
Check any new query with `bq query --dry_run` before running it.

## Ranking must break ties

`ORDER BY total_usage DESC` alone is not deterministic: shops tied on the LIMIT
boundary swap between runs and the report changes for no reason. Always add
`shop_id` as a secondary key.

## Preconditions

Confirm `bq` is authenticated and can read the view:

```bash
gcloud auth list        # an ACTIVE account that can read project avada-seo
bq --project_id=avada-seo query --quiet --use_legacy_sql=false 'SELECT 1'
```

No `GOOGLE_APPLICATION_CREDENTIALS` / no service-account JSON / no `npm install`.

## How to invoke

All dates are UTC (Firestore doc IDs use UTC days).

### Single shop

```bash
python3 ~/.claude/skills/credit-history-report/scripts/query.py --shop <shopId> --date YYYY-MM-DD
python3 ~/.claude/skills/credit-history-report/scripts/query.py --shop <shopId> --week YYYY-Www
python3 ~/.claude/skills/credit-history-report/scripts/query.py --shop <shopId> --from YYYY-MM-DD --to YYYY-MM-DD
```

### Aggregate (top N shops)

```bash
python3 ~/.claude/skills/credit-history-report/scripts/query.py --all --date YYYY-MM-DD
python3 ~/.claude/skills/credit-history-report/scripts/query.py --all --week YYYY-Www
python3 ~/.claude/skills/credit-history-report/scripts/query.py --all --from YYYY-MM-DD --to YYYY-MM-DD [--top 20]
```

### Other apps — Blog & APC (no BigQuery mirror)

`avada-blog-app` and `ai-product-copy` do NOT have the firestore-bigquery-export
extension on credit data; `scripts/app_credit_report.py` reads Firestore directly
(REST, operator gcloud token, read-only):

```bash
python3 ~/.claude/skills/credit-history-report/scripts/app_credit_report.py --app blog --date YYYY-MM-DD
python3 ~/.claude/skills/credit-history-report/scripts/app_credit_report.py --app apc  --date YYYY-MM-DD
```

Schemas (see script docstring):
- **blog** — root `creditLogs`, one doc per event `{shopId, shopDomain, feature,
  status, cost, createdAt}`. `status=TOPUP` rows are grants and are excluded;
  remaining rows' `cost` summed per shop × feature.
- **apc** — root `bulkGenerateProcesses`, one doc per bulk run `{shopId,
  aiCreditAction, creditCost, completedCount, totalCount, createdAt}`.

**apc changed under the report (fixed 2026-07-10).** It used to count `resultGen`
docs. Nothing has been written to `resultGen` since **2026-06-11**, while
generation carried on — so for 29 days the report returned an empty table that
read like "nobody used the app". If a per-app report suddenly shows zero shops,
check that the collection it reads is still being written before believing it.

`creditCost` is stamped at process creation as `totalCount × rate` (1, 2 or 5),
not `completedCount`. A run charged for 6,695 items that finishes 110 still
reports 13,390. `credits/{shop}` holds a balance, not a ledger, so no per-event
figure exists; the meta line prints `items_completed` beside `credits_charged` so
the gap stays visible.

Output: markdown to stdout + `reports/<app>-<date>.{json,csv}`. Note: no
collection-group index exists for `creditHistories`-style queries in these
projects — do not create indexes; the script avoids needing them.

## Telegram post (run by default after the daily aggregate)

After running the **aggregate** mode for the standard daily/weekly summary, post
the compact ranking to the configured Telegram group:

```bash
python3 ~/.claude/skills/credit-history-report/scripts/post_telegram.py        # yesterday (UTC)
# flags: --date YYYY-MM-DD · --week YYYY-Www · --from/--to · --top N · --dry-run
```

**Schedule it after 00:00 UTC.** The default day is `now(UTC).date() - 1` — the last
complete UTC day. Run it at 06:00 Asia/Saigon (23:00 UTC the day before) and that
day is two calendar days back locally: the message is stale but labelled with the
correct older date, so nothing looks wrong. The `com.avada.billing-report`
LaunchAgent runs at 08:00 local (01:00 UTC), which clears midnight UTC with an
hour of margin for the export to settle.

Credentials lookup: this skill's `config/telegram.json` → fall-through to
`~/.claude/skills/avada-billing-report/config/telegram.json` → env vars
(`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` / `TELEGRAM_THREAD_ID`).

**Run this step after `query.py --all` for the standard daily report.** Skip it for
single-shop drill-downs (`--shop ...`) and ad-hoc / one-off ranges the user is
exploring — those answer one person's question and don't belong in the group. When
unsure, dry-run first.

## Output

- Markdown table printed to stdout — paste directly into Slack / doc.
- JSON + CSV written under `~/.claude/skills/credit-history-report/reports/`.
- File naming: `shop-<id>-<range>.{json,csv}` or `all-shops-<range>.{json,csv}`
  (range is `YYYY-MM-DD`, `YYYY-MM-DD_YYYY-MM-DD`, or `YYYY-Www`).

## Interpreting fields

- One column per action: currently `seoOnPageAudit`, `imageAltText`,
  `generateAnchorText`, `generateFaqsInBulk` (whatever the view exposes — see
  "Adding a new action" below).
- `total` is the sum of all actions for that day/shop.
- `shopify_domain` is joined from `shops_raw_changelog` (latest non-deleted state),
  filtered to the small id set first so the join stays cheap.
- "—" in a cell = zero usage in that bucket (filtered out at the view level).

## Adding a new AI_CREDIT_USAGE_ACTION

The view's long-format pivot lists each known action explicitly. When a new
action enum value is added in `packages/functions/src/const/aiCreditUsageAction.js`,
add a matching `STRUCT('newAction', SAFE_CAST(JSON_VALUE(b.data, '$.newAction') AS INT64))`
row to the `exploded` CTE in `bigquery/views/credit_histories_daily_long.sql`
(in the Avada SEO repo) and re-run `bash bigquery/deploy-views.sh`. No code
change is needed in this skill.

## Troubleshooting

- **Access Denied:** active account can't read `avada-seo`. Check
  `gcloud auth list`; the view lives in project `avada-seo`, not staging.
- **Empty results for a shop you expect data on:** dates are UTC. A shop in
  Vietnam timezone running at 07:00 local on 2026-02-17 logs against UTC
  `2026-02-17`, not `2026-02-16`. Try widening with `--from/--to`.
- **`shopify_domain: (unknown)`:** the `shops` document is missing or the
  domain field is empty; the credit data itself is still correct.
- **Source location moved:** override with `BQ_VIEW` / `BQ_SHOPS_TABLE` /
  `BQ_PROJECT` env vars before running.

## Never

- Do not commit `reports/` (gitignored — contains internal shopify_domain values).
- Read-only: this skill never writes to BigQuery or Firestore.
- Do not forward `reports/*.csv` externally without review — contains
  `shopify_domain` (PII-adjacent).
