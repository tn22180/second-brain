---
name: credit-report-bigquery-cost
description: Joining shops_raw_* to resolve domains costs 139 GB per BigQuery run; resolve via Firestore batchGet instead
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c530a18-e6a5-49ce-9a53-e3c0cec30190
---

Any BigQuery query that reads the `data` column of `shops_raw_changelog` or `shops_raw_latest` scans the entire JSON blob. Measured with `bq query --dry_run` on 2026-07-09: **139.53 GB, ~$0.70 per run**, versus **216 MB (~$0.001)** for `creditHistories_daily_long` alone. `shops_raw_latest` alone is 277 GB.

Both `credit-history-report/scripts/query.py` and `post_telegram.py` used to join it just to turn `shop_id` into `shopifyDomain`. `post_telegram.py` runs daily at 06:00 via the `com.avada.billing-report` LaunchAgent, so that join was burning roughly $21/month. Both now resolve domains with a single free Firestore `:batchGet` on `shops/{id}?mask.fieldPaths=shopifyDomain` after the query returns. Purged shops come back `missing` and fall back to the raw id, matching the old `IFNULL` behaviour.

**Always `bq query --dry_run` before running a new query against this dataset.**

Second trap found the same day: `ORDER BY total_usage DESC LIMIT N` has no tiebreak, so shops tied on the boundary swapped between runs and the daily Telegram message changed for no reason. Six shops were tied at exactly 100 credits on 2026-07-08. Both scripts now sort by `(usage DESC, shop_id)`. Related: [[credit-not-tokens]], [[daily-manager-page]].
