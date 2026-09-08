---
name: check-master-before-building
description: Before implementing a brief, grep master for the feature — Avada devs run the same brief through Claude in parallel and ship it twice.
metadata:
  type: feedback
---

Before writing a line for a brief, run `git log origin/master -- <the file you'd create>` and
`git ls-tree -r --name-only origin/master | grep -i <feature>`. Team members run the same brief
through their own Claude session; the work can already be merged.

**Why:** 2026-09-07, the Enterprise/Pro Slack alert brief. A whole branch (5 commits, MR 2229) was
built and pushed while master already carried the identical feature — the Enterprise service was
byte-identical apart from three added `export` keywords, and hailt had shipped the Pro alert as
`1ba78f5a90` (merged `979f1825df`, 2026-09-04) from the same brief. Only the merge conflict
revealed it, 167 commits behind.

**How to apply:** the check costs one command and runs before the plan, not at merge time. If the
feature is already there, the job becomes a diff of the two implementations — the surviving work is
whatever the merged version got wrong, as a small MR off master, never a merge of the dead branch.
Resolving such a conflict naively is actively dangerous: keeping both call sites on `afterCharge`
would have posted two Slack messages per event, which the conflict markers never show.

Sibling of [[verify-branch-before-diagnosing]].
