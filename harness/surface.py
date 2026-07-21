"""Read-loop surfacing: matured inbox candidates -> session-start context.

A candidate matures once its (×N) recurrence counter reaches read_loop.maturity_days.
Held (`#hold`) and promoted (`[x]`) lines never surface. This only *reminds* — it
never writes to ~/.claude memory (promotion stays a manual, reviewed step).
"""
import re
from pathlib import Path


def matured(cfg) -> list[tuple[int, str]]:
    """Return [(count, text), ...] for open candidates with count >= threshold,
    most-recurring first."""
    threshold = int(cfg.get("read_loop", {}).get("maturity_days", 2))
    inbox = Path(cfg["_repo"]) / "daily" / "inbox.md"
    if not inbox.exists():
        return []
    out: list[tuple[int, str]] = []
    for ln in inbox.read_text(errors="replace").splitlines():
        m = re.match(r"^\s*- \[ \]\s*(.*)$", ln)
        if not m:
            continue
        rest = m.group(1)
        if "#hold" in rest:
            continue
        cm = re.search(r"\(×(\d+)\)", rest)
        n = int(cm.group(1)) if cm else 1
        if n >= threshold:
            text = re.sub(r"^\(×\d+\)\s*", "", rest).strip()
            out.append((n, text))
    out.sort(key=lambda t: t[0], reverse=True)
    return out


def render_text(cfg) -> str:
    """Human-readable block for `brain surface`."""
    rows = matured(cfg)
    if not rows:
        return "(no matured candidates)"
    lines = ["Matured second-brain memory candidates (recurred, unreviewed):"]
    for n, text in rows:
        lines.append(f"  - (×{n}) {text}")
    lines.append("Review each: promote to ~/.claude memory, or tag #hold in daily/inbox.md.")
    return "\n".join(lines)


def render_hook(cfg) -> str:
    """SessionStart-hook envelope. Empty string when nothing matured (emit nothing)."""
    rows = matured(cfg)
    if not rows:
        return ""
    body = "\n".join(f"- (×{n}) {text}" for n, text in rows)
    ctx = (
        "Second-brain read-loop: matured memory candidates awaiting review "
        "(recurred >= threshold, not held/promoted). Consider promoting to "
        "~/.claude memory or tag `#hold` in daily/inbox.md:\n" + body
    )
    import json
    return json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": ctx,
        }
    }, ensure_ascii=False)
