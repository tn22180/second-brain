---
name: avada-agent-scaffold
description: Use when you need to set up (or refresh) Claude Code / AI-agent support in an Avada Shopify app repo — the .claude/, .agent/, .cursorrules and docs/ai-agent scaffold. Scans the target repo (packages, Firebase projects, worker jobs, domains) and stamps an adapted, merge-safe agent scaffold, then prints a checklist of app-specific gaps to fill. Trigger phrases: "set up agents for this app", "scaffold .claude", "port joy's agent setup", "agent support for <app>".
---

# Avada Agent Scaffold

Generator that stamps a consistent Claude/agent-support layer into any Avada Shopify app
repo (seo, blog, ai-product-copy, aeo, image-optimizer, avachat, …), adapted from the
mature `joy` repo scaffold. **Merge-safe**: never clobbers an app's existing `CLAUDE.md`,
`settings.local.json`, or existing skills.

## What it produces

```
<repo>/
  .claude/
    agents/*.md         generic Avada agents (planner, code-reviewer, debugger, …)
    commands/*.md       slash commands (/plan /review /commit /refactor …)
    hooks/*.sh          guard hooks (block-dangerous-bash, auto-lint, …)
    skills/<name>/      domain skills — generic (backend, firestore, polaris…) + app stubs
    workflows/*.md      rules (development-rules, orchestration-protocol, primary-workflow…)
    settings.json       hooks wired up (MERGED into any existing settings)
  .agent/               harness-agnostic mirror (agents/ rules/ skills/ workflows/)
  .cursorrules          single-file Cursor rules (generated from .agent/rules)
  docs/ai-agent/README.md   index of the scaffold
```

`.claude/` is the source of truth. `.agent/` is a copy for non-Claude harnesses, stamped
from the SAME templates in one pass, so the two never drift at generation time.

## When to use

- A repo has little/no `.claude/` agent support and you want the standard Avada setup.
- You want to refresh/extend an existing scaffold (re-run; it's idempotent + merge-safe).
- The user says "make this app work like joy for agents" or "package/apply the agent setup".

## How to run

```bash
# from anywhere; pass the target repo root
node ~/.claude/skills/avada-agent-scaffold/scripts/scaffold.mjs --repo "/path/to/app" --dry-run
node ~/.claude/skills/avada-agent-scaffold/scripts/scaffold.mjs --repo "/path/to/app"
```

Flags:
- `--repo <path>`  target repo root (default: cwd)
- `--dry-run`      print planned writes, touch nothing
- `--force`        overwrite files the generator itself previously wrote (still never
                   clobbers `CLAUDE.md` / `settings.local.json`)
- `--only <a,b>`   restrict to sections: `agents,commands,hooks,skills,rules,cursorrules,docs`

## Flow (follow in order)

1. **Scan** — read target `packages/`, `.firebaserc` (project ids), `worker.config.yml`
   (jobs list), `packages/functions/src/` top-level dirs. Build the placeholder map.
2. **Dry-run first** — always run `--dry-run` and show the user the planned file list +
   detected placeholders before writing. Confirm.
3. **Stamp** — write `.claude/` + `.agent/` + `.cursorrules` + `docs/ai-agent/README.md`.
   Merge `settings.json`. Skip any file that already exists unless `--force`.
4. **Domain stubs** — for each detected domain (from `worker.config.yml` jobs + notable
   `src/` dirs) that has no matching generic skill, emit a stub `skills/<domain>/SKILL.md`
   with frontmatter + outline + `TODO` markers.
5. **Gap checklist** — the script prints, and you relay: which stubs need filling, which
   per-package `CLAUDE.md` are missing, which agents to review for app fit.
6. **Adapt CLAUDE.md by hand** — the generator does NOT edit an existing `CLAUDE.md`.
   Add navigation tables (Which skill / command / agent) pointing at the new scaffold.

## Placeholders

Templates use `{{TOKEN}}` markers filled from the scan:

| Token | Source |
|-------|--------|
| `{{APP_NAME}}` | repo dir name / package.json name |
| `{{PROD_PROJECT}}` | `.firebaserc` `default` |
| `{{STAGING_PROJECTS}}` | `.firebaserc` other aliases |
| `{{PACKAGES}}` | `packages/*` dir names |
| `{{DOMAINS}}` | worker jobs + notable `src/` dirs |

## Adapting joy → a new app (rules the templates already bake in)

- Strip joy-specific domains (points/loyalty/rewards). Keep the layered architecture,
  naming, Firestore multi-tenant (`shopId`), webhook <5s, Pub/Sub fan-out rules — those
  are Avada-wide.
- App-specific skills are **stubs only** — never invent domain detail. The operator fills
  them from the app's own `PATTERNS.md` / `src/`.

See `references/mapping.md` (which joy files are generic vs app-specific) and
`references/adaptation-guide.md` (how to fill stubs) before extending templates.

## Red flags

| Thought | Reality |
|---------|---------|
| "Just overwrite CLAUDE.md" | Never. It's hand-owned. Generator refuses; you edit it manually. |
| "Copy joy's point/loyalty skill" | App-specific. Not generic. Leave as a stub for the target app. |
| "Skip dry-run" | Always dry-run + confirm first — the target repo may have partial scaffold. |
| "Edit .agent copy directly" | Edit `.claude/` (source), re-run generator to re-stamp `.agent/`. |
