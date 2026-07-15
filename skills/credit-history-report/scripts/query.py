#!/usr/bin/env python3
"""Credit history report — queries the BigQuery mirror of Firestore
`shops/{shopId}/creditHistories` (view `creditHistories_daily_long` in dataset
`avada-seo.firestore_export`). Uses the local `bq` CLI (gcloud auth — no
service-account JSON).

The report is feature-first: which feature burned how many credits, how many
shops used it, and who leads. Per-shop rows follow, broken down by feature.

`usage` is a CREDIT count, not tokens. The Firestore document is a per-shop,
per-day map of {feature: credits} plus `totalUsage`; no token counts exist
anywhere upstream.

  Single shop:
    query.py --shop <id> --date YYYY-MM-DD
    query.py --shop <id> --week YYYY-Www
    query.py --shop <id> --from YYYY-MM-DD --to YYYY-MM-DD

  Aggregate (all shops):
    query.py --all --date YYYY-MM-DD
    query.py --all --week YYYY-Www
    query.py --all --from YYYY-MM-DD --to YYYY-MM-DD [--top 20]

Output: markdown to stdout · JSON + CSV in reports/.
"""
import argparse
import csv
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from datetime import date as Date, timedelta

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORTS = os.path.join(SKILL, "reports")
PROJECT = os.environ.get("BQ_PROJECT", "avada-seo")
VIEW = os.environ.get("BQ_VIEW", "avada-seo.firestore_export.creditHistories_daily_long")

# Shop domains deliberately do NOT come from BigQuery. Reading the `data` column of
# shops_raw_changelog forces a scan of the whole JSON blob — 139 GB, ~$0.70 a run —
# while the credit view alone is ~216 MB. Firestore point reads are free.
FIRESTORE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    target = p.add_mutually_exclusive_group(required=True)
    target.add_argument("--shop", help="single shop mode — shop document id")
    target.add_argument("--all", action="store_true", help="aggregate across all shops")
    rng = p.add_mutually_exclusive_group(required=True)
    rng.add_argument("--date", help="single day YYYY-MM-DD")
    rng.add_argument("--week", help="ISO week YYYY-Www (Mon..Sun, UTC)")
    rng.add_argument("--from", dest="date_from", help="range start YYYY-MM-DD (use with --to)")
    p.add_argument("--to", dest="date_to", help="range end YYYY-MM-DD (use with --from)")
    p.add_argument("--top", type=int, default=20, help="top N shops (aggregate mode, default 20)")
    return p.parse_args()


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


def run_bq(sql, params):
    cmd = ["bq", f"--project_id={PROJECT}", "query", "--quiet",
           "--use_legacy_sql=false", "--format=json", "--max_rows=10000000"]
    for k, t, v in params:
        cmd.append(f"--parameter={k}:{t}:{v}")
    cmd.append(sql)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.stderr.write(f"bq failed:\n{proc.stdout}\n{proc.stderr}\n")
        sys.exit(1)
    return json.loads(proc.stdout) if proc.stdout.strip() else []


def resolve_domains(shop_ids):
    """One Firestore batchGet per chunk. Purged shops come back `missing` and keep their id."""
    ids = list(dict.fromkeys(shop_ids))
    if not ids:
        return {}
    tok = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True)
    if tok.returncode != 0:
        return {}
    out = {}
    for i in range(0, len(ids), 300):  # batchGet caps at 1000 documents
        body = {"documents": [f"projects/{PROJECT}/databases/(default)/documents/shops/{s}"
                              for s in ids[i:i + 300]],
                "mask": {"fieldPaths": ["shopifyDomain"]}}
        p = subprocess.run(["curl", "-s", "-X", "POST", f"{FIRESTORE}:batchGet",
                            "-H", f"Authorization: Bearer {tok.stdout.strip()}",
                            "-H", "Content-Type: application/json", "-d", json.dumps(body)],
                           capture_output=True, text=True)
        try:
            for r in json.loads(p.stdout):
                if "found" in r:
                    sid = r["found"]["name"].split("/")[-1]
                    dom = r["found"].get("fields", {}).get("shopifyDomain", {}).get("stringValue")
                    if dom:
                        out[sid] = dom
        except Exception:
            pass
    return out


SQL_SINGLE_SHOP = """
SELECT event_date, action, usage, total_usage
FROM `{view}`
WHERE shop_id = @shop_id AND event_date BETWEEN @date_from AND @date_to
ORDER BY event_date, usage DESC
"""

