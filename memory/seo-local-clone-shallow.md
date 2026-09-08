---
name: seo-local-clone-shallow
description: Local seo clone (projects/Falcon/seo + its worktrees) is a shallow clone with ~68 grafts; merge-base with origin/master comes back empty and git refuses "unrelated histories" until fetch --unshallow.
metadata:
  type: project
---

The `seo` checkout on this Mac was shallow (68 lines in `.git/shallow`, shared by every `seo-wt-*` worktree). Symptoms seen 2026-09-07: `git merge-base HEAD origin/master` empty, `git merge origin/master` → `fatal: refusing to merge unrelated histories`, `git rev-list --count origin/master` = 190. Fixed with `git fetch --unshallow origin` (done once; stays fixed for all worktrees).

**Why:** a shallow root makes "behind master" counts and conflict analysis wrong, and a naive `--allow-unrelated-histories` would produce a garbage merge.
**How to apply:** before any merge/rebase claim in `seo`, check `git rev-parse --is-shallow-repository`. Same check applies to other Avada repos cloned with depth. See [[verify-branch-before-diagnosing]].
