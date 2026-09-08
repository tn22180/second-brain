#!/usr/bin/env python3
"""Avada GCP billing — data engine for the daily per-app cost report.

Runs ONE granular BigQuery query against the avada-seo billing export via the local
`bq` CLI (your gcloud auth — no service-account JSON), then computes every slice the
report needs (MTD, Rolling-30, day-over-day with root-cause deltas, cost-by-service,
top Cloud Functions) and writes a single structured JSON file. The styled markdown
report is authored separately by Claude following SKILL.md ("data + guided authoring").

Usage:
  python3 billing_data.py                 # newest settled day (UTC)
  python3 billing_data.py --date 2026-05-26
  python3 billing_data.py --tz Asia/Ho_Chi_Minh
  python3 billing_data.py --all-projects  # include *-staging
  python3 billing_data.py --budget 3500   # monthly budget target (USD)

Output: <skill>/reports/billing-data-<d1>.json  (+ a short summary to stderr)
"""
import argparse
import calendar
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUTDIR = os.path.join(SKILL_DIR, "reports")

BILLING_PROJECT = os.environ.get("BILLING_PROJECT", "avada-seo")
BILLING_DATASET = os.environ.get("BILLING_DATASET", "gcp_billing_export")
BILLING_TABLE = os.environ.get("BILLING_TABLE", "gcp_billing_export_v1_01BDCA_07A8E0_293FF2")
FQ_TABLE = f"{BILLING_PROJECT}.{BILLING_DATASET}.{BILLING_TABLE}"

TZ_RE = re.compile(r"^[A-Za-z0-9_/+-]+$")


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--date", help="report day (d1), YYYY-MM-DD; default = today - --lag-days, "
                                  "then walked back to the newest settled day")
    p.add_argument("--lag-days", type=int, default=2,
                   help="how many days behind today to probe first (default 2)")
    p.add_argument("--max-walk", type=int, default=4,
                   help="max extra days to walk back looking for a settled day (default 4)")
    p.add_argument("--no-impute", action="store_true",
                   help="never substitute a trailing median for a missing flat storage SKU; "
                        "walk back to a fully-landed day instead")
    p.add_argument("--impute-min-ratio", type=float, default=0.6,
                   help="refuse to impute a day whose non-flat cost is below this fraction of "
                        "its trailing median — it is missing more than the flat SKU (default 0.6)")
    p.add_argument("--tz", default="UTC", help="timezone for the day boundary (default UTC)")
    p.add_argument("--all-projects", action="store_true", help="include *-staging projects")
    p.add_argument("--budget", type=float, default=3500.0, help="monthly budget target (default 3500)")
    p.add_argument("--outdir", default=DEFAULT_OUTDIR)
    return p.parse_args()


def build_sql(tz, prod_only):
    # Service/SKU -> friendly bucket. Firestore bills under the "App Engine" service
    # (SKUs "Cloud Firestore *"), so classify by SKU first, then by service.
    prod_filter = ""
    if prod_only:
        prod_filter = (
            "AND LOWER(project.id) NOT LIKE '%staging%'\n"
            "  AND LOWER(IFNULL(project.name, '')) NOT LIKE '%staging%'"
        )
    return f"""
SELECT
  project.id AS project_id,
  COALESCE(project.name, project.id) AS project_name,
  CASE
    WHEN STARTS_WITH(sku.description, 'Cloud Firestore') THEN 'Firestore / Storage'
    WHEN service.description = 'Cloud Storage' THEN 'Firestore / Storage'
    WHEN sku.description LIKE '%GCS Storage%' THEN 'Firestore / Storage'
    WHEN service.description = 'Cloud Run Functions' THEN 'Cloud Functions'
    WHEN service.description = 'Cloud Run' THEN 'Cloud Run'
    WHEN service.description = 'Cloud Logging' THEN 'Logging'
    WHEN service.description = 'Cloud Pub/Sub' THEN 'Pub/Sub'
    WHEN service.description = 'Cloud Scheduler' THEN 'Scheduler'
    ELSE service.description
  END AS bucket,
  STARTS_WITH(sku.description, 'Cloud Firestore Storage') AS flat_sku,
  IF(service.description = 'Cloud Run Functions',
     IFNULL((SELECT value FROM UNNEST(labels) WHERE key = 'goog-drz-cloudfunctions-id'), '(untagged)'),
     NULL) AS fn_id,
  DATE(usage_start_time, '{tz}') AS usage_date,
  currency,
  ROUND(SUM(cost), 6) AS cost
FROM `{FQ_TABLE}`
WHERE _PARTITIONTIME >= TIMESTAMP(@part_from)
  AND DATE(usage_start_time, '{tz}') BETWEEN @win_start AND @win_end
  AND project.id IS NOT NULL
  {prod_filter}
GROUP BY project_id, project_name, bucket, flat_sku, fn_id, usage_date, currency
"""


