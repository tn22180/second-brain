"""Turn today's raw signal into a daily note via headless `claude -p`.

Resilient: if the LLM call fails/times out, still write a note holding the raw
signal so the day is never lost. Memory-fact candidates are appended to
daily/inbox.md (never auto-written into ~/.claude memory).
"""
import re
import subprocess
from pathlib import Path

TIMEOUT = 240


def norm_candidate(text: str) -> str:
    """Normalization key for candidate dedup.

    Drops the (×N) counter and any trailing line-metadata (` → slug`, ` #hold`,
    ` #mem:...`, REFRAME notes) so a bare re-emitted candidate matches its
    already-promoted/held anchor even when the original text is short. Then keeps
    word chars (incl. Vietnamese) + spaces, collapses, and takes a stable prefix.
    """
    t = re.sub(r"^\(×\d+\)\s*", "", text.strip())
    # cut at the earliest trailing-metadata marker (promotion arrow or a #tag)
    cut = len(t)
    for marker in (" → ", " #"):
        idx = t.find(marker)
        if idx != -1:
            cut = min(cut, idx)
    t = t[:cut].lower()
    t = re.sub(r"[^\w\s]", " ", t, flags=re.UNICODE)
    t = re.sub(r"\s+", " ", t).strip()
    return t[:80]


def _bump(line: str) -> str:
    """Increment the (×N) recurrence counter on an open candidate line."""
    m = re.search(r"\(×(\d+)\)", line)
    if m:
        n = int(m.group(1)) + 1
        return line[: m.start()] + f"(×{n})" + line[m.end():]
    # legacy open line with no counter: seeing it again makes it ×2
    return re.sub(r"^(- \[ \]\s*)", r"\g<1>(×2) ", line, count=1)

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
    """Fold today's candidates into daily/inbox.md.

    One line per distinct fact. A recurring fact bumps its (×N) counter instead
    of adding a duplicate line; a fact already promoted ([x]) or held (#hold) is
    dropped entirely (never resurrected). Genuinely new facts append under a
    dated header as `- [ ] (×1) ...`.
    """
    if not cands:
        return
    inbox = Path(cfg["_repo"]) / "daily" / "inbox.md"
    lines = inbox.read_text(errors="replace").splitlines() if inbox.exists() else []

    open_idx: dict[str, int] = {}   # norm-key -> line index of an open candidate
    done_keys: set[str] = set()     # promoted or held -> skip forever
    for i, ln in enumerate(lines):
        m = re.match(r"^\s*- \[( |x)\]\s*(.*)$", ln)
        if not m:
            continue
        checked, rest = m.group(1) == "x", m.group(2)
        key = norm_candidate(rest)
        if checked or "#hold" in rest:
            done_keys.add(key)
        else:
            open_idx[key] = i

    bumped, new_lines = 0, []
    for c in cands:
        key = norm_candidate(c)
        if key in done_keys:
            continue
        if key in open_idx:
            i = open_idx[key]
            lines[i] = _bump(lines[i])
            bumped += 1
        else:
            new_lines.append(f"- [ ] (×1) {c}")
            done_keys.add(key)  # guard against intra-batch dups

    if bumped:
        inbox.write_text("\n".join(lines) + ("\n" if lines else ""))
    if new_lines:
        with open(inbox, "a") as f:
            f.write(f"\n### memory candidates {date}\n" + "\n".join(new_lines) + "\n")
    if bumped or new_lines:
        print(f"  inbox: {len(new_lines)} new candidate(s), {bumped} recurrence bump(s)")


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
