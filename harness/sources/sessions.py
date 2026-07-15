"""Today's Claude Code activity from ~/.claude/history.jsonl.

Each line: {display, timestamp(ms str), project, sessionId, ...}.
`display` is what the user typed. Richest cheap signal for "what I worked on".
Grouped by project, deduped, capped.
"""
import datetime as _dt
import json
from pathlib import Path

MAX_PER_PROJECT = 40


def _today_ms_range():
    now = _dt.datetime.now()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return int(start.timestamp() * 1000), int(now.timestamp() * 1000) + 1000


def collect(cfg, date) -> str:
    path = Path(cfg["paths"]["history"])
    if not path.exists():
        return "(no history.jsonl)"
    lo, hi = _today_ms_range()
    by_proj = {}
    with open(path, errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
                ts = int(d.get("timestamp", 0))
            except (ValueError, TypeError):
                continue
            if not (lo <= ts <= hi):
                continue
            disp = (d.get("display") or "").strip()
            if not disp or disp.startswith("/"):  # skip slash-command noise
                continue
            proj = Path(d.get("project", "?")).name or "?"
            by_proj.setdefault(proj, [])
            if disp not in by_proj[proj]:
                by_proj[proj].append(disp)
    if not by_proj:
        return "(no Claude Code prompts today)"
    out = []
    for proj, prompts in sorted(by_proj.items()):
        out.append(f"[{proj}] ({len(prompts)} prompts)")
        for p in prompts[:MAX_PER_PROJECT]:
            out.append(f"  - {p}")
    return "\n".join(out)
