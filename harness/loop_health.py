#!/usr/bin/env python3
"""Prove every unattended loop on this Mac left its output behind; alert on change.

Checks the artifact a loop must produce, not whether its process is alive — see
loops.yml for why. Alerts only on transitions (new failure, changed reason,
recovery) plus a re-alert while still failing, so an hourly run never spams.

    loop_health.py              check, alert, save state
    loop_health.py --dry-run    check and print only
"""
import argparse
import html
import datetime as dt
import glob
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
STATE_DIR = Path(os.environ.get("LOOP_HEALTH_STATE", "~/.cache/loop-health")).expanduser()
# Every subprocess is bounded: the fix-bot watchdog went blind for 2.5 days
# inside one unbounded probe (2026-08-23).
PROBE_TIMEOUT = 20


def parse_age(s):
    m = re.fullmatch(r"(\d+)([mhd])", str(s))
    if not m:
        raise ValueError(f"bad duration {s!r}")
    return int(m.group(1)) * {"m": 60, "h": 3600, "d": 86400}[m.group(2)]


def fmt_age(sec):
    if sec < 3600:
        return f"{sec // 60}m"
    if sec < 172800:
        return f"{sec // 3600}h"
    return f"{sec // 86400}d"


def expand(paths):
    out = []
    for p in paths if isinstance(paths, list) else [paths]:
        out += glob.glob(os.path.expanduser(p))
    return out


def check_launchd(c, now):
    try:
        r = subprocess.run(["launchctl", "print", f"gui/{os.getuid()}/{c['label']}"],
                           capture_output=True, text=True, timeout=PROBE_TIMEOUT)
    except subprocess.TimeoutExpired:
        return f"launchctl hung on {c['label']}"
    if r.returncode != 0:
        return f"{c['label']} not loaded"
    if c.get("running") and not re.search(r"^\s*pid = \d+", r.stdout, re.M):
        return f"{c['label']} loaded but no pid"
    return None


def check_file_fresh(c, now):
    files = expand(c["path"])
    if not files:
        return f"no file at {c['path']}"
    age = int(now - max(os.path.getmtime(f) for f in files))
    if age > parse_age(c["max_age"]):
        return f"{Path(max(files, key=os.path.getmtime)).name} stale {fmt_age(age)} (max {c['max_age']})"
    return None


def check_dated_file(c, now):
    dates = []
    for f in expand(c["path"]):
        m = re.search(r"\d{4}-\d{2}-\d{2}", Path(f).name)
        if m:
            dates.append(dt.date.fromisoformat(m.group()))
    if not dates:
        return f"no dated file at {c['path']}"
    newest = max(dates)
    lag = (dt.date.fromtimestamp(now) - newest).days
    if lag > c["max_lag_days"]:
        return f"newest {newest} is {lag}d old (max {c['max_lag_days']}d)"
    return None


def check_git_ref(c, now):
    repo = os.path.expanduser(c["repo"])
    try:
        r = subprocess.run(["git", "-C", repo, "log", "-1", "--format=%ct", c["ref"]],
                           capture_output=True, text=True, timeout=PROBE_TIMEOUT)
    except subprocess.TimeoutExpired:
        return f"git hung on {repo}"
    if r.returncode != 0 or not r.stdout.strip():
        return f"{c['ref']} unreadable in {repo}"
    age = int(now - int(r.stdout.strip()))
    if age > parse_age(c["max_age"]):
        return f"{c['ref']} last commit {fmt_age(age)} ago (max {c['max_age']})"
    return None


def check_expires(c, now):
    left = (dt.date.fromisoformat(str(c["date"])) - dt.date.fromtimestamp(now)).days
    if left < 0:
        return f"{c.get('what', 'credential')} expired {c['date']}"
    if left <= c.get("warn_days", 7):
        return f"{c.get('what', 'credential')} expires {c['date']} ({left}d left)"
    return None


