# Per-feature credit report — design

Date: 2026-07-09
Status: approved pending implementation

## Problem

The reports answer "how many credits did this shop spend" but bury "which
features did they use". The daily-manager board already shows the flat credit
total, so the report duplicates it and adds nothing. Feature-level detail is
the part nobody can see today.

## Non-goal: tokens

The original request asked for **tokens per feature**. Tokens are not
available and the report must not pretend otherwise.

Findings (verified 2026-07-09):

- `creditHistories` docs hold only per-action credit counters. A raw doc:
  `{date, imageAltText: 5417, totalUsage: 5417, updatedAt}`. No token field.
- The backend *does* extract token usage from every LLM provider
  (`packages/functions/src/helpers/extractLLMUsage.js`; OpenAI, Claude,
  OpenRouter, NineRouter), but persists it for exactly one action:
  `BULK_AI_FIX`, written to `shops/{shopId}/aiFixJobs/{jobId}.totalTokens`.
- The other four actions — `SEO_ON_PAGE_AUDIT`, `GENERATE_FAQS_IN_BULK`,
  `IMAGE_ALT_TEXT`, `GENERATE_ANCHOR_TEXT` — discard token counts after the
  call. Their credit cost is flat per item, not token-derived.

Reporting tokens for 1 of 5 actions would produce a table that reads as
"these features used no tokens". Tokens are therefore out of scope. Making
them reportable requires a backend change (persist tokens into
`creditHistories`) plus a BigQuery view update, and would only cover data
from the deploy date forward — no backfill is possible.

## Non-goal: item counts

Dropped for the same reason. Blog (`creditLogs`, one doc per event) and APC
(`resultGen`, one doc per item) can count items honestly. SEO cannot: its
`creditHistories` doc is a per-day rollup with no event count, and credits do
not map 1:1 to items (anchor text costs 1/item, FAQ costs `numberOfFaqs`,
meta costs 1). A column that is real for two apps and fabricated for the
third is worse than no column.

## Output

Every report becomes three tables, ordered day → feature → shop.

### 1. Feature × day

```
| date       | imageAltText | seoOnPageAudit | ... | total   |
| 2026-07-01 |       58,120 |         14,003 | ... |  78,883 |
| **TOTAL**  |      412,905 |         98,220 | ... | 557,315 |
```

Omitted entirely when the range is a single day (it would be one row).
Days with no usage still print, all cells `—`, so dead days are visible.

### 2. Feature rollup for the range

```
| feature      | credits | %     | shops |
| imageAltText | 412,905 | 74.1% |    38 |
```

- `shops` = count of distinct shops with usage > 0 for that feature.
- The TOTAL row's `shops` is the distinct shop count across the range, **not**
  the sum of the column — one shop uses several features.
- `%` = feature credits / range total, one decimal. The final row is forced to
  `100%` if rounding drifts.

### 3. Shop table (unchanged content, reordered)

`total` moves from column 4 to the last column so the feature columns lead.

`--top` applies **only** to the shop table. The day matrix and the feature
rollup are computed over all shops; restricting them to top-N would make the
percentages wrong.

Feature columns are always derived from the data, never hardcoded, matching
today's behaviour (`query.py:166`).

## Architecture

New `scripts/render.py` — pure formatting, no network I/O:

```python
def day_matrix(rows, features)   # feature × day table
def feature_rollup(rows)         # [{feature, credits, pct, shops}]
def shop_table(rows, features)   # total last
def fmt(n)                       # "—" when zero (moved from query.py:148)
```

Both report scripts normalise their source into a common row shape
`[{date, shop_id, feature, credits}]` and hand it to `render.py`. One place
to change a table, all three apps follow.

| app  | source                    | mapping |
|------|---------------------------|---------|
| SEO  | BigQuery view             | `event_date, shop_id, action, usage`. Add `event_date` to the `GROUP BY` in `SQL_ALL_SHOPS`, which currently drops it (`query.py:108-112`). |
| Blog | `creditLogs`              | `createdAt→date, shopId, feature, cost`. `status=TOPUP` stays excluded (`app_credit_report.py:145`). |
| APC  | `resultGen`               | `createdAt→date, shopId, "pageType.contentType", count`. |

APC stores no credit amount. Its tables are headed `generations`, not
`credits`, and keep the existing `unit: generations (1 ≈ 1 credit)` meta line
(`app_credit_report.py:188`). The two units are not conflated.

## CLI

`app_credit_report.py` gains `--week YYYY-Www` and `--from/--to`, matching
`query.py`. It has only ever accepted a single `--date`. Ranges loop day by
day: one `runQuery` per day, plus one `batchGet` per day for APC's parent
`bulkGenerateProcesses` docs. A seven-day range is roughly 7× the reads of a
single day. Progress is logged per day to stderr, as the existing per-batch
counter already does (`app_credit_report.py:106`).

## Edge cases

- Blog docs missing `feature` → `(unknown)`, preserving current behaviour
  (`app_credit_report.py:149`).
- A new `AI_CREDIT_USAGE_ACTION` value appearing in data gets its own column
  with no code change.

## Files

- `scripts/render.py` — new
- `scripts/query.py` — SQL gains `event_date`; delegates rendering
- `scripts/app_credit_report.py` — range flags, day loop; delegates rendering
- `SKILL.md` — new CLI, and a note that tokens are not persisted for 4 of 5
  actions
- `scripts/post_telegram.py` — untouched, per the requirement that the
  notification message stays as-is

No backend change. No new Firestore index. The skill stays read-only.

## Blocker

The disk is full: `/System/Volumes/Data` is at 100%, 892Mi free, and a
`sed` invocation already failed with `ENOSPC`. `write_outputs()` writes
`reports/*.json` and `reports/*.csv` and will fail. Free space before running
the scripts for real.
