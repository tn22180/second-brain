#!/usr/bin/env python3
"""Post a compact daily AI-credit-usage summary to Telegram. Same style as the
avada-billing-report Telegram post.

Credentials lookup order:
  1. config/telegram.json in this skill
  2. ~/.claude/skills/avada-billing-report/config/telegram.json  (so we reuse
     the existing bot/group rather than asking the user to set up a second one)
  3. env vars TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (+ TELEGRAM_THREAD_ID)

Default reports yesterday (UTC, matching Firestore creditHistories doc-id
convention). The BigQuery mirror is realtime, so 1-day lag is enough.

Usage:
  post_telegram.py                          # yesterday (UTC)
  post_telegram.py --date 2026-05-26
  post_telegram.py --week 2026-W21
  post_telegram.py --from 2026-05-20 --to 2026-05-26
  post_telegram.py --dry-run                # print, don't send
  post_telegram.py --top 5                  # top N shops in the post (default 5)
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date as Date, timedelta

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT = os.environ.get("BQ_PROJECT", "avada-seo")
VIEW = os.environ.get("BQ_VIEW", "avada-seo.firestore_export.creditHistories_daily_long")
TG_API = "https://api.telegram.org/bot{token}/sendMessage"

# Shop domains come from Firestore, not BigQuery. Joining shops_raw_changelog to
# read `data` scans the whole JSON blob — 139 GB, ~$0.70 every run, daily — while
# the credit view alone is ~216 MB. Firestore point reads are free.
FIRESTORE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"

ACTION_EMOJI = {
    "seoOnPageAudit":     "🔍",
    "imageAltText":       "🖼️",
    "generateAnchorText": "⚓",
    "generateFaqsInBulk": "❓",
    "unknown":            "❔",
}


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    rng = p.add_mutually_exclusive_group()
    rng.add_argument("--date", help="single day YYYY-MM-DD (default: yesterday UTC)")
    rng.add_argument("--week", help="ISO week YYYY-Www (Mon..Sun UTC)")
    rng.add_argument("--from", dest="date_from", help="range start YYYY-MM-DD (with --to)")
    p.add_argument("--to", dest="date_to", help="range end YYYY-MM-DD (with --from)")
    p.add_argument("--top", type=int, default=30, help="top N shops in the post (default 30)")
    p.add_argument("--dry-run", action="store_true", help="print the message, don't send")
    return p.parse_args()


def resolve_range(args):
    if args.date:
        d = Date.fromisoformat(args.date)
        return d, d, "single"
    if args.week:
        m = re.match(r"^(\d{4})-W(\d{1,2})$", args.week)
        if not m:
            sys.exit(f"Bad --week '{args.week}'")
        start = Date.fromisocalendar(int(m.group(1)), int(m.group(2)), 1)
        return start, start + timedelta(days=6), "week"
    if args.date_from:
        if not args.date_to:
            sys.exit("--from requires --to")
        a, b = Date.fromisoformat(args.date_from), Date.fromisoformat(args.date_to)
        return a, b, "range"
    d = datetime.datetime.now(datetime.timezone.utc).date() - timedelta(days=1)
    return d, d, "single"


def load_telegram_cfg():
    candidates = [
        os.path.join(SKILL, "config", "telegram.json"),
        os.path.expanduser("~/.claude/skills/avada-billing-report/config/telegram.json"),
    ]
    for p in candidates:
        if os.path.exists(p):
            cfg = json.load(open(p))
            return cfg.get("botToken"), cfg.get("chatId"), cfg.get("messageThreadId"), p
    return (os.environ.get("TELEGRAM_BOT_TOKEN"),
            os.environ.get("TELEGRAM_CHAT_ID"),
            os.environ.get("TELEGRAM_THREAD_ID"),
            "env vars")


SQL = """
WITH agg AS (
  SELECT shop_id, action, SUM(usage) AS usage
  FROM `{view}`
  WHERE event_date BETWEEN @date_from AND @date_to
  GROUP BY shop_id, action
),
top_shops AS (
  -- shop_id breaks ties: without it the shops sitting exactly on the LIMIT
  -- boundary swap between runs and the report changes for no reason.
  SELECT shop_id, SUM(usage) AS total_usage
  FROM agg GROUP BY shop_id
  ORDER BY total_usage DESC, shop_id LIMIT @top
),
action_totals AS (
  SELECT action, SUM(usage) AS usage FROM agg GROUP BY action
),
overall AS (
  SELECT SUM(usage) AS total_usage, COUNT(DISTINCT shop_id) AS total_shops FROM agg
)
SELECT 'TOP' AS kind, shop_id AS key, shop_id AS label, total_usage AS value FROM top_shops
UNION ALL
SELECT 'ACTION', action, action, usage FROM action_totals
UNION ALL
SELECT 'OVERALL', '', CAST(total_shops AS STRING), total_usage FROM overall
"""


def resolve_domains(shop_ids):
    """One Firestore batchGet. Missing shops keep their id, matching the old
    `IFNULL(shopify_domain, shop_id)` fallback exactly."""
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


def run_bq(d_from, d_to, top):
    cmd = ["bq", f"--project_id={PROJECT}", "query", "--quiet",
           "--use_legacy_sql=false", "--format=json", "--max_rows=10000",
           f"--parameter=date_from:DATE:{d_from.isoformat()}",
           f"--parameter=date_to:DATE:{d_to.isoformat()}",
           f"--parameter=top:INT64:{top}",
           SQL.format(view=VIEW)]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.stderr.write(f"bq failed:\n{proc.stdout}\n{proc.stderr}\n")
        sys.exit(1)
    rows = json.loads(proc.stdout) if proc.stdout.strip() else []
    doms = resolve_domains([r["key"] for r in rows if r["kind"] == "TOP"])
    for r in rows:
        if r["kind"] == "TOP":
            r["label"] = doms.get(r["key"], r["key"])
    return rows


def fmt(n):
    return f"{int(n):,}"


def build_message(rows, d_from, d_to, kind, top_n):
    tops, actions, overall = [], [], {"total_usage": 0, "total_shops": 0}
    for r in rows:
        v = int(float(r["value"] or 0))
        if r["kind"] == "TOP":
            tops.append({"shop_id": r["key"], "label": r["label"], "value": v})
        elif r["kind"] == "ACTION":
            actions.append({"action": r["key"], "value": v})
        else:
            overall["total_usage"] = v
            overall["total_shops"] = int(r["label"] or 0)
    tops.sort(key=lambda x: x["value"], reverse=True)
    actions.sort(key=lambda x: x["value"], reverse=True)

    if kind == "single":
        header = f"💳 AI Credit Usage — {d_from.isoformat()}"
    elif kind == "week":
        header = f"💳 AI Credit Usage — Tuần {d_from.isoformat()} → {d_to.isoformat()}"
    else:
        header = f"💳 AI Credit Usage — {d_from.isoformat()} → {d_to.isoformat()}"

    L = [header]
    L.append(f"📊 Tổng: {fmt(overall['total_usage'])} credits từ {fmt(overall['total_shops'])} shops")

    if actions:
        L.append("")
        L.append("By action:")
        for a in actions:
            emoji = ACTION_EMOJI.get(a["action"], "•")
            L.append(f"{emoji} {a['action']}: {fmt(a['value'])}")

    if tops:
        L.append("")
        L.append(f"🏆 Top {len(tops)} shops:")
        for i, t in enumerate(tops, 1):
            L.append(f"{i}. {t['label']} — {fmt(t['value'])}")

    return "\n".join(L)


def send(token, chat, thread, text):
    payload = {"chat_id": chat, "text": text, "disable_web_page_preview": "true"}
    if thread:
        payload["message_thread_id"] = str(thread)
    body = urllib.parse.urlencode(payload).encode()
    req = urllib.request.Request(TG_API.format(token=token), data=body, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": e.read().decode("utf-8", "replace")}
    except urllib.error.URLError as e:
        return {"ok": False, "error": str(e)}


def main():
    args = parse_args()
    d_from, d_to, kind = resolve_range(args)
    rows = run_bq(d_from, d_to, args.top)
    if not rows:
        sys.stderr.write(f"No credit usage data for {d_from} → {d_to}; skipping post.\n")
        sys.exit(0)
    msg = build_message(rows, d_from, d_to, kind, args.top)

    if args.dry_run:
        print(msg)
        return

    token, chat, thread, cfg_src = load_telegram_cfg()
    if not token or not chat:
        sys.exit("Telegram credentials not found in config/telegram.json or env vars.")
    res = send(token, chat, thread, msg)
    if res.get("ok"):
        sys.stderr.write(f"Telegram: posted to chat {chat} (creds from {cfg_src})\n")
    else:
        sys.stderr.write(f"Telegram FAILED: {res}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
