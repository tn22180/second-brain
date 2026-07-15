---
name: avada-billing-report
description: Use when the user wants the daily/date-range GCP cost report for Avada apps, per-app (per-project) GCP spend, "how much did app X cost on GCP", a billing summary / cost-by-service / top Cloud Functions / optimize-cost report from the avada-seo BigQuery billing export, or asks to regenerate the gcp-cost-<date>.md report. Reads the gcp_billing_export table via the local bq CLI (gcloud auth).
---

# Avada Billing Report

Produces the **daily GCP cost report** (Vietnamese, multi-app) from the `avada-seo`
BigQuery billing export. Two stages:

1. **Data** (deterministic): `scripts/billing_data.py` runs one `bq` query and writes
   `reports/billing-data-<d1>.json` with every number the report needs.
2. **Authoring** (you, following this guide): turn that JSON + `config/*` into the
   styled markdown and save it to `reports/gcp-cost-<d1>.md`.

"App" = a GCP **project**. `d1` = the report day (yesterday by default), `d2` = the day
before. **Cost basis = gross `SUM(cost)`** (before credits). All money is USD unless the
data says otherwise.

## Preconditions

```bash
gcloud auth list        # an ACTIVE account that can read project avada-seo
```
If `bq` fails with permission errors, ask the user to run `! gcloud auth login`.
Requires `python3` (stdlib only).

## One-command path (recommended)

```bash
python3 ~/.claude/skills/avada-billing-report/scripts/render_report.py        # yesterday
# flags: --date YYYY-MM-DD · --tz Asia/Ho_Chi_Minh · --all-projects · --budget 3500
#        --no-refresh (reuse cached data) · --data PATH · --out PATH
```
`render_report.py` calls `billing_data.py` internally, then writes `reports/gcp-cost-<d1>.md`.
This is the right entrypoint for routine daily runs.

## Telegram post (run by default after the daily render)

After the markdown is written, post the compact summary to the configured Telegram
group so the team sees yesterday's cost without opening the file, then upload the full
`reports/gcp-cost-<d1>.md` as a document so viewers can read the detail:

```bash
python3 ~/.claude/skills/avada-billing-report/scripts/post_telegram.py        # latest cached data
# flags: --date YYYY-MM-DD · --dry-run (preview without sending)
#        --no-document (summary only, skip the .md upload)
```

Reads the same `reports/billing-data-<d1>.json` and posts via `config/telegram.json`
(or `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` env vars). Silently skips with exit 2
if neither is configured. After the summary message it uploads the styled
`reports/gcp-cost-<d1>.md` via `sendDocument` (multipart, urllib only); if that file
is missing it warns and skips the upload — run `render_report.py` first so the detail
file exists. `--dry-run` previews only the summary text and never uploads.

**Always run this step after `render_report.py` for the standard daily/date-range
report**, unless the user explicitly says "no Telegram", asks only for a specific
slice (single app, custom services breakdown, etc.), or is iterating on the report
content. When in doubt, dry-run first and show the user the message before posting.

## Manual two-stage path

Use this when you want to inspect the data before authoring, or want to write the report
yourself with judgment beyond the templates.

### Step 1 — generate the data

```bash
python3 ~/.claude/skills/avada-billing-report/scripts/billing_data.py        # yesterday, UTC
# flags: --date YYYY-MM-DD · --tz Asia/Ho_Chi_Minh · --all-projects · --budget 3500
```
It prints the data-file path on stdout and a summary on stderr. Load the JSON before authoring.

The query already buckets raw GCP services into friendly names: **Firestore / Storage**
(any `Cloud Firestore *` SKU, Cloud Storage, GCS Storage — note Firestore bills under the
"App Engine" service), **Cloud Functions** (Cloud Run Functions), **Cloud Run**, **Logging**,
**Pub/Sub**, **Scheduler**; everything else keeps its raw name. Function-level cost comes
from the `goog-drz-cloudfunctions-id` label; rows without it are `(untagged)`.

