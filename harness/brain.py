#!/usr/bin/env python3
"""second-brain harness entrypoint.

Subcommands:
  status   show config + repo state + last run
  mirror   rsync ~/.claude/skills + memory dir into the repo (copies)
  learn    collect today's raw signal from all enabled sources (prints)
  summarize  run the LLM summary over today's signal -> daily/<date>.md
  sync     mirror -> learn -> summarize -> commit -> push
  push     git add/commit/push (used by sync; standalone for manual)
"""
import argparse
import datetime as _dt
import os
import sys
from pathlib import Path

import yaml

HARNESS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(HARNESS_DIR))


def expand(p: str) -> Path:
    return Path(os.path.expanduser(str(p)))


def load_config() -> dict:
    with open(HARNESS_DIR / "config.yml") as f:
        cfg = yaml.safe_load(f)
    # normalize path-like values
    for k, v in cfg.get("paths", {}).items():
        cfg["paths"][k] = str(expand(v))
    cfg["claude_bin"] = str(expand(cfg["claude_bin"]))
    cfg["_harness_dir"] = str(HARNESS_DIR)
    cfg["_repo"] = cfg["paths"]["repo"]
    return cfg


def today_str(cfg) -> str:
    # local date; launchd runs in local tz
    return _dt.datetime.now().strftime("%Y-%m-%d")


# ---- subcommand handlers -------------------------------------------------

def cmd_status(cfg, args):
    repo = Path(cfg["_repo"])
    print(f"repo:        {repo}")
    print(f"claude_bin:  {cfg['claude_bin']}  ({'ok' if Path(cfg['claude_bin']).exists() else 'MISSING'})")
    print(f"remote:      {cfg['git']['remote']} / {cfg['git']['branch']}")
    print("sources:     " + ", ".join(k for k, v in cfg["sources"].items() if v))
    daily = repo / "daily"
    notes = sorted(daily.glob("20*.md")) if daily.exists() else []
    print(f"daily notes: {len(notes)}" + (f" (latest {notes[-1].name})" if notes else ""))
    # git state
    import subprocess
    if (repo / ".git").exists():
        head = subprocess.run(["git", "-C", str(repo), "log", "-1", "--format=%h %ci %s"],
                              capture_output=True, text=True)
        print("last commit: " + (head.stdout.strip() or "(none yet)"))


def cmd_mirror(cfg, args):
    import mirror
    mirror.run(cfg)


def cmd_resume(cfg, args):
    import resume
    resume.sync(cfg)


def cmd_learn(cfg, args):
    import learn
    signal = learn.collect(cfg, today_str(cfg))
    print(signal)


def cmd_summarize(cfg, args):
    import learn
    import summarize
    date = today_str(cfg)
    signal = learn.collect(cfg, date)
    path = summarize.run(cfg, date, signal)
    print(f"wrote {path}")


def cmd_push(cfg, args):
    import gitutil
    gitutil.commit_push(cfg, args.message or f"brain: sync {today_str(cfg)}")


def cmd_sync(cfg, args):
    import mirror
    import learn
    import summarize
    import gitutil
    date = today_str(cfg)
    print("[1/5] mirror");    mirror.run(cfg)
    if cfg.get("resume_all"):
        import resume
        print("[2/5] resume");  resume.sync(cfg)
    print("[3/5] learn");     signal = learn.collect(cfg, date)
    print("[4/5] summarize"); summarize.run(cfg, date, signal)
    print("[5/5] push");      gitutil.commit_push(cfg, f"brain: sync {date}")
    print("done")


HANDLERS = {
    "status": cmd_status,
    "mirror": cmd_mirror,
    "resume": cmd_resume,
    "learn": cmd_learn,
    "summarize": cmd_summarize,
    "push": cmd_push,
    "sync": cmd_sync,
}


def main():
    ap = argparse.ArgumentParser(prog="brain")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in HANDLERS:
        p = sub.add_parser(name)
        if name == "push":
            p.add_argument("-m", "--message")
    args = ap.parse_args()
    cfg = load_config()
    HANDLERS[args.cmd](cfg, args)


if __name__ == "__main__":
    main()
