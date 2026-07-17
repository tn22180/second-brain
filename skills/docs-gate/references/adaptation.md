# Adaptation guide — stamping the templates into a new repo

## Token reference

`probe.mjs` proposes a value for each. Every one is a guess from file counts — review before use.

| Token | Where | What it means | How to decide |
|---|---|---|---|
| `{{ANCHOR_ROOTS}}` | citations.js | Path prefixes a checkable citation must start with | Top-level source dirs whose names never appear nested. See lessons.md. |
| `{{ANCHOR_ROOTS_PROSE}}` | citations.js | Same, for the header comment | Comma-joined. |
| `{{DOTFILE_TOKEN}}` | citations.js | Regex alternation of root dotfiles the docs cite | Escaped, `\|`-joined, e.g. `\.gitlab-ci\.yml`. Each one must ALSO appear in `ANCHOR_ROOTS`. None? Use `(?!)`. Never `package.json` — see lessons.md. |
| `{{LIVING_DIRS}}` | gitContext.js | Dirs whose `.md` files describe current code | Exclude dated records (specs, plans, ADRs, changelogs). They cite dead code **by design**. |
| `{{LIVING_FILES}}` | gitContext.js | Root-level always-loaded docs | Exact matches only. Never enumerate per-package docs here. |
| `{{PACKAGE_DOC_RE}}` | gitContext.js | Glob for per-package docs | A **regex**, not a list — else a new package's doc is silently unchecked. Non-monorepo: `/^$/`. |
| `{{MIN_LIVING_DOCS}}` | gitContext.js | Fail-closed floor | ~half the current count. A floor, not a target. |
| `{{DEFAULT_BRANCH}}` | gitContext.js | Local diff base | `master` or `main`. |
| `{{FEATURE_BRANCH_RE}}` | featureDoc.js | What counts as a feature branch | Re-measure per repo. |
| `{{FEATURE_CODE_RE}}` | featureDoc.js | Code paths that trigger the doc requirement | Source only. Tests are excluded separately. |
| `{{FEATURE_DOC_RE}}` | featureDoc.js | What satisfies the requirement | |
| `{{BRANCH_EVIDENCE}}` | featureDoc.js | The measurement justifying prefix gating | Paste probe output verbatim. Do not copy another repo's numbers. |
| `{{MIRROR_MAP}}` | mirrorParity.js | `.claude/` dir → mirror dir pairs | No mirror in the repo → **delete mirrorParity.js and its test**, drop it from index.js. |

## Which checks apply

Not every repo takes all four. Drop what doesn't fit — a check that can't fire is noise in the runner.

| Check | Needs | Drop when |
|---|---|---|
| citations | living docs with `file:line` citations | corpus has ~0 anchored citations and the team won't adopt the convention |
| feature-doc | a `docs/features/`-style home + branch-prefix discipline | probe flags prefix gating as a bad fit, or there's no doc home yet |
| skill-gate | `.claude/skills/*/SKILL.md` | repo has no skills |
| mirror-parity | both `.claude/` and `.agent/` | no mirror |

## Module system

Templates are **CommonJS** (`require` / `module.exports`), because the origin repo runs jest 24 with
no `"type": "module"` — `.mjs` is untestable there.

If the target is ESM (`"type": "module"`, or jest ≥27 with ESM configured), convert on stamp:
`require(x)` → `import`, `module.exports = {a}` → `export {a}`, and `require.main === module` →
`import.meta.url === pathToFileURL(process.argv[1]).href`.

Keep `gitContext`'s lazy require **inside `main()`**, however you spell it. Loading the impure layer
at module scope makes every test shell out to git.

## Structure — do not collapse it

- `citations.js` / `featureDoc.js` / `skillGate.js` / `mirrorParity.js` — **pure** cores: take data,
  return findings. Testable without a repo.
- `gitContext.js` — the **only** file that touches git or fs.
- `index.js` — runner. Sums findings; a check that throws counts as a failure.

Each core exports `main()` for standalone CLI use and its pure analyzer for tests. The split is what
makes the suite fast and hermetic — but see lessons.md on why at least one test must read a real file.

## Tests

The fixture paths in `templates/docs-gate/__tests__/` are shaped like a `packages/` monorepo. They are
**examples, not constants**. After stamping, run the suite: failures point exactly at fixtures whose
paths don't match the target's anchor roots. Fix and re-run.

Do not stub `lineCountOf` in every test. One end-to-end test against a real file on disk is what
catches the impure layer being wrong.

## CI

`templates/ci/gitlab-job.yml.tmpl` — append to `.gitlab-ci.yml`, add `check` as the first stage.

GitHub Actions: no template; write it directly. The MR-pipeline equivalent is
`on: pull_request`, and the shallow-clone equivalent of `GIT_DEPTH: '0'` is
`actions/checkout` with `fetch-depth: 0`. The diff base is `github.event.pull_request.base.sha` —
`gitContext.diffBase()` reads `CI_MERGE_REQUEST_DIFF_BASE_SHA`, so either export that variable or
edit the function. Editing it is cleaner.

## Sequencing — baseline debt first

The gate cannot go blocking while the repo already fails it. Order:

1. Probe. Read the baseline debt list.
2. Fix every dead citation, or `citation-skip` it with a real reason.
3. Write real `trigger:` / `why-not-claude-md:` for existing skills — **by hand, per skill**. Bulk
   generation produces fabricated justifications, which are worse than none: they defeat the check
   while looking like they passed it.
4. Stamp the scripts + tests. Suite green.
5. Add the CI job.
6. Confirm the job runs on a real MR.

Steps 2–3 are most of the work in a repo with existing docs. Budget for them.
