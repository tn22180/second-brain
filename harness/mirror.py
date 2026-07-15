"""Mirror ~/.claude/skills and the memory dir into the repo as real copies.

Copies (not symlinks) so git backs up actual content. One-way: source of truth
stays in ~/.claude; the repo is a backup + aggregation surface.
"""
import subprocess
from pathlib import Path

# transient / noise excluded from the backup
EXCLUDES = [
    "__pycache__/", "*.pyc", ".DS_Store", "cache/", "*.zip", "*.rdb", "*.log",
]


def _rsync(src: Path, dst: Path):
    dst.mkdir(parents=True, exist_ok=True)
    cmd = ["rsync", "-a", "--delete"]
    for e in EXCLUDES:
        cmd += ["--exclude", e]
    # trailing slash on src => copy contents into dst
    cmd += [f"{src}/", f"{dst}/"]
    subprocess.run(cmd, check=True)


def run(cfg: dict):
    repo = Path(cfg["_repo"])
    skills_src = Path(cfg["paths"]["skills_src"])
    memory_src = Path(cfg["paths"]["memory_src"])

    if skills_src.exists():
        _rsync(skills_src, repo / "skills")
        print(f"  mirrored skills: {skills_src} -> skills/")
    else:
        print(f"  WARN skills_src missing: {skills_src}")

    if memory_src.exists():
        _rsync(memory_src, repo / "memory")
        print(f"  mirrored memory: {memory_src} -> memory/")
    else:
        print(f"  WARN memory_src missing: {memory_src}")
