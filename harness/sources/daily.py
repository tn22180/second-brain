"""Open loops from daily-manager's open-loops.yml (structured task state)."""
from pathlib import Path

import yaml


def collect(cfg, date) -> str:
    path = Path(cfg["paths"]["daily_manager"]) / "open-loops.yml"
    if not path.exists():
        return "(no open-loops.yml)"
    with open(path) as f:
        loops = yaml.safe_load(f) or []
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    active = [l for l in loops if isinstance(l, dict) and not l.get("done")]
    active.sort(key=lambda l: order.get(l.get("pri", "low"), 9))
    if not active:
        return "(no open loops)"
    out = []
    for l in active:
        out.append(f"  - [{l.get('pri','?')}] {l.get('id','?')}: {l.get('what','')}")
    return "\n".join(out)
