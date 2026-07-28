#!/usr/bin/env python3
"""Mine ~/.claude/projects/**/*.jsonl transcripts for the shell commands Claude
actually ran, and report which ones are still not covered by an allow rule.

Usage:
    python3 mine_permissions.py                 # report uncovered command families
    python3 mine_permissions.py --all           # rank every family, covered or not
    python3 mine_permissions.py --json          # machine-readable
    python3 mine_permissions.py --min 5         # only families seen >= 5 times

Reads (never writes) these settings files, in Claude Code precedence order:
    ~/.claude/settings.json
    ~/.claude/settings.local.json
    <project>/.claude/settings.json
    <project>/.claude/settings.local.json
"""

import argparse
import collections
import functools
import json
import os
import re
import shutil
import sys
from pathlib import Path

HOME = Path.home()
TRANSCRIPTS = HOME / ".claude" / "projects"
PROJECT_ROOT = Path(__file__).resolve().parents[2]  # second-brain/

SETTINGS_FILES = [
    HOME / ".claude" / "settings.json",
    HOME / ".claude" / "settings.local.json",
    PROJECT_ROOT / ".claude" / "settings.json",
    PROJECT_ROOT / ".claude" / "settings.local.json",
]

# Split a compound command into the individual invocations a permission rule sees.
SEGMENT = re.compile(r"&&|\|\||;|\n|\|")
# Shell keywords / syntax that are not binaries.
NOT_A_BINARY = {
    "if", "then", "else", "elif", "fi", "for", "do", "done", "while", "until",
    "case", "esac", "function", "return", "break", "continue", "exit", "set",
    "local", "export", "const", "let", "var", "import", "from", "await", "new",
    "def", "print", "class", "EOF", "PY", "JS", "SH", "the", "in", "true", "false",
}
BINARY_RE = re.compile(r"^[A-Za-z0-9_./-]+$")


def iter_bash_commands(root: Path):
    """Yield every Bash tool_use command string across all transcripts."""
    for path in root.rglob("*.jsonl"):
        try:
            with path.open(encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    line = line.strip()
                    if not line or '"tool_use"' not in line:
                        continue
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if rec.get("type") != "assistant":
                        continue
                    content = (rec.get("message") or {}).get("content")
                    if not isinstance(content, list):
                        continue
                    for block in content:
                        if (
                            isinstance(block, dict)
                            and block.get("type") == "tool_use"
                            and block.get("name") == "Bash"
                        ):
                            cmd = (block.get("input") or {}).get("command")
                            if isinstance(cmd, str):
                                yield cmd
        except OSError:
            continue


@functools.lru_cache(maxsize=4096)
def is_executable(name: str) -> bool:
    """True if `name` resolves to something runnable on this machine.

    Transcripts contain heredoc bodies, SQL, and JS as well as commands. Requiring
    the first token to be a real binary is what separates them.
    """
    if "/" in name:
        return os.access(name, os.X_OK)
    return shutil.which(name) is not None


def family_of(segment: str) -> str | None:
    """Reduce one invocation to the family a permission rule would key on.

    `git log --oneline` -> `git log`;  `head -50 f.txt` -> `head`.
    Returns None for shell syntax and anything unparseable.
    """
    tokens = segment.strip().split()
    if not tokens:
        return None
    binary = tokens[0].strip("(){}\"'`$")
    if not binary or not BINARY_RE.match(binary) or binary in NOT_A_BINARY:
        return None
    if "=" in binary:  # VAR=value prefix
        return None
    short = binary.rsplit("/", 1)[-1]
    if not is_executable(binary) and not is_executable(short):
        return None
    # Multi-verb CLIs: the subcommand is part of the identity.
    if short in {"git", "gh", "glab", "gcloud", "firebase", "docker", "npm",
                 "yarn", "pnpm", "bq", "kubectl", "brew"}:
        for tok in tokens[1:]:
            if re.match(r"^[a-z][a-z0-9:_-]*$", tok):
                return f"{short} {tok}"
        return short
    return short


def load_rules(files) -> dict:
    """Return {'allow': [...], 'ask': [...], 'deny': [...]} merged across files."""
    merged = {"allow": [], "ask": [], "deny": []}
    for path in files:
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"warn: cannot parse {path}: {exc}", file=sys.stderr)
            continue
        perms = data.get("permissions") or {}
        for bucket in merged:
            merged[bucket].extend(perms.get(bucket) or [])
    return merged


def bash_prefixes(rules: list[str]) -> list[str]:
    """Extract the command prefix from each Bash(...) rule."""
    out = []
    for rule in rules:
        m = re.match(r"^Bash\((.*)\)$", rule)
        if not m:
            continue
        body = m.group(1)
        body = re.sub(r"[:\s]?\*$", "", body).strip()
        if body:
            out.append(body)
    return out


def covered(family: str, prefixes: list[str]) -> str | None:
    """Return the rule prefix covering this family, or None."""
    for prefix in prefixes:
        if family == prefix or family.startswith(prefix + " ") or prefix.startswith(family + " "):
            return prefix
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--all", action="store_true", help="include already-covered families")
    ap.add_argument("--json", action="store_true", help="emit JSON")
    ap.add_argument("--min", type=int, default=2, help="minimum occurrences (default 2)")
    ap.add_argument("--limit", type=int, default=60, help="max rows (default 60)")
    args = ap.parse_args()

    if not TRANSCRIPTS.is_dir():
        print(f"no transcripts at {TRANSCRIPTS}", file=sys.stderr)
        return 1

    counts = collections.Counter()
    total = 0
    for cmd in iter_bash_commands(TRANSCRIPTS):
        total += 1
        for segment in SEGMENT.split(cmd):
            fam = family_of(segment)
            if fam:
                counts[fam] += 1

    rules = load_rules(SETTINGS_FILES)
    allow_prefixes = bash_prefixes(rules["allow"])
    ask_prefixes = bash_prefixes(rules["ask"])
    deny_prefixes = bash_prefixes(rules["deny"])

    rows = []
    for fam, n in counts.most_common():
        if n < args.min:
            break
        status, rule = "uncovered", None
        if (rule := covered(fam, deny_prefixes)):
            status = "deny"
        elif (rule := covered(fam, ask_prefixes)):
            status = "ask"
        elif (rule := covered(fam, allow_prefixes)):
            status = "allow"
        if status != "uncovered" and not args.all:
            continue
        rows.append({"family": fam, "count": n, "status": status, "rule": rule})
        if len(rows) >= args.limit:
            break

    if args.json:
        json.dump({"totalBashCalls": total,
                   "transcriptDir": str(TRANSCRIPTS),
                   "rows": rows}, sys.stdout, indent=2)
        print()
        return 0

    print(f"{total} Bash calls across {len(list(TRANSCRIPTS.rglob('*.jsonl')))} transcripts")
    print(f"{len(allow_prefixes)} allow / {len(ask_prefixes)} ask / {len(deny_prefixes)} deny Bash rules\n")
    if not rows:
        print("nothing uncovered above the threshold.")
        return 0
    print(f"{'count':>7}  {'status':<9}  family -> covering rule")
    for row in rows:
        tail = f" -> Bash({row['rule']}:*)" if row["rule"] else ""
        print(f"{row['count']:>7}  {row['status']:<9}  {row['family']}{tail}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
