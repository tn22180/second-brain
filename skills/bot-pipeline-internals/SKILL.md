---
name: bot-pipeline-internals
description: How data flows through falcon-fix-bot — scan/watermark/dedup, selector JSON extraction, the 7 evidence sources and their degradation ladder, diagnose/fix session mechanics (permissions, logs, language), owner resolution (git history → roster → Slack UID), ledger/state semantics, and the learn subsystem. Read when changing scan.js, selector.js, diagnose.js, fixer.js, owner.js, learn.js, ledger.js, or the prompts/agents.
---

# Pipeline internals

## Scan & dedup (three layers — know which one you're touching)

1. **Watermark (PRIMARY):** `watermark.json` per channel = last processed slack ts. Scan
   reads `--from <date-of-watermark>` and keeps `ts > watermark`. Advanced ONLY when the
   whole run completes cleanly (scan/selector throw ⇒ untouched ⇒ nothing is ever lost;
   per-bug errors do NOT block advance — they're ledgered).
2. **Ledger `has(bug_id)` (SECONDARY):** works because the selector sets `bug_id = slack_ts`
   (see `prompts/selector.md`). If you ever change bug_id format, this silently stops
   deduping — keep them equal or rework scan.
3. **Selector grouping:** same-root-cause threads collapse into ONE handoff (others into
   `duplicates[]`). Earliest thread wins.

## Selector (`selector.js`)

One claude call (SELECTOR_MODEL, sonnet-tier) on the whole batch. `extractHandoffs` finds the
payload with a **string-aware balanced-bracket scanner**, fenced ```json blocks first, then
the raw text; arrays of non-objects (e.g. an example `[1,2,3]` in prose) are skipped;
markdown links `[text](url)` before the payload were a real crash once — there's a test.
Invalid JSON → ONE retry with the parse error appended → then the run aborts (watermark
safe). Empty array = legitimate quiet hour.

## Repo freshness (who pulls what, when)

- **App clones** (`data/repos/<app>`): fast-forwarded to `origin/<default>` at the START of
  every run (`main.js` 1c → `git.syncDefaultBranch`) so diagnose reads CURRENT code — before
  2026-07-21 only the FIX worktree was guaranteed fresh and diagnose read clone-time files.
  Best-effort per app: a failed refresh warns and that app diagnoses on the stale tree
  (fixer's MISMATCH assert still rejects fixes whose diagnosed lines drifted).
- **FIX worktrees**: `fixer.js` fetches origin immediately before creating the worktree from
  `origin/<default>` — always fresh, independent of the clone refresh.
- **Docs repos** (falcon-docs FSD): best-effort `pull --ff-only` at startup.
- **team-ops**: `sync-claude-tools.js` pulls at startup.

## Evidence assembly (`diagnose.js`) — 7 sources, EACH individually fault-isolated

thread (required — from `tools/get-thread.js`) · crisp transcript IN FULL (user 2026-07-21:
the bug conversation can sit anywhere in it — no routine cap; only >200k chars gets a
MIDDLE cut via `middleCut`, head+tail preserved, loud marker) · screenshots
(downloaded to /state, model READS the images — vision) · Firestore `errorAlerts` (6k cap) ·
**live shop context** (decrypt token in-process → ONE read-only GraphQL query → only the
RESPONSE goes into evidence, never the token) · FSD docs dir (intended-behaviour check — many
"bugs" are unbuilt features) · learn KB — the WHOLE recent-commits.md (already 400-line-capped by learn.js; the model picks what matters).

A failed source becomes a literal `MISSING: <name>` line — diagnosis continues degraded.
**Shop-context failure additionally injects "do not exceed CONFIDENCE: medium"** — no live
verification ⇒ no auto-fix, by design (TAG path instead). Preserve this ladder when editing.

## Model sessions (`claude.js#runClaude`)

- `claude -p` child process, 20-min timeout, exactly ONE retry, 64MB buffer. Raw output
  appended to `/state/logs/<runId>/<bug_id>-{diagnose,fix}.log` — ALWAYS check these first.
- `skipPermissions: true` is passed ONLY by diagnose + fixer (they use tools; headless
  default permission mode blocks Edit and every FIX died as EMPTY_DIFF until this was found
  in phase-0). Selector/learn don't get it (least privilege).
- **Verdict reformat backstop** (`diagnose.js#reformatVerdict`): if `parseVerdict` rejects
  the block (markdown bold, VERDICT/CONFIDENCE merged on one line — both seen live
  2026-07-21), ONE cheap no-tools call asks the model to restate ONLY the strict block from
  its own analysis; parse that, keep the ORIGINAL text as the dev report. Parser itself now
  tolerates bare emphasis wrappers (`**VERDICT: FIX**`). Ambiguous-after-both → SKIP with
  `unclearReply` ("chưa thể tự kết luận" — NOT "không cần sửa code") + dev report persisted.
- **MWPS race** (`pipeline.js#armAutoMerge`): GitLab 405s merge-when-pipeline-succeeds until
  the MR's first pipeline exists. Arming retries 5×8s; if it STILL fails the path does NOT
  error — outcome stays auto-fix/pending-merge, ops gets "could NOT be armed", the thread
  reply drops the auto-merge promise. (Live: MR !2031 turned into a false "error".)
- **Total failure returns `{ok:false, text:""}` — diagnose THROWS on !ok** (→ ops alert +
  ledger error). It used to silently SKIP; if you refactor, keep the throw — a dead claude
  CLI must be loud, not quietly idle.
- `REPORT_LANGUAGE=vi` appends a Vietnamese instruction to diagnose/fix/learn prompts. The
  instruction explicitly keeps verdict labels + enums (`VERDICT/FIX/SKIP/high/...`) English —
  parseVerdict depends on it. Never localize those.

## Three thread touchpoints (`pipeline.js#processOneHandoff` / `runFixPath`)

The in-thread signal is no longer FIX-only. Once a handoff clears the supported/in-scope check
(§Scan & dedup routing) but BEFORE evidence assembly starts:

0. **CLAIMED GUARD** (`classifyThread`) — BEFORE any signal, replies are classified
   (bot's own messages + the reporter's follow-ups never count):
   - `handled` — a reply with a GitLab MR link, or ANY mention-less reply from another
     author ("để em xem", "done") → a dev is on it → ledger `skipped-claimed`, totally
     silent (live 2026-07-21: the bot barged into a thread with dev MR !2030).
   - `assigned` — a techlead tagged dev(s) via `<@U…>` but no one has responded (no
     mention-less reply anywhere) → bot still diagnoses but NEVER fixes: posts
     `assignedReply` ("có thể hữu ích cho <@dev>") + uploads the full diagnosis file,
     ledger `assigned-report`. Assignment outranks even a FIX/high verdict (gate is
     bypassed). Any mention-less human reply anywhere flips the thread to `handled`.
1. **CHECKING** — (only when `REACTIONS=1`; default OFF) react 👀 `eyes` on the real thread (`handoff.channel_id`/`handoff.slack_ts`,
   never-throw try/catch, same pattern `runFixPath` uses for its own reaction) + post
   `report.checkingReply()` via the same `postBestEffort` + `thread.channel_id || handoff.channel_id`
   / `thread.thread_ts || handoff.slack_ts` resolution the TAG/FIX replies use (so TEST_MODE
   redirection applies to the comment, same as any other reply). Unsupported/unknown apps never
   reach this — they return earlier, ledger-only. The COMMENT is opt-in (`CHECKING_COMMENT=1`,
   default OFF — user feedback: reads as spam; 👀 is the signal) and `hasBotCheckingReply`
   suppresses a re-post when a crashed run already left one.
2. **FIXING** — `runFixPath` reacts 🤖 `robot_face` only when `REACTIONS=1` (👀 already fired
   at checking when enabled, so it is not re-reacted).
3. **RESULT** — FIX/TAG replies unchanged. SKIP is no longer silent: genuine SKIP verdicts
   post `report.skipReply({reason})`; an AMBIGUOUS one (verdict null after the reformat
   backstop) posts `unclearReply` AND uploads the full analysis file to the thread (same
   mechanics as the TAG upload) so the reader has the "what to do next", not a bare shrug.

## Dev report artifact (`report.js#devReport` + pipeline persist/upload)

`diagnose()`'s `verdictText` IS ALREADY the full raw diagnose-model text (`res.text` from
`claude.js#runClaude` — the whole session's stdout, not just the parsed verdict block);
`parseVerdict` only extracts fields FROM it, it never replaces it. Same for the fix session:
`fixer.js#applyFix` now also returns `report: res.text` (the fix-bug subagent's own
stdout/prose) alongside `{wtDir, branch, changedFiles, diff}`. `pipeline.js#persistDevReport`
builds `report.devReport({app, bugId, permalink, kind, body, fixReport})` and writes it to
`/state/reports/<sanitizeId(bug_id)>.md` — **ALWAYS**, for both TAG and FIX outcomes, even
under DRY_RUN (a local file write is not an outward action, so the DRY_RUN gate doesn't apply
to it). This is the durable "hand the dev the bot's full reasoning" artifact: a tagged dev or
an MR reviewer can read the whole diagnosis (and, on the FIX path, the fix session's own
report) to continue from where the bot left off, not just the terse Slack reply.

- **TAG path**: after the existing `tagReply` post, `persistDevReport(kind:"diagnosis",
  body: verdictText)` then `ctx.slack.uploadReport(...)` uploads that same markdown to the
  thread as a Slack file (best-effort, wrapped in try/catch even though `uploadReport` itself
  never throws). If the upload fails, the local `/state/reports/<id>.md` file is still there.
- **FIX path**: `persistDevReport(kind:"fix", body: verdictText, fixReport)` runs right after
  `applyFix` succeeds (before commit/push), unconditionally (DRY_RUN included). The MR
  description is then `verdictText + "\n\n---\n## Fix report\n" + fixReport + "\n\n" +
  permalink` — no separate Slack upload on this path (the MR already carries the report; the
  thread reply stays the short customer-facing `fixedReply`).

## Fix path mechanics (`fixer.js` + pipeline FIX branch)

`sanitizeId(bug_id)` for EVERY path/branch derived from it (bug_id is LLM-originated —
path traversal via `../` was demonstrated; the sanitizer also collapses dot-runs because git
refuses `..` in ref names). Worktree at `/state/wt/<id>` from `origin/<default>` (real
default read from git, NOT config — llm-ai-search-seo is `main`). Stale worktree/branch from
a crashed run are best-effort cleaned BEFORE creating. `collectDiff` runs `git add -N .`
first so brand-new files appear in the diff (plain `git diff` misses untracked files —
a fix that only creates a file returned an empty diff once). Worktree removed in `finally`.

## Owner resolution (`owner.js`) — who gets tagged

1. Files from the verdict → `git log --since=180.days --format=%ae` per file → tally emails
   **case-insensitively** (MinhPT@ and minhpt@ are one author; case-sensitivity once caused
   wrong-person tagging), bot's own email excluded, per-file failures isolated.
2. Most frequent email's localpart must be a roster member (walk ALL teams + designers).
   Roster is loaded at runtime from the team-ops clone
   (`/repos/team-ops/skills/jira/team-roster.json`) with the bundled `config/team-roster.json`
   as fallback — so team reorgs propagate without code changes (the 2026-07-15 reorg from 3
   teams to 2 boards is exactly why).
3. Username → Slack UID via **`secrets/slack-roster.json`** (authoritative, private — team
   policy forbids committing UIDs; regenerate per [[bot-edge-cases]]) → fallback: fuzzy
   `users.list` token map (`slack.buildUserMap`, bot token) → fallback: the team's first techlead (team found by
   `config.apps[app].appKey` ∈ team.apps, e.g. "AEO") → ultimate: `fallbackSlackUserId`.
