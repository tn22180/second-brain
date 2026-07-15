# Per-Feature Credit Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the credit reports show which features shops used, broken down by day, instead of leading with a flat credit total the dashboard already shows.

**Architecture:** A new pure-formatting module `scripts/render.py` owns all three tables (feature × day, feature rollup, shop table). Each app script aggregates its own source into the shapes `render.py` consumes, then delegates every line of markdown to it. SEO aggregates in BigQuery; Blog and APC aggregate in Python because they already pull raw event documents.

**Tech Stack:** Python 3 stdlib only. `bq` CLI (gcloud auth) for SEO. Firestore REST for Blog/APC. `unittest` for tests — no pip install, the disk is full.

## Global Constraints

- Read-only. The skill never writes to BigQuery or Firestore.
- No new Firestore index. No backend change.
- `scripts/post_telegram.py` is untouched.
- APC stores no credit amount. Its tables are headed `generations`, never `credits`, and keep the meta line `unit: generations (1 ≈ 1 credit)`.
- `--top` applies only to the shop table. The day matrix and feature rollup are computed over all shops.
- Feature columns are derived from data, never hardcoded.
- All dates are UTC.
- Percentages use one decimal. The TOTAL row is forced to `100.0%` when rounding drifts.
- Zero renders as `—`.
- Do not commit `reports/` (already gitignored).

## Deviation from the spec

The spec proposed normalising all three apps into `[{date, shop_id, feature, credits}]` and rolling up in Python. That is kept for Blog and APC, which already fetch one document per event. It is **dropped for SEO**: the feature rollup must cover every shop, and materialising every `shop × day × action` row locally would be a large transfer for no gain. SEO instead runs three aggregating queries and hands `render.py` the summed results. `render.py` therefore consumes pre-aggregated data, not raw events.

---

### Task 0: Test harness

**Prerequisite, done by the user:** the skill directory is not a git repository
today. Tuan is creating it. Do not run `git init` — confirm the repo exists and
stop if it does not, rather than initialising one in the wrong place.

**Files:**
- Create: `tests/__init__.py`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: a git repo rooted at the skill directory, created by the user
- Produces: `python3 -m unittest discover tests` as the test command for every later task

- [ ] **Step 1: Confirm the repository exists**

```bash
git -C ~/.claude/skills/credit-history-report rev-parse --is-inside-work-tree
```

Expected: `true`. If it errors with `not a git repository`, stop and ask —
the later commit steps have nowhere to land.

- [ ] **Step 2: Confirm `reports/` is ignored**

Run: `cat .gitignore`
Expected: a line matching `reports/`. If absent, append it:

```bash
echo 'reports/' >> .gitignore
```

- [ ] **Step 3: Create the test package**

```bash
mkdir -p tests
touch tests/__init__.py
```

- [ ] **Step 4: Verify the (empty) suite runs**

Run: `python3 -m unittest discover tests -v`
Expected: `Ran 0 tests in 0.000s` followed by `OK`

- [ ] **Step 5: Commit**

```bash
git add .gitignore tests/__init__.py
git commit -m "chore: init repo and unittest harness"
```

---

### Task 1: `fmt` and `features_of`

**Files:**
- Create: `scripts/render.py`
- Create: `tests/test_render.py`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `fmt(n) -> str` — `"—"` for zero/None, thousands-separated integer for whole numbers, two decimals otherwise
  - `features_of(rows) -> list[str]` — sorted distinct `row["feature"]` values

- [ ] **Step 1: Write the failing test**

```python
# tests/test_render.py
import unittest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import render


class TestFmt(unittest.TestCase):
    def test_zero_and_none_render_as_dash(self):
        self.assertEqual(render.fmt(0), "—")
        self.assertEqual(render.fmt(None), "—")
        self.assertEqual(render.fmt(0.0), "—")

    def test_whole_numbers_have_thousands_separators(self):
        self.assertEqual(render.fmt(5417), "5,417")
        self.assertEqual(render.fmt(5417.0), "5,417")

    def test_fractional_credits_keep_two_decimals(self):
        self.assertEqual(render.fmt(12.5), "12.50")


class TestFeaturesOf(unittest.TestCase):
    def test_returns_sorted_distinct_features(self):
        rows = [{"feature": "imageAltText"}, {"feature": "seoOnPageAudit"},
                {"feature": "imageAltText"}]
        self.assertEqual(render.features_of(rows),
                         ["imageAltText", "seoOnPageAudit"])

    def test_empty_input_returns_empty_list(self):
        self.assertEqual(render.features_of([]), [])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest discover tests -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'render'`

- [ ] **Step 3: Write minimal implementation**