# Every shop, not just the top N. The feature summary has to count shops that never
# reach the leaderboard, otherwise a feature used widely but lightly disappears.
# Ranking happens in Python.
SQL_ALL_SHOPS = """
SELECT shop_id, action, SUM(usage) AS usage
FROM `{view}`
WHERE event_date BETWEEN @date_from AND @date_to
GROUP BY shop_id, action
"""


def fmt(n):
    return f"{int(n):,}" if n else "—"


def pct(part, whole):
    return f"{part / whole * 100:.1f}%" if whole else "—"


def table(header, rows, right=()):
    sep = "|" + "|".join("---:" if i in right else "---" for i in range(len(header))) + "|"
    return ["| " + " | ".join(header) + " |", sep] + ["| " + " | ".join(r) + " |" for r in rows]


def write_outputs(base, payload, csv_header, csv_rows):
    os.makedirs(REPORTS, exist_ok=True)
    with open(base + ".json", "w") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)
    with open(base + ".csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(csv_header)
        w.writerows(csv_rows)


def report_single_shop(args, d_from, d_to, slug):
    rows = run_bq(SQL_SINGLE_SHOP.format(view=VIEW),
                  [("shop_id", "STRING", args.shop),
                   ("date_from", "DATE", d_from.isoformat()),
                   ("date_to", "DATE", d_to.isoformat())])
    domain = resolve_domains([args.shop]).get(args.shop)

    by_date, feat_total = defaultdict(dict), defaultdict(int)
    for r in rows:
        u = int(r["usage"] or 0)
        by_date[r["event_date"]][r["action"]] = u
        by_date[r["event_date"]]["__total"] = int(r["total_usage"] or 0)
        feat_total[r["action"]] += u
    feats = sorted(feat_total, key=lambda a: (-feat_total[a], a))
    dates = sorted(by_date)
    grand = sum(feat_total.values())

    L = [f"# Credit history — shop `{args.shop}` · {d_from} → {d_to}",
         f"shopify_domain: **{domain or '(unknown)'}**", ""]
    if not dates:
        L.append("_No credit usage in this range._")
        print("\n".join(L))
        return

    L += [f"**{fmt(grand)}** credit · **{len(feats)}** tính năng · **{len(dates)}** ngày có hoạt động", "",
          "## Tính năng nào tốn credit", ""]
    L += table(["Tính năng", "Credit", "% tổng", "Số ngày dùng"],
               [[f, fmt(feat_total[f]), pct(feat_total[f], grand),
                 str(sum(1 for d in dates if by_date[d].get(f)))] for f in feats]
               + [["**Tổng**", f"**{fmt(grand)}**", "100.0%", f"**{len(dates)}**"]],
               right=(1, 2, 3))
    L += ["", "## Theo ngày", ""]
    L += table(["Ngày", "Tổng"] + feats,
               [[d, fmt(by_date[d].get("__total", 0))] + [fmt(by_date[d].get(f, 0)) for f in feats]
                for d in dates]
               + [["**Tổng**", f"**{fmt(grand)}**"] + [f"**{fmt(feat_total[f])}**" for f in feats]],
               right=tuple(range(1, len(feats) + 2)))
    print("\n".join(L))

    payload = {"shop_id": args.shop, "shopify_domain": domain, "unit": "credits",
               "range": {"from": d_from.isoformat(), "to": d_to.isoformat()},
               "total": grand,
               "features": [{"feature": f, "credits": feat_total[f]} for f in feats],
               "days": [{"date": d, "total": by_date[d].get("__total", 0),
                         **{f: by_date[d].get(f, 0) for f in feats}} for d in dates]}
    write_outputs(os.path.join(REPORTS, f"shop-{args.shop}-{slug}"), payload,
                  ["date", "total"] + feats,
                  [[d["date"], d["total"]] + [d.get(f, 0) for f in feats] for d in payload["days"]])


def report_all_shops(args, d_from, d_to, slug):
    rows = run_bq(SQL_ALL_SHOPS.format(view=VIEW),
                  [("date_from", "DATE", d_from.isoformat()),
                   ("date_to", "DATE", d_to.isoformat())])

    by_shop = defaultdict(dict)
    feat_total, feat_shops, feat_leader = defaultdict(int), defaultdict(int), {}
    for r in rows:
        sid, act, u = r["shop_id"], r["action"], int(r["usage"] or 0)
        by_shop[sid][act] = u
        feat_total[act] += u
        feat_shops[act] += 1
        if act not in feat_leader or u > feat_leader[act][1]:
            feat_leader[act] = (sid, u)

    if not by_shop:
        print(f"# Credit history — all shops · {d_from} → {d_to}\n\n_No credit usage in this range._")
        return

    grand = sum(feat_total.values())
    # shop_id / feature name break ties. Python's sort is stable, but BigQuery
    # returns rows in no fixed order, so without a tiebreak the shops sitting on
    # the --top boundary swap between runs.
    feats = sorted(feat_total, key=lambda a: (-feat_total[a], a))
    ranked = sorted(by_shop.items(), key=lambda kv: (-sum(kv[1].values()), kv[0]))
    top = ranked[:args.top]
    top_sum = sum(sum(a.values()) for _, a in top)

    doms = resolve_domains([s for s, _ in top] + [feat_leader[f][0] for f in feats])
    name = lambda s: doms.get(s, s)

    L = [f"# Credit history — all shops · {d_from} → {d_to}", "",
         f"**{fmt(grand)}** credit · **{fmt(len(by_shop))}** shop · **{len(feats)}** tính năng", "",
         "> Đơn vị là **credit**, không phải token — nguồn không có dữ liệu token.", "",
         "## Tính năng nào tốn credit", ""]
    L += table(["Tính năng", "Credit", "% tổng", "Shop dùng", "TB/shop", "Shop cao nhất"],
               [[f, fmt(feat_total[f]), pct(feat_total[f], grand), fmt(feat_shops[f]),
                 fmt(round(feat_total[f] / feat_shops[f])) if feat_shops[f] else "—",
                 f"{name(feat_leader[f][0])} ({fmt(feat_leader[f][1])})"] for f in feats]
               + [["**Tổng**", f"**{fmt(grand)}**", "100.0%", f"**{fmt(len(by_shop))}**", "", ""]],
               right=(1, 2, 3, 4))

    L += ["", f"## Shop nào dùng gì — top {len(top)} / {fmt(len(by_shop))}", ""]
    body = []
    for i, (sid, acts) in enumerate(top, 1):
        tot = sum(acts.values())
        body.append([str(i), name(sid), f"`{sid}`", fmt(tot), pct(tot, grand),
                     max(acts, key=acts.get)] + [fmt(acts.get(f, 0)) for f in feats])
    top_feats = {f: sum(a.get(f, 0) for _, a in top) for f in feats}
    body.append(["", f"**Cộng top {len(top)}**", "", f"**{fmt(top_sum)}**", f"**{pct(top_sum, grand)}**", ""]
                + [f"**{fmt(top_feats[f])}**" for f in feats])
    body.append(["", f"**Tất cả {fmt(len(by_shop))} shop**", "", f"**{fmt(grand)}**", "**100.0%**", ""]
                + [f"**{fmt(feat_total[f])}**" for f in feats])
    L += table(["#", "Shop", "shop_id", "Tổng", "% tổng", "Tính năng chính"] + feats, body,
               right=tuple([3, 4] + list(range(6, 6 + len(feats)))))
    print("\n".join(L))

    payload = {"range": {"from": d_from.isoformat(), "to": d_to.isoformat()},
               "top": args.top, "unit": "credits",
               "totals": {"credits": grand, "shops": len(by_shop), "features": len(feats)},
               "features": [{"feature": f, "credits": feat_total[f], "shops": feat_shops[f],
                             "avg_per_shop": round(feat_total[f] / feat_shops[f]) if feat_shops[f] else 0,
                             "leader_shop_id": feat_leader[f][0],
                             "leader_domain": name(feat_leader[f][0]),
                             "leader_credits": feat_leader[f][1]} for f in feats],
               "shops": [{"rank": i, "shop_id": sid, "shopify_domain": doms.get(sid),
                          "total": sum(a.values()), "main_feature": max(a, key=a.get),
                          **{f: a.get(f, 0) for f in feats}}
                         for i, (sid, a) in enumerate(top, 1)]}
    write_outputs(os.path.join(REPORTS, f"all-shops-{slug}"), payload,
                  ["rank", "shop_id", "shopify_domain", "total", "main_feature"] + feats,
                  [[s["rank"], s["shop_id"], s["shopify_domain"] or "", s["total"], s["main_feature"]]
                   + [s.get(f, 0) for f in feats] for s in payload["shops"]])
    with open(os.path.join(REPORTS, f"features-{slug}.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["feature", "credits", "pct_of_total", "shops", "avg_per_shop",
                    "leader_domain", "leader_credits"])
        for x in payload["features"]:
            w.writerow([x["feature"], x["credits"], round(x["credits"] / grand * 100, 1),
                        x["shops"], x["avg_per_shop"], x["leader_domain"], x["leader_credits"]])


def main():
    args = parse_args()
    d_from, d_to, slug = resolve_range(args)
    (report_all_shops if args.all else report_single_shop)(args, d_from, d_to, slug)


if __name__ == "__main__":
    sys.exit(main())
