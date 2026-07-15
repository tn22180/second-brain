"""git add / commit / push for the repo. Push failures warn, never crash sync."""
import subprocess
from pathlib import Path

AUTHOR_NAME = "Tuan"
AUTHOR_EMAIL = "seomduc@gmail.com"


def _git(cfg, *args, check=False):
    return subprocess.run(["git", "-C", cfg["_repo"], *args],
                          capture_output=True, text=True, check=check)


def _ensure_identity(cfg):
    if not _git(cfg, "config", "user.email").stdout.strip():
        _git(cfg, "config", "user.email", AUTHOR_EMAIL)
        _git(cfg, "config", "user.name", AUTHOR_NAME)


def commit_push(cfg, message: str):
    repo = Path(cfg["_repo"])
    _ensure_identity(cfg)
    _git(cfg, "add", "-A")
    # anything staged?
    if _git(cfg, "diff", "--cached", "--quiet").returncode == 0:
        print("  nothing to commit")
    else:
        c = _git(cfg, "commit", "-m", message)
        if c.returncode != 0:
            print(f"  WARN commit failed: {c.stderr.strip()[:200]}")
            return
        print(f"  committed: {message}")

    branch = cfg["git"]["branch"]
    remote = cfg["git"]["remote"]
    p = _git(cfg, "push", "-u", remote, branch)
    if p.returncode == 0:
        print(f"  pushed -> {remote}/{branch}")
    else:
        err = (p.stderr or p.stdout).strip()
        print(f"  WARN push failed (commit is safe locally): {err.splitlines()[0] if err else '?'}")
