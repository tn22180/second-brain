"""Turn today's raw signal into a daily note via headless `claude -p`.

Resilient: if the LLM call fails/times out, still write a note holding the raw
signal so the day is never lost. Memory-fact candidates are appended to
daily/inbox.md (never auto-written into ~/.claude memory).
"""
import subprocess
from pathlib import Path

TIMEOUT = 240

INSTRUCTION = """You are the daily journaler for my second-brain. Below is raw signal from my day \
(Claude Code prompts, git commits, open loops, inbox jots). Write a concise daily note in Markdown. \
Keep each item in its ORIGINAL language (Vietnamese or English). Be terse.

Sections, in this exact order:
## Worked on
- concrete things done or attempted today (from prompts + commits)
## Decided
- decisions made today (only if clear from the signal; else a single "- —")
## Learned
- durable facts or insights worth keeping (else "- —")
## Open loops
- carry the open-loop list over unchanged, most-critical first
## Memory candidates
- 0 to 5 durable facts that might deserve a permanent memory file, each line starting with "- candidate: ". If none, write "- none".

Output ONLY the markdown, starting at "## Worked on". No preamble, no code fence.
"""


def _call_claude(cfg, signal: str) -> str | None:
    try:
        r = subprocess.run(
            [cfg["claude_bin"], "-p", INSTRUCTION],
            input=signal,
            cwd=cfg["_repo"],
            capture_output=True,
            text=True,
            timeout=TIMEOUT,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        print(f"  WARN claude call failed: {e}")
        return None
    if r.returncode != 0:
        print(f"  WARN claude exit {r.returncode}: {r.stderr.strip()[:200]}")
        return None
    out = (r.stdout or "").strip()
    return out or None


def _extract_candidates(md: str) -> list[str]:
    out, grab = [], False
    for line in md.splitlines():
        if line.strip().lower().startswith("## memory candidates"):
            grab = True
            continue
        if grab and line.startswith("## "):
            break
        if grab:
            s = line.strip()
            if s.lower().startswith("- candidate:"):
                out.append(s[len("- candidate:"):].strip())
    return out


def _append_candidates(cfg, date: str, cands: list[str]):
    if not cands:
        return
    inbox = Path(cfg["_repo"]) / "daily" / "inbox.md"
    existing = inbox.read_text(errors="replace") if inbox.exists() else ""
    block = [f"\n### memory candidates {date}"]
    for c in cands:
        line = f"- [ ] {c}"
        if line not in existing:
            block.append(line)
    if len(block) > 1:
        with open(inbox, "a") as f:
            f.write("\n".join(block) + "\n")
        print(f"  appended {len(block)-1} memory candidate(s) to daily/inbox.md")


def run(cfg, date: str, signal: str) -> Path:
    daily = Path(cfg["_repo"]) / "daily"
    daily.mkdir(parents=True, exist_ok=True)
    note = daily / f"{date}.md"

    body = _call_claude(cfg, signal)
    if body:
        note.write_text(f"# {date}\n\n{body}\n")
        _append_candidates(cfg, date, _extract_candidates(body))
    else:
        # fallback: keep the raw signal so nothing is lost
        note.write_text(
            f"# {date}\n\n_(LLM summary unavailable — raw signal below)_\n\n"
            f"```\n{signal}\n```\n"
        )
    return note
