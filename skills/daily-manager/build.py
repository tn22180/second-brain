#!/usr/bin/env python3
"""Render a tabbed daily dashboard from live sources.

Sources, each degrading independently:
  cost   <- avada-billing-report/reports/billing-data-*.json
  credit <- BigQuery creditHistories_daily_long (cached per day)
  git    <- local repos under ~/Documents/SEO-BLOG
  jobs   <- Firestore REST, shopDataPurgeJobs (needs gcloud token)
  loops  <- open-loops.yml (hand-maintained)

Self-contained output: no CDN, no fetch, opens offline from file://.
Per-day detail is embedded as JSON and rendered client-side on click.
"""
import glob
import html
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
REPORTS = os.path.expanduser("~/.claude/skills/avada-billing-report/reports")
CACHE = os.path.join(HERE, "cache")
REPO_ROOT = os.path.expanduser("~/Documents/SEO-BLOG")
REPOS = [
    "seo", "blogs", "ai-product-copy", "llm-ai-search-seo",
    "avada-image-optimizer", "avachat", "worker-sdk", "avada-apps-cdn",
]
OUT = os.path.expanduser("~/daily.html")
PRI_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
PRI_VN = {"critical": "Khẩn", "high": "Cao", "medium": "Vừa", "low": "Thấp"}

BQ_PROJECT = "avada-seo"
BQ_VIEW = "avada-seo.firestore_export.creditHistories_daily_long"
CREDIT_DAYS = 14
CACHE_VER = "v3"  # bump whenever the cached credit payload changes shape

# A spike must be both relative and absolute: +200% on a $0.30 app is noise, and
# +$25 on a $2,000 app is a rounding error. Require both.
SPIKE_ABS = 20.0   # USD/day added
SPIKE_PCT = 50.0   # vs the previous day

# Deliberately no join against shops_raw_changelog / shops_raw_latest: reading
# their `data` column forces a scan of the whole JSON blob (139 GB, ~$0.70 a run).
# This touches only the credit view (~216 MB); the per-day breakdown costs nothing
# extra because it is the same scan. Domains are resolved afterwards through a
# single free Firestore batchGet.
CREDIT_SQL = f"""
WITH win AS (
  SELECT shop_id, action, usage, event_date
  FROM `{BQ_VIEW}`
  WHERE event_date BETWEEN @d_from AND @d_day
),
daily AS (SELECT event_date, SUM(usage) v, COUNT(DISTINCT shop_id) s FROM win GROUP BY event_date),
acts AS (
  SELECT event_date, action, SUM(usage) v, COUNT(DISTINCT shop_id) s
  FROM win GROUP BY event_date, action
),
tops AS (
  SELECT event_date, shop_id, v FROM (
    -- shop_id breaks ties: without it the shops on the rn<=8 boundary swap
    -- between runs and the panel changes for no reason.
    SELECT event_date, shop_id, SUM(usage) v,
           ROW_NUMBER() OVER (PARTITION BY event_date ORDER BY SUM(usage) DESC, shop_id) rn
    FROM win GROUP BY event_date, shop_id
  ) WHERE rn <= 8
)
SELECT 'DAILY' kind, CAST(event_date AS STRING) d, CAST(s AS STRING) k, v, 0 AS s2 FROM daily
UNION ALL SELECT 'ACTION', CAST(event_date AS STRING), action, v, s FROM acts
UNION ALL SELECT 'TOP', CAST(event_date AS STRING), shop_id, v, 0 FROM tops
"""


# ---------------------------------------------------------------- collectors

def sh(args, cwd=None, timeout=15):
    try:
        r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def movers(causes, keep=4, floor=0.01):
    """The daily report's own top-N movers, already computed per app.

    This is a *ranked excerpt*, not a full breakdown: a service missing from the
    list moved less than the ones shown, it did not cost zero. Reading absolute
    per-service cost out of it is wrong — go to the billing export for that.
    """
    out = {}
    for grp in ("services", "functions"):
        items = [c for c in causes.get(grp, []) if abs(c.get("delta", 0)) >= floor]
        items.sort(key=lambda c: (-abs(c["delta"]), c["key"]))  # key breaks ties
        out[grp] = [{"k": c["key"], "d": round(c["delta"], 2),
                     "a": round(c.get("d2", 0), 2), "b": round(c.get("d1", 0), 2)}
                    for c in items[:keep]]
    return out


def collect_cost():
    """Per-day spend. `dod.d1Cost` is that single day's cost; `mtd`/`r30` are running totals."""
    days = []
    for f in sorted(glob.glob(f"{REPORTS}/billing-data-*.json"))[-30:]:
        try:
            d = json.load(open(f))
        except Exception:
            continue
        dates, t = d["meta"]["dates"], d["totals"]
        apps = []
        for a in d.get("apps", []):
            dod = a.get("dod") or {}
            if dod.get("d1") != dates["d1"]:
                continue  # stale row: this app's dod describes a different day
            apps.append({"id": a["project_id"], "name": a["project_name"],
                         "cost": round(dod.get("d1Cost", 0), 2),
                         "prev": round(dod.get("d2Cost", 0), 2),
                         "pct": round(dod.get("pct", 0) or 0, 1),
                         "why": movers(a.get("dodCauses") or {})})
        apps.sort(key=lambda a: -a["cost"])
        days.append({
            "d": dates["d1"],
            "total": round(sum(a["cost"] for a in apps), 2),
            "r30": t.get("r30", 0), "mtd": t.get("mtd", 0),
            "est": t.get("mtdEstimate", 0), "budget": t.get("budgetTarget", 0),
            "dayBudget": round(t.get("budgetTarget", 0) / max(dates.get("daysInMonth", 30), 1), 2),
            "apps": apps,
        })
    days.sort(key=lambda x: x["d"])
    return {"days": fill_gaps(days)}


