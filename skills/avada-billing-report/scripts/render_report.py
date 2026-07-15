#!/usr/bin/env python3
"""Render the daily Avada GCP cost report (markdown, Vietnamese).

Reads the data JSON written by billing_data.py + config/{apps,settings,suggestions}.json,
recovers source casing for Cloud Function names from the app's `functionsRepo` exports,
applies the suggestion templates, and writes reports/gcp-cost-<d1>.md in the layout of
docs/example-report.md.

Default flow (single command): runs billing_data.py for yesterday, then renders.
  python3 render_report.py
  python3 render_report.py --date 2026-05-26      # specific day, re-runs data
  python3 render_report.py --date 2026-05-26 --no-refresh   # reuse existing data JSON
  python3 render_report.py --data /path/billing-data-X.json --out /path/out.md
"""
import argparse
import datetime
import glob
import json
import os
import re
import subprocess
import sys
from datetime import timedelta
from zoneinfo import ZoneInfo

SK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORTS = os.path.join(SK, "reports")
CONFIG = os.path.join(SK, "config")


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--date", help="report day (d1). Default: yesterday in --tz")
    p.add_argument("--tz", default="UTC", help="day-boundary timezone for the data query")
    p.add_argument("--all-projects", action="store_true", help="include *-staging projects")
    p.add_argument("--budget", type=float, help="monthly budget target (override settings)")
    p.add_argument("--data", help="path to an existing billing-data-<d1>.json (skip re-running data)")
    p.add_argument("--no-refresh", action="store_true",
                   help="with --date: reuse reports/billing-data-<date>.json if present")
    p.add_argument("--out", help="output .md path (default reports/gcp-cost-<d1>.md)")
    return p.parse_args()


