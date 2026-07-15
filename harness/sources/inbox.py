"""Manual jots the user dropped into daily/inbox.md.

Lines starting with '## candidate:' are memory-fact candidates the summarizer
appends; they are echoed back too so they stay visible until filed.
"""
from pathlib import Path


def collect(cfg, date) -> str:
    path = Path(cfg["_repo"]) / "daily" / "inbox.md"
    if not path.exists():
        return "(no inbox.md)"
    text = path.read_text(errors="replace").strip()
    return text if text else "(inbox empty)"
