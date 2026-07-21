---
name: verify-skill-citations-against-disk
description: "Agent skills/docs copied between Avada apps read as authoritative but cite code that doesn't exist — script-verify every path and symbol before trusting or writing one"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 14216855-d862-47f9-bb7b-b7fa79da0f33
---

Before trusting **or writing** a skill/CLAUDE.md/doc claim, verify every cited path and symbol
against disk. Prose that names a file and a line number is not evidence — it is a claim.

Method that works: script it, don't read it. `grep -rl <symbol> src | wc -l` per claim; treat
**"0 occurrences"** as the headline finding, not a footnote. Reading the prose and nodding is how
this rot survived a prior 4-subagent review.

**Why:** on 2026-07-16 an audit of Avada SEO's `.claude/` found the generic skill set was
**joy's skill pack**, copied and noun-scrubbed (`customers`→`resources`, `tiers`→`items`,
`trustBadges`→`widgets`). Zero SEO facts had ever been added. `cloudTaskService`, `enqueueTask`,
`firestore-indexes/`, `paginateQuery`, `react-i18next`, `ShopContext`, `resourcePicker` — all 0
occurrences in SEO. `anti-patterns.md` presented two invented Firestore doc IDs as tech debt
"found in this repo". Cross-checking every Avada repo proved the tell: those symbols exist in
`joy` (29/1/20 hits) and **nowhere else** — not blogs, ai-product-copy, avachat, llm-ai-search-seo,
or seo. 23 skills → 13; −12,872 lines.

The same copies were installed at `~/.claude/skills/` (global), so joy's architecture was being
fed to every other app as fact. Deleted 2026-07-16; joy keeps its own in-repo copies.

**How to apply:** a skill earns its place only with (a) a trigger CLAUDE.md can't imply, (b)
knowledge absent from an always-loaded file, (c) real `file:line`. Failing (c) predicts failing the
rest. Duplication *is* the bug — a wrong skill outranks a correct CLAUDE.md because it sounds
specific, so prefer deleting to converting. I also propagated Cloud Tasks and `firestore-indexes/`
into CLAUDE.md myself by trusting the skill table over `package.json`: check deps first.

Related: [[verify-branch-before-diagnosing]]