4. Non-roster top author (someone who left, an outside contributor) → TL fallback kicks in.

## Ledger semantics (`ledger.js`)

Append-only JSONL; **the LAST line per bug_id wins** (literal — no field merging across
history; `updateState` carries prior fields forward itself when writing). Corrupt/truncated
lines are skipped with a warning (a torn write used to brick every ledger call). Known
bounded gap: a truncated line WITHOUT trailing newline swallows the single next append.
`countToday(action)` filters by UTC ISO date — used for the daily caps.

## Learn subsystem (`learn.js`)

**When:** at the `LEARN_AT` daily slots (default `08:15,18:30` — start/end of the team's
workday, mirroring kael-autofix's launchd schedule; container TZ is Asia/Ho_Chi_Minh so
slots are team-local). The check runs inside the hourly loop: a slot is caught by the
FIRST run at/after it (`isLearnDue`: stamp `knowledge/last-run` mtime < most recent slot
occurrence). A bot that was down over a slot catches up on its next run — ONE learn covers
everything, because the git-log watermark (not the schedule) decides what's summarized.

**What:** per app, `git log <last-sha>..origin/<default>` → if new commits, ONE claude call
(selector model) summarizes → then THREE writes:
1. `recordEntry` appends the durable history — `knowledge/entries.jsonl` (append-only
   SOURCE OF TRUTH, kael-shape `{id,date,app,from_sha,to_sha,n,summary}` + optional
   `hidden`) AND `knowledge/archive/YYYY-MM.md` (per-month browsable view). Best-effort:
   a failed history write warns, never blocks the KB rebuild.
