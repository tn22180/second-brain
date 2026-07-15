# Credit History Report Skill — Design

**Date:** 2026-04-21
**Status:** Draft — awaiting user review
**Owner:** Tony

## Purpose

Provide a user-level Claude Code skill that generates credit usage reports from the `shops/{shopId}/creditHistories` Firestore sub-collection, for ad-hoc daily, weekly, or custom date-range reporting. Supports both single-shop drill-downs and system-wide aggregates.

## Scope

**In scope:**
- Query `creditHistories` sub-collection for one shop or all shops.
- Filter by a single date, an ISO week, or an arbitrary `from`/`to` range.
- Produce a markdown table in the terminal AND persist JSON + CSV files to a `reports/` folder inside the skill directory.
- Authenticate via a user-provided Firebase service account, read from env var `GOOGLE_APPLICATION_CREDENTIALS`.

**Out of scope:**
- Scheduling / recurring runs (user can wrap with cron later).
- Writing to Firestore — read-only.
- Cross-project comparisons (staging vs prod) in a single run.
- Anything visual beyond terminal markdown.

## Data Source

**Collection path:** `shops/{shopId}/creditHistories/{YYYY-MM-DD}`

**Document fields:**
- `date` — Firestore `Timestamp`, UTC midnight of the day.
- `totalUsage` — `number`, sum of all action increments for that day.
- `generateFaqsInBulk` — `number`, per-action increment (current feature tracked).
- `updatedAt` — Firestore `Timestamp`.

**Parent shop doc (`shops/{shopId}`):** needs field `shopifyDomain` (string) — included in output to make shopIds human-identifiable.

**Note on extensibility:** the repo writes action names dynamically via `FieldValue.increment(data[key])` (see `creditHistoryRepository.js:46-51`). The skill must treat any non-standard field (not in `['date', 'totalUsage', 'updatedAt']`) as an additional action bucket, not hardcode only `generateFaqsInBulk`.

## Architecture

**Location:** `~/.claude/skills/credit-history-report/` (user-level, not committed to this repo).

**Layout:**
```
~/.claude/skills/credit-history-report/
├── SKILL.md                ← Frontmatter + invocation instructions for Claude
├── README.md               ← Human setup instructions
├── scripts/
│   ├── query.js            ← CLI entry point
│   └── package.json        ← firebase-admin, date-fns
├── reports/                ← Output JSON/CSV (gitignored if .git exists)
└── .gitignore              ← ignores reports/ and node_modules/
```

**Runtime:** Node 20+, firebase-admin SDK.

## CLI Interface

```bash
node scripts/query.js [mode] [range] [options]
```

**Mode (exactly one required):**
- `--shop <shopId>` — single-shop report
- `--all` — aggregate across all shops

**Range (exactly one required):**
- `--date YYYY-MM-DD` — single day
- `--week YYYY-Www` — ISO week, e.g. `2026-W07`
- `--from YYYY-MM-DD --to YYYY-MM-DD` — custom range (inclusive)

**Options:**
- `--top N` — (aggregate mode only) limit top-N shops in the table. Default: 10.
- `--project <projectId>` — override Firestore project ID (else taken from service account).
- `--out <dir>` — override output directory (default: `reports/` inside skill).

**Env:**
- `GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json` — **required**.
- `FIRESTORE_PROJECT_ID=<project>` — optional override.

## Data Flow

### Single-shop mode
1. Parse range → compute UTC start/end `Date`.
2. Query `shops/{shopId}/creditHistories` where `date >= start AND date <= end`, order by `date asc`.
3. Fetch parent shop doc to get `shopifyDomain`.
4. Print markdown table (one row per day) + total.
5. Save JSON + CSV.

### Aggregate mode
1. Parse range.
2. **Collection group query** on `creditHistories` filtered by date range. This avoids iterating every shop.
   - Fallback if collectionGroup index is missing: list all shop IDs, then per-shop fetch with bounded concurrency (`p-limit` 10).
3. Group results by `shopId` (parent path), sum `totalUsage` and each action bucket per shop.
4. Batch-fetch `shopifyDomain` for each shopId that has data (single `getAll()` call).
5. Sort by `totalUsage` desc, take top-N for the markdown table; full list goes to JSON/CSV.
6. Print summary (shops-with-activity, totals) + top-N table.
7. Save JSON + CSV.

