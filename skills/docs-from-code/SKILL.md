---
name: docs-from-code
description: Use when a repo needs its agent docs written or rebuilt from the code itself — feature docs, domain skills, CLAUDE.md — or when existing ones have gone stale and you need to know which claims are still true. Establishes the shared layer first, then one skill+doc per domain, every claim cited to a line that exists. Trigger phrases: "document this app", "write skills for this repo", "our docs are out of date", "gen docs from code", "audit the docs against the code", "rebuild the agent scaffold".
---

# Docs From Code

Produce an agent-facing doc layer that is **true**, from a repo's actual source. Pairs with
`docs-gate`, which is what keeps it true afterwards.

The output is not prose about the app. It is a set of claims, each cited to a line that exists, each
placed in the one file where a reader will actually be holding it.

## The ordering rule — shared layer first, always

**Analyse and write what is common to the whole app before anything domain-specific. Then, per
domain, produce its skill and its feature doc together.**

This is not stylistic. It is the only order that works, for one mechanical reason:

> A domain skill has to justify **why it isn't in CLAUDE.md**. That sentence cannot be written —
> cannot even be evaluated — until CLAUDE.md exists and says something definite.

Write the specifics first and every skill invents its own boundary. The result is what this method
was built after: one repo carried **19 feature-map skills and 13 domain skills side by side**, two
taxonomies over the same code, neither wrong on its own, together unusable. Nobody could say which
to open, so nothing got opened.

The layers, and what belongs in each:

| Layer | Files | Holds | Loaded |
|---|---|---|---|
| **Common** | root `CLAUDE.md`, `PATTERNS.md`, `packages/*/CLAUDE.md` | what is true app-wide: architecture, layers, multi-tenancy, response shape, logging, caution points | always |
| **Specific — how-to** | `.claude/skills/<domain>/SKILL.md` | editing rules, gotchas, checklists for an agent about to change that code | on trigger |
| **Specific — map** | `docs/features/<area>.md` | what the user sees, sub-features, FE→route→controller→service→repo flow, data model, async jobs | by a human, to orient |

Layer rules are **not** skills. If it applies to every controller, it is common, and a skill that
repeats it is noise that also has to be kept in sync.

## Flow — follow in order

### 0. Measure the tree before reading a line of code

Skipping this is the single most expensive mistake available here.

```bash
git rev-list --left-right --count origin/master...HEAD    # master-only | branch-only
git log -1 --format='%ci' origin/master
git log -1 --format='%ci' HEAD
```

**Docs describe a tree, not a repo.** If you document from a branch that is behind the target, you
will write claims that are true where you are standing and false where they land — and they will
read as rot to whoever gets them. This happened at full scale: a doc set was written from a branch
**207 commits behind master**, and the result documented a deleted component, a routing gate that
never existed, and a CI safety net that was never built. Every one of those was "verified against the
code" — the wrong code.

Establish the target tree first and work from it. If docs already exist against an older tree, see
**Retargeting** below.

### 1. The common layer

Read the source and write, or correct, in this order:

1. `packages/<pkg>/CLAUDE.md` — layer rules per package. What a controller returns, how async is
   queued, logging, i18n, what is forbidden.
2. `PATTERNS.md` — patterns with a real `file:line` for each.
3. Root `CLAUDE.md` — what the app is, the architecture, multi-tenancy, the caution points, and a
   nav table pointing at the domains.

Do not start a skill until these say something definite. They are the baseline every skill argues
against.

### 2. Enumerate the specifics — from the code, not from a wish

Derive the domain list from what exists:

```bash
ls packages/*/src/                          # top-level source dirs
cat packages/functions/worker.config.yml    # background jobs, if any
grep -rn "router\.\(get\|post\|put\)" packages/functions/src/routes/  # feature surface
ls packages/assets/src/pages/               # what the user actually sees
```

A domain earns an entry when it holds non-obvious knowledge with real `file:line`. "We have a
services directory" is not a domain.

### 3. Per specific area — skill and feature doc together

For each domain, in one pass:

- **`docs/features/<area>.md`** — the map. Entry points, flow, data model, jobs, plan gating.
- **`.claude/skills/<domain>/SKILL.md`** — the how-to, with frontmatter that must carry:
  - `trigger:` — when this fires, in the words someone would actually type
  - `why-not-claude-md:` — what it holds that the common layer does not. **If you cannot write
    this sentence honestly, the skill should not exist.** Fold the content into the common layer
    and move on.