def fill_gaps(days):
    """The report only exists for days the LaunchAgent actually ran. Insert explicit
    placeholders so evenly-spaced bars don't imply a continuous timeline."""
    if not days:
        return days
    out, cur = [], datetime.fromisoformat(days[0]["d"]).date()
    end = datetime.fromisoformat(days[-1]["d"]).date()
    have = {d["d"]: d for d in days}
    while cur <= end:
        k = cur.isoformat()
        out.append(have[k] if k in have else {"d": k, "total": 0, "missing": True, "apps": []})
        cur += timedelta(days=1)
    return out


def resolve_domains(shop_ids, token):
    """One batchGet for every shop at once. Purged shops come back `missing`."""
    if not shop_ids or not token:
        return {}
    base = f"projects/{BQ_PROJECT}/databases/(default)/documents/shops/"
    body = {"documents": [base + i for i in shop_ids], "mask": {"fieldPaths": ["shopifyDomain"]}}
    raw = sh(["curl", "-s", "-X", "POST",
              f"https://firestore.googleapis.com/v1/projects/{BQ_PROJECT}"
              f"/databases/(default)/documents:batchGet",
              "-H", f"Authorization: Bearer {token}",
              "-H", "Content-Type: application/json", "-d", json.dumps(body)], timeout=60)
    out = {}
    try:
        for r in json.loads(raw):
            if "found" in r:
                sid = r["found"]["name"].split("/")[-1]
                dom = r["found"].get("fields", {}).get("shopifyDomain", {}).get("stringValue")
                if dom:
                    out[sid] = dom
    except Exception:
        pass
    return out


def prune_cache(keep):
    """Drop stale days and files from older cache schemas."""
    for f in glob.glob(os.path.join(CACHE, "credit-*.json")):
        if os.path.basename(f) != keep:
            try:
                os.remove(f)
            except OSError:
                pass


def collect_credit():
    """Per-day AI credit usage. Cached per target day: many rebuilds, one query."""
    d_day = datetime.now(timezone.utc).date() - timedelta(days=1)
    d_from = d_day - timedelta(days=CREDIT_DAYS - 1)
    os.makedirs(CACHE, exist_ok=True)
    name = f"credit-{CACHE_VER}-{d_day}.json"
    prune_cache(name)
    cached = os.path.join(CACHE, name)
    if os.path.exists(cached):
        try:
            return json.load(open(cached))
        except Exception:
            pass

    raw = sh(["bq", f"--project_id={BQ_PROJECT}", "query", "--quiet",
              "--use_legacy_sql=false", "--format=json", "--max_rows=2000",
              f"--parameter=d_from:DATE:{d_from}", f"--parameter=d_day:DATE:{d_day}",
              CREDIT_SQL], timeout=180)
    if not raw:
        return {"error": "BigQuery không trả về dữ liệu (kiểm tra `bq` auth)"}
    try:
        rows = json.loads(raw)
    except Exception:
        return {"error": "BigQuery trả về dữ liệu lạ"}

    byday = {}
    for r in rows:
        day = byday.setdefault(r["d"], {"d": r["d"], "total": 0, "shops": 0,
                                        "actions": [], "tops": []})
        v = int(float(r["v"] or 0))
        if r["kind"] == "DAILY":
            day["total"], day["shops"] = v, int(r["k"] or 0)
        elif r["kind"] == "ACTION":
            shops = int(float(r["s2"] or 0))
            day["actions"].append({"action": r["k"], "usage": v, "shops": shops,
                                   "avg": round(v / shops) if shops else 0})
        else:
            day["tops"].append({"shop_id": r["k"], "usage": v})

    doms = resolve_domains(sorted({t["shop_id"] for d in byday.values() for t in d["tops"]}),
                           sh(["gcloud", "auth", "print-access-token"], timeout=25))
    for d in byday.values():
        # Name breaks ties so the table order is stable across rebuilds.
        d["actions"].sort(key=lambda x: (-x["usage"], x["action"]))
        d["tops"].sort(key=lambda x: (-x["usage"], x["shop_id"]))
        for t in d["tops"]:
            t["label"] = doms.get(t["shop_id"], t["shop_id"])

    data = {"day": str(d_day), "days": sorted(byday.values(), key=lambda x: x["d"])}
    try:
        json.dump(data, open(cached, "w"))
    except Exception:
        pass
    return data


def collect_git():
    cutoff = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    out = []
    for name in REPOS:
        path = os.path.join(REPO_ROOT, name)
        if not os.path.isdir(os.path.join(path, ".git")):
            continue
        dirty = len([l for l in sh(["git", "status", "--porcelain"], path).splitlines() if l])
        commits = [
            l.split("\t", 2) for l in sh(
                ["git", "log", f"--since={cutoff}", "--pretty=%h\t%ad\t%s", "--date=short"], path
            ).splitlines() if l
        ]
        unpushed = None
        if sh(["git", "rev-parse", "--abbrev-ref", "@{u}"], path):
            unpushed = len([l for l in sh(["git", "log", "--oneline", "@{u}..HEAD"], path).splitlines() if l])
        out.append({"repo": name, "branch": sh(["git", "branch", "--show-current"], path),
                    "dirty": dirty, "unpushed": unpushed, "commits": commits})
    return out


def collect_jobs():
    token = sh(["gcloud", "auth", "print-access-token"], timeout=25)
    if not token:
        return {"error": "chưa đăng nhập gcloud"}
    url = (f"https://firestore.googleapis.com/v1/projects/{BQ_PROJECT}/databases/(default)"
           "/documents/shopDataPurgeJobs?pageSize=60")
    raw = sh(["curl", "-s", "-H", f"Authorization: Bearer {token}", url], timeout=30)
    if not raw:
        return {"error": "không gọi được Firestore"}
    try:
        docs = json.loads(raw).get("documents", [])
    except Exception:
        return {"error": "Firestore trả về dữ liệu lạ"}

    def val(f, k, default=None):
        v = f.get(k)
        if not v:
            return default
        v = list(v.values())[0]
        return int(v) if isinstance(v, str) and v.isdigit() else v

    jobs = [{
        "id": d["name"].split("/")[-1],
        "status": val(d.get("fields", {}), "status", "?"),
        "processed": val(d.get("fields", {}), "processed", 0),
        "remaining": val(d.get("fields", {}), "remainingApprox"),
        "updated": d.get("updateTime", "")[:19],
    } for d in docs]
    jobs.sort(key=lambda j: j["updated"], reverse=True)
    return {"jobs": jobs[:6]}