def ensure_data(args, lag_days):
    """Return path to the data JSON, running billing_data.py if needed."""
    if args.data:
        return args.data
    if not args.date:
        # Default = today (in --tz) minus reportLagDays. Billing export typically lags
        # 1-2 days, so the most recent day's data is incomplete.
        d1 = datetime.datetime.now(ZoneInfo(args.tz)).date() - timedelta(days=lag_days)
        args.date = d1.isoformat()
    if args.no_refresh:
        cached = os.path.join(REPORTS, f"billing-data-{args.date}.json")
        if os.path.exists(cached):
            return cached
    cmd = [sys.executable, os.path.join(os.path.dirname(__file__), "billing_data.py"),
           "--tz", args.tz, "--outdir", REPORTS, "--date", args.date]
    if args.all_projects:
        cmd += ["--all-projects"]
    if args.budget is not None:
        cmd += ["--budget", str(args.budget)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    sys.stderr.write(res.stderr)
    if res.returncode != 0:
        sys.exit(res.returncode)
    path = res.stdout.strip().splitlines()[-1]
    return path


def _name_score(name):
    """Higher = more likely a function export name. Prefer lowerCamelCase over
    PascalCase (classes) over ALLCAPS (constants)."""
    starts_lower = name[0].islower()
    has_upper = any(c.isupper() for c in name)
    has_lower = any(c.islower() for c in name)
    if starts_lower and has_upper:
        return 3   # lowerCamelCase
    if starts_lower:
        return 2   # all lowercase
    if has_upper and has_lower:
        return 1   # PascalCase (likely a class)
    return 0       # ALL_CAPS


def load_camel_map(functions_repo):
    """lower(name) -> best source-cased variant from *.js export files."""
    if not functions_repo or not os.path.isdir(functions_repo):
        return {}
    names = set()
    for fp in glob.glob(os.path.join(functions_repo, "handlers/exports/*.js")):
        try:
            with open(fp) as f:
                names.update(re.findall(r"[A-Za-z][A-Za-z0-9_]+", f.read()))
        except OSError:
            pass
    m = {}
    for n in names:
        key = n.lower()
        if key not in m or _name_score(n) > _name_score(m[key]):
            m[key] = n
    return m


def money(x): return f"${x:.2f}"
def approx(x): return f"~${x:.2f}"
def signed(x): return f"{'+' if x >= 0 else '-'}${abs(x):.2f}"


def render(data, apps_cfg, settings, sugg, camel_by_app):
    meta = data["meta"]; dates = meta["dates"]
    tgt = data["totals"]["budgetTarget"]
    market_res = [re.compile(p) for p in settings["marketplacePatterns"]]
    thr = settings["otherThreshold"]
    default_emoji = settings["defaultEmoji"]

    def disp(app):
        c = apps_cfg.get(app["project_id"])
        if c:
            return c["emoji"], c["name"], c.get("description", "")
        return default_emoji, app["project_name"], ""

    global_camel = {}
    for m in camel_by_app.values():
        global_camel.update(m)

    def fn_name(fid, pid):
        if fid == "(untagged)":
            return "(untagged)"
        for m in (camel_by_app.get(pid, {}), global_camel):
            if fid in m:
                return m[fid]
            if fid.endswith("gen2") and fid[:-4] in m:
                return m[fid[:-4]] + "Gen2"
        return fid

    def suggestion(name):
        for r in sugg["functionRules"]:
            if re.search(r["pattern"], name, re.I):
                return r["text"]
        return sugg["functionDefault"]

    market, full, other = [], [], []
    for a in data["apps"]:
        if any(r.search(a["project_name"]) for r in market_res):
            market.append(a)
        elif a["r30"] >= thr:
            full.append(a)
        elif a["r30"] > 0:
            other.append(a)

    now = datetime.datetime.now(ZoneInfo(settings["reportTimezoneDisplay"]))
    L = []
    L.append("# GCP Daily Cost Report\n")
    L.append("| | |")
    L.append("|---|---|")
    L.append(f"| **Thời gian** | {now.strftime('%H:%M:%S %-d/%-m/%Y')} (Bangkok) |")
    L.append(f"| **DoD** | {dates['d2']} → {dates['d1']} |")
    L.append(f"| **MTD** | {dates['monthStart']} → {dates['d1']} ({dates['mtdDays']} ngày) |")
    L.append(f"| **Rolling 30** | {dates['r30Start']} → {dates['r30End']} |")
    L.append("| **Nguồn** | BigQuery Billing Export |\n")
    L.append("---\n")

    for a in full:
        emoji, name, desc = disp(a)
        L.append(f"## {emoji} {name}")
        if desc:
            L.append(f"> {desc}")
        L.append(f"> Project: `{a['project_id']}` | Nguồn: BigQuery Billing Export\n")
        L.append("### 💰 Tổng quan\n")
        L.append("|  | Tháng này (MTD) | Rolling 30 ngày |")
        L.append("|--|---:|---:|")
        L.append(f"| Thực tế | {money(a['mtd'])} ({a['mtdDays']} ngày) | {money(a['r30'])} (30 ngày) |")
        L.append(f"| Trung bình / ngày | {approx(a['mtdAvg'])} | {approx(a['r30Avg'])} |")
        L.append(f"| **Ước tính tháng** | **{approx(a['mtdEstimate'])}** | **{approx(a['r30Estimate'])}** |\n")

        d = a["dod"]
        L.append("### 📈 Biến động ngày\n")
        L.append(f"| | Ngày kia ({d['d2']}) | Hôm qua ({d['d1']}) | Thay đổi |")
        L.append("|---|---|---|---|")
        if d["pct"] is None:
            chg = "— (mới)"
        else:
            arrow = "📈" if d["pct"] >= 0 else "📉"
            warn = " ⚠️" if abs(d["pct"]) >= 20 else ""
            chg = f"**{d['pct']:+.1f}% {arrow}{warn}**"
        L.append(f"| Chi phí | {money(d['d2Cost'])} | **{money(d['d1Cost'])}** | {chg} |\n")
        causes, fcauses = [], []
        for s in a["dodCauses"]["services"]:
            if abs(s["delta"]) >= 0.05:
                verb = "tăng" if s["delta"] >= 0 else "giảm"
                causes.append(f"- **{s['key']}**: {verb} {signed(s['delta'])} ({money(s['d2'])} → {money(s['d1'])})")
        for s in a["dodCauses"]["functions"]:
            if abs(s["delta"]) >= 0.05:
                verb = "tăng" if s["delta"] >= 0 else "giảm"
                fcauses.append(f"- fn `{fn_name(s['key'], a['project_id'])}`: {verb} {signed(s['delta'])} ({money(s['d2'])} → {money(s['d1'])})")
        if causes or fcauses:
            L.append("**Nguyên nhân chính:**\n")
            L += causes[:3] + fcauses[:3]
            L.append("")

        L.append("### 🗂️ Chi phí theo Service *(Rolling 30 ngày)*\n")
        L.append("| Service | Chi phí | % | Ước tính tháng |")
        L.append("|---------|--------:|--:|---------------:|")
        for s in a["services"]:
            L.append(f"| {s['bucket']} | {money(s['cost'])} | {s['pct']:.1f}% | {approx(s['cost'])} |")
        L.append("")

        if a["functions"]:
            L.append("### ⚡ Top Cloud Functions *(Rolling 30 ngày)*")
            L.append(f"> Tổng Functions: **{money(a['functionsTotal'])}**\n")
            L.append("| # | Function | Chi phí | % | Ước tính tháng |")
            L.append("|---|----------|--------:|--:|---------------:|")
            for i, f in enumerate(a["functions"][:30]):
                badge = "🔴" if i == 0 else "🟡" if i == 1 else "🟠" if i <= 4 else "⚪"
                L.append(f"| {badge} | `{fn_name(f['fn_id'], a['project_id'])}` | {money(f['cost'])} | {f['pct']:.1f}% | {approx(f['cost'])} |")
            rest = a["functions"][30:]
            if rest:
                L.append(f"\n_… và {len(rest)} functions khác (tổng {approx(sum(x['cost'] for x in rest))})_")
            L.append("")

        L.append("### 💡 Gợi ý Optimize\n")
        if a["r30Estimate"] <= tgt:
            L.append(f"> 💰 **Budget**: R30 estimate **{approx(a['r30Estimate'])}**/tháng → Target **${tgt:,.0f}** → dưới budget **{money(tgt - a['r30Estimate'])}** 🟢\n")
        else:
            L.append(f"> 💰 **Budget**: R30 estimate **{approx(a['r30Estimate'])}**/tháng → Target **${tgt:,.0f}** → vượt budget **{money(a['r30Estimate'] - tgt)}** 🔴\n")
        realfns = [f for f in a["functions"] if f["fn_id"] != "(untagged)"]
        if realfns:
            L.append("**🔧 Functions:**\n")
            L.append("| Function | Cost | Gợi ý |")
            L.append("|----------|-----:|-------|")
            for i, f in enumerate(realfns[:30]):
                nm = fn_name(f["fn_id"], a["project_id"])
                s = suggestion(nm)
                if i == 0:
                    s = f"⚠️ {f['pct']:.0f}% Cloud Fn → ưu tiên #1 · " + s
                L.append(f"| `{nm}` | {money(f['cost'])} | {s} |")
            rest = realfns[30:]
            if rest:
                L.append(f"\n_… và {len(rest)} functions khác (tổng {approx(sum(x['cost'] for x in rest))})_")
            L.append("")
        bullets = []
        for s in a["services"]:
            b = sugg["serviceBullets"].get(s["bucket"])
            if b and s["bucket"] != "Cloud Functions":
                bullets.append(f"- **{s['bucket']}** ({money(s['cost'])}): {b}")
        if bullets:
            L.append("**🛠️ Services:**\n")
            L += bullets
            L.append("")
        L.append("\n---\n")

    if other:
        L.append("## 📦 Other apps (nhỏ)\n")
        L.append("| App | Project | R30 | Est/tháng |")
        L.append("|-----|---------|----:|----------:|")
        for a in sorted(other, key=lambda x: x["r30"], reverse=True):
            emoji, name, _ = disp(a)
            L.append(f"| {emoji} {name} | `{a['project_id']}` | {money(a['r30'])} | {approx(a['r30Estimate'])} |")
        L.append("\n---\n")

    tot = data["totals"]
    total_est = tot["r30Estimate"]
    gap = round(total_est - tgt, 2)
    L.append(f"## 🎯 Mục tiêu: Optimize về ${tgt:,.0f}/tháng\n")
    if gap > 0:
        L.append(f"> **R30 estimate hiện tại: {approx(total_est)}/tháng → Target: ${tgt:,.0f} → Cần cắt: {approx(gap)} ({gap/total_est*100:.1f}%)** 🔴\n")
    else:
        L.append(f"> **R30 estimate hiện tại: {approx(total_est)}/tháng → Target: ${tgt:,.0f} → Dưới budget {approx(-gap)}** 🟢\n")
    L.append("| App | Estimate/tháng (R30) | % tổng | Mục tiêu |")
    L.append("|-----|---:|---:|---:|")
    ranked = sorted(full, key=lambda x: x["r30Estimate"], reverse=True)
    top_id = ranked[0]["project_id"] if ranked else None
    for a in ranked:
        emoji, name, _ = disp(a)
        pct = a["r30Estimate"] / total_est * 100 if total_est else 0
        if gap > 0 and a["project_id"] == top_id:
            goal = f"**{approx(a['r30Estimate'] - gap)}** *(cắt {approx(gap)})*"
        else:
            goal = f"{approx(a['r30Estimate'])} ✅ ổn"
        L.append(f"| {emoji} {name} | {approx(a['r30Estimate'])} | {pct:.1f}% | {goal} |")
    mk_total = round(sum(x["r30Estimate"] for x in market), 2)
    if market:
        L.append(f"| {settings['marketplaceLabel']} | {approx(mk_total)} | {mk_total/total_est*100:.1f}% | {approx(mk_total)} (SaaS) |")
    oth_total = round(sum(x["r30Estimate"] for x in other), 2)
    if other:
        L.append(f"| 📦 Other apps | {approx(oth_total)} | {oth_total/total_est*100:.1f}% | {approx(oth_total)} ✅ |")
    L.append("")
    if gap > 0 and ranked:
        top = ranked[0]; _, name, _ = disp(top)
        L.append(f"> 💡 **{name}** chiếm {top['r30Estimate']/total_est*100:.0f}% tổng chi phí — ưu tiên cắt giảm tại app này.\n")

    L.append("---\n## 💰 Tổng tất cả apps\n")
    L.append("|  | Tháng này (MTD) | Rolling 30 ngày |")
    L.append("|--|---:|---:|")
    L.append(f"| Thực tế | {money(tot['mtd'])} | {money(tot['r30'])} (30 ngày) |")
    L.append(f"| **Ước tính tháng** | **{approx(tot['mtdEstimate'])}** | **{approx(tot['r30Estimate'])}** |")
    L.append(f"| 🎯 Budget target | ${tgt:,.2f} | ${tgt:,.2f} |")
    if gap > 0:
        L.append(f"| Gap | — | **{approx(gap)}** cần cắt 🔴 |")
    else:
        L.append(f"| Gap | — | dưới budget {approx(-gap)} 🟢 |")
    L.append("")
    return "\n".join(L) + "\n"


def main():
    args = parse_args()
    apps_cfg = json.load(open(os.path.join(CONFIG, "apps.json")))
    settings = json.load(open(os.path.join(CONFIG, "settings.json")))
    sugg = json.load(open(os.path.join(CONFIG, "suggestions.json")))

    data_path = ensure_data(args, int(settings.get("reportLagDays", 1)))
    with open(data_path) as f:
        data = json.load(f)
    if args.budget is not None:
        data["totals"]["budgetTarget"] = args.budget

    camel_by_app = {pid: load_camel_map(cfg.get("functionsRepo"))
                    for pid, cfg in apps_cfg.items() if isinstance(cfg, dict)}

    md = render(data, apps_cfg, settings, sugg, camel_by_app)
    d1 = data["meta"]["dates"]["d1"]
    out_path = args.out or os.path.join(REPORTS, f"gcp-cost-{d1}.md")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        f.write(md)
    sys.stderr.write(f"\nWrote {out_path}\n")
    print(out_path)


if __name__ == "__main__":
    main()