2. `sections/<app>.md` overwritten with the latest summary.
3. `recent-commits.md` rebuilt from sections (400-line tail cap) — the ONLY file the model
   ever reads (diagnose feeds the whole file). History is deliberately NOT fed to the
   model — it's for selective human/AI reading via the monthly archives.

`scripts/kb-regen.js --state data/state` rebuilds all three views from entries.jsonl —
use after hand-hiding a bad entry (`"hidden": true`) or a backfill (kael's regen-kb.js
equivalent). entries.jsonl was seeded 2026-07-21 from kael-autofix's KB (51 entries,
2026-07-01→21, tagged `source:"kael-autofix"`).

Digest posted to OPS_CHANNEL as **header + ONE message per app** (a single combined message
hit the length cap and truncated mid-word). Language follows REPORT_LANGUAGE. Per-app claude
failure keeps the previous section — learn NEVER throws into the run.

## Sync of agents/skills (`sync-claude-tools.js`)

Installs `claude/agents/*` + the team-ops **plugin layout** (top-level `agents/ skills/
commands/`; falls back to legacy `claude-tools/{agents,skills}`) into container `~/.claude`.
team-ops became the `falcon@falcon` Claude Code plugin on 2026-07-17 — if the team
restructures again, this resolver is where to look. Skills are copied as DIRECTORIES
(`cp -R src dest/` semantics) — the trailing-slash contents-flatten bug bit this project
once; there's a test.