def collect_loops():
    p = os.path.join(HERE, "open-loops.yml")
    try:
        items = [i for i in (yaml.safe_load(open(p)) or []) if not i.get("done")]
    except Exception as e:
        return {"error": str(e)}
    items.sort(key=lambda i: PRI_RANK.get(i.get("pri", "low"), 9))
    return {"items": items}


def build_alerts(cost, credit, git, jobs, loops):
    """Only things that want a decision today. Severity: bad | warn | info."""
    a = []
    days = [d for d in (cost.get("days") or []) if not d.get("missing")]
    if days:
        last = days[-1]
        if last["est"] > last["budget"]:
            a.append(("bad", "Chi phí",
                      f"Tháng này trên đà ${last['est']:,.0f}, vượt budget ${last['budget']:,.0f} "
                      f"khoảng ${last['est'] - last['budget']:,.0f}."))
        for app in sorted(last["apps"], key=lambda x: -(x["cost"] - x.get("prev", 0))):
            jump = app["cost"] - app.get("prev", 0)
            if jump < SPIKE_ABS or app.get("pct", 0) < SPIKE_PCT or not app.get("prev"):
                continue
            top = ((app.get("why") or {}).get("services") or [None])[0]
            why = f" Chủ yếu do {top['k']} (+${top['d']:,.2f})." if top and top["d"] > 0 else ""
            a.append(("bad", "Chi phí tăng vọt",
                      f"{app['id']} ngày {last['d']}: ${app['prev']:,.2f} → ${app['cost']:,.2f} "
                      f"(+{app['pct']:.0f}%).{why}"))

    cds = credit.get("days") or []
    if cds:
        cur = cds[-1]
        if len(cds) >= 8 and cur["total"]:
            base = sum(d["total"] for d in cds[-8:-1]) / 7
            if base and cur["total"] > base * 1.5:
                a.append(("warn", "AI credit",
                          f"Hôm {cur['d']} dùng {cur['total']:,} credit, cao hơn "
                          f"{cur['total']/base - 1:.0%} so với trung bình 7 ngày ({base:,.0f})."))
        # Concentration, not a fault. Measured over 2026-06-10..07-09 this fires on
        # 4/30 days, always when one shop runs a bulk job on an otherwise quiet day.
        # It is a ratio, so a low daily total trips it as easily as a big shop does.
        if cur["total"] and cur["tops"] and cur["tops"][0]["usage"] > cur["total"] * 0.25:
            t = cur["tops"][0]
            a.append(("info", "AI credit",
                      f"Một shop chiếm {t['usage']/cur['total']:.0%} credit hôm đó "
                      f"({t['label']} — {t['usage']:,}). Thường là bulk job, không phải lỗi."))

    for it in loops.get("items", []):
        if it.get("pri") == "critical":
            a.append(("bad", "Bảo mật", it["what"]))

    js = jobs.get("jobs", [])
    for j in js:
        if j["status"] == "running":
            a.append(("warn", "Job nền",
                      f"{j['id']} đang chạy — {j['processed']:,} shop xong, cập nhật {j['updated'][:10]}."))
    # remainingApprox is a snapshot taken when that job ended, so only the newest
    # job's figure still describes the world.
    if js and js[0]["status"] != "running" and js[0].get("remaining"):
        a.append(("warn", "Job nền",
                  f"Còn khoảng {js[0]['remaining']:,} shop đủ điều kiện purge — cần chạy đợt tiếp theo."))
    for r in git:
        if r["unpushed"]:
            a.append(("warn", "Git", f"{r['repo']}: {r['unpushed']} commit chưa push lên origin ({r['branch']})."))
        if r["dirty"]:
            a.append(("warn", "Git", f"{r['repo']}: {r['dirty']} file sửa chưa commit."))
    rank = {"bad": 0, "warn": 1, "info": 2}
    a.sort(key=lambda x: rank.get(x[0], 9))  # stable: order within a severity is preserved
    return a


# ------------------------------------------------------------------- render

ICONS = {
    "alert": '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    "cost": '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    "credit": '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
    "job": '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/>',
    "loop": '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
    "ship": '<circle cx="12" cy="12" r="3"/><path d="M3 12h6"/><path d="M15 12h6"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
    "moon": '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
}


def icon(name, size=18, cls="ic"):
    return (f'<svg class="{cls}" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" '
            f'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
            f'aria-hidden="true">{ICONS[name]}</svg>')


def esc(s):
    return html.escape(str(s))


