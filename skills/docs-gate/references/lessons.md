# Lessons — what the first build measured, and what it got wrong

Every item here cost something to learn. None of it is reasoning from first principles; all of it
is measurement from the `seo` repo build (2026-07-16, MR !1994). Read before changing a template.

## The gate's real signal is "the cited file still exists"

Not the line number. Measured: the median citation sits ~120 lines above EOF, so the past-EOF check
essentially never fires for a typical citation. Of 9 findings against master, **7 were artifacts** of
comparing against a branch shorter than the doc assumed — not rot. The 2 genuine rot cases were file
**moves**, caught by the tracked-path check.

Do not sell the line check as the value. Sell "cited file was moved or deleted". Line drift is a
bonus that fires rarely.

## Suffix matching is a trap. Root-anchored only.

The first design mandated matching `foo.js:12` against any tracked path ending in `foo.js`. Measured
result: **212 ambiguous + 15 past-EOF findings, mostly its own artifacts**. Root-anchored-only:
279 checkable, **0 false**. Coverage drops to 21% of the corpus; it caught 100% of known real rot.

21% is the right trade. A gate that cries wolf gets disabled in a week.

## An anchor root must not also be a nested directory name

Found by the probe on its own source repo. `scripts/` had 5+ tracked JS files at top level, so the
heuristic proposed it as an anchor root. But `packages/functions/scripts/` also exists — so the
document-relative citation `scripts/detect-worker-affected.js:5-12`, written inside a doc about
`packages/functions` and pointing at a file that **exists**, parsed as root-anchored and was reported
as rot.

Rule: a candidate anchor root is safe only if its name never appears as a nested path segment.
`probe.mjs` enforces this and reports what it rejected. Citations under a rejected root stay
unchecked — correct, not a gap to close.

## Dotfiles need an explicit alternative — NOT an optional leading dot (solved in blogs)

`FILE_TOKEN` starts with `[A-Za-z0-9_]`, so `.gitlab-ci.yml:216` parses as `gitlab-ci.yml:216` — the
leading dot is dropped, the path resolves to nothing, and the citation is silently classed as
shorthand. Every citation into a dotfile is invisible. It matters where a repo's CI claims are the
expensive ones: in `blogs`, "production deploys on a tag, not on master" was unverifiable.

The obvious fix is **wrong**. An optional leading dot (`\.?[A-Za-z0-9_]…`) looks equivalent and is
not: against the prose `...packages/functions/a.js:5` it matches the final ellipsis dot and yields
the path `.packages/functions/a.js`, which is unanchored — so a **checked citation silently becomes
an invisible one**. The fix makes coverage worse, quietly.

What works — two changes:

1. Give dotfiles their own alternative in the pattern, listed explicitly:
   `(?:\.gitlab-ci\.yml|[A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:js|…)):(\d+)(?:-(\d+))?`.
   Alternation is leftmost-first, so `.gitlab-ci.yml:216` matches whole rather than one char later.
2. `ANCHOR_ROOTS` must also admit the file (`'.gitlab-ci.yml'`) — otherwise it parses correctly and
   is dropped as unanchored anyway.

Step 2 is safe **only** for root-level filenames that are unique and never written
document-relative. `.gitlab-ci.yml` qualifies: exactly one exists, nobody ever means a sibling.
`package.json` does **not** — every package has one, and `package.json:66` inside
`packages/functions/CLAUDE.md` means the sibling, so admitting it would check the wrong file and
pass. Apply the same nested-segment test as any other anchor root.

Keep a test for the ellipsis case. It is the one that fails if someone "simplifies" this back to
`\.?`.

## YAML sequences fail good work — the block-scalar bug's mirror image

`parseFrontmatter` handles `key: value` and block scalars. A bare `key:` opening an indented list is
neither:

```yaml
trigger:
  - gen ai blog
  - why is Claude charging 5 credits
```

It parsed to `''` and was reported as "frontmatter key is missing or empty" against a skill that had
done nothing wrong. Caught on the **first run** of the gate in `blogs`.

Note the symmetry, and that both are the same root cause — a parser that judges a value it did not
actually read:

| Hole | Sign | Result |
|---|---|---|
| `trigger: >` parsed to `">"` | passes junk | zero justification, green |
| `trigger:` + list parsed to `""` | fails good work | a correct skill blocked |

The second is the one that gets the gate switched off. Handle sequences before trusting any
frontmatter value; join the items into one string, since the gate judges only that a justification
exists, never what it says.

## Three citation conventions coexist; only one is checkable

1. **root-anchored** — `packages/functions/src/a.js:69`. Checkable. 279 of 1336.
2. **document-relative** — `package.json:121` inside `packages/functions/CLAUDE.md` means its sibling.
3. **domain shorthand** — a doc establishes `jobDataMigrate.service.js:82`, then later writes
   `service.js:165`.

