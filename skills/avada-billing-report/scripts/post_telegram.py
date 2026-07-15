#!/usr/bin/env python3
"""Post the compact daily GCP cost summary to a Telegram chat/group/topic.

Reads the latest reports/billing-data-<d1>.json (or --data / --date), formats the
short message (the one the user wants in the group), and POSTs via the Telegram Bot
API. After the summary, uploads the full reports/gcp-cost-<d1>.md as a document so
viewers can read the detail (skip with --no-document). No external deps — urllib only.

Credentials come from (priority order):
  1. config/telegram.json   — {"botToken": "...", "chatId": "...", "messageThreadId": null}
  2. env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_THREAD_ID

Usage:
  python3 post_telegram.py                 # latest cached data (summary + full .md)
  python3 post_telegram.py --date 2026-05-26
  python3 post_telegram.py --dry-run       # print message, don't send
  python3 post_telegram.py --no-document   # summary only, skip the .md upload
"""
import argparse
import datetime
import glob
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import timedelta
from zoneinfo import ZoneInfo

SK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(SK, "config")
REPORTS = os.path.join(SK, "reports")
TG_API = "https://api.telegram.org/bot{token}/sendMessage"
TG_DOC_API = "https://api.telegram.org/bot{token}/sendDocument"


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--date", help="report day (d1) — loads reports/billing-data-<date>.json")
    p.add_argument("--data", help="explicit path to a billing-data-<d1>.json")
    p.add_argument("--tz", default="Asia/Ho_Chi_Minh",
                   help="timezone for computing today→default d1 (default Asia/Ho_Chi_Minh)")
    p.add_argument("--dry-run", action="store_true", help="print the message, do not send")
    p.add_argument("--no-document", action="store_true",
                   help="post only the summary; skip uploading the full reports/gcp-cost-<d1>.md")
    return p.parse_args()


def load_data(args, lag_days):
    if args.data:
        return json.load(open(args.data))
    if not args.date:
        d1 = datetime.datetime.now(ZoneInfo(args.tz)).date() - timedelta(days=lag_days)
        args.date = d1.isoformat()
    path = os.path.join(REPORTS, f"billing-data-{args.date}.json")
    if os.path.exists(path):
        return json.load(open(path))
    # Fall back to whichever data file exists most recently (e.g. user overrode).
    files = sorted(glob.glob(os.path.join(REPORTS, "billing-data-*.json")))
    if not files:
        sys.exit("No billing-data-*.json in reports/ — run render_report.py first.")
    sys.stderr.write(f"Note: {path} not found; using {files[-1]} instead.\n")
    return json.load(open(files[-1]))


def load_telegram_cfg():
    path = os.path.join(CONFIG, "telegram.json")
    cfg = {}
    if os.path.exists(path):
        cfg = json.load(open(path))
    token = cfg.get("botToken") or os.environ.get("TELEGRAM_BOT_TOKEN")
    chat = cfg.get("chatId") or os.environ.get("TELEGRAM_CHAT_ID")
    thread = cfg.get("messageThreadId") or os.environ.get("TELEGRAM_THREAD_ID")
    return token, chat, thread