CSS = """
*{box-sizing:border-box}
:root{
  --bg:#f6f7f9; --card:#fff; --fg:#0f172a; --muted:#475569; --line:#e2e8f0; --line2:#cbd5e1;
  --accent:#2563eb; --bad:#dc2626; --warn:#b45309; --ok:#047857;
  --bad-bg:#fef2f2; --warn-bg:#fffbeb; --nav:rgba(255,255,255,.88);
}
@media (prefers-color-scheme:dark){:root{
  --bg:#0d1117; --card:#161b22; --fg:#e6edf3; --muted:#9198a1; --line:#2a3038; --line2:#3d444d;
  --accent:#58a6ff; --bad:#f85149; --warn:#d29922; --ok:#3fb950;
  --bad-bg:#2a1416; --warn-bg:#2a2113; --nav:rgba(22,27,34,.88);
}}
:root[data-theme=dark]{
  --bg:#0d1117; --card:#161b22; --fg:#e6edf3; --muted:#9198a1; --line:#2a3038; --line2:#3d444d;
  --accent:#58a6ff; --bad:#f85149; --warn:#d29922; --ok:#3fb950;
  --bad-bg:#2a1416; --warn-bg:#2a2113; --nav:rgba(22,27,34,.88);
}
:root[data-theme=light]{
  --bg:#f6f7f9; --card:#fff; --fg:#0f172a; --muted:#475569; --line:#e2e8f0; --line2:#cbd5e1;
  --accent:#2563eb; --bad:#dc2626; --warn:#b45309; --ok:#047857;
  --bad-bg:#fef2f2; --warn-bg:#fffbeb; --nav:rgba(255,255,255,.88);
}
body{margin:0;background:var(--bg);color:var(--fg);
  font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px 64px}
.ic{flex-shrink:0}

nav{position:sticky;top:12px;z-index:20;margin:12px auto 24px;max-width:1080px;
  background:var(--nav);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  border:1px solid var(--line);border-radius:12px;
  display:flex;align-items:center;gap:4px;padding:8px 10px;flex-wrap:wrap}
.brand{font-weight:650;font-size:14px;margin-right:8px;padding-left:4px;white-space:nowrap}
[role=tab]{color:var(--muted);background:none;border:0;font:inherit;font-size:13px;
  padding:7px 11px;border-radius:7px;cursor:pointer;display:flex;align-items:center;gap:6px;
  transition:color .2s,background-color .2s}
[role=tab]:hover{color:var(--fg);background:var(--line)}
[role=tab][aria-selected=true]{color:var(--accent);
  background:color-mix(in srgb,var(--accent) 12%,transparent)}
[role=tab]:focus-visible,button:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.count{font-size:11px;font-variant-numeric:tabular-nums;background:var(--line);
  color:var(--muted);border-radius:99px;padding:0 6px;min-width:18px;text-align:center}
[role=tab][aria-selected=true] .count{background:var(--accent);color:#fff}
.spacer{flex:1}
#theme{background:none;border:1px solid var(--line);color:var(--muted);border-radius:7px;
  padding:6px 8px;cursor:pointer;display:flex;transition:color .2s,border-color .2s}
#theme:hover{color:var(--fg);border-color:var(--muted)}
#theme .moon{display:none}
:root[data-theme=dark] #theme .moon{display:block}
:root[data-theme=dark] #theme .sun{display:none}

header{padding:8px 0 4px}
h1{font-size:26px;margin:0 0 4px;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:13px;margin-bottom:22px}

.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:26px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.kpi .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);
  font-weight:600;margin-bottom:6px}
.kpi .val{font-size:24px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.kpi .hint{font-size:12px;color:var(--muted);margin-top:2px}
.kpi.is-bad .val{color:var(--bad)} .kpi.is-ok .val{color:var(--ok)}

[role=tabpanel]{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:22px}
[role=tabpanel][hidden]{display:none}
.head{display:flex;align-items:center;gap:9px;margin-bottom:4px}
h2{font-size:17px;margin:0;font-weight:650;letter-spacing:-.01em}
.why{color:var(--muted);font-size:12.5px;margin:0 0 18px}

.alerts{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.al{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border-radius:9px;
  border:1px solid var(--line);line-height:1.5}
.al.bad{background:var(--bad-bg);border-color:color-mix(in srgb,var(--bad) 35%,transparent)}
.al.warn{background:var(--warn-bg);border-color:color-mix(in srgb,var(--warn) 32%,transparent)}
.al.info{background:color-mix(in srgb,var(--accent) 7%,transparent);
  border-color:color-mix(in srgb,var(--accent) 30%,transparent)}
.al.info .ic{color:var(--accent)} .al.info b{color:var(--accent)}
.al.bad .ic{color:var(--bad)} .al.warn .ic{color:var(--warn)}
.al b{font-weight:600;margin-right:6px}
.al.bad b{color:var(--bad)} .al.warn b{color:var(--warn)}

.chart{width:100%;height:auto;display:block}
.bar{cursor:pointer;transition:opacity .15s}
.bar:hover{opacity:.75}
.hint-click{font-size:12px;color:var(--muted);margin:6px 0 16px;display:flex;gap:6px;align-items:center}
.daybox{border:1px solid var(--line);border-radius:10px;padding:16px;background:var(--bg)}
.dayhead{display:flex;align-items:baseline;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.dayhead .dt{font-size:15px;font-weight:650}
.dayhead .tot{font-size:15px;font-variant-numeric:tabular-nums;color:var(--accent);font-weight:600}
.dayhead .cmp{font-size:12px;color:var(--muted)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}

table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);
  border-bottom:1px solid var(--line2);padding:0 10px 8px 0;font-weight:600;white-space:nowrap}
td{padding:9px 10px 9px 0;border-bottom:1px solid var(--line);vertical-align:top}
tbody tr:last-child td{border-bottom:0}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.note{color:var(--muted);font-size:12px;margin-top:2px}
.muted{color:var(--muted)} .up{color:var(--bad)} .down{color:var(--ok)}
.why{margin-top:14px;border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:var(--bg)}
.whyhead{font-size:13px;margin-bottom:10px}
.whyg{margin-top:8px} .whyg h4{margin:0 0 4px;font-size:11px;letter-spacing:.06em;
  text-transform:uppercase;color:var(--muted);font-weight:600}
.whyr{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:baseline;
  padding:3px 0;font-size:13px;border-bottom:1px solid var(--line)}
.whyr:last-child{border-bottom:0}
.whyr>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.whyr .note{min-width:120px;text-align:right}
.scroll{overflow-x:auto}
.minih{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);
  font-weight:600;margin:0 0 8px}

.pill{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;
  border:1px solid var(--line2);color:var(--muted);white-space:nowrap}
.p-critical{background:var(--bad);color:#fff;border-color:transparent}
.p-high{color:var(--bad);border-color:currentColor}
.p-medium{color:var(--warn);border-color:currentColor}
.p-done{color:var(--ok);border-color:currentColor}
.p-run{color:var(--warn);border-color:currentColor}

.repo{padding:14px 0;border-bottom:1px solid var(--line)}
.repo:first-of-type{padding-top:0} .repo:last-child{border-bottom:0;padding-bottom:0}
.repo h3{font-size:14px;margin:0 0 8px;display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.commits{list-style:none;margin:0;padding:0}
.commits li{padding:4px 0;font-size:13px;display:flex;gap:9px;align-items:baseline}
.commits .mono{color:var(--accent)}

@media(max-width:1000px){.kpis{grid-template-columns:repeat(3,1fr)}}
@media(max-width:860px){.kpis{grid-template-columns:repeat(2,1fr)}.grid2{grid-template-columns:1fr}}
@media(max-width:620px){.kpis{grid-template-columns:1fr}[role=tab] .lbltxt{display:none}}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
"""