### Step 2 — author `reports/gcp-cost-<d1>.md`

Read `config/apps.json`, `config/settings.json`, `config/suggestions.json`. Then render the
sections below. Match the layout of `docs/example-report.md` exactly (emoji, Vietnamese
headings, right-aligned money columns, `$` prefix, 2 decimals).

### Which projects get a full section
- **Marketplace first:** projects whose `project_name` matches a `marketplacePatterns`
  regex (e.g. "Use of …") are NOT apps — set them aside for one row under
  `marketplaceLabel` in the final totals area.
- **Full section:** any remaining project with `r30 ≥ otherThreshold`, ordered by `r30`
  desc. Use `apps.json` for emoji/name/description; fall back to `project_name` +
  `defaultEmoji` if absent.
- **Other apps:** remaining projects with `r30 < otherThreshold` → one compact table
  (apps.json naming when present, else `defaultEmoji`), no per-app deep section.

### Display names / emoji
From `apps.json` by `project_id`; fall back to `project_name` + `defaultEmoji`.

### Formatting (match the example exactly)
- Money: `$1234.56` — 2 decimals, **no thousands separator**. Estimates get a `~` prefix.
- Percent: one decimal, e.g. `47.7%`.
- DoD deltas: `<tăng|giảm> +$3.96` / `-$1.25` then ` ($<d2> → $<d1>)` (sign+`$` before the number).
- Cap the **Top Cloud Functions** table and the **🔧 Functions** optimize table at the top
  ~30 by cost; append `_… và <N> functions khác (tổng ~$X)_` for the remainder.

