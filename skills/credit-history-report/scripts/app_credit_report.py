#!/usr/bin/env python3
"""Daily credit usage for apps WITHOUT a creditHistories BigQuery mirror.

Schemas differ per app, discovered 2026-06-12:

  blog (avada-blog-app)   — root collection `creditLogs`: one doc per event
      {shopId, shopDomain, feature, status, source, cost, createdAt}
      status TOPUP = credit grant (excluded from usage); everything else = spend.

  apc (ai-product-copy)   — root collection `bulkGenerateProcesses`: one doc per
      bulk run {shopId, aiCreditAction, creditCost, completedCount, totalCount,
      createdAt}. Corrected 2026-07-10: this used to read `resultGen`, which has
      been unwritten since 2026-06-11 and so reported zero usage for 29 days.

Read-only Firestore REST, operator gcloud token. UTC days.

Usage:
  python3 app_credit_report.py --app blog --date 2026-06-11 [--top 20]
  python3 app_credit_report.py --app apc  --date 2026-06-11
"""

import argparse
import csv
import json
import subprocess
import sys
import urllib.request
from collections import defaultdict
from datetime import date as Date, timedelta
from pathlib import Path

REPORTS_DIR = Path(__file__).resolve().parent.parent / "reports"

APPS = {
    "blog": {"project": "avada-blog-app"},
    "apc": {"project": "ai-product-copy"},
}


