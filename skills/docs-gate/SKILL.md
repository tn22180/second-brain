---
name: docs-gate
description: Use when you want a repo's docs and agent skills to stop rotting silently — a CI gate that fails an MR when a doc cites code that moved or died, when a feature branch ships no feature doc, when a SKILL.md carries no justification, or when a .claude/.agent mirror drifts. Measures the target repo first, then stamps adapted scripts + tests + a CI job. Trigger phrases: "docs gate", "block MRs with rotten docs", "auto-update docs", "require a doc per feature", "port the docs gate to <app>".
---

# Docs Gate

Stamps a docs-rot gate into a repo: four checks, a jest suite, and one blocking CI job on merge
requests. Derived from the `seo` build (2026-07-16, MR !1994).

**This skill measures before it generates.** The origin repo's constants are tokens, not defaults.
A gate whose anchor roots, living-doc dirs, and branch conventions were inherited from another app is
a gate that reports rot in files the target repo never had — the same failure that got three
copied-between-apps skills deleted from this machine on 2026-07-16.

## The four checks

| Check | Fails the MR when |
|---|---|
| `citations` | a living doc cites `path/file.js:69` and the file is no longer tracked, or line 69 is past EOF |
| `feature-doc` | a `feat/*` branch changes source but adds/edits no feature doc |
| `skill-gate` | a new/changed `SKILL.md` lacks a real `trigger:` or `why-not-claude-md:` |
| `mirror-parity` | `.claude/x` and `.agent/x` are not byte-identical |

Escape hatches: `<!-- citation-skip: reason -->` (one comment exempts one citation) and a
`[no-docs]` line at the start of any commit message on the branch.

## What it produces

```
<repo>/
  scripts/docs-gate/
    index.js          runner — sums findings; a check that throws counts as a failure
    citations.js      pure core + CLI
    featureDoc.js     pure core + CLI
    skillGate.js      pure core + CLI
    mirrorParity.js   pure core + CLI   (drop if the repo has no .agent/ mirror)
    gitContext.js     the ONLY file that touches git or fs
    __tests__/*.test.js
  .gitlab-ci.yml      + a `docs_gate` job, + `check` as the first stage
  package.json        + "docs-gate": "node scripts/docs-gate/index.js"
```

## Flow — follow in order

1. **Probe.** Never skip; this is the whole point of the skill.

   ```bash
   node ~/.claude/skills/docs-gate/scripts/probe.mjs --repo /path/to/repo
   ```

   Prints a proposed token map, repo shape, citation-corpus coverage, **baseline debt**, skills
   missing justification, and red flags. Read the red flags before anything else.

2. **Show the user the probe output and settle the trade.** Two things need a human decision:
   - **Coverage.** If only ~20% of citations are checkable, say that number out loud. The choice is
     "accept it as a forward-only convention" vs "re-anchor the corpus first" — the user's call, not
     yours.
   - **Which checks apply.** See `references/adaptation.md`. Drop what doesn't fit rather than
     stamping a check that can never fire.

3. **Clear the baseline debt.** The gate cannot block while the repo already fails it. Fix each dead
   citation or `citation-skip` it with a real reason. Then write `trigger:` / `why-not-claude-md:`
   for existing skills — **by hand, one at a time, by someone who knows the domain**. This is usually
   most of the work.

4. **Stamp.** Copy `templates/docs-gate/` into `<repo>/scripts/docs-gate/`, substitute every
   `{{TOKEN}}` from the reviewed map, convert to ESM if the target needs it
   (`references/adaptation.md`). Add the `package.json` script.

5. **Run the suite.** Test fixtures are shaped like the origin repo; failures point at fixtures whose
   paths don't match the target. Fix them. Then `yarn docs-gate` — it must exit 0 on a clean branch.

6. **Wire CI.** `templates/ci/gitlab-job.yml.tmpl`. GitHub Actions has no template — see
   `references/adaptation.md`.

7. **Attack it.** Run the five attacks in `references/lessons.md`. Each must fail the gate. A gate
   you didn't try to break is a gate you don't know the shape of.

8. **Verify the job actually runs.** Open a real MR and look at the pipeline. Until someone sees the
   job, report the gate as **unverified** — see the red flag below.

## Read before changing a template

`references/lessons.md` — every measured finding and every hole that shipped, from the first build.
`references/adaptation.md` — token table, which checks apply, module system, CI, sequencing.

## Red flags

| Thought | Reality |
|---|---|
| "Copy seo's constants, they're sensible" | That is the exact failure this skill exists to avoid. Probe first. |
| "Skip the probe, I can see the repo layout" | The probe caught a false-positive anchor root on the repo it was written in. You will not out-eyeball it. |
| "Coverage is only 21%, tighten the matching" | Suffix matching was measured: 212 ambiguous findings, mostly its own artifacts. 21% with 0 false beats 80% with noise. |
| "Bulk-generate the skill justifications" | A fabricated justification defeats the check while looking like it passed. Hand-write or leave the skill out. |
| "The job is in .gitlab-ci.yml, so it's shipped" | If MR pipelines are disabled in project settings, the job never runs and every MR is green over nothing. Unverifiable from the CLI. Someone must look. |
| "Tests pass, the logic is right" | 55 tests passed over a live dead citation because every test stubbed the fs layer. Keep one real-file test. |
| "A check crashed, that's 0 findings" | Fail closed. A crash is never a pass. |
| "Also check `.agent/`" | It's a mirror. Check `.claude/`, enforce byte parity. Two independently-checked copies can both be green while disagreeing. |
| "Deleting the stale doc satisfies the gate" | It did, once. Deletions must not pass. |