JS = r"""
const root=document.documentElement, KEY='dm-theme';
if(localStorage.getItem(KEY)) root.dataset.theme=localStorage.getItem(KEY);
document.getElementById('theme').onclick=()=>{
  const dark = root.dataset.theme
    ? root.dataset.theme==='dark'
    : matchMedia('(prefers-color-scheme:dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  localStorage.setItem(KEY, root.dataset.theme);
};

/* ---- tabs ---- */
const tabs=[...document.querySelectorAll('[role=tab]')];
const panels=id=>document.getElementById('p-'+id);
function select(id, push){
  if(!panels(id)) id = tabs[0].dataset.tab;
  tabs.forEach(t=>{
    const on = t.dataset.tab===id;
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
    panels(t.dataset.tab).hidden = !on;
  });
  if(push && location.hash.slice(1)!==id) history.replaceState(null,'','#'+id);
}
tabs.forEach((t,i)=>{
  t.onclick=()=>{select(t.dataset.tab,true); t.focus();};
  t.onkeydown=e=>{
    const d = e.key==='ArrowRight'?1 : e.key==='ArrowLeft'?-1 : e.key==='Home'?-i : e.key==='End'?tabs.length-1-i : 0;
    if(!d) return;
    e.preventDefault();
    const n=tabs[(i+d+tabs.length)%tabs.length];
    select(n.dataset.tab,true); n.focus();
  };
});
addEventListener('hashchange',()=>select(location.hash.slice(1),false));
select(location.hash.slice(1)||tabs[0].dataset.tab,false);

/* ---- per-day drilldown ---- */
const DATA=JSON.parse(document.getElementById('data').textContent);
const money=n=>'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const num=n=>n.toLocaleString('en-US');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function delta(cur,prev){
  if(prev==null||!prev) return '';
  const p=(cur/prev-1)*100;
  if(!isFinite(p)) return '';
  const cls=p>=0?'up':'down';
  return `<span class="${cls}">${p>=0?'+':'−'}${Math.abs(p).toFixed(0)}%</span>`;
}

function selectDay(kind,i){
  const svg=document.querySelector(`#p-${kind} .chart`);
  svg.querySelectorAll('.bar').forEach(b=>{
    const on = +b.dataset.i===i;
    b.setAttribute('fill', on?'var(--accent)':'var(--line2)');
    b.setAttribute('aria-selected', on);
  });
  document.getElementById(kind+'-detail').innerHTML =
    kind==='cost' ? costDay(i) : creditDay(i);
}

/* Previous day with an actual report — not i-1, which may be a gap placeholder. */
function prevOf(kind,i){
  for(let j=i-1;j>=0;j--) if(!DATA[kind][j].missing) return DATA[kind][j];
  return null;
}

const signed=n=>(n>0?'+':n<0?'−':'')+money(Math.abs(n));

/* The app whose absolute day-over-day swing is largest — the one worth explaining.
   Ties broken by project id so the panel does not reshuffle between rebuilds. */
function biggestMover(d){
  const c=d.apps.filter(a=>a.why&&a.prev!=null);
  if(!c.length) return null;
  c.sort((x,y)=>Math.abs(y.cost-y.prev)-Math.abs(x.cost-x.prev)||x.id.localeCompare(y.id));
  return Math.abs(c[0].cost-c[0].prev)>=1 ? c[0] : null;
}

function whyBlock(m){
  if(!m) return '';
  const grp=(title,list)=>!list||!list.length?'':`<div class=whyg><h4>${title}</h4>`+list.map(r=>
    `<div class=whyr><span title="${esc(r.k)}">${esc(r.k)}</span>
      <span class="mono ${r.d>0?'up':'down'}">${signed(r.d)}</span>
      <span class="note mono">${money(r.a)} → ${money(r.b)}</span></div>`).join('')+`</div>`;
  const j=m.cost-m.prev;
  return `<div class=why>
    <div class=whyhead>Vì sao đổi — <b>${esc(m.id)}</b>
      <span class=mono>${money(m.prev)} → ${money(m.cost)}</span>
      <span class="mono ${j>0?'up':'down'}">${signed(j)}</span></div>
    ${grp('Theo dịch vụ',m.why.services)}${grp('Theo function',m.why.functions)}
    <div class="note" style="margin-top:8px">Chỉ liệt kê các mục biến động mạnh nhất.
      Mục không xuất hiện nghĩa là nó đổi ít hơn — không phải bằng 0.</div>
  </div>`;
}

function costDay(i){
  const d=DATA.cost[i], p=prevOf('cost',i);
  const prevBy=p?Object.fromEntries(p.apps.map(a=>[a.id,a.cost])):{};
  const rows=d.apps.filter(a=>a.cost>0).map(a=>`<tr>
    <td>${esc(a.name)}<div class="note mono">${esc(a.id)}</div></td>
    <td class=num>${money(a.cost)}</td>
    <td class="num muted">${d.total?(a.cost/d.total*100).toFixed(0):0}%</td>
    <td class=num>${delta(a.cost,prevBy[a.id])}</td></tr>`).join('');
  const over=d.total-d.dayBudget;
  return `<div class=daybox>
    <div class=dayhead><span class=dt>${esc(d.d)}</span>
      <span class=tot>${money(d.total)}</span>
      <span class=cmp>${p?`${delta(d.total,p.total)} so với ${esc(p.d)} · `:''}
        ngân sách ngày ${money(d.dayBudget)} (${over>0?'vượt':'dưới'} ${money(Math.abs(over))})</span></div>
    <div class=scroll><table><thead><tr><th>App</th><th class=num>Chi phí</th>
      <th class=num>Tỷ lệ</th><th class=num>So hôm trước</th></tr></thead>
      <tbody>${rows||'<tr><td colspan=4 class=muted>Không có chi phí.</td></tr>'}</tbody></table></div>
    ${whyBlock(biggestMover(d))}
  </div>`;
}

function creditDay(i){
  const d=DATA.credit[i], p=prevOf('credit',i);
  const acts=d.actions.map(a=>`<tr><td>${esc(a.action)}</td>
    <td class=num>${num(a.usage)}</td>
    <td class="num muted">${d.total?(a.usage/d.total*100).toFixed(0):0}%</td>
    <td class=num>${num(a.shops)}</td>
    <td class="num muted">${num(a.avg)}</td></tr>`).join('');
  const tops=d.tops.map(t=>`<tr><td>${esc(t.label)}
    ${t.label!==t.shop_id?`<div class="note mono">${esc(t.shop_id)}</div>`:''}</td>
    <td class=num>${num(t.usage)}</td>
    <td class="num muted">${d.total?(t.usage/d.total*100).toFixed(0):0}%</td></tr>`).join('');
  return `<div class=daybox>
    <div class=dayhead><span class=dt>${esc(d.d)}</span>
      <span class=tot>${num(d.total)} credit</span>
      <span class=cmp>${p?`${delta(d.total,p.total)} so với ${esc(p.d)} · `:''}${num(d.shops)} shop · ${d.actions.length} tính năng</span></div>
    <div class=grid2>
      <div><h3 class=minih>Theo tính năng</h3><div class=scroll><table>
        <thead><tr><th>Tính năng</th><th class=num>Credit</th><th class=num>%</th>
          <th class=num>Shop dùng</th><th class=num>TB/shop</th></tr></thead>
        <tbody>${acts||'<tr><td colspan=5 class=muted>Không có.</td></tr>'}</tbody></table></div></div>
      <div><h3 class=minih>Top shop</h3><div class=scroll><table>
        <thead><tr><th>Shop</th><th class=num>Credit</th><th class=num>%</th></tr></thead>
        <tbody>${tops||'<tr><td colspan=3 class=muted>Không có.</td></tr>'}</tbody></table></div></div>
    </div>
  </div>`;
}

['cost','credit'].forEach(kind=>{
  const svg=document.querySelector(`#p-${kind} .chart`);
  if(!svg || !DATA[kind] || !DATA[kind].length) return;
  const bars=[...svg.querySelectorAll('.bar')];
  if(!bars.length) return;
  bars.forEach((b,pos)=>{
    const i=+b.dataset.i;
    b.onclick=()=>selectDay(kind,i);
    b.onkeydown=e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();selectDay(kind,i);return;}
      const step=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;
      if(!step) return;
      e.preventDefault();
      const n=bars[Math.min(Math.max(pos+step,0),bars.length-1)];
      n.focus(); n.click();
    };
  });
  selectDay(kind, +bars[bars.length-1].dataset.i);
});
"""