```python
# scripts/render.py
"""Pure formatting for credit reports. No network, no filesystem.

Consumes pre-aggregated data — each app script aggregates its own source
(SEO in BigQuery, Blog/APC in Python) and hands the results here.
"""


def fmt(n):
    """Zero renders as an em dash so dead cells are visible."""
    if not n:
        return "—"
    if float(n) == int(n):
        return f"{int(n):,}"
    return f"{float(n):,.2f}"


def features_of(rows):
    return sorted({r["feature"] for r in rows})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest discover tests -v`
Expected: `Ran 5 tests` … `OK`

- [ ] **Step 5: Commit**

```bash
git add scripts/render.py tests/test_render.py
git commit -m "feat: add render.fmt and render.features_of"
```

---

### Task 2: `feature_rollup`

The TOTAL row's `shops` value is the distinct shop count across the whole range, not the column sum — one shop uses several features. The caller supplies it because only the caller knows the full shop set.

**Files:**
- Modify: `scripts/render.py`
- Modify: `tests/test_render.py`

**Interfaces:**
- Consumes: `fmt` from Task 1
- Produces:
  - `feature_rollup(feature_rows, total_shops, unit="credits") -> list[str]`
    where `feature_rows` is `[{"feature": str, "credits": float, "shops": int}]`
    and the return value is markdown lines. Percentages are computed here;
    the row with the largest credits absorbs any rounding drift so the column
    sums to exactly `100.0%`.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_render.py, above the __main__ guard

