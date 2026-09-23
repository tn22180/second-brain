"""git add / commit / push for the repo. A push failure is reported, not fatal."""
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


def commit_push(cfg, message: str) -> bool:
    """False when the push did not land, so sync can exit loud instead of quiet."""
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
            return False
        print(f"  committed: {message}")

    branch = cfg["git"]["branch"]
    remote = cfg["git"]["remote"]
    p = _git(cfg, "push", "-u", remote, branch)
    if p.returncode == 0:
        print(f"  pushed -> {remote}/{branch}")
        return True
    # The whole error, not its first line: GitHub's push-protection block names the
    # offending file and commit further down, and a one-line WARN hid a dead backup
    # for 23 nightly runs.
    err = (p.stderr or p.stdout).strip()
    print(f"  PUSH FAILED (commits are safe locally):\n{err}")
    return False