def bar_chart(days, key, w=680, h=170, fmt=lambda v: f"{v:,.0f}", ref=None, ref_label=""):
    """Clickable bars, indexed by data-i. Days with no report render as a hollow
    outline: not clickable, and visibly not zero."""
    if len(days) < 2:
        return '<p class="muted">Chưa đủ dữ liệu để vẽ.</p>'
    vals = [d[key] for d in days if not d.get("missing")]
    if not vals:
        return '<p class="muted">Chưa đủ dữ liệu để vẽ.</p>'
    pad_l, pad_r, pad_t, pad_b = 58, 10, 14, 24
    iw, ih = w - pad_l - pad_r, h - pad_t - pad_b
    hi = max(vals + ([ref] if ref else [])) or 1
    slot = iw / len(days)
    bw = max(slot * 0.64, 3)
    bars = ""
    for i, d in enumerate(days):
        x = pad_l + i * slot + (slot - bw) / 2
        if d.get("missing"):
            bars += (f'<rect class="gap" x="{x:.1f}" y="{pad_t + ih - 8:.1f}" width="{bw:.1f}" '
                     f'height="8" rx="2" fill="none" stroke="var(--line2)" stroke-width="1" '
                     f'stroke-dasharray="2 2"><title>{esc(d["d"])}: không có báo cáo</title></rect>')
            continue
        bh = d[key] / hi * ih
        bars += (f'<rect class="bar" data-i="{i}" x="{x:.1f}" y="{pad_t + ih - bh:.1f}" '
                 f'width="{bw:.1f}" height="{max(bh,1):.1f}" rx="2" fill="var(--line2)" '
                 f'tabindex="0" role="button" aria-label="{esc(d["d"])}: {esc(fmt(d[key]))}">'
                 f'<title>{esc(d["d"])}: {esc(fmt(d[key]))}</title></rect>')
    refline = ""
    if ref:
        ry = pad_t + ih - ref / hi * ih
        refline = (f'<line x1="{pad_l}" y1="{ry:.1f}" x2="{w-pad_r}" y2="{ry:.1f}" stroke="var(--bad)" '
                   f'stroke-width="1.5" stroke-dasharray="5 4"/>'
                   f'<text x="{w-pad_r}" y="{ry-5:.1f}" class="ax" text-anchor="end" fill="var(--bad)">'
                   f'{esc(ref_label)}</text>')
    return f'''<svg class="chart" viewBox="0 0 {w} {h}" role="group"
 aria-label="Biểu đồ {len(days)} ngày. Bấm vào một cột để xem chi tiết ngày đó.">
<style>.ax{{font:10px system-ui;fill:var(--muted)}}</style>
<text x="{pad_l-8}" y="{pad_t}" class="ax" text-anchor="end" dy="3.5">{esc(fmt(hi))}</text>
<line x1="{pad_l}" y1="{pad_t+ih}" x2="{w-pad_r}" y2="{pad_t+ih}" stroke="var(--line2)" stroke-width="1"/>
{bars}{refline}
<text x="{pad_l}" y="{h-5}" class="ax">{esc(days[0]["d"][5:])}</text>
<text x="{w-pad_r}" y="{h-5}" class="ax" text-anchor="end">{esc(days[-1]["d"][5:])}</text>
</svg>'''