def build_message(data, apps_cfg, settings):
    meta = data["meta"]; dates = meta["dates"]
    tgt = data["totals"]["budgetTarget"]
    market_re = [re.compile(p) for p in settings["marketplacePatterns"]]
    thr = settings["otherThreshold"]
    default_emoji = settings["defaultEmoji"]

    def disp(a):
        c = apps_cfg.get(a["project_id"])
        if c:
            return c["emoji"], c["name"]
        return default_emoji, a["project_name"]

    full = [a for a in data["apps"]
            if a["r30"] >= thr and not any(r.search(a["project_name"]) for r in market_re)]

    L = []
    L.append(f"🔥 GCP Cost Report — {dates['d1']}")
    L.append(f"📆 DoD: {dates['d2']} → {dates['d1']}")
    L.append("")

    for a in full:
        emoji, name = disp(a)
        L.append(f"{emoji} {name}")
        d = a["dod"]
        if d["pct"] is None:
            chg = "— (mới)"
        else:
            mark = " 🚨" if abs(d["pct"]) >= 30 else (" ⚠️" if abs(d["pct"]) >= 10 else "")
            if d["pct"] >= 0:
                chg = f"📈 +{d['pct']:.1f}%{mark}"
            else:
                chg = f"📉 {d['pct']:.1f}%{mark}"
        L.append(f"   Ngày {dates['d1']}: ${d['d1Cost']:.2f} {chg}")
        L.append(f"   Ước tính tháng (R30): ~${a['r30Estimate']:.2f}")
        L.append("")

    tot = data["totals"]
    L.append(f"📋 TỔNG R30: ${tot['r30']:.2f} — Ước tính tháng ~${tot['r30Estimate']:.2f}")
    gap = round(tot["r30Estimate"] - tgt, 2)
    gap_pct_of_target = gap / tgt * 100 if tgt else 0
    if gap <= 0:
        L.append(f"✅ R30 estimate ~${tot['r30Estimate']:.2f} vs target ${tgt:,.0f} → "
                 f"dưới budget ${-gap:.2f} 🟢")
    else:
        lead = "🚨" if gap_pct_of_target >= 20 else "⚠️"
        trail = "🔴" if gap_pct_of_target >= 20 else "🟡"
        L.append(f"{lead} R30 estimate ~${tot['r30Estimate']:.2f} vs target ${tgt:,.0f} → "
                 f"cần cắt ~${gap:.2f} ({gap_pct_of_target:.1f}%) {trail}")

    if full:
        L.append("")
        L.append("Phân bổ mục tiêu:")
        ranked = sorted(full, key=lambda x: x["r30Estimate"], reverse=True)
        top_id = ranked[0]["project_id"] if gap > 0 else None
        for a in ranked:
            emoji, name = disp(a)
            if gap > 0 and a["project_id"] == top_id:
                L.append(f"• {emoji} {name}: ~${a['r30Estimate']:.2f} → cần cắt về "
                         f"~${a['r30Estimate'] - gap:.2f} (cắt ~${gap:.2f})")
            else:
                L.append(f"• {emoji} {name}: ~${a['r30Estimate']:.2f} ✅ ổn")
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


def send_document(token, chat, thread, path, caption=None):
    """Upload a file via multipart/form-data (sendDocument). urllib only, no deps."""
    boundary = "----avadaBillingReport" + os.urandom(8).hex()
    with open(path, "rb") as f:
        file_bytes = f.read()
    fields = {"chat_id": str(chat)}
    if thread:
        fields["message_thread_id"] = str(thread)
    if caption:
        fields["caption"] = caption

    parts = []
    for name, val in fields.items():
        parts.append(f"--{boundary}\r\n".encode())
        parts.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        parts.append(val.encode() + b"\r\n")
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(
        f'Content-Disposition: form-data; name="document"; filename="{os.path.basename(path)}"\r\n'.encode())
    parts.append(b"Content-Type: text/markdown\r\n\r\n")
    parts.append(file_bytes + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)

    req = urllib.request.Request(TG_DOC_API.format(token=token), data=body, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": e.read().decode("utf-8", "replace")}
    except urllib.error.URLError as e:
        return {"ok": False, "error": str(e)}


def main():
    args = parse_args()
    apps_cfg = json.load(open(os.path.join(CONFIG, "apps.json")))
    settings = json.load(open(os.path.join(CONFIG, "settings.json")))
    data = load_data(args, int(settings.get("reportLagDays", 1)))
    msg = build_message(data, apps_cfg, settings)

    if args.dry_run:
        print(msg)
        return

    token, chat, thread = load_telegram_cfg()
    if not token or not chat:
        sys.stderr.write(
            "Telegram credentials not found. Either:\n"
            "  - create config/telegram.json with {\"botToken\":..., \"chatId\":..., \"messageThreadId\":null}\n"
            "  - or export TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (+ optional TELEGRAM_THREAD_ID)\n"
            "Skipping Telegram post.\n")
        sys.exit(2)

    res = send(token, chat, thread, msg)
    if res.get("ok"):
        sys.stderr.write(f"Telegram: posted to chat {chat}"
                         + (f" thread {thread}" if thread else "") + "\n")
    else:
        sys.stderr.write(f"Telegram FAILED: {res}\n")
        sys.exit(1)

    # Upload the full styled report so viewers can read the detail.
    if args.no_document:
        return
    d1 = data["meta"]["dates"]["d1"]
    report_path = os.path.join(REPORTS, f"gcp-cost-{d1}.md")
    if not os.path.exists(report_path):
        sys.stderr.write(
            f"Note: {report_path} not found — skipping document upload. "
            "Run render_report.py first to generate it.\n")
        return
    cap = f"📄 Chi tiết GCP Cost Report — {d1}"
    dres = send_document(token, chat, thread, report_path, caption=cap)
    if dres.get("ok"):
        sys.stderr.write(f"Telegram: uploaded {os.path.basename(report_path)}\n")
    else:
        sys.stderr.write(f"Telegram document upload FAILED: {dres}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
