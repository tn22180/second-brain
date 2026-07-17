# What doc rot actually looks like

Every entry below was found by measurement in one audit of a real Shopify-app monorepo, when a doc
set written against a branch **207 commits behind master** was retargeted onto master. They are
ordered by how hard they are to see — and, not coincidentally, by how much damage they do.

Use this as the checklist for what to grep for. Do not assume a category is absent because the gate
is green; most of these are invisible to any citation checker.

## 1. Wrong line number — the only kind a gate catches, and the least harmful

`worker.config.yml:121` when the file has 99 lines. A reader notices instantly.

Caught by: the citation gate (past-EOF, or path not tracked).
Fixed by: `scripts/renumber.mjs`, mechanically, on content evidence.

**This is the shallow end.** In the audit, 9 gate findings looked like the whole problem. They were
about 5% of it.

## 2. Right number, wrong line — invisible to the gate

The tree moved and the citation slid onto `);`, or a blank line, or a different function. The file
still exists and is long enough, so the gate passes.

Measured: 27 commits landing on master in one afternoon slid **35 citations**. The gate stayed green
the entire time.

Found by: reading the cited line. Or, at scale, the content-match pass in `renumber.mjs` — anything
it reports as "already correct" is genuinely fine; everything else needs eyes.

## 3. Shorthand citations — structurally uncheckable

`dispatchWork.js:44` instead of `packages/functions/src/helpers/worker/dispatchWork.js:44`. A
root-anchored gate skips these by design, because resolving them means guessing.

Measured: **1116 of 1504** citations in one corpus were shorthand. One skill had its citations
shorthand *without exception* — so nothing had ever checked a single one, and it had drifted into
describing an entire subsystem the repo did not have (see #5).

This is where the worst rot hides, and it hides *permanently*: the doc never fails, so nobody ever
looks. Root-anchoring is not a style preference. It is the difference between a checkable claim and
an unfalsifiable one.

## 4. Documented in the wrong place — nothing checks it at all

An audit found `.claude/agents/`, `.claude/commands/` and `.claude/workflows/` absent from the
gate's living-doc list. Three agent definitions went on instructing debugging agents to hunt for a
spill mechanism the repo never had. The gate was **structurally unable** to notice.

Ask, for each place an agent reads: is this in the gate's scope? An agent acts on an agent
definition exactly the way it acts on a skill. A dead citation there is the same defect.

## 5. The claim is false — the number is fine

The most expensive category, and completely invisible to tooling.

Real examples from one audit:

| Claim | Reality |
|---|---|
| "routes to the fleet past **three** gates … fleet healthy" | Two gates. The function's own docblock said so. `isFleetHealthy` — 0 occurrences. |
| "both topics are in `MIGRATED_TOPICS`, so they route to the worker" | **Neither** was. Exactly inverted: they always publish to Pub/Sub. |
| "CI detects affected worker jobs by dependency closure" | No such script. Deploy fires on a commit marker alone. The doc promised a safety net that did not exist. |
| "regenerate charges via `reduceCredits`" | That function had no caller in the file. The real path was a different, transactional one. |
| "spill tiers: `spillPolicy.js:20-40`" | The file did not exist on the target tree. |
| Named the SDK `@avada-falcon/worker-sdk` | The installed dependency was `@minhdevtree/worker-sdk`. |
| Listed a package in the repo structure | Git had never tracked it — every one of its files was ignored by a broad `lib/` rule. |

Found only by: grepping every symbol a doc names. **"0 occurrences" is a finding.**

The trap: an inverted claim reads *more* authoritative than a vague one. "Both topics are migrated,
so they route to the fleet" is specific, confident, and backwards.

## 6. Documenting the wrong tree

The root cause of most of the above. Docs describe a tree, not a repo. Written from a branch behind
the target, every claim is true where the author stood and false where it lands.

Measured: 207 commits behind. The docs documented a deleted component, a routing gate that never
existed, and a CI mechanism nobody built. All of it was "verified against the code" — the wrong code.

Check first, always:

```bash
git rev-list --left-right --count origin/master...HEAD
```

## 7. Two taxonomies over one codebase

Not rot in any single file — each doc was fine. One repo carried 19 feature-map skills and 13 domain
skills side by side, no name overlap, so git merged them without a murmur. Nobody could tell which to
open, so nothing got opened.

Prevented by: writing the common layer first, so every specific artifact has to justify its own
existence against it (`why-not-claude-md`). See the ordering rule in SKILL.md.

## The lesson under all of it

A green gate means **no root-anchored citation is provably dead**. That is a narrow, useful claim.
It is not "the docs are accurate", and the gap between the two is categories 2 through 7 — which is
most of the damage.
