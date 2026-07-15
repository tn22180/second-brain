"""Make `/resume` (launched from the second-brain repo) list EVERY conversation
across all projects, not just this repo's.

Claude Code scopes `/resume` to the current cwd's project dir under
~/.claude/projects/<encoded-cwd>/. We symlink every other project's session
*.jsonl into the second-brain project dir, so `brain` -> `/resume` shows them all.

Symlinks (not copies): no 180M duplication; resuming writes back to the original
session file. Idempotent; prunes broken links. Touches ~/.claude only — reversible
(delete the symlinks). Never overwrites a real session file.
"""
import re
from pathlib import Path


def _encode(path: str) -> str:
    # Claude encodes a cwd into its project-dir name by replacing / and . with -
    return re.sub(r"[/.]", "-", path)


def sync(cfg) -> Path:
    src_root = Path(cfg["paths"]["projects_src"])
    repo = Path(cfg["_repo"])
    target = src_root / _encode(str(repo))
    target.mkdir(parents=True, exist_ok=True)

    wanted = {}  # filename -> source path
    for pdir in src_root.iterdir():
        if not pdir.is_dir() or pdir == target:
            continue
        for j in pdir.glob("*.jsonl"):
            wanted[j.name] = j  # session uuid filenames are globally unique

    linked = 0
    for name, srcfile in wanted.items():
        dst = target / name
        if dst.is_symlink():
            if dst.resolve() == srcfile.resolve():
                continue
            dst.unlink()
        elif dst.exists():
            continue  # a real session that belongs to this repo — leave it
        dst.symlink_to(srcfile)
        linked += 1

    pruned = 0
    for link in target.glob("*.jsonl"):
        if link.is_symlink() and not link.exists():  # source gone -> broken
            link.unlink()
            pruned += 1

    total = len(list(target.glob("*.jsonl")))
    print(f"  /resume aggregation: {total} sessions in {target.name}"
          f" (+{linked} linked{f', -{pruned} pruned' if pruned else ''})")
    return target