def render(cost, credit, git, jobs, loops, alerts):
    now = datetime.now(timezone.utc).astimezone().strftime("%d/%m/%Y %H:%M")
    days = cost.get("days") or []
    real = [d for d in days if not d.get("missing")]  # gap placeholders carry no totals
    last = real[-1] if real else {}
    cds = credit.get("days") or []
    cur = cds[-1] if cds else {}
    items = loops.get("items", [])
    n_crit = sum(1 for i in items if i.get("pri") in ("critical", "high"))
    n_ship = sum(len(r["commits"]) for r in git)

    delta = ""
    if len(real) >= 8:
        d = last["r30"] - real[-8]["r30"]
        delta = f"{'+' if d >= 0 else '−'}${abs(d):,.0f} so với 7 ngày trước"
    over = last.get("est", 0) - last.get("budget", 0)

    cr_hint = f"{cur.get('shops',0)} shop" if cur else "chưa có dữ liệu"
    if cur and len(cds) >= 8:
        base = sum(x["total"] for x in cds[-8:-1]) / 7
        if base:
            pct = cur["total"] / base - 1
            cr_hint = f"{'+' if pct >= 0 else '−'}{abs(pct):.0%} vs TB 7 ngày · {cur['shops']} shop"

    kpis = f'''
<div class=kpi><div class=lbl>Chi phí 30 ngày</div>
  <div class=val>${last.get('r30',0):,.0f}</div><div class=hint>{esc(delta) or '&nbsp;'}</div></div>
<div class="kpi {'is-bad' if over > 0 else 'is-ok'}"><div class=lbl>Dự phóng tháng này</div>
  <div class=val>${last.get('est',0):,.0f}</div>
  <div class=hint>{'vượt' if over > 0 else 'dưới'} budget ${abs(over):,.0f}</div></div>
<div class=kpi><div class=lbl>AI credit hôm qua</div>
  <div class=val>{cur.get('total',0):,}</div><div class=hint>{esc(cr_hint)}</div></div>
<div class="kpi {'is-bad' if alerts else 'is-ok'}"><div class=lbl>Cần chú ý</div>
  <div class=val>{len(alerts)}</div>
  <div class=hint>{sum(1 for a in alerts if a[0]=='bad')} khẩn · {sum(1 for a in alerts if a[0]=='warn')} cảnh báo</div></div>
<div class=kpi><div class=lbl>Việc đang mở</div>
  <div class=val>{len(items)}</div><div class=hint>{n_crit} ưu tiên cao trở lên</div></div>'''

    alert_html = "".join(
        f'<li class="al {esc(sev)}">{icon("alert")}<div><b>{esc(tag)}</b>{esc(msg)}</div></li>'
        for sev, tag, msg in alerts
    ) or f'<li class="al">{icon("alert")}<div>Không có gì cần chú ý hôm nay.</div></li>'

    if loops.get("error"):
        loop_html = f'<p class="muted">Không đọc được open-loops.yml: {esc(loops["error"])}</p>'
    else:
        rows = "".join(
            f'<tr><td><span class="pill p-{esc(i.get("pri","low"))}">{esc(PRI_VN.get(i.get("pri","low"),"?"))}</span></td>'
            f'<td>{esc(i["what"])}'
            + (f'<div class="note">{esc(i["note"])}</div>' if i.get("note") else "")
            + f'</td><td class="num mono">{esc(i.get("since",""))}</td></tr>' for i in items)
        loop_html = (f'<div class=scroll><table><thead><tr><th>Ưu tiên</th><th>Việc</th>'
                     f'<th class=num>Treo từ</th></tr></thead><tbody>{rows}</tbody></table></div>')

    if jobs.get("error"):
        job_html = f'<p class="muted">Không lấy được: {esc(jobs["error"])}</p>'
    else:
        js = jobs.get("jobs", [])

        def rem(j, i):
            if not j.get("remaining"):
                return "—"
            n = f'{j["remaining"]:,}'
            return n if i == 0 else f'<span class="muted">{n}<sup>†</sup></span>'

        rows = "".join(
            f'<tr><td class="mono">{esc(j["id"][:38])}</td>'
            f'<td><span class="pill p-{"done" if j["status"]=="done" else "run"}">{esc(j["status"])}</span></td>'
            f'<td class="num">{j["processed"]:,}</td><td class="num">{rem(j,i)}</td>'
            f'<td class="num mono">{esc(j["updated"][:10])}</td></tr>' for i, j in enumerate(js))
        job_html = (f'<div class=scroll><table><thead><tr><th>Job</th><th>Trạng thái</th>'
                    f'<th class=num>Shop xong</th><th class=num>Còn lại</th><th class=num>Cập nhật</th>'
                    f'</tr></thead><tbody>{rows}</tbody></table></div>'
                    f'<p class="note">† Số cũ — chụp lúc job đó kết thúc, chưa trừ những shop mà job sau đã xoá. '
                    f'Chỉ dòng trên cùng phản ánh hiện tại.</p>')

    ship = ""
    for r in git:
        if not r["commits"]:
            continue
        badges = f'<span class="pill">{esc(r["branch"])}</span>'
        if r["unpushed"]:
            badges += f'<span class="pill p-high">{r["unpushed"]} chưa push</span>'
        if r["dirty"]:
            badges += f'<span class="pill p-medium">{r["dirty"]} chưa commit</span>'
        lis = "".join(f'<li><span class="mono">{esc(c[0])}</span><span class="note">{esc(c[1][5:])}</span>'
                      f'<span>{esc(c[2])}</span></li>' for c in r["commits"])
        ship += f'<div class=repo><h3>{esc(r["repo"])} {badges}</h3><ul class=commits>{lis}</ul></div>'
    ship = ship or '<p class="muted">Không có commit nào trong 7 ngày qua.</p>'

    def tab(tid, ic, label, n=None):
        c = f'<span class=count>{n}</span>' if n is not None else ""
        return (f'<button role=tab data-tab="{tid}" aria-controls="p-{tid}" aria-selected=false '
                f'tabindex=-1>{icon(ic,15)}<span class=lbltxt>{label}</span>{c}</button>')

    click_hint = ('<p class=hint-click>' + icon("alert", 14) +
                  'Bấm (hoặc Tab rồi Enter) vào một cột để xem chi tiết ngày đó. '
                  'Mũi tên trái/phải để đổi ngày.</p>')

    cost_chart = bar_chart(days, "total", fmt=lambda v: f"${v:,.0f}",
                           ref=last.get("dayBudget"),
                           ref_label=f"ngân sách/ngày ${last.get('dayBudget',0):,.0f}") if days else ""
    credit_chart = bar_chart(cds, "total") if cds else '<p class="muted">Chưa có dữ liệu.</p>'
    credit_body = (f'<p class="muted">Không lấy được: {esc(credit["error"])}</p>'
                   if credit.get("error") else
                   f'{credit_chart}{click_hint}<div id=credit-detail></div>')

    payload = json.dumps({"cost": days, "credit": cds}, ensure_ascii=False).replace("</", "<\\/")

    return f'''<title>Daily Manager — Avada</title>
<meta name=viewport content="width=device-width,initial-scale=1">
<style>{CSS}</style>

<nav role=tablist aria-label="Khu vực">
  <span class=brand>Daily Manager</span>
  {tab('alerts','alert','Cần chú ý',len(alerts))}
  {tab('cost','cost','Chi phí')}
  {tab('credit','credit','AI credit')}
  {tab('jobs','job','Job nền')}
  {tab('loops','loop','Việc mở',len(items))}
  {tab('shipped','ship','Đã ship',n_ship)}
  <span class=spacer></span>
  <button id=theme aria-label="Đổi sáng/tối">{icon('sun',16,'ic sun')}{icon('moon',16,'ic moon')}</button>
</nav>

<div class=wrap>
<header>
  <h1>Hôm nay có gì</h1>
  <div class=sub>Dựng lúc {now} · chi phí đến {esc(last.get('d','?'))}, credit đến {esc(credit.get('day','?'))}
    (BigQuery export trễ ~1–2 ngày)</div>
</header>

<div class=kpis>{kpis}</div>

<div role=tabpanel id=p-alerts aria-labelledby=alerts hidden>
  <div class=head>{icon('alert')}<h2>Cần chú ý</h2></div>
  <p class=why>Những thứ cần mày quyết hôm nay. Các tab khác chỉ để theo dõi.</p>
  <ul class=alerts>{alert_html}</ul>
</div>

<div role=tabpanel id=p-cost hidden>
  <div class=head>{icon('cost')}<h2>Chi phí</h2></div>
  <p class=why>Mỗi cột là chi phí GCP thật của một ngày (không phải tích luỹ). Đường đỏ đứt là ngân sách chia đều theo ngày.</p>
  {cost_chart}{click_hint}
  <div id=cost-detail></div>
</div>

<div role=tabpanel id=p-credit hidden>
  <div class=head>{icon('credit')}<h2>AI credit</h2></div>
  <p class=why>Credit khách dùng mỗi ngày (giờ UTC). Bấm vào ngày để xem action và top shop của riêng ngày đó.</p>
  {credit_body}
</div>

<div role=tabpanel id=p-jobs hidden>
  <div class=head>{icon('job')}<h2>Job nền</h2></div>
  <p class=why>Job xoá shop đã gỡ app. Chạy nền, không ai báo khi xong.</p>
  {job_html}
</div>

<div role=tabpanel id=p-loops hidden>
  <div class=head>{icon('loop')}<h2>Việc đang mở</h2></div>
  <p class=why>Việc đã bắt đầu, chưa đóng. Sửa tay ở <span class=mono>~/.claude/skills/daily-manager/open-loops.yml</span>
    — đổi <span class=mono>done: true</span> để gỡ khỏi đây.</p>
  {loop_html}
</div>

<div role=tabpanel id=p-shipped hidden>
  <div class=head>{icon('ship')}<h2>Đã ship — 7 ngày</h2></div>
  <p class=why>Commit theo repo, kèm nhánh đang làm và việc chưa push/chưa commit.</p>
  {ship}
</div>
</div>

<script type="application/json" id="data">{payload}</script>
<script>{JS}</script>
'''


def main():
    cost, git = collect_cost(), collect_git()
    credit = collect_credit()
    jobs, loops = collect_jobs(), collect_loops()
    alerts = build_alerts(cost, credit, git, jobs, loops)
    open(OUT, "w").write(render(cost, credit, git, jobs, loops, alerts))
    cds = credit.get("days") or []
    print(f"wrote {OUT}")
    print(f"  cost {len(cost['days'])}d | credit {len(cds)}d "
          f"({cds[-1]['total']:,} on {cds[-1]['d']})" if cds else "  credit —")
    print(f"  git {len(git)} repo | jobs {len(jobs.get('jobs',[]))} "
          f"| loops {len(loops.get('items',[]))} | alerts {len(alerts)}")
    for sev, tag, msg in alerts:
        print(f"  [{sev:4}] {tag}: {msg}")


if __name__ == "__main__":
    sys.exit(main())
