"""Today's git commits across the Avada repos, filtered to my own commits.

For each configured repo under the workspace: author = that repo's local
user.email, commits since local midnight.
"""
import subprocess
from pathlib import Path


def _run(args, cwd=None):
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    return r.stdout.strip()


def collect(cfg, date) -> str:
    workspace = Path(cfg["paths"]["workspace"])
    out = []
    for name in cfg.get("repos", []):
        repo = workspace / name
        if not (repo / ".git").exists():
            continue
        email = _run(["git", "-C", str(repo), "config", "user.email"])
        args = ["git", "-C", str(repo), "log", "--since=midnight",
                "--no-merges", "--format=%h %s"]
        if email:
            args += [f"--author={email}"]
        log = _run(args)
        if log:
            out.append(f"[{name}] {email}")
            for ln in log.splitlines():
                out.append(f"  - {ln}")
    return "\n".join(out) if out else "(no commits today)"