def get_token():
    return subprocess.run(
        ["gcloud", "auth", "print-access-token"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def api(token, project, path, payload=None):
    url = (f"https://firestore.googleapis.com/v1/projects/{project}"
           f"/databases/(default)/documents{path}")
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Authorization": f"Bearer {token}",
                 "Content-Type": "application/json"},
        method="POST" if payload is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def fval(fields, name, default=None):
    v = fields.get(name)
    if v is None:
        return default
    for k in ("stringValue", "timestampValue", "booleanValue"):
        if k in v:
            return v[k]
    if "integerValue" in v:
        return int(v["integerValue"])
    if "doubleValue" in v:
        return float(v["doubleValue"])
    return default


def run_query_day(token, project, collection, date, select=None):
    """Yield docs from a root collection where createdAt is inside `date` (UTC).

    Upper bound is the next midnight, exclusive. Bounding at 23:59:59.999999Z
    instead drops anything written in the final microsecond — Firestore stores
    timestamps to nanosecond precision, so that window is real.
    """
    nxt = (Date.fromisoformat(date) + timedelta(days=1)).isoformat()
    where = {"compositeFilter": {"op": "AND", "filters": [
        {"fieldFilter": {"field": {"fieldPath": "createdAt"},
                         "op": "GREATER_THAN_OR_EQUAL",
                         "value": {"timestampValue": f"{date}T00:00:00Z"}}},
        {"fieldFilter": {"field": {"fieldPath": "createdAt"},
                         "op": "LESS_THAN",
                         "value": {"timestampValue": f"{nxt}T00:00:00Z"}}},
    ]}}
    cursor, total = None, 0
    while True:
        sq = {
            "from": [{"collectionId": collection}],
            "where": where,
            "orderBy": [{"field": {"fieldPath": "createdAt"},
                         "direction": "ASCENDING"},
                        {"field": {"fieldPath": "__name__"},
                         "direction": "ASCENDING"}],
            "limit": 300,
        }
        if select:
            sq["select"] = {"fields": [{"fieldPath": f} for f in select]}
        if cursor:
            sq["startAt"] = cursor
        batch = [item for item in api(token, project, ":runQuery",
                                      {"structuredQuery": sq})
                 if "document" in item]
        if not batch:
            return
        for item in batch:
            yield item["document"]
        total += len(batch)
        print(f"  {collection}: {total} docs…", file=sys.stderr)
        last = batch[-1]["document"]
        cursor = {
            "values": [
                {"timestampValue": fval(last.get("fields", {}), "createdAt")},
                {"referenceValue": last["name"]},
            ],
            "before": False,
        }
        if len(batch) < 300:
            return


def batch_get(token, project, paths, chunk=300):
    """batchGet full doc paths; return {path: fields}."""
    prefix = f"projects/{project}/databases/(default)/documents"
    out = {}
    paths = list(paths)
    for i in range(0, len(paths), chunk):
        body = {"documents": [f"{prefix}/{p}" for p in paths[i:i + chunk]]}
        for item in api(token, project, ":batchGet", body):
            found = item.get("found")
            if found:
                out[found["name"].split("/documents/")[1]] = found["fields"]
    return out


def report_blog(token, project, date):
    """Aggregate creditLogs by shop; usage = non-TOPUP events' cost."""
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
    rows = []
    for sid, feats in shops.items():
        feats = {k: v for k, v in feats.items() if v}
        if not feats:
            continue
        rows.append({"shop_id": sid, "shopify_domain": domains.get(sid),
                     "total": sum(feats.values()), **feats})
    meta = {"topup_events_excluded": topup_events,
            "topup_credits_excluded": topup_total}
    return rows, meta


def report_apc(token, project, date):
    """Credits per shop x aiCreditAction, read from `bulkGenerateProcesses`.

    This used to count `resultGen` docs. That collection stopped being written on
    2026-06-11 while generation carried on, so the report silently returned zero
    shops for every day after it — an empty table that looked like an answer.

    Each process doc carries `aiCreditAction` and `creditCost`, and has done since
    at least 2026-05-01, so this path also covers the old range.

    `creditCost` is the charge stamped when the process is created: totalCount x a
    per-item rate (1, 2 or 5), NOT completedCount. A process charged for 6,695
    items that completes 110 still reports the full 13,390. `credits/{shop}` holds
    only a running balance, not a ledger, so no per-event truth exists in this
    project. `items_completed` in the meta line is what actually landed.
    """
    shops = defaultdict(lambda: defaultdict(int))
    charged = completed = 0
    for doc in run_query_day(token, project, "bulkGenerateProcesses", date,
                             select=["shopId", "aiCreditAction", "creditCost",
                                     "completedCount", "createdAt"]):
        f = doc.get("fields", {})
        sid = fval(f, "shopId", "(unknown)")
        action = fval(f, "aiCreditAction", "(unknown)") or "(unknown)"
        cost = fval(f, "creditCost", 0) or 0
        shops[sid][action] += cost
        charged += cost
        completed += fval(f, "completedCount", 0) or 0
    shop_docs = batch_get(token, project,
                          [f"shops/{s}" for s in shops if s != "(unknown)"])
    rows = []
    for sid, acts in shops.items():
        acts = {k: v for k, v in acts.items() if v}
        if not acts:
            continue
        dom = fval(shop_docs.get(f"shops/{sid}", {}), "shopifyDomain",
                   "(unknown)")
        rows.append({"shop_id": sid, "shopify_domain": dom,
                     "total": sum(acts.values()), **acts})
    return rows, {"source": "bulkGenerateProcesses.creditCost",
                  "credits_charged": charged, "items_completed": completed}


def feature_summary(rows, features):
    """Per-feature view across EVERY shop, not just the printed top N.

    A feature many shops touch lightly never reaches the leaderboard, so counting
    only the top N would erase it. `shops` is how many shops used the feature at
    all; `avg` is per *using* shop, not per shop in the app.
    """
    grand = sum(r["total"] for r in rows)
    out = []
    for f in features:
        users = [r for r in rows if r.get(f)]
        total = sum(r[f] for r in users)
        if not total:
            continue
        top = max(users, key=lambda r: (r[f], r["shop_id"]))  # shop_id breaks ties
        out.append({
            "feature": f, "total": total,
            "pct": total / grand * 100 if grand else 0.0,
            "shops": len(users), "avg": total / len(users),
            "top_shop": top.get("shopify_domain") or top["shop_id"],
            "top_usage": top[f],
        })
    out.sort(key=lambda x: (-x["total"], x["feature"]))  # feature breaks ties
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True, choices=sorted(APPS))
    ap.add_argument("--date", required=True, help="YYYY-MM-DD (UTC)")
    ap.add_argument("--top", type=int, default=20)
    args = ap.parse_args()

    project = APPS[args.app]["project"]
    token = get_token()
    rows, meta = (report_blog if args.app == "blog" else report_apc)(
        token, project, args.date)
    # shop_id breaks ties: without it, shops level on `total` swap places between
    # runs and the report changes for no reason.
    rows.sort(key=lambda r: (-r["total"], r["shop_id"]))

    names = {k for r in rows for k in r
             if k not in ("shop_id", "shopify_domain", "total")}
    summary = feature_summary(rows, names)
    cols = [s["feature"] for s in summary]  # heaviest feature first, not alphabetical

    REPORTS_DIR.mkdir(exist_ok=True)
    stem = f"{args.app}-{args.date}"
    (REPORTS_DIR / f"{stem}.json").write_text(json.dumps(
        {"app": args.app, "project": project, "date": args.date,
         "meta": meta, "features": summary, "rows": rows}, indent=2))
    with open(REPORTS_DIR / f"{stem}.csv", "w", newline="") as fcsv:
        w = csv.DictWriter(fcsv, ["shop_id", "shopify_domain", "total"] + cols)
        w.writeheader()
        w.writerows(rows)
    with open(REPORTS_DIR / f"features-{stem}.csv", "w", newline="") as fcsv:
        w = csv.DictWriter(fcsv, ["feature", "total", "pct", "shops", "avg",
                                  "top_shop", "top_usage"])
        w.writeheader()
        w.writerows(summary)

    def fmt(n):
        return f"{n:,.1f}".rstrip("0").rstrip(".") if isinstance(n, float) \
            else f"{n:,}"

    grand = sum(r["total"] for r in rows)

    print(f"# Credit usage — {args.app} ({project}) · {args.date}")
    if meta:
        print("> " + " · ".join(f"{k}: {fmt(v) if isinstance(v, (int, float)) else v}"
                                for k, v in meta.items()))

    print("\n## Tính năng nào tốn credit\n")
    print("| Tính năng | Credit | % tổng | Shop dùng | TB/shop | Shop cao nhất |")
    print("|---|---:|---:|---:|---:|---|")
    for s in summary:
        print(f"| `{s['feature']}` | **{fmt(s['total'])}** | {s['pct']:.1f}% "
              f"| {s['shops']:,} | {fmt(s['avg'])} "
              f"| {s['top_shop']} ({fmt(s['top_usage'])}) |")
    print(f"| **Tổng** | **{fmt(grand)}** | 100% | {len(rows):,} shop | | |")

    shown = min(args.top, len(rows))
    print(f"\n## Shop nào dùng gì\n\n{len(rows)} shop có phát sinh. Hiện {shown}.\n")
    header = ["#", "shop_id", "shopify_domain", "total"] + cols + ["Tính năng chính"]
    print("| " + " | ".join(header) + " |")
    print("|" + "|".join(["---"] * len(header)) + "|")
    for i, r in enumerate(rows[:shown], 1):
        main_feat = max((c for c in cols if r.get(c)),
                        key=lambda c: (r[c], c), default="—")
        cells = [str(i), f"`{r['shop_id']}`", r["shopify_domain"] or "(unknown)",
                 f"**{fmt(r['total'])}**"]
        cells += [fmt(r[c]) if r.get(c) else "—" for c in cols]
        cells.append(f"`{main_feat}`" if main_feat != "—" else "—")
        print("| " + " | ".join(cells) + " |")

    # Two totals, never one: the top-N row and the all-shops row answer different
    # questions, and collapsing them silently understates every feature column.
    def totrow(label, subset):
        cells = [fmt(sum(r.get(c, 0) for r in subset)) for c in cols]
        return (f"| | **{label}** | | **{fmt(sum(r['total'] for r in subset))}** | "
                + " | ".join(f"**{c}**" for c in cells) + " | |")
    if shown < len(rows):
        print(totrow(f"Cộng top {shown}", rows[:shown]))
    print(totrow(f"Tất cả {len(rows)} shop", rows))
    print(f"\nWrote {REPORTS_DIR / (stem + '.json')}, .csv, features-{stem}.csv",
          file=sys.stderr)


if __name__ == "__main__":
    main()