### Function camelCase
Billing function ids are lowercased (`lighthouseauditrunnergen2`). Recover source casing:
for an app with a `functionsRepo` path, collect exported function names (e.g.
`grep -rhoE "exports\\.[A-Za-z0-9_]+" <functionsRepo>` or the project's handler exports),
build a `lower(name) → name` map. For ids ending `gen2`, map the base then append `Gen2`.
Keep hyphenated ids (`changelogtriggers-shopinfos`) as-is if unmatched. If no repo is
available for that app, show the id as-is but prettify a trailing `gen2` → `Gen2`.

### Header block
```
# GCP Daily Cost Report

| | |
|---|---|
| **Thời gian** | <now in settings.reportTimezoneDisplay> (<tz name>) |
| **DoD** | <d2> → <d1> |
| **MTD** | <monthStart> → <d1> (<mtdDays> ngày) |
| **Rolling 30** | <r30Start> → <r30End> |
| **Nguồn** | BigQuery Billing Export |

---
```

### Per-app section (repeat per app)
```
## <emoji> <name>
> <description>
> Project: `<project_id>` | Nguồn: BigQuery Billing Export

### 💰 Tổng quan
|  | Tháng này (MTD) | Rolling 30 ngày |
|--|---:|---:|
| Thực tế | $<mtd> (<mtdDays> ngày) | $<r30> (30 ngày) |
| Trung bình / ngày | ~$<mtdAvg> | ~$<r30Avg> |
| **Ước tính tháng** | **~$<mtdEstimate>** | **~$<r30Estimate>** |

### 📈 Biến động ngày
| | Ngày kia (<d2>) | Hôm qua (<d1>) | Thay đổi |
|---|---|---|---|
| Chi phí | $<d2Cost> | **$<d1Cost>** | **<+/-pct%> <📈/📉>** |
```
- Append ` ⚠️` to the change cell when `abs(pct) ≥ 20`.
- **Nguyên nhân chính:** from `dodCauses` — list the 2-3 biggest `services` deltas, then
  the 2-3 biggest `functions` deltas (skip near-zero |delta| < 0.05). Format:
  `- **<bucket>**: <tăng/giảm> <+/-$delta> ($<d2> → $<d1>)` and
  `- fn \`<camelName>\`: <tăng/giảm> <+/-$delta> ($<d2> → $<d1>)`.
  Omit the whole block if there are no meaningful movers.

```
### 🗂️ Chi phí theo Service *(Rolling 30 ngày)*
| Service | Chi phí | % | Ước tính tháng |
|---------|--------:|--:|---------------:|
```
One row per `services[]` entry: `$cost`, `pct%`, `~$cost` (R30 cost ≈ monthly estimate).

```
### ⚡ Top Cloud Functions *(Rolling 30 ngày)*
> Tổng Functions: **$<functionsTotal>**
| # | Function | Chi phí | % | Ước tính tháng |
|---|----------|--------:|--:|---------------:|
```
One row per `functions[]` entry. Rank emoji: **#1 🔴 · #2 🟡 · #3-5 🟠 · #6+ ⚪**.
Show the camelCase name in backticks (`(untagged)` stays literal).

```
### 💡 Gợi ý Optimize
> 💰 **Budget**: R30 estimate **~$<r30Estimate>**/tháng → Target **$<budgetTarget>** → <dưới budget $X 🟢 | vượt budget $X 🔴>

**🔧 Functions:**
| Function | Cost | Gợi ý |
|----------|-----:|-------|
```
For each function (skip `(untagged)`), pick the suggestion from `suggestions.functionRules`
(first regex matching the camelCase name, case-insensitive) else `functionDefault`. For the
#1 function, prefix the suggestion with `⚠️ <pct>% Cloud Fn → ưu tiên #1 · `.
```
**🛠️ Services:**
```
Bulleted list for each service bucket present in `suggestions.serviceBullets` (skip
Cloud Functions — covered above): `- **<bucket>** ($<r30 cost>): <bullet text>`.

### Final section
```
---
## 🎯 Mục tiêu: Optimize về $<budgetTarget>/tháng
> **R30 estimate hiện tại: ~$<totals.r30Estimate>/tháng → Target: $<budgetTarget> → <Cần cắt: ~$gap (pct%) 🔴 | Dưới budget ~$X 🟢>**

| App | Estimate/tháng (R30) | % tổng | Mục tiêu |
|-----|---:|---:|---:|
```
One row per app (and a Marketplace/Other row). `% tổng` = app r30Estimate / totals.r30Estimate.
**Mục tiêu (target allocation):** if over budget, the highest-cost app absorbs the entire
gap (`target = its estimate − gap`, mark *(cắt ~$gap)*); all others keep their estimate with
`✅ ổn`. If under budget, every app is `✅ ổn`.

Then, **only if over budget**, a prioritized deep-dive for the top app: walk its biggest
cost items (services from `services[]` + top functions), each as `#### N. **<item>** — ~$<cost>/tháng`
with a priority tag (🔴 cao for the top few, 🟡 trung bình after) and concrete steps drawn
from the suggestion templates. Close with a `## 💰 Tổng <N> apps` table (MTD/R30 actual +
estimate, budget target, gap).

## Quick reference
| Need | Where |
|------|-------|
| The numbers | `reports/billing-data-<d1>.json` (from Step 1) |
| Emoji / name / description / repo | `config/apps.json` |
| Budget, thresholds, marketplace rule | `config/settings.json` |
| Suggestion templates | `config/suggestions.json` |
| Layout to match | `docs/example-report.md` |
| Estimate formulas | MTD: mtd/mtdDays×daysInMonth · R30: r30 (≈ month) — already in JSON |

## Troubleshooting
- **Access Denied:** active account can't read `avada-seo` (`gcloud auth list`). The table is in `avada-seo`, not staging.
- **`(untagged)` dominates Functions:** expected — many Gen2 rows lack the function-id label; report it as-is, don't hide it.
- **App missing nice name/emoji:** add it to `config/apps.json`.
- **Source table moved:** set `BILLING_PROJECT` / `BILLING_DATASET` / `BILLING_TABLE` env vars.

## Never
- Do not commit `reports/` (gitignored — internal project names & spend).
- Read-only: never writes to BigQuery.
- No service-account JSON / hardcoded creds — relies on the operator's gcloud auth.
