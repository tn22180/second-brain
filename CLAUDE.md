# second-brain / Avada workspace

Personal knowledge repo **and** the parent directory of every Avada repo. Because the repos
sit under `projects/Falcon/`, this file loads for all of them — it is the Avada context.

Identity, tone, and working rules live in `~/.claude/CLAUDE.md`. Discrete technical facts live
in the auto-memory dir. This file is the map: what exists, where, and which tool to reach for.

## Repo → Firebase project

Verified against each repo's `.firebaserc` on 2026-07-28.

| Repo | production | staging | packages |
|------|-----------|---------|----------|
| `seo` | `avada-seo` | `avad-seo-staging` (+ `avada-seo-staging-2..8`) | assets, copyright, dashboard, functions, scripttag |
| `blogs` | `avada-blog-app` | `avada-blog-staging` (+ `seoon-blog-staging-2..6`) | assets, avadaseo, editor, functions |
| `ai-product-copy` | `ai-product-copy` | `ai-product-copy-staging` | assets, functions, scripttag |
| `llm-ai-search-seo` (AEO) | `seo-on-aeo` | `seoon-llm-ai-search` | assets, copyright, functions |
| `avada-image-optimizer` | `app-plaza-image-optimizer` | `seoon-image-optimizer-staging` | assets, copyright, functions, scripttag |
| `avachat` | `seo-chat-bot-99cc0` | `avada-seo-staging-8` | admin, chat-ui, functions |
| `joy` | `avada-joy` | `avada-joy-staging` (+ `-2..29`) | assets, functions, scripttag, web-components (plus 3 test-only dirs) |
| `speed-up-report` | — | `plaza-staging-3` | pnpm workspace: `apps/*`, `packages/*` |
| `avada-apps-cdn` | — | — | (flat) |

`avad-seo-staging` is spelled without the trailing `a` — that is the real project id, not a typo
to fix. Staging 2–8 use the full `avada-` prefix.

**Libs** (no Firebase): `avada-core`, `avada-components`, `avada-editor-js-core`, `worker-sdk`,
`axyseo`, `avada-feature-request`, `avada-prod-error-alert`, `avada-bfcm`.

**Team and infra** — org is Avada → team Falcon → team **SEOOn**, which he leads. These are his
surface too, not side projects:

| Repo | What |
|---|---|
| `fleet-control` | Bun cockpit over the SEO worker fleet: read-only health (Redis heartbeats, BullMQ queue depth) + audited deploy trigger around the Ansible playbooks. Control plane only — never in the job path. |
| `team-ops` | Team Falcon operating docs, all-member readable: how the team works, tooling, process. |
| `seo-suite-ai` | Shared AI-skill library the team writes into. |

`gitlab-arena/` is not a repo — a local Python build dir (`build_gitlab_arena.py`, `members.json`,
`kpi.csv` → `arena.html`) producing a GitLab activity leaderboard. Same for `job-notes/`.

Team-wide AI usage is queryable via the `prompt-audit` MCP server
(`team_usage`, `member_prompts`, `team_prompt_audit`).

`avada-prod-error-alert` is published to **public npm under that exact unscoped name** —
not `@avada/prod-error-alert`.

`seo-wt-*` and `blogs-wt-docs` are git worktrees, not separate repos.

BigQuery billing export and the Firestore export both live in `avada-seo`.

## Stack

Shopify app: Polaris frontend (`packages/assets`) + Firebase Functions backend
(`packages/functions`). Firestore is the primary DB. Pub/Sub for fan-out.

Versions and runtimes differ per repo — check the repo, don't assume. `seo` is Polaris v13 and
also runs a self-hosted BullMQ/Redis worker fleet alongside Cloud Functions.

## Which skill

| Need | Skill |
|---|---|
| GCP cost, per-app spend, "how much did X cost" | `avada-billing-report` |
| AI credit usage (SEO via BigQuery view; Blog + APC via Firestore REST) | `credit-history-report` |
| Port the 1-star review alert to another app | `avada-low-rating-alert` |
| Write or rebuild an app's docs + skills from its code | `docs-from-code` |
| CI gate that keeps those docs true | `docs-gate` |
| Restart a stalled self-chaining fan-out job | `resume-stuck-job` |
| Create Jira issues on project FAL | `jira-create` |

**Code-level skills are per-repo.** Look in `<repo>/.claude/skills/` and that repo's own
`CLAUDE.md`. The global `firestore` / `backend` / `polaris` skills were deleted 2026-07-16:
they were copies of `joy`'s and described joy only — `cloudTaskService`/`enqueueTask`,
`firestore-indexes/`, and `paginateQuery` exist in `joy` and in no other app. Loaded globally,
they fed joy's architecture to every app as fact. A repo with no skill for something has a real
gap; don't fill it from another app's skill.

## Conventions

- Deploy is manual. Confirm the target project id before any write to GCP or Firestore.
- Pass absolute paths; don't `cd` into a repo and then run.
- CI uses immutable install. Any MR that adds a dependency must commit `yarn.lock` alongside,
  or the pipeline fails.
- MRs for `blogs` branch from `master`.
- The prod-error log sink exists in **every** prod project, not just `seo`.

## Layout

```
harness/
  brain.py            CLI: sync | learn | mirror | push | status
  config.yml          paths, repo list, source toggles, schedule
  sources/            per-source daily collectors (sessions, gitlog, daily, inbox)
  permissions/        mine_permissions.py — audits the Claude allowlist against real usage
daily/
  YYYY-MM-DD.md       generated daily note
  inbox.md            manual jots; matured entries surface at session start via read-loop
jobs/                 ad-hoc briefs and reports
memory/, skills/      mirrors of ~/.claude — backup only, not the live copy
projects/Falcon/      every Avada repo
launchd/              daily sync at 20:00 local
```

`brain.py sync` runs nightly: mirror → learn → summarize via headless `claude -p` → commit →
push. Durable facts become candidates in `daily/inbox.md`; they are never auto-written to memory.
A candidate matures after recurring on 2+ distinct daily runs and then surfaces at session start.
