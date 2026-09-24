---
name: seo-shared-checkout-branch-swap
description: Main seo checkout is shared with parallel sessions; branch can be switched under you → commit lands on master. Use own worktree.
metadata:
  node_type: memory
  type: feedback
  originSessionId: 005eea2a-e35c-4db2-a422-cee810919f26
  modified: 2026-09-24T03:17:27.650Z
---

2026-09-24: created `feat/autopilot` in the main `projects/Falcon/seo` checkout; another session switched it to master and committed `[deploy-cloud-run-production]`. My next docs commit (`ff1a10f7703`) landed on local master, unpushed, one push away from prod master. Fixed by moving it to a worktree and `git reset --keep` on master.

**Why:** several Claude sessions work in the same seo path at once; `git checkout` there is shared state.
**How to apply:** for any multi-commit feature in seo (or any repo other sessions touch), work in `<repo>-wt-<name>` via `git worktree add` from the start, symlink node_modules if the lockfile matches, and re-check `rev-parse --abbrev-ref HEAD` right before every commit. Related: [[verify-branch-before-diagnosing]].
