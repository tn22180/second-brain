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


def mirror_conversations(cfg: dict):
    """Gather all Claude Code transcripts into conversations/ (gitignored, local).

    One subdir per project (repo). Skips the second-brain project's own dir.
    """
    repo = Path(cfg["_repo"])
    src = Path(cfg["paths"]["projects_src"])
    if not src.exists():
        print(f"  WARN projects_src missing: {src}")
        return
    dst = repo / "conversations"
    own = repo.name  # e.g. "second-brain" — its encoded dir contains this
    cmd = ["rsync", "-a", "--delete", "--prune-empty-dirs",
           "--include", "*/", "--include", "*.jsonl", "--exclude", "*",
           "--exclude", f"*{own}*/", f"{src}/", f"{dst}/"]
    subprocess.run(cmd, check=True)
    n = len(list(dst.rglob("*.jsonl"))) if dst.exists() else 0
    print(f"  mirrored conversations: {n} transcripts -> conversations/ (gitignored)")


def link_projects(cfg: dict):
    """Symlink every git repo in the workspace into projects/ (gitignored).

    Idempotent: refreshes links, prunes ones whose target vanished. Repos keep
    their own git; nothing is copied or pushed.
    """
    repo = Path(cfg["_repo"])
    ws = Path(cfg["paths"]["workspace"])
    proj = repo / "projects"
    if not ws.exists():
        print(f"  WARN workspace missing: {ws}")
        return
    targets = {}
    for child in sorted(ws.iterdir()):
        if child.is_dir() and (child / ".git").exists():
            targets[child.name] = child.resolve()

    linked = 0
    for name, target in targets.items():
        link = proj / name
        if link.is_symlink() or link.exists():
            # refresh only if it's our symlink; never touch a real file/dir
            if link.is_symlink():
                link.unlink()
            else:
                print(f"  SKIP {name}: real path exists in projects/, not a link")
                continue
        link.symlink_to(target)
        linked += 1

    # prune stale symlinks (repo removed/renamed)
    pruned = 0
    for link in proj.iterdir():
        if link.is_symlink() and (link.name not in targets or not link.resolve().exists()):
            link.unlink()
            pruned += 1
    print(f"  linked {linked} project(s) -> projects/ (gitignored){f', pruned {pruned}' if pruned else ''}")


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

    if cfg.get("mirror_conversations"):
        mirror_conversations(cfg)

    if cfg.get("link_projects"):
        link_projects(cfg)