The feature doc links to its skill. It must not duplicate the skill's gotchas.

**Write these by hand, per domain.** Never bulk-generate justifications: a fabricated
`why-not-claude-md` defeats the check while looking like it passed it, which is strictly worse than
an absent skill.

### 4. Verify every claim — grep is the method

For every file, symbol, and mechanism a doc names: grep the target tree. **"0 occurrences" is a
finding, not a hiccup.** Delete the claim; do not soften it into a guess about what the code
"probably" does.

Root-anchor every citation — `packages/functions/src/a.js:69`, never `a.js:69`. Shorthand is
invisible to the gate, and invisible is exactly how the worst rot survives: an audit found a skill
whose every citation was shorthand, so nothing had ever checked one of them, and it had drifted into
describing an entire subsystem the repo did not have.

**A citation that resolves is not a citation that is right.** The gate checks that a file exists and
is long enough. It cannot see that line 240 stopped being a subscriber and became `);`. Read the
line.

### 5. Install the gate

Use the `docs-gate` skill. Docs decay by default; something has to fail an MR or this all rots again
within weeks. Measured: 27 commits landing on master in a single afternoon moved 35 citations, and
the gate stayed green through all of it — green means "nothing root-anchored is provably dead", never
"the docs are accurate".

## Retargeting — when docs already exist against an older tree

Do not rewrite by hand and do not eyeball line numbers.

```bash
node ~/.claude/skills/docs-from-code/scripts/renumber.mjs --repo /path/to/repo --old-rev <sha>   # dry run
node ~/.claude/skills/docs-from-code/scripts/renumber.mjs --repo /path/to/repo --old-rev <sha> --apply
```

`--old-rev` is the tree the docs were written or last verified against. The tool reads the line
CONTENT the citation pointed at there, finds it in the current tree, and rewrites the number — only
on a unique match, or a unique match after ±4 lines of context disambiguate. Everything else it hands
back for a human.

- It is **not idempotent**. Run once per move; verify with the gate, never by re-running it.
- Its "needs a human" list is the real work. Those are usually claims that are **false**, not
  mis-numbered — re-pointing one at a nearby line launders a wrong statement into a passing one.
- It only touches root-anchored citations. Shorthand stays stale and stays invisible.

Typical shape of one real run: 353 already correct, 35 renumbered on evidence, 0 guessed.

## Delegating the audit

Auditing many docs at once is read-heavy and parallelises well — one subagent per doc cluster. Every
brief must carry:

- the target tree and what is **absent** from it, as measured facts the agent re-verifies itself
- "grep every symbol; 0 occurrences is a finding"
- "delete claims about code that does not exist; do NOT rewrite them into a guess"
- "root-anchor every citation you write"
- "never invent a file, symbol, or line number; report what you could not verify"
- which files are theirs, and that other agents hold the rest

Expect them to find that your own briefed "facts" were wrong. In the run this came from, an agent
caught a fact the controller had asserted about the wrong tree. Let that correction land.

## Red flags

| Thought | Reality |
|---|---|
| "I'll write the skills first, CLAUDE.md after" | Then no skill can justify itself. Two taxonomies, nobody opens either. |
| "The branch is close enough to the target" | Measure it. 207 commits behind produced docs that read as pure fiction. |
| "It's cited, so it's verified" | Cited means the file is long enough. Read the line. |
| "`a.js:69` is clear enough in context" | The gate can't check it. Shorthand is where rot hides. |
| "The symbol's probably renamed — I'll point at the closest thing" | That is a guess wearing a citation. Delete, or hand it to a human. |
| "Generate the `why-not-claude-md` for all skills" | A fabricated justification defeats the check while looking like it passed. |
| "Gate's green, docs are good" | Green = nothing root-anchored is provably dead. Nothing more. |
| "This layer rule belongs in the skill" | If it's true app-wide it's common. A skill repeating it is a copy to keep in sync. |
| "Docs are done" | They decay from the next merge. Install `docs-gate` or don't bother writing them. |

## See also

- `docs-gate` — the CI gate that keeps this true: dead citations, missing feature docs, unjustified
  skills, `.claude`/`.agent` mirror drift.
- `avada-agent-scaffold` — stamps the empty `.claude/` structure. This skill fills it with what is
  true.