CHECKS = {
    "launchd": check_launchd,
    "file_fresh": check_file_fresh,
    "dated_file": check_dated_file,
    "git_ref": check_git_ref,
    "expires": check_expires,
}


def run_checks(cfg, now):
    results = {}
    for loop in cfg["loops"]:
        fails = []
        for c in loop["checks"]:
            try:
                err = CHECKS[c["kind"]](c, now)
            except Exception as e:  # a broken check is itself a failure, never a pass
                err = f"{c['kind']} check error: {e}"
            if err:
                fails.append(err)
        results[loop["name"]] = fails
    return results


def decide(results, state, now, realert_sec):
    """Return (messages, new_state). Pure, so the transition rules are testable."""
    msgs, new = [], {}
    for name, fails in results.items():
        prev = state.get(name, {})
        if not fails:
            if prev.get("fails"):
                msgs.append(f"✅ {name}: recovered")
            new[name] = {"fails": []}
            continue
        changed = fails != prev.get("fails")
        due = now - prev.get("alerted_at", 0) >= realert_sec
        alerted_at = prev.get("alerted_at", 0)
        if changed or due:
            msgs.append(f"🚨 {name}: " + "; ".join(fails))
            alerted_at = now
        new[name] = {"fails": fails, "alerted_at": alerted_at}
    return msgs, new


def notify_macos(text):
    subprocess.run(["osascript", "-e", f"display notification {json.dumps(text)} with title \"loop-health\""],
                   capture_output=True, timeout=PROBE_TIMEOUT)


def read_env_var(env_file, name):
    for line in Path(os.path.expanduser(env_file)).read_text().splitlines():
        k, _, v = line.partition("=")
        if k.strip() == name:
            return v.strip().strip('"').strip("'")
    raise KeyError(f"{name} not in {env_file}")


def telegram_text(msgs):
    return "<b>loop-health</b>\n" + html.escape("\n".join(msgs), quote=False)


def notify_telegram(tg, text):
    # Token is read at send time from the bot's own env file, never copied here.
    token = read_env_var(tg["env_file"], tg["token_var"])
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=urllib.parse.urlencode({"chat_id": tg["chat_id"], "text": text, "parse_mode": "HTML"}).encode())
    urllib.request.urlopen(req, timeout=15).read()


def send(cfg, msgs):
    text = "\n".join(msgs)
    n = cfg.get("notify", {})
    if n.get("macos", True):
        try:
            notify_macos(text if len(msgs) == 1 else f"{len(msgs)} loop changes — see ~/.cache/loop-health/last-run")
        except Exception as e:
            print(f"WARN macOS notify failed: {e}", file=sys.stderr)
    tg = n.get("telegram") or {}
    if tg.get("enabled"):
        try:
            notify_telegram(tg, telegram_text(msgs))
        except Exception as e:  # message only: the URL would carry the bot token
            print(f"WARN telegram notify failed: {type(e).__name__}", file=sys.stderr)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=str(HERE / "loops.yml"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    cfg = yaml.safe_load(Path(args.config).read_text())
    now = time.time()
    results = run_checks(cfg, now)

    lines = [f"{'OK ' if not f else 'FAIL'}  {n}" + ("" if not f else "  — " + "; ".join(f))
             for n, f in results.items()]
    report = f"{dt.datetime.fromtimestamp(now):%Y-%m-%d %H:%M}\n" + "\n".join(lines)
    print(report)
    if args.dry_run:
        return 0

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    state_file = STATE_DIR / "state.json"
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    msgs, new_state = decide(results, state, now, parse_age(cfg.get("notify", {}).get("realert", "24h")))
    if msgs:
        send(cfg, msgs)
    state_file.write_text(json.dumps(new_state, indent=1, ensure_ascii=False))
    # The heartbeat other loops (and you) read to know this checker is itself alive.
    (STATE_DIR / "last-run").write_text(report + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