def run_bq(sql, params):
    cmd = ["bq", f"--project_id={BILLING_PROJECT}", "query", "--quiet",
           "--use_legacy_sql=false", "--format=json", "--max_rows=10000000"]
    for k, v in params.items():
        cmd.append(f"--parameter={k}:DATE:{v}")
    cmd.append(sql)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.stderr.write("bq query failed:\n" + (proc.stdout or "") + (proc.stderr or "") + "\n")
        sys.exit(1)
    out = proc.stdout.strip()
    return json.loads(out) if out else []


def in_range(d, lo, hi):
    return lo <= d <= hi


# The "Cloud Firestore Storage" SKU is a storage-at-rest charge: near-constant day to
# day (<3% spread), and it is the chunk the export delivers last — during the
# 2026-08-03..12 backlog it landed at lag 4-7 while everything else was in at lag 1.
# Its absence is therefore the cheapest reliable signal that a day has not finished
# landing, and a day missing it reads ~25% cheaper than it really was.
FLAT_SKU_FLOOR = 0.10   # projects billing less than this/day are noise, skip them


def normalize(rows):
    for r in rows:
        r["cost"] = float(r["cost"] or 0)
        if isinstance(r["usage_date"], str):
            r["usage_date"] = date.fromisoformat(r["usage_date"])
        if not isinstance(r.get("flat_sku"), bool):
            r["flat_sku"] = str(r.get("flat_sku")).lower() == "true"
    return rows


def flat_sku_by_day(rows):
    out = defaultdict(float)
    for r in rows:
        if r["flat_sku"]:
            out[(r["project_id"], r["usage_date"])] += r["cost"]
    return out