class TestFeatureRollup(unittest.TestCase):
    def test_orders_by_credits_descending_and_totals(self):
        rows = [{"feature": "seoOnPageAudit", "credits": 250, "shops": 5},
                {"feature": "imageAltText", "credits": 750, "shops": 3}]
        lines = render.feature_rollup(rows, total_shops=6)
        self.assertIn("| feature | credits | % | shops |", lines[0])
        self.assertIn("imageAltText", lines[2])
        self.assertIn("seoOnPageAudit", lines[3])
        self.assertIn("75.0%", lines[2])
        self.assertIn("25.0%", lines[3])

    def test_total_row_uses_supplied_distinct_shop_count(self):
        rows = [{"feature": "a", "credits": 10, "shops": 5},
                {"feature": "b", "credits": 10, "shops": 4}]
        lines = render.feature_rollup(rows, total_shops=6)
        total = lines[-1]
        self.assertIn("**TOTAL**", total)
        self.assertIn("**20**", total)
        self.assertIn("**6**", total)
        self.assertNotIn("**9**", total)

    def test_rounding_drift_is_absorbed_so_column_sums_to_100(self):
        rows = [{"feature": "a", "credits": 1, "shops": 1},
                {"feature": "b", "credits": 1, "shops": 1},
                {"feature": "c", "credits": 1, "shops": 1}]
        lines = render.feature_rollup(rows, total_shops=1)
        pcts = [float(l.split("|")[3].strip().rstrip("%"))
                for l in lines[2:-1]]
        self.assertAlmostEqual(sum(pcts), 100.0, places=6)

    def test_unit_label_is_configurable_for_apc(self):
        rows = [{"feature": "page.body", "credits": 4, "shops": 1}]
        lines = render.feature_rollup(rows, total_shops=1, unit="generations")
        self.assertIn("| feature | generations | % | shops |", lines[0])

    def test_empty_input_says_no_usage(self):
        self.assertEqual(render.feature_rollup([], total_shops=0),
                         ["_No usage in this range._"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest discover tests -v`
Expected: FAIL with `AttributeError: module 'render' has no attribute 'feature_rollup'`

- [ ] **Step 3: Write minimal implementation**

```python
# append to scripts/render.py

def feature_rollup(feature_rows, total_shops, unit="credits"):
    if not feature_rows:
        return ["_No usage in this range._"]

    ranked = sorted(feature_rows, key=lambda r: r["credits"], reverse=True)
    grand = sum(r["credits"] for r in ranked)

    pcts = [round(r["credits"] * 100.0 / grand, 1) if grand else 0.0
            for r in ranked]
    # The biggest row absorbs rounding drift so the column reads 100.0%.
    drift = round(100.0 - sum(pcts), 1)
    if pcts:
        pcts[0] = round(pcts[0] + drift, 1)

    lines = [f"| feature | {unit} | % | shops |", "|---|---|---|---|"]
    for r, pct in zip(ranked, pcts):
        lines.append(f"| {r['feature']} | {fmt(r['credits'])} | "
                     f"{pct}% | {r['shops']} |")
    lines.append(f"| **TOTAL** | **{fmt(grand)}** | **100.0%** | "
                 f"**{total_shops}** |")
    return lines
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest discover tests -v`
Expected: `Ran 10 tests` … `OK`

- [ ] **Step 5: Commit**

```bash
git add scripts/render.py tests/test_render.py
git commit -m "feat: add render.feature_rollup"
```

---

### Task 3: `day_matrix`

Days with no usage still print, all cells `—`, so dead days are visible. The caller supplies the full date list because a day absent from the data is exactly the day we must not silently drop.

**Files:**
- Modify: `scripts/render.py`
- Modify: `tests/test_render.py`

**Interfaces:**
- Consumes: `fmt` from Task 1
- Produces:
  - `day_matrix(cells, features, dates, unit="credits") -> list[str]`
    where `cells` is `{(date, feature): credits}` and `dates` is every date in
    the range as `YYYY-MM-DD` strings, ascending. Returns `[]` when `len(dates) <= 1`
    — a one-row matrix is noise.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_render.py, above the __main__ guard

class TestDayMatrix(unittest.TestCase):
    def test_single_day_range_renders_nothing(self):
        cells = {("2026-07-01", "a"): 5}
        self.assertEqual(
            render.day_matrix(cells, ["a"], ["2026-07-01"]), [])

    def test_days_with_no_usage_still_print_as_dashes(self):
        cells = {("2026-07-01", "a"): 5}
        lines = render.day_matrix(cells, ["a"], ["2026-07-01", "2026-07-02"])
        self.assertIn("2026-07-02", lines[3])
        self.assertIn("—", lines[3])

    def test_row_total_sums_the_features_for_that_day(self):
        cells = {("2026-07-01", "a"): 5, ("2026-07-01", "b"): 7}
        lines = render.day_matrix(cells, ["a", "b"],
                                  ["2026-07-01", "2026-07-02"])
        self.assertIn("12", lines[2])

    def test_total_row_sums_each_feature_column(self):
        cells = {("2026-07-01", "a"): 5, ("2026-07-02", "a"): 6}
        lines = render.day_matrix(cells, ["a"], ["2026-07-01", "2026-07-02"])
        self.assertIn("**11**", lines[-1])

    def test_header_lists_features_then_total(self):
        lines = render.day_matrix({}, ["a", "b"],
                                  ["2026-07-01", "2026-07-02"])
        self.assertEqual(lines[0], "| date | a | b | total |")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest discover tests -v`
Expected: FAIL with `AttributeError: module 'render' has no attribute 'day_matrix'`

- [ ] **Step 3: Write minimal implementation**

```python
# append to scripts/render.py

def day_matrix(cells, features, dates, unit="credits"):
    if len(dates) <= 1:
        return []

    header = ["date"] + list(features) + ["total"]
    lines = ["| " + " | ".join(header) + " |",
             "|" + "---|" * len(header)]

    col_totals = {f: 0 for f in features}
    for d in dates:
        vals = [cells.get((d, f), 0) for f in features]
        for f, v in zip(features, vals):
            col_totals[f] += v
        row = [d] + [fmt(v) for v in vals] + [fmt(sum(vals))]
        lines.append("| " + " | ".join(row) + " |")

    grand = sum(col_totals.values())
    lines.append("| **TOTAL** | "
                 + " | ".join(f"**{fmt(col_totals[f])}**" for f in features)
                 + f" | **{fmt(grand)}** |")
    return lines
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest discover tests -v`
Expected: `Ran 15 tests` … `OK`

- [ ] **Step 5: Commit**

```bash
git add scripts/render.py tests/test_render.py
git commit -m "feat: add render.day_matrix"
```

---

### Task 4: `shop_table`

`total` moves to the last column so the feature columns lead. `--top` truncates here and only here.

**Files:**
- Modify: `scripts/render.py`
- Modify: `tests/test_render.py`

**Interfaces:**
- Consumes: `fmt` from Task 1
- Produces:
  - `shop_table(shop_rows, features, top=20) -> list[str]`
    where `shop_rows` is
    `[{"shop_id": str, "shopify_domain": str|None, "features": {name: credits}}]`.
    Rows are ranked by their feature sum, truncated to `top`, and the trailing
    TOTAL row sums only the rows shown.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_render.py, above the __main__ guard

class TestShopTable(unittest.TestCase):
    def _rows(self):
        return [
            {"shop_id": "s1", "shopify_domain": "a.myshopify.com",
             "features": {"alt": 10, "faq": 5}},
            {"shop_id": "s2", "shopify_domain": None,
             "features": {"alt": 40}},
        ]

    def test_total_is_the_last_column(self):
        lines = render.shop_table(self._rows(), ["alt", "faq"])
        self.assertEqual(lines[0],
                         "| # | shop_id | shopify_domain | alt | faq | total |")

    def test_rows_ranked_by_total_descending(self):
        lines = render.shop_table(self._rows(), ["alt", "faq"])
        self.assertIn("s2", lines[2])
        self.assertIn("s1", lines[3])

    def test_missing_domain_renders_as_dash(self):
        lines = render.shop_table(self._rows(), ["alt", "faq"])
        self.assertIn("| — |", lines[2])

    def test_top_truncates_rows(self):
        lines = render.shop_table(self._rows(), ["alt", "faq"], top=1)
        body = [l for l in lines if l.startswith("| 1 |") or l.startswith("| 2 |")]
        self.assertEqual(len(body), 1)

    def test_total_row_sums_only_displayed_rows(self):
        lines = render.shop_table(self._rows(), ["alt", "faq"], top=1)
        self.assertIn("**40**", lines[-1])

    def test_empty_input_says_no_usage(self):
        self.assertEqual(render.shop_table([], ["alt"]),
                         ["_No usage in this range._"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest discover tests -v`
Expected: FAIL with `AttributeError: module 'render' has no attribute 'shop_table'`

- [ ] **Step 3: Write minimal implementation**

```python
# append to scripts/render.py

def shop_table(shop_rows, features, top=20):
    if not shop_rows:
        return ["_No usage in this range._"]

    def total_of(r):
        return sum(r["features"].values())

    ranked = sorted(shop_rows, key=total_of, reverse=True)[:top]

    header = ["#", "shop_id", "shopify_domain"] + list(features) + ["total"]
    lines = ["| " + " | ".join(header) + " |",
             "|" + "---|" * len(header)]

    col_totals = {f: 0 for f in features}
    grand = 0
    for i, r in enumerate(ranked, 1):
        vals = [r["features"].get(f, 0) for f in features]
        for f, v in zip(features, vals):
            col_totals[f] += v
        grand += total_of(r)
        cells = [str(i), f"`{r['shop_id']}`", r["shopify_domain"] or "—"] \
            + [fmt(v) for v in vals] + [fmt(total_of(r))]
        lines.append("| " + " | ".join(cells) + " |")

    lines.append("| | **TOTAL** | | "
                 + " | ".join(f"**{fmt(col_totals[f])}**" for f in features)
                 + f" | **{fmt(grand)}** |")
    return lines
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest discover tests -v`
Expected: `Ran 21 tests` … `OK`

- [ ] **Step 5: Commit**

```bash
git add scripts/render.py tests/test_render.py
git commit -m "feat: add render.shop_table with total as last column"
```

---

### Task 5: `date_span` helper

Both app scripts need "every date in the range, ascending" — `day_matrix` refuses to invent it. Put it in `render.py` so the day loop in Task 7 and the SEO matrix in Task 6 share one definition.

**Files:**
- Modify: `scripts/render.py`
- Modify: `tests/test_render.py`

**Interfaces:**
- Consumes: nothing
- Produces: `date_span(d_from, d_to) -> list[str]` — inclusive, `YYYY-MM-DD`, accepts `datetime.date`

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_render.py, above the __main__ guard
from datetime import date as _Date


class TestDateSpan(unittest.TestCase):
    def test_inclusive_of_both_ends(self):
        self.assertEqual(
            render.date_span(_Date(2026, 7, 1), _Date(2026, 7, 3)),
            ["2026-07-01", "2026-07-02", "2026-07-03"])

    def test_single_day(self):
        self.assertEqual(render.date_span(_Date(2026, 7, 1), _Date(2026, 7, 1)),
                         ["2026-07-01"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest discover tests -v`
Expected: FAIL with `AttributeError: module 'render' has no attribute 'date_span'`

- [ ] **Step 3: Write minimal implementation**

```python
# add near the top of scripts/render.py, after the docstring
from datetime import timedelta


# append to scripts/render.py

def date_span(d_from, d_to):
    out, d = [], d_from
    while d <= d_to:
        out.append(d.isoformat())
        d += timedelta(days=1)
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest discover tests -v`
Expected: `Ran 23 tests` … `OK`

- [ ] **Step 5: Commit**

```bash
git add scripts/render.py tests/test_render.py
git commit -m "feat: add render.date_span"
```

---

### Task 6: SEO — aggregate in BigQuery, render three tables

`SQL_ALL_SHOPS` currently groups by `shop_id, action` and drops `event_date` (`scripts/query.py:108-112`). Rather than pull every `shop × day × action` row across all shops, add two aggregating queries beside it and let BigQuery do the summing. `--top` still truncates only the shop table.

**Files:**
- Modify: `scripts/query.py` (replace `SQL_ALL_SHOPS` block at lines 107-132, `report_all_shops` at 200-249, and drop the now-unused `fmt` at 148-149 and `pivot` at 135-145)
- Test: manual — this task is I/O against BigQuery and has no unit test. `render.py` is already covered.

**Interfaces:**
- Consumes: `render.day_matrix`, `render.feature_rollup`, `render.shop_table`, `render.features_of`, `render.date_span`, `render.fmt`
- Produces: nothing later tasks depend on

- [ ] **Step 1: Import render and delete the duplicated helpers**

Replace `scripts/query.py` lines 135-149 (the `pivot` and `fmt` definitions) with nothing, and add this import after the existing `from datetime import date as Date, timedelta` line:

```python
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render
from render import fmt
```

`report_single_shop` still calls `fmt`; the `from render import fmt` line keeps it working unchanged.

- [ ] **Step 2: Add the two aggregating queries**

Insert after `SQL_ALL_SHOPS`:

```python
SQL_FEATURE_BY_DAY = """
SELECT event_date, action, SUM(usage) AS usage
FROM `{view}`
WHERE event_date BETWEEN @date_from AND @date_to
GROUP BY event_date, action
"""

SQL_FEATURE_ROLLUP = """
SELECT action,
       SUM(usage) AS usage,
       COUNT(DISTINCT shop_id) AS shops
FROM `{view}`
WHERE event_date BETWEEN @date_from AND @date_to
GROUP BY action
"""

SQL_TOTAL_SHOPS = """
SELECT COUNT(DISTINCT shop_id) AS shops
FROM `{view}`
WHERE event_date BETWEEN @date_from AND @date_to
"""
```

- [ ] **Step 3: Rewrite `report_all_shops`**

Replace the whole function:

```python
def report_all_shops(args, d_from, d_to, slug):
    rng = [("date_from", "DATE", d_from.isoformat()),
           ("date_to", "DATE", d_to.isoformat())]

    day_rows = run_bq(SQL_FEATURE_BY_DAY.format(view=VIEW), rng)
    roll_rows = run_bq(SQL_FEATURE_ROLLUP.format(view=VIEW), rng)
    total_shops = int(run_bq(SQL_TOTAL_SHOPS.format(view=VIEW), rng)[0]["shops"])

    shop_rows_raw = run_bq(
        SQL_ALL_SHOPS.format(view=VIEW, shops_raw=SHOPS_RAW),
        rng + [("top", "INT64", str(args.top))])

    features = sorted({r["action"] for r in roll_rows})
    dates = render.date_span(d_from, d_to)
    cells = {(r["event_date"], r["action"]): int(r["usage"] or 0)
             for r in day_rows}

    rollup = [{"feature": r["action"],
               "credits": int(r["usage"] or 0),
               "shops": int(r["shops"] or 0)} for r in roll_rows]

    by_shop = {}
    for r in shop_rows_raw:
        sid = r["shop_id"]
        s = by_shop.setdefault(sid, {"shop_id": sid,
                                     "shopify_domain": r.get("shopify_domain"),
                                     "features": {}})
        s["features"][r["action"]] = int(r["usage"] or 0)
    shop_rows = list(by_shop.values())

    L = [f"# Credit history — all shops · {d_from} → {d_to}", ""]
    matrix = render.day_matrix(cells, features, dates)
    if matrix:
        L += [f"## By feature × day"] + matrix + [""]
    L += ["## By feature — whole range"] \
        + render.feature_rollup(rollup, total_shops) + [""]
    L += [f"## By shop — top {args.top}"] \
        + render.shop_table(shop_rows, features, top=args.top)
    print("\n".join(L))

    payload = {"range": {"from": d_from.isoformat(), "to": d_to.isoformat()},
               "top": args.top, "features": features,
               "total_shops": total_shops,
               "by_day": [{"date": d,
                           **{f: cells.get((d, f), 0) for f in features}}
                          for d in dates],
               "by_feature": rollup,
               "shops": [{"rank": i, "shop_id": s["shop_id"],
                          "shopify_domain": s["shopify_domain"],
                          "total": sum(s["features"].values()),
                          **{f: s["features"].get(f, 0) for f in features}}
                         for i, s in enumerate(
                             sorted(shop_rows,
                                    key=lambda x: sum(x["features"].values()),
                                    reverse=True), 1)]}
    base = os.path.join(REPORTS, f"all-shops-{slug}")
    write_outputs(base, payload,
                  ["rank", "shop_id", "shopify_domain"] + features + ["total"],
                  [[s["rank"], s["shop_id"], s["shopify_domain"] or ""]
                   + [s.get(f, 0) for f in features] + [s["total"]]
                   for s in payload["shops"]])
```

Note the CSV header now ends with `total`, matching the new column order.

- [ ] **Step 4: Verify against BigQuery — single day**

Run: `python3 ~/.claude/skills/credit-history-report/scripts/query.py --all --date 2026-07-08`
Expected: no `## By feature × day` section (single day), a `## By feature — whole range` table whose `%` column ends at `100.0%`, and a shop table whose last column is `total`.

- [ ] **Step 5: Verify against BigQuery — multi-day**

Run: `python3 ~/.claude/skills/credit-history-report/scripts/query.py --all --from 2026-07-01 --to 2026-07-07`
Expected: a `## By feature × day` table with exactly seven data rows plus a TOTAL row. Its TOTAL row per feature must equal that feature's `credits` in the rollup table. Check one feature by eye.

- [ ] **Step 6: Confirm the rollup is not limited by `--top`**

Run: `python3 ~/.claude/skills/credit-history-report/scripts/query.py --all --date 2026-07-08 --top 1`
Expected: the shop table has one row; the rollup's TOTAL credits is unchanged from Step 4.

- [ ] **Step 7: Commit**

```bash
git add scripts/query.py
git commit -m "feat: per-feature day matrix and rollup for SEO report"
```

---

### Task 7: Blog and APC — date ranges and shared rendering

`app_credit_report.py` accepts only `--date` today (`main()`, line 194). Add `--week` and `--from/--to`, loop the days, and route both apps through `render.py`. APC's unit label stays `generations`.

**Files:**
- Modify: `scripts/app_credit_report.py`

**Interfaces:**
- Consumes: `render.*` from Tasks 1-5; `resolve_range` semantics mirrored from `scripts/query.py:53-72`
- Produces: nothing later tasks depend on

- [ ] **Step 1: Import render and add range parsing**

Add after the existing imports:

```python
import re
import sys as _sys
from datetime import date as Date, timedelta

_sys.path.insert(0, str(Path(__file__).resolve().parent))
import render
```

Add this function, mirroring `query.py`:

```python
def resolve_range(args):
    if args.date:
        d = Date.fromisoformat(args.date)
        return d, d, args.date
    if args.week:
        m = re.match(r"^(\d{4})-W(\d{1,2})$", args.week)
        if not m:
            sys.exit(f"Bad --week '{args.week}' (want YYYY-Www)")
        start = Date.fromisocalendar(int(m.group(1)), int(m.group(2)), 1)
        return start, start + timedelta(days=6), args.week
    if args.date_from:
        if not args.date_to:
            sys.exit("--from requires --to")
        a, b = Date.fromisoformat(args.date_from), Date.fromisoformat(args.date_to)
        if a > b:
            sys.exit("--from is after --to")
        return a, b, f"{a.isoformat()}_{b.isoformat()}"
    sys.exit("Must specify --date, --week, or --from/--to")
```

- [ ] **Step 2: Make `report_blog` and `report_apc` return per-day rows**

Both currently return `(rows, meta)` keyed by shop. Change each to return a flat list of `{"date", "shop_id", "shopify_domain", "feature", "credits"}` for **one** day, so the caller can loop days and concatenate. Replace the tail of `report_blog`:

```python
def report_blog(token, project, date):
    """One row per (shop, feature) for a single UTC day. TOPUP excluded."""
    shops = defaultdict(lambda: defaultdict(float))
    domains, topup_total, topup_events = {}, 0.0, 0
    for doc in run_query_day(token, project, "creditLogs", date,
                             select=["shopId", "shopDomain", "feature",
                                     "status", "cost", "createdAt"]):
        f = doc.get("fields", {})
        sid = fval(f, "shopId", "(unknown)")
        status = (fval(f, "status") or "").upper()
        cost = fval(f, "cost", 0) or 0
        domains[sid] = fval(f, "shopDomain", domains.get(sid, "(unknown)"))
        if status == "TOPUP":
            topup_total += cost
            topup_events += 1
            continue
        feature = fval(f, "feature", "(unknown)") or "(unknown)"
        shops[sid][feature] += cost

    rows = [{"date": date, "shop_id": sid, "shopify_domain": domains.get(sid),
             "feature": feat, "credits": credits}
            for sid, feats in shops.items()
            for feat, credits in feats.items() if credits]
    return rows, {"topup_events_excluded": topup_events,
                  "topup_credits_excluded": topup_total}
```

and of `report_apc`:

```python
def report_apc(token, project, date):
    """One row per (shop, pageType.contentType) for a single UTC day."""
    by_process = defaultdict(int)
    for doc in run_query_day(token, project, "resultGen", date,
                             select=["processId", "createdAt"]):
        pid = fval(doc.get("fields", {}), "processId", "(none)")
        by_process[pid] += 1
    procs = batch_get(token, project,
                      [f"bulkGenerateProcesses/{p}" for p in by_process
                       if p != "(none)"])
    shops = defaultdict(lambda: defaultdict(int))
    for pid, n in by_process.items():
        pf = procs.get(f"bulkGenerateProcesses/{pid}")
        sid = fval(pf, "shopId", "(unknown)") if pf else "(unknown)"
        ctype = (f"{fval(pf, 'pageType', '?')}.{fval(pf, 'contentType', '?')}"
                 if pf else "(unknown)")
        shops[sid][ctype] += n
    shop_docs = batch_get(token, project,
                          [f"shops/{s}" for s in shops if s != "(unknown)"])
    rows = [{"date": date, "shop_id": sid,
             "shopify_domain": fval(shop_docs.get(f"shops/{sid}", {}),
                                    "shopifyDomain", "(unknown)"),
             "feature": ctype, "credits": n}
            for sid, types in shops.items()
            for ctype, n in types.items() if n]
    return rows, {"unit": "generations (1 ≈ 1 credit)"}
```

- [ ] **Step 3: Rewrite `main` to loop days and render**

```python
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True, choices=sorted(APPS))
    rng = ap.add_mutually_exclusive_group(required=True)
    rng.add_argument("--date", help="single day YYYY-MM-DD (UTC)")
    rng.add_argument("--week", help="ISO week YYYY-Www (Mon..Sun, UTC)")
    rng.add_argument("--from", dest="date_from", help="range start (use with --to)")
    ap.add_argument("--to", dest="date_to", help="range end")
    ap.add_argument("--top", type=int, default=20)
    args = ap.parse_args()

    d_from, d_to, slug = resolve_range(args)
    project = APPS[args.app]["project"]
    token = get_token()
    unit = "generations" if args.app == "apc" else "credits"
    report = report_apc if args.app == "apc" else report_blog

    dates = render.date_span(d_from, d_to)
    all_rows, meta = [], {}
    for d in dates:
        print(f"[{d}] querying {project}…", file=sys.stderr)
        rows, day_meta = report(token, project, d)
        all_rows.extend(rows)
        # Blog's meta counts TOPUP rows excluded that day — sum across the
        # range. APC's meta is a constant unit label, so last-wins is fine.
        for k, v in day_meta.items():
            if isinstance(v, (int, float)):
                meta[k] = meta.get(k, 0) + v
            else:
                meta[k] = v

    features = render.features_of(all_rows)
    cells = defaultdict(float)
    for r in all_rows:
        cells[(r["date"], r["feature"])] += r["credits"]

    per_feature = defaultdict(lambda: {"credits": 0.0, "shops": set()})
    per_shop = {}
    for r in all_rows:
        pf = per_feature[r["feature"]]
        pf["credits"] += r["credits"]
        pf["shops"].add(r["shop_id"])
        s = per_shop.setdefault(r["shop_id"],
                                {"shop_id": r["shop_id"],
                                 "shopify_domain": r["shopify_domain"],
                                 "features": defaultdict(float)})
        s["features"][r["feature"]] += r["credits"]

    rollup = [{"feature": f, "credits": v["credits"], "shops": len(v["shops"])}
              for f, v in per_feature.items()]
    total_shops = len({r["shop_id"] for r in all_rows})

    L = [f"# Credit usage — {args.app} · {d_from} → {d_to}", ""]
    if meta:
        L += ["  ".join(f"{k}: {v}" for k, v in meta.items()), ""]
    matrix = render.day_matrix(dict(cells), features, dates, unit=unit)
    if matrix:
        L += ["## By feature × day"] + matrix + [""]
    L += [f"## By feature — whole range"] \
        + render.feature_rollup(rollup, total_shops, unit=unit) + [""]
    L += [f"## By shop — top {args.top}"] \
        + render.shop_table(list(per_shop.values()), features, top=args.top)
    print("\n".join(L))

    ranked = sorted(per_shop.values(),
                    key=lambda s: sum(s["features"].values()), reverse=True)
    shops_out = [{"rank": i, "shop_id": s["shop_id"],
                  "shopify_domain": s["shopify_domain"],
                  **{f: s["features"].get(f, 0) for f in features},
                  "total": sum(s["features"].values())}
                 for i, s in enumerate(ranked, 1)]

    REPORTS_DIR.mkdir(exist_ok=True)
    stem = f"{args.app}-{slug}"
    (REPORTS_DIR / f"{stem}.json").write_text(json.dumps(
        {"app": args.app, "project": project,
         "range": {"from": d_from.isoformat(), "to": d_to.isoformat()},
         "unit": unit, "meta": meta, "features": features,
         "total_shops": total_shops,
         "by_day": [{"date": d, **{f: cells.get((d, f), 0) for f in features}}
                    for d in dates],
         "by_feature": rollup,
         "shops": shops_out}, indent=2, ensure_ascii=False))
    with open(REPORTS_DIR / f"{stem}.csv", "w", newline="") as fcsv:
        w = csv.DictWriter(
            fcsv, ["rank", "shop_id", "shopify_domain"] + features + ["total"])
        w.writeheader()
        w.writerows(shops_out)
    print(f"\nWrote {REPORTS_DIR / (stem + '.json')} and .csv", file=sys.stderr)
```

Delete the local `fmt` defined inside `main` (`app_credit_report.py:217-219`)
— `render.fmt` replaces it. Delete the old inline json/csv/table block it
served (lines 200-238); the code above is its whole replacement.

**Behaviour change to state in the commit message:** the old shop table's
TOTAL row summed *every* shop even when `--top` truncated the display
(`app_credit_report.py:234-235`). `render.shop_table` sums only the rows
shown. The whole-range total now lives in the rollup table, which is computed
over all shops, so no number is lost — but the shop table's TOTAL means
something narrower than it did.

- [ ] **Step 4: Verify Blog, single day**

Run: `python3 ~/.claude/skills/credit-history-report/scripts/app_credit_report.py --app blog --date 2026-07-08`
Expected: no day matrix, a rollup headed `| feature | credits | % | shops |`, the `topup_events_excluded` meta line still present.

- [ ] **Step 5: Verify APC uses the `generations` label**

Run: `python3 ~/.claude/skills/credit-history-report/scripts/app_credit_report.py --app apc --date 2026-07-08`
Expected: rollup header reads `| feature | generations | % | shops |`, and the meta line `unit: generations (1 ≈ 1 credit)` is present. The word `credits` must not appear in any table header.

- [ ] **Step 6: Verify a Blog range loops the days**

Run: `python3 ~/.claude/skills/credit-history-report/scripts/app_credit_report.py --app blog --from 2026-07-01 --to 2026-07-03`
Expected: three `[YYYY-MM-DD] querying avada-blog-app…` lines on stderr, and a day matrix with three data rows.

- [ ] **Step 7: Commit**

```bash
git add scripts/app_credit_report.py
git commit -m "feat: date ranges and per-feature tables for blog and apc"
```

---

### Task 8: Update `SKILL.md`

**Files:**
- Modify: `SKILL.md`

**Interfaces:**
- Consumes: the CLI shipped in Tasks 6 and 7
- Produces: nothing

- [ ] **Step 1: Document the new Blog/APC range flags**

Replace the two example lines under "Other apps — Blog & APC" with:

```bash
python3 ~/.claude/skills/credit-history-report/scripts/app_credit_report.py --app blog --date YYYY-MM-DD
python3 ~/.claude/skills/credit-history-report/scripts/app_credit_report.py --app blog --week YYYY-Www
python3 ~/.claude/skills/credit-history-report/scripts/app_credit_report.py --app apc  --from YYYY-MM-DD --to YYYY-MM-DD
```

Add: "Ranges loop one Firestore query per day — a seven-day range costs roughly 7× the reads of a single day."

- [ ] **Step 2: Rewrite "Interpreting fields"**

```markdown
## Interpreting fields

Reports print three tables, ordered day → feature → shop:

1. **By feature × day** — omitted for single-day ranges. A day with no usage
   still prints, all cells `—`.
2. **By feature — whole range** — credits, share of total, and how many
   distinct shops used that feature. The TOTAL row's `shops` is the distinct
   shop count across the range, not the column sum.
3. **By shop — top N** — `--top` truncates this table only. The rollup and
   the day matrix always cover every shop, otherwise the percentages lie.

`—` in a cell means zero usage in that bucket.

APC has no stored credit amount; its tables are headed `generations`
(1 generation ≈ 1 credit).
```

- [ ] **Step 3: Add the token limitation**

Add a new section before "Never":

```markdown
## Tokens are not reportable

The report shows credits, not tokens. The backend extracts token usage from
every LLM provider but persists it for exactly one action, `BULK_AI_FIX`
(`shops/{shopId}/aiFixJobs/{jobId}.totalTokens`). The other four actions —
`SEO_ON_PAGE_AUDIT`, `GENERATE_FAQS_IN_BULK`, `IMAGE_ALT_TEXT`,
`GENERATE_ANCHOR_TEXT` — discard token counts; their credit cost is flat per
item. Reporting tokens would require persisting them into `creditHistories`
plus a view change, and could not be backfilled.
```

- [ ] **Step 4: Verify the doc matches the code**

Run: `python3 ~/.claude/skills/credit-history-report/scripts/app_credit_report.py --app blog --help`
Expected: the flags listed match the ones documented in Step 1.

- [ ] **Step 5: Commit**

```bash
git add SKILL.md
git commit -m "docs: three-table output, range flags, token limitation"
```

---

## Before running anything

The disk is full — `/System/Volumes/Data` at 100%, 892Mi free, and a `sed`
call already died with `ENOSPC`. `write_outputs()` writes
`reports/*.json` and `reports/*.csv`. Free space before Task 6's
verification steps, or they will fail on the write rather than the query.
