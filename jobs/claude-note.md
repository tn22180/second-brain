và sumup lại thói quen cũng như việc t hay làm cũng như là tao là ai , rule là gì nguyên tắc cái gì được làm, không được làm bắt đầu từ đâu giảm context các thứ ra CLAUDE.md ở claude tổng và second-brain

---

## Design (approved 2026-07-28)

Three layers, no layer repeats another:

| Layer | Holds | Changes |
|---|---|---|
| `CLAUDE.md` | identity, how to answer, judgment rules, start-here | rarely |
| `memory/*.md` | discrete technical facts | often |
| `settings.json` | allow / ask / deny | mechanical |

**Global `~/.claude/CLAUDE.md`** (~40 lines, loads in every project) — identity + rules only.
All Avada workspace content moves out; one pointer line replaces it.

**`second-brain/CLAUDE.md`** (~80 lines) — Avada workspace: repo→project table, stack,
which-skill routing, conventions, layout. Loads for every Avada repo because they all sit
under `second-brain/projects/Falcon/` and Claude Code walks parent directories.

Evidence base: 2,637 prompts in `history.jsonl`, 18.8k Bash calls across 753 transcripts,
4 matured read-loop candidates (×3).

Written in English — matches the existing file, and CLAUDE.md is read by the model.

---

## Progress

Started: 2026-07-28

**Status: COMPLETE** — 2026-07-28

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Write global `~/.claude/CLAUDE.md` | ✅ | 54 lines; Avada content removed |
| 3 | Verify repo→project table against disk | ✅ | ran before #2; 3 errors found in old table |
| 2 | Write `second-brain/CLAUDE.md` | ✅ | 94 lines; every id from `.firebaserc` |
| 4 | Check no duplication across three layers | ✅ | `user-profile` memory was duplicating identity — trimmed |
| 5 | Fix stale `avada-repo-map` memory | ✅ | deleted (superseded + wrong path); 4 links repointed |
| 6 | Final verification, close out | ✅ | all 25 cited paths and 7 skills exist |
| 7 | Correct identity to techlead of team SEOOn | ✅ | org Avada → Falcon → SEOOn; added team/infra repos |

### Log

#### ✅ Task 1: Write global CLAUDE.md
Identity, reply style, six judgment rules, start-here, one pointer line. No command lists —
those stay in `settings.json`. Review caught one false claim (both `settings.local.json` "kept
empty"; the second-brain one had been repopulated) and it was reworded.

#### ✅ Task 3: Verify repo→project table
Run before task 2 so the table was written from verified data, not corrected after. Checked
every `.firebaserc` under `projects/Falcon/`. Three errors in the old global table:

- `seo` packages listed `docker`, which does not exist, and omitted `dashboard`.
- `joy` was absent entirely — a live repo (`avada-joy` / `avada-joy-staging` + `-2..29`) with
  its own in-repo skills.
- `~/Documents/Falcon-Notification/falcon-notification` was listed as a separate workspace.
  That path does not exist.

Also confirmed: `avad-seo-staging` really is spelled without the trailing `a`; all 11 lib repos
have no `.firebaserc`; `seo-wt-*` are worktrees, not repos.

#### ✅ Task 2: Write second-brain/CLAUDE.md
Verified table (9 apps + 11 libs), stack, which-skill routing, conventions including the four
matured read-loop rules, layout. Added `speed-up-report` and the newer repos.

#### ✅ Task 4: Check layer overlap
No memory fact restated: `shops_raw`, the 139 GB join, the UTC cron offset, purge economics,
the Redis proxy, `daily.html`, FAL-206 all appear zero times in either CLAUDE.md. Only
`firebase deploy` is named from `settings.json`, as an example inside a rule, not as a list.

One real overlap found and fixed: `user-profile.md` restated identity, Vietnamese, terse, and
caveman — all now owned by the global CLAUDE.md, and both load every session. Trimmed to the
two things only it knows (git email vs Claude email; the prompts-over-safety trade-off).

#### ✅ Task 5: Fix stale repo-map memory
`avada-repo-map.md` claimed repos live under `~/Documents/SEO-BLOG/`, which no longer exists,
and its table is now fully covered by `second-brain/CLAUDE.md` including the `avad-seo-staging`
gotcha and the BigQuery-export note. Deleted rather than patched. Four `[[avada-repo-map]]`
links across other memories repointed.

#### ✅ Task 6: Final verification
All paths cited in both files resolve on disk (`harness/brain.py`, `config.yml`, `sources/`,
`permissions/mine_permissions.py`, `daily/`, `jobs/`, `memory/`, `skills/`, `projects/Falcon/`,
`launchd/`). All 7 skills named in the routing table exist under `~/.claude/skills/`.

#### ✅ Task 7: Correct identity to techlead
Global CLAUDE.md said "Engineer at Avada" — wrong scope. Now: techlead of team SEOOn, org
chain Avada → team Falcon → SEOOn, owning the team plus the infrastructure behind the apps.
Added a scope note: he is accountable across the whole surface, so a finding in one app usually
needs checking in the others, and cost/reliability numbers are things he reports upward.

That scope pulled in a section second-brain/CLAUDE.md was missing — the team and infra repos:
`fleet-control` (Bun cockpit over the worker fleet, control plane only), `team-ops` (team Falcon
operating docs), `seo-suite-ai` (shared AI-skill library), plus the `prompt-audit` MCP server for
team-wide AI usage. Verified from each repo's README, not assumed.

Correction caught during that pass: `gitlab-arena` is **not** a repo. No `.git`, no
`package.json` — a local Python build dir (`build_gitlab_arena.py`, `members.json`, `kpi.csv`
→ `arena.html`). It had been about to be listed alongside real repos. Same for `job-notes/`.

### Result

Global CLAUDE.md went from 2,944 bytes of mostly-Avada content loaded into every project, to
54 lines of identity and rules. Avada context moved to `second-brain/CLAUDE.md`, which loads
only where it applies — and is now correct, which the old one was not.

Memory index dropped from 11 entries to 10, with the largest duplicate trimmed.

### Open

None. The one open question — which email is authoritative for commit attribution — was
answered: `tuannv@avada.email` (name `Tony`), confirmed set globally and in all 20 repos under
`projects/Falcon/`. The `teamf2663@gmail.com` in the old memory was simply wrong; `user-profile`
memory now records the correct address and why the Claude account email is irrelevant here.