def day_completeness(flat, day, lookback=7):
    """{project_id: (present, ratio-to-trailing-median)} for projects that bill the flat SKU.

    Gate on presence, not on the ratio: the SKU lands as one row per project per day, so
    a backlog leaves a hole rather than a smaller number, while a genuine storage drop
    (avada-blog-app fell 1.56 -> 0.20/day on 2026-08-20 after a purge) is a small number
    that is nonetheless complete. Ratio is kept only for the trail.
    """
    checks = {}
    for pid in {p for p, _ in flat}:
        hist = sorted(flat.get((pid, day - timedelta(days=i)), 0.0) for i in range(1, lookback + 1))
        med = hist[len(hist) // 2]
        if med < FLAT_SKU_FLOOR:
            continue
        got = flat.get((pid, day), 0.0)
        checks[pid] = (got > 0, round(got / med, 3))
    return checks


# A day can go missing more than the flat SKU. Imputing then hides a real hole, so the
# day's remaining cost has to still look like itself before the substitution is allowed.
IMPUTE_LOOKBACK = 14
IMPUTE_SAMPLE = 7


def nonflat_by_day(rows):
    out = defaultdict(float)
    for r in rows:
        if not r["flat_sku"]:
            out[(r["project_id"], r["usage_date"])] += r["cost"]
    return out


def trailing_positive_median(series, pid, day, lookback=IMPUTE_LOOKBACK, want=IMPUTE_SAMPLE):
    """Median of the newest `want` non-zero values in the `lookback` days before `day`.

    Zeros are dropped rather than averaged in: a run of missing days would otherwise drag
    the baseline to 0 exactly when it is needed.
    """
    vals = []
    for i in range(1, lookback + 1):
        v = series.get((pid, day - timedelta(days=i)), 0.0)
        if v > 0:
            vals.append(v)
        if len(vals) >= want:
            break
    if len(vals) < 3:
        return None
    vals.sort()
    return vals[len(vals) // 2]


def impute_flat_sku(rows, days, min_ratio):
    """Synthesize the flat 'Cloud Firestore Storage' row for days the export owes us.

    The SKU is storage-at-rest — one row per project per day, <3% spread, and the last
    thing the export writes. From 2026-09-03 it stopped arriving entirely, which froze
    the report on 2026-09-02 for three consecutive runs. A trailing median of a
    near-constant charge beats republishing a stale day.
    """
    flat = flat_sku_by_day(rows)
    nonflat = nonflat_by_day(rows)
    meta = {}
    for r in rows:
        meta.setdefault(r["project_id"], (r["project_name"], r["currency"]))
    synth, used, skipped = [], [], []
    for day in days:
        for pid in sorted({p for p, _ in flat}):
            if flat.get((pid, day), 0.0) > 0:
                continue
            base = trailing_positive_median(flat, pid, day)
            if base is None or base < FLAT_SKU_FLOOR:
                continue
            nf_base = trailing_positive_median(nonflat, pid, day)
            ratio = round(nonflat.get((pid, day), 0.0) / nf_base, 3) if nf_base else None
            if ratio is not None and ratio < min_ratio:
                skipped.append({"date": day.isoformat(), "project_id": pid, "nonFlatRatio": ratio})
                continue
            name, currency = meta.get(pid, (pid, "USD"))
            synth.append({"project_id": pid, "project_name": name, "currency": currency,
                          "bucket": "Firestore / Storage", "flat_sku": True, "fn_id": None,
                          "usage_date": day, "cost": round(base, 6), "imputed": True})
            used.append({"date": day.isoformat(), "project_id": pid,
                         "cost": round(base, 2), "nonFlatRatio": ratio})
    return synth, used, skipped


def pick_settled_day(rows, probe, max_walk):
    """Newest day <= probe where both it and its d2 have finished landing.

    d2 has to be settled too — the report's headline number is the d2->d1 delta, and
    an unsettled d2 fakes a spike just as well as an unsettled d1 fakes a drop.
    """
    flat = flat_sku_by_day(rows)
    trail = []
    for i in range(max_walk + 1):
        cand = probe - timedelta(days=i)
        c1 = day_completeness(flat, cand)
        c2 = day_completeness(flat, cand - timedelta(days=1))
        both = list(c1.values()) + list(c2.values())
        # No checkable project means no signal, not a clean bill of health: if the
        # export stalls long enough, the trailing medians go to zero too.
        ok = bool(both) and all(present for present, _ in both)
        missing = sorted(pid for pid, (present, _) in list(c1.items()) + list(c2.items())
                         if not present)
        trail.append({"d1": cand.isoformat(), "settled": ok,
                      "projectsChecked": len(c1), "missingFlatSku": missing})
        if ok:
            return cand, True, trail
    return probe, False, trail


def aggregate(rows, d1, d2, month_start, r30_start, days_in_month):
    by_app = defaultdict(list)
    for r in normalize(rows):
        by_app[r["project_id"]].append(r)

    apps = []
    for pid, rs in by_app.items():
        name = rs[0]["project_name"]
        # currency: pick the one carrying the most cost; warn if mixed.
        cur_cost = defaultdict(float)
        for r in rs:
            cur_cost[r["currency"]] += r["cost"]
        currency = max(cur_cost, key=cur_cost.get)
        mixed = len([c for c, v in cur_cost.items() if abs(v) > 0.005]) > 1

        mtd = sum(r["cost"] for r in rs if in_range(r["usage_date"], month_start, d1))
        r30 = sum(r["cost"] for r in rs if in_range(r["usage_date"], r30_start, d1))
        d1_cost = sum(r["cost"] for r in rs if r["usage_date"] == d1)
        d2_cost = sum(r["cost"] for r in rs if r["usage_date"] == d2)
        mtd_days = (d1 - month_start).days + 1

        # cost-by-service over rolling 30
        svc = defaultdict(float)
        for r in rs:
            if in_range(r["usage_date"], r30_start, d1):
                svc[r["bucket"]] += r["cost"]
        services = sorted(
            [{"bucket": b, "cost": round(c, 2),
              "pct": round(100 * c / r30, 1) if r30 else 0.0} for b, c in svc.items()],
            key=lambda x: (-x["cost"], x["bucket"]))   # name breaks ties so daily reports diff clean

        # top Cloud Functions over rolling 30
        fns = defaultdict(float)
        for r in rs:
            if r["bucket"] == "Cloud Functions" and r["fn_id"] and in_range(r["usage_date"], r30_start, d1):
                fns[r["fn_id"]] += r["cost"]
        fn_total = sum(fns.values())
        functions = sorted(
            [{"fn_id": f, "cost": round(c, 2),
              "pct": round(100 * c / fn_total, 1) if fn_total else 0.0} for f, c in fns.items()],
            key=lambda x: (-x["cost"], x["fn_id"]))

        # day-over-day root causes (d1 vs d2), per bucket and per function
        svc_d1, svc_d2 = defaultdict(float), defaultdict(float)
        fn_d1, fn_d2 = defaultdict(float), defaultdict(float)
        for r in rs:
            if r["usage_date"] == d1:
                svc_d1[r["bucket"]] += r["cost"]
                if r["fn_id"]:
                    fn_d1[r["fn_id"]] += r["cost"]
            elif r["usage_date"] == d2:
                svc_d2[r["bucket"]] += r["cost"]
                if r["fn_id"]:
                    fn_d2[r["fn_id"]] += r["cost"]

        def deltas(a, b):
            keys = set(a) | set(b)
            out = [{"key": k, "d2": round(b.get(k, 0), 2), "d1": round(a.get(k, 0), 2),
                    "delta": round(a.get(k, 0) - b.get(k, 0), 2)} for k in keys]
            return sorted(out, key=lambda x: (-abs(x["delta"]), x["key"]))

        apps.append({
            "project_id": pid,
            "project_name": name,
            "currency": currency,
            "mixedCurrency": mixed,
            "mtd": round(mtd, 2),
            "mtdDays": mtd_days,
            "mtdAvg": round(mtd / mtd_days, 2) if mtd_days else 0.0,
            "mtdEstimate": round(mtd / mtd_days * days_in_month, 2) if mtd_days else 0.0,
            "r30": round(r30, 2),
            "r30Avg": round(r30 / 30, 2),
            "r30Estimate": round(r30, 2),  # 30-day window ≈ a month
            "dod": {"d2": d2.isoformat(), "d1": d1.isoformat(),
                    "d2Cost": round(d2_cost, 2), "d1Cost": round(d1_cost, 2),
                    "pct": round(100 * (d1_cost - d2_cost) / d2_cost, 1) if d2_cost else None},
            "services": services,
            "functions": functions,
            "functionsTotal": round(fn_total, 2),
            "dodCauses": {"services": deltas(svc_d1, svc_d2)[:5],
                          "functions": deltas(fn_d1, fn_d2)[:5]},
        })

    apps.sort(key=lambda a: (-a["r30"], a["project_id"]))
    return apps


def main():
    args = parse_args()
    if not TZ_RE.match(args.tz):
        sys.exit(f"Invalid --tz '{args.tz}'")

    today = datetime.now(ZoneInfo(args.tz)).date()
    if args.date:
        probe = date.fromisoformat(args.date)
        walk = 0
        win_end = probe
    else:
        probe = today - timedelta(days=args.lag_days)
        walk = args.max_walk
        win_end = today - timedelta(days=1)   # pull the fresher days too, to judge settling

    earliest = probe - timedelta(days=walk)
    win_start = min(earliest.replace(day=1), earliest - timedelta(days=29))
    part_from = win_start - timedelta(days=1)

    sql = build_sql(args.tz, prod_only=not args.all_projects)
    sys.stderr.write(f"Querying {FQ_TABLE}\n  window {win_start}..{win_end} ({args.tz}), "
                     f"scope={'all' if args.all_projects else 'production'}\n")
    rows = normalize(run_bq(sql, {"part_from": part_from.isoformat(),
                                  "win_start": win_start.isoformat(),
                                  "win_end": win_end.isoformat()}))

    imputed = None

    def imputed_meta(used, skipped, keep):
        return {
            "sku": "Cloud Firestore Storage",
            "rows": [u for u in used if u["date"] in keep],
            "total": round(sum(u["cost"] for u in used if u["date"] in keep), 2),
            "skipped": [s for s in skipped if s["date"] in keep],
            "minNonFlatRatio": args.impute_min_ratio,
        }

    if args.date:
        d1, settled, trail = probe, None, []
        # An explicit date pins the day, not the hole in it: backfilling a day the export
        # never finished (2026-09-03..05) is exactly when the estimate is needed.
        if not args.no_impute:
            days = [probe, probe - timedelta(days=1)]
            synth, used, skipped = impute_flat_sku(rows, days, args.impute_min_ratio)
            if synth:
                rows = rows + synth
                imputed = imputed_meta(used, skipped, {d.isoformat() for d in days})
    else:
        d1, settled, trail = pick_settled_day(rows, probe, walk)
        if not (settled and d1 == probe) and not args.no_impute:
            # d2 of the oldest candidate needs the SKU too — the headline is a delta.
            days = [probe - timedelta(days=i) for i in range(walk + 2)]
            synth, used, skipped = impute_flat_sku(rows, days, args.impute_min_ratio)
            if synth:
                patched = rows + synth
                cand, ok, cand_trail = pick_settled_day(patched, probe, walk)
                if ok and cand > d1:
                    rows = patched
                    d1, settled, trail = cand, False, cand_trail
                    imputed = imputed_meta(
                        used, skipped,
                        {cand.isoformat(), (cand - timedelta(days=1)).isoformat()})
        if imputed:
            sys.stderr.write(
                f"Note: {imputed['sku']} missing — imputed {imputed['total']:.2f} across "
                f"{len(imputed['rows'])} project-days to report {d1} instead of a stale day.\n")
        elif not settled:
            sys.stderr.write(
                f"WARNING: no settled day in {earliest}..{probe} — the billing export is "
                f"still backfilling. Reporting {d1} anyway; treat it as a floor.\n")
        elif d1 != probe:
            sys.stderr.write(f"Note: {probe} not settled yet, walked back to {d1}.\n")

    d2 = d1 - timedelta(days=1)
    month_start = d1.replace(day=1)
    r30_start = d1 - timedelta(days=29)
    days_in_month = calendar.monthrange(d1.year, d1.month)[1]

    apps = aggregate(rows, d1, d2, month_start, r30_start, days_in_month)

    primary_currency = apps[0]["currency"] if apps else "USD"
    total_r30 = round(sum(a["r30"] for a in apps), 2)
    total_r30_est = round(sum(a["r30Estimate"] for a in apps), 2)
    total_mtd = round(sum(a["mtd"] for a in apps), 2)
    total_mtd_est = round(sum(a["mtdEstimate"] for a in apps), 2)

    payload = {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ"),
            "tz": args.tz,
            "scope": "all" if args.all_projects else "production",
            "currency": primary_currency,
            "budgetTarget": args.budget,
            "sourceTable": BILLING_TABLE,
            "dates": {"d1": d1.isoformat(), "d2": d2.isoformat(),
                      "monthStart": month_start.isoformat(), "mtdDays": (d1 - month_start).days + 1,
                      "daysInMonth": days_in_month,
                      "r30Start": r30_start.isoformat(), "r30End": d1.isoformat()},
            "completeness": {
                "probeDate": probe.isoformat(),
                "lagDays": args.lag_days,
                "settled": settled,
                "walkedBackDays": (probe - d1).days,
                "imputed": imputed,
                "trail": trail,
            },
        },
        "totals": {
            "r30": total_r30, "r30Estimate": total_r30_est,
            "mtd": total_mtd, "mtdEstimate": total_mtd_est,
            "budgetTarget": args.budget,
            "gapR30": round(total_r30_est - args.budget, 2),
        },
        "apps": apps,
    }

    os.makedirs(args.outdir, exist_ok=True)
    out_path = os.path.join(args.outdir, f"billing-data-{d1.isoformat()}.json")
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    # short summary to stderr (stdout stays clean for piping if ever needed)
    sys.stderr.write(f"\nWrote {out_path}\n")
    sys.stderr.write(f"Apps (R30, {primary_currency}):\n")
    for a in apps:
        sys.stderr.write(f"  {a['r30']:>9.2f}  {a['project_name']} ({a['project_id']})\n")
    sys.stderr.write(f"Total R30 estimate: {total_r30_est:.2f} {primary_currency} "
                     f"· budget {args.budget:.2f} · gap {payload['totals']['gapR30']:+.2f}\n")
    print(out_path)  # stdout = path to the data file


if __name__ == "__main__":
    main()
