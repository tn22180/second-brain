---
name: docs-from-code
description: "Tony's rule for generating app docs/skills: analyse the shared layer first, then per-domain, and emit skill+doc per domain"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 14216855-d862-47f9-bb7b-b7fa79da0f33
---

When documenting an app or generating its agent skills, do the **common/shared layer first**
(root `CLAUDE.md`, `PATTERNS.md`, `packages/*/CLAUDE.md`), and only then go per-domain — emitting
that domain's skill and its feature doc together.

**Why:** Tony asked for this explicitly (2026-07-17), and it is load-bearing, not stylistic. A
domain skill must justify `why-not-claude-md:` — that sentence cannot be written or evaluated until
the common layer exists and says something definite. Write specifics first and every skill invents
its own boundary: the SEO repo ended up carrying 19 feature-map skills (`avada-*`) and 13 domain
skills side by side, two taxonomies over one codebase, no name overlap so git merged both silently.
Nobody could tell which to open.

**How to apply:** use the `docs-from-code` skill — it encodes this ordering, plus step 0 (measure
tree staleness, see [[verify-branch-before-diagnosing]]) and `scripts/renumber.mjs` for retargeting
docs whose tree moved. Pair with `docs-gate` to keep the result true; a green gate only means no
root-anchored citation is provably dead, never that the docs are accurate.

Related: [[verify-branch-before-diagnosing]], [[verify-skill-citations-against-disk]]