2 and 3 are unresolvable without guessing. Skip them silently, count them in the summary line so the
skipped population stays visible, and enforce convention 1 for **new** docs only. Do not re-anchor an
existing corpus to raise coverage; nobody will review that diff.

## `.agent/` is a mirror, not a second source

Two failures, both real:

- `.agent/skills/**` bypassed the gate entirely — a skill pack added *only* there needed no
  justification and got no citation check. The exact incident the gate exists to prevent, reopened
  one directory over.
- Counting both trees double-counts every citation and reports each finding twice against what is
  literally the same text.

Fix: check `.claude/` only, and enforce **byte parity** as its own check. Parity covers the mirror
transitively. Extending the globs to `.agent/` instead is wrong — two independently-checked copies
can both be green while disagreeing with each other.

## Fail closed, everywhere

Each of these shipped as a silent pass first:

| Hole | Fix |
|---|---|
| A check throws → runner counted it as 0 findings | `catch` → `failures += 1`. A crash is never a pass. |
| Living-docs list came back empty → nothing to check → PASS | `MIN_LIVING_DOCS` floor. An empty corpus means the resolver broke. |
| Branch name empty/unknown → no gate | `stats.unknownBranch` → fail. |
| **Deleting** the feature doc satisfied "a feature doc changed" | `git diff --name-only` lists deletions; pass only on files still present. |

## `split('\n').length` is lines **+ 1**

This one shipped. A live dead citation (`worker.config.yml:50-221`, file is 220 lines) sat in the
branch while the gate reported PASS. All 55 tests passed over it — **every test stubbed
`lineCountOf`**, so no test could see the bug.

Count like `wc -l`: strip one trailing newline, then split. And keep at least one test that reads a
**real file on disk** end-to-end. A suite that stubs the impure layer everywhere cannot catch the
impure layer being wrong.

## Escape hatches must be as narrow as the justification they force

- `citation-skip` first matched the **line**, so one comment silenced every citation on it — three
  dead citations, one reason, reported "1 skip". Now one comment exempts one citation.
- `[no-docs]` first matched **anywhere** in a commit body, so a commit merely *quoting* an earlier
  `[no-docs]` commit exempted the whole branch. Now anchored at line start (`/^\[no-docs]/m`).

## Boilerplate detection: don't prefix-match placeholder shapes

`why-not-claude-md: <script> injection is the exact vector this skill defends against` is real prose
in a web repo, and a prefix-anchored `<...>` rule read it as an unfilled placeholder. Split the rule:
stub tokens (`TODO`, `TBD`, `N/A`) prefix-match; placeholder shapes (`<...>`, `...`) match only as
the **whole** value.

## YAML block scalars bypass frontmatter checks

`trigger: >` parsed to the literal string `">"` — non-empty, non-boilerplate, **passes with zero
justification**. The repo's own house style already used `description: >`, so it fired on real files.
Handle `>`, `|`, `>-`, `>+`, `|-`, `|+` before trusting any frontmatter value.

## Gate on the branch prefix, not the commit subject

Measured in `seo`: 74 of the last 99 merges carry a branch prefix; only 40 of the last 200 commits say
`feat:`. Conventional-commit gating would miss most feature work. **Re-measure per repo** — `probe.mjs`
prints this and flags repos where prefix gating is a bad fit.

## The gate is theater unless the CI job actually runs

GitLab: if merge-request pipelines are disabled in project settings, a `merge_request_event` job
**never runs** and every MR stays green while nothing is checked. This cannot be verified from the
CLI without API auth. Someone must open an MR and see the job in the pipeline. Until then, report the
gate as unverified — not as shipped.

Also required: `GIT_DEPTH: '0'`. The default shallow clone has no merge-base with the target branch,
so the diff base silently degrades.

## Don't trust the repo's lint script to cover you

In `seo`: root eslint v6.8.0 **crashes**, and `yarn eslint-fix` is scoped via `npm --prefix` to two
packages — so it never touches `scripts/`. A hook swallowed the failure with `exit 0`. Net: nothing
lints the gate's own code. `probe.mjs` reports the lint command and whether it's scoped. If nothing
covers the new directory, match `.prettierrc` by hand and say so in the plan rather than writing a
constraint that is fiction.

## Attack the gate after building it

Re-run these against the finished gate. All three were live holes at some point:

1. Add a tracked skill under `.agent/skills/` only → must fail (parity).
2. Move a cited file → must fail (tracked-path).
3. Point a citation one line past EOF → must fail (line check).
4. Delete a feature doc on a `feat/` branch → must fail (deletions don't satisfy).
5. Edit `.claude/x` and not `.agent/x` → must fail (parity).

An *untracked* file under `.agent/` is correctly **not** caught — it isn't in the MR.