## Output

### Terminal (markdown)

Single-shop:
```
# Credit History — abc123 (example.myshopify.com)
Range: 2026-02-10 → 2026-02-16

| date       | generateFaqsInBulk | totalUsage |
|------------|-------------------:|-----------:|
| 2026-02-10 |                120 |        120 |
| 2026-02-11 |                 85 |         85 |
| …          |                 … |          … |
| **Total**  |            **205** |    **205** |

Saved: reports/shop-abc123-2026-02-10_2026-02-16.json
Saved: reports/shop-abc123-2026-02-10_2026-02-16.csv
```

Aggregate:
```
# Credit History — All Shops
Range: 2026-02-10 → 2026-02-16

- Shops with activity: 42
- Total usage: 12,450
- generateFaqsInBulk: 12,450

## Top 10 shops

| shopId | shopifyDomain         | totalUsage | generateFaqsInBulk |
|--------|-----------------------|-----------:|-------------------:|
| abc123 | example.myshopify.com |      2,100 |              2,100 |
| …      | …                     |          … |                  … |

Saved: reports/all-shops-2026-02-10_2026-02-16.json
Saved: reports/all-shops-2026-02-10_2026-02-16.csv
```

### File output

**JSON shape (single-shop):**
```json
{
  "mode": "single-shop",
  "shopId": "abc123",
  "shopifyDomain": "example.myshopify.com",
  "range": {"from": "2026-02-10", "to": "2026-02-16"},
  "total": {"totalUsage": 205, "generateFaqsInBulk": 205},
  "days": [
    {"date": "2026-02-10", "totalUsage": 120, "generateFaqsInBulk": 120}
  ]
}
```

**JSON shape (aggregate):**
```json
{
  "mode": "aggregate",
  "range": {"from": "2026-02-10", "to": "2026-02-16"},
  "summary": {"shopsWithActivity": 42, "totalUsage": 12450, "byAction": {"generateFaqsInBulk": 12450}},
  "shops": [
    {"shopId": "abc123", "shopifyDomain": "example.myshopify.com", "totalUsage": 2100, "byAction": {"generateFaqsInBulk": 2100}}
  ]
}
```

**CSV:** one row per day (single-shop) or per shop (aggregate). Columns mirror the JSON flat fields.

## Error Handling

- **Missing `GOOGLE_APPLICATION_CREDENTIALS`:** exit 1, human-readable message pointing to README.
- **Invalid date/week format:** exit 2, show accepted formats.
- **Both or neither of `--shop`/`--all`:** exit 2, show usage.
- **No data in range:** exit 0, print "no credit history found" and still save an empty JSON (for idempotent pipelines).
- **Firestore permission denied / project mismatch:** surface the raw message — user most likely needs a different SA.
- **Collection-group index missing:** catch the Firestore error, print the exact console URL from the error message so the user can create the index in one click.

## Test Plan

Before declaring the skill done, test with **real staging data** (`avad-seo-staging`):

1. Install deps, run `--shop <realShopId> --date <knownDate>` → expect non-empty output matching Firestore console.
2. Run `--shop <realShopId> --from <d1> --to <d2>` spanning 3+ days → verify sum equals per-day sum.
3. Run `--all --date <recentDate> --top 5` → verify top-5 matches manual spot check.
4. Run with missing env var → verify error path.
5. Run with a shopId that has no `creditHistories` → verify "no data" path.

Tests are manual exploratory runs, not automated. The skill is a thin CLI; automating these would require a Firestore emulator fixture which is out of scope.

## Security

- SA path only comes from env var — never committed, never logged.
- No shop data is logged beyond what the report prints.
- Read-only — no `.set()`/`.update()` calls anywhere.
- Output files may contain shopifyDomains (PII-adjacent); README warns users before sharing externally.

## Open Questions

None at design time. All clarified during brainstorm:
- Scope: both single-shop and aggregate (user chose C).
- Output: all of markdown + JSON + CSV (user chose D).
- Auth: env var only, no file in skill folder.
- Identifier: both `shopId` and `shopifyDomain` in output.
