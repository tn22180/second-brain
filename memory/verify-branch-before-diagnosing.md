---
name: verify-branch-before-diagnosing
description: "Pin which tree you are reading before making ANY claim about code — bug diagnosis, docs, skills, tickets. A stale checkout makes every claim confidently wrong."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 14216855-d862-47f9-bb7b-b7fa79da0f33
---

**Code claims describe a tree, not a repo.** Before reading code to support any claim — a bug
diagnosis, a doc, a skill, a JIRA ticket — pin which revision you are standing on and whether it is
the one that matters.

```bash
git rev-list --left-right --count origin/master...HEAD   # master-only | branch-only
git log -1 --format='%ci' origin/master; git log -1 --format='%ci' HEAD
```

**Why:** this has now fired twice in one session, the second time at scale.

1. Ticket SEO-260714 (Enterprise showed 1000 credits, not 10000): I read `planFeatures.js` on a
   checkout that already had the fix, saw `plans: nonEnterprisePaidPlans`, and concluded it was a
   data problem. Wrong — a real code bug (`PlanFeatures.js:11` `.find()` matched the earlier
   `proPlans` group, which held the enterprise ids), already fixed on master by `163b5cb03c`.
2. Worse: I then spent a session writing a doc set + 13 skills from the worktree of
   `feat/worker-pubsub-migration` — **207 commits behind master**. The output documented a deleted
   component, a routing gate that never existed, and a CI safety net nobody built. I also filed 12
   JIRA bugs from that tree; one (#11, regenerate/`reduceCredits`) was already fixed on master, and
   every line number in the other 11 was wrong. This memory already warned that that exact branch
   was stale, and I read it and still anchored there — because the worktree was where I was working.

**How to apply:** the trap is not ignorance of staleness, it is that the tree you happen to be
*sitting in* feels like the truth. Measure the distance to the target tree as step 0, before reading
any code, and cite `git show <rev>:<path>` when the target is not your checkout. Applies equally to
writing docs (`[[docs-from-code]]` makes this its step 0) and to filing tickets — a bug measured on
a stale branch is a bug report about fiction.

Related: [[avada-agent-scaffold-skill]], [[docs-from-code]], [[verify-skill-citations-against-disk]]
