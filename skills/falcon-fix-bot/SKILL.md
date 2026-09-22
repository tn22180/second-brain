---
name: falcon-fix-bot
description: START HERE when maintaining this repo — what the bot is, the module map, the hourly run flow, rollout phases/env flags, how to build/run/pause/debug, and where every piece of state lives. Router to the sibling skills (bot-safety-gates, bot-pipeline-internals, bot-edge-cases). Read before changing ANY code here.
---

# falcon-fix-bot — maintainer's overview

Team bug-fix bot, one hourly loop — a **native launchd daemon** since 2026-09-22 (Docker is the rollback, see [[bot-deploy]]). Hourly: scans the Avada Slack support channels (seo-suite-support + blog-support; crisis-management removed 2026-07-21 per user),
auto-fixes high-confidence bugs of the 4 Organic apps (branch → MR → merge-on-green →
gated PRODUCTION deploy via git tag), tags the responsible dev for everything else.

**Authoritative docs, in order:**
1. `docs/superpowers/specs/2026-07-17-falcon-fix-bot-design.md` — the approved design (decisions log!)
2. `docs/superpowers/plans/2026-07-17-falcon-fix-bot.md` — how it was built, task by task
3. This skill + siblings: [[bot-safety-gates]] · [[bot-pipeline-internals]] · [[bot-edge-cases]]

## Architecture in one paragraph

A **deterministic Node orchestrator** (all control flow, git, GitLab API, Slack, ledger, caps
= plain code) that calls `claude -p` for exactly four bounded jobs: **selector** (batch of
Slack messages → JSON bug handoffs), **diagnose** (evidence → FIX/SKIP verdict), **fix**
(edit files in a worktree), **learn** (summarize team commits). The model NEVER drives the
loop, never touches git, never decides to merge or deploy — code gates do. This shape was
chosen because the predecessor (kael-autofix) empirically failed when the model orchestrated
("orchestrator exits early"). Don't reintroduce model-driven control flow.

## Module map (src/)

| Module | Owns | Never does |
|---|---|---|
| `main.js` | startup (secrets→env, clones, allowlist, sync ~/.claude), LOCK/PAUSED, run loop, watermark advance | business logic |
| `pipeline.js` | pool (CONCURRENCY), per-app fix mutex, per-handoff state machine, DRY_RUN gating of push/MR/merge | tag anything |
| `scan.js` | read channels (bot-token conversations.history) since watermark → candidates | advance watermark |
| `selector.js` | 1 claude call → validated handoffs; balanced-bracket JSON extraction | tools/filesystem |
| `diagnose.js` | evidence assembly (7 sources, each fault-isolated) → claude → `parseVerdict` | edit files |
| `fixer.js` | worktree lifecycle, fix session, hard asserts (`checkFixResult`), `collectDiff`, `sanitizeId` | commit/push (caller does) |
| `gate.js` | pure `decide()` — THE auto-fix decision (see [[bot-safety-gates]]) | I/O |
| `git.js` | local git ops; `pushBranch` (falcon-bot/* only); token redaction; `syncRemoteUrl` re-points an existing clone's `origin` at the configured host (host-move migration — clones are never re-created) | tags (no tag code at all) |
| `gitlab-host.js` | THE single source of truth for the GitLab host (`https://git.avada.net` since the 2026-08-18 move off gitlab.com) — `apiBase()`/`repoUrl()`/`authedRepoUrl()`/`credentialEntry()`; https-only validation (the write token rides in these URLs); `setHost()` wired from `config.gitlabHost` (env override `GITLAB_HOST`) at the top of `startup()`. A guard test fails the build if any other `src/` module hardcodes a host | know about projects/allowlist |
| `gitlab.js` | REST client, allowlist-gated; MR create / merge_when_pipeline_succeeds / tags list / pipeline status | tag creation, direct merge |
| `deploy.js` | **THE ONLY tag-push path** — fence, caps, batching (see [[bot-safety-gates]]) | retry a failed deploy |
| `learn.js` | commit summaries at LEARN_AT slots (08:15/18:30) → entries.jsonl + monthly archive + KB + VN digest | throw (always degrades) |
| `owner.js` | git-history → roster member → Slack UID (see [[bot-pipeline-internals]]) | post |
| `slack.js` | reads AND writes on the **bot token only** (Web API: conversations.history/replies, users.list, chat.postMessage, reactions, file upload), DRY_RUN/TEST_MODE routing, `[TEST PRODUCTION]` marker | secrets in errors (scrubbed); no personal user token/cookie |
| `commands.js` | in-thread `@bot fu`/`continue` triggers — see §commands below | tag/fix outside `processOneHandoff`'s own gates |
| `ops-commands.js` | ops-channel admin surface: `help`/`config`/`admin`/`recheck`/`continue` — parse → authorize (admins only) → dispatch — see §commands below | act for a non-admin |
| `runtime-config.js` | Slack-settable config overlay (`data/state/runtime-config.json`); `sanitize()` is the key allowlist — THE security boundary for the whole feature | let a rollout flag (AUTO_DEPLOY/DRY_RUN/TEST_MODE/…) through the overlay |
| `ledger.js` | append-only seen.jsonl (last-line-wins), per-channel watermark, daily counts, per-bug command cursor | delete/rewrite history |
| `claude.js` | `runClaude` (timeout 20m + 1 retry + logFile), fail-closed `parseVerdict`, arg building | emit `--dangerously-skip-permissions` — it is gone; sessions take a `profile` |
| `permissions.js` | the two session profiles (`investigate` read-only, `edit`) as default-deny allowlists + the shared deny backstop | hand out bare `Bash` (a guard test fails) — see [[bot-safety-gates]] |
| `report.js` | `makeReport(lang)` — all human-facing text, vi default | logic |
| `config.js` | config.json + env parsing (safe defaults: DRY_RUN/TEST_MODE=true), merges the `runtime-config.js` overlay over env for models/cron | — |
| `sync-claude-tools.js` | installs claude/agents/* + team-ops plugin skills into the daemon's OWN `$HOME/.claude` (both layouts) | point at the operator's real HOME |

`tools/`: vendored `slk` (Slack CLI, ESM, own package.json) · `get-thread.js` + `lib/parse.js`
(thread→JSON; 9 unit tests) · `crisp.js` · `fetch-captures.js` (screenshots) · `fs-query.js`
(Firestore prod logs) · `shop-token.js` (decrypt + **query-only** GraphQL guard).
`claude/agents/`: `diagnose-bug.md`, `fix-bug.md` — the unattended agent prompts.
`prompts/`: `selector.md`, `learn.md` (placeholders `{{...}}`).

## The hourly run (condensed — full detail in [[bot-pipeline-internals]])

```
LOCK/PAUSED → follow-ups (deploy-check on pending-merge; learn if a LEARN_AT slot passed — default 08:15 & 18:30 VN time)
→ scan channels since watermark → selector → per-handoff (pool=3, per-app fix mutex):
    thread → [supported/in-scope?] → react 👀 + "checking" reply → evidence → diagnose → gate.decide():
      SKIP → "checked, no fix needed (<reason>)" reply → ledger
      TAG  → owner via git history → thread reply with root cause + @mention
      FIX  → react 🤖 (👀 already fired at checking) → worktree fix → asserts → commit(bot author)
             → push falcon-bot/* → MR (description = full diagnosis + fix report) → (AUTO_MERGE) merge-on-green → CS reply
→ watermark advance (ONLY on clean run) → ops summary (silent if empty)
```

**Dev-report handoff** (see [[bot-pipeline-internals]] for the full mechanics): every TAG and
FIX outcome persists `data/state/reports/<bug_id>.md` — the bot's FULL reasoning (the whole
diagnose model text, not just the parsed verdict), so a tagged dev or an MR reviewer can
continue from where the bot left off. TAG additionally uploads that file to the thread via
Slack's external-upload API; FIX instead appends the fix session's own report into the MR
description (no Slack upload — the MR already carries it).

Three thread touchpoints now, not one: **CHECKING** (👀 + comment, right after the app is
confirmed supported/in-scope, before evidence gathering) → **FIXING** (🤖 only, at the top of
`runFixPath`) → **RESULT** (FIX/TAG/SKIP reply — SKIP is no longer silent in-thread; it would
otherwise leave "đang kiểm tra" dangling). Unsupported/unknown apps stay ledger-only silent —
the bot isn't working them, so no "checking" fires.

## §commands — two authorization surfaces, one switch

Both surfaces below are gated by the SAME `COMMANDS_ENABLED=1` (default OFF — ship-disabled
until reviewed live, same posture as every other live-posting capability) and skipped under
`FORCE_RECHECK` (a replay must not also dispatch live commands). They run back-to-back as step
**1d** in `run()` (`main.js`, right after the roster refresh and before SCAN), each in its own
try/catch — a failure in one is nonfatal and never blocks the other or the main scan.

### In-thread triggers (`commands.js`, added 2026-07-27)

Lets a **roster dev/techlead/tester** (`engineerUidSet`; unauthorized mentions are silently
ignored, just logged) drive the bot from inside a thread reply — no selector/scan window
needed:

- **`@falcon_bot fu`** / **`phụ`** (accent-insensitive) — full re-diagnose that **CAN
  auto-fix**. Builds a synthetic handoff (same shape FORCE_RECHECK's targeted replay uses) and
  calls `processOneHandoff(..., {bypassClaim: true})` — the ONE new pipeline.js knob: an
  explicit human ask overrides the passive "someone already replied/was tagged, step aside"
  heuristic (`classifyThread`'s handled/assigned check). Every other gate (supported app,
  `gate.decide`, MAX_FIXES_PER_RUN/DAY caps, DRY_RUN/TEST_MODE) is unchanged — commands share
  ONE `fixesThisRun` counter with the main scan's `processHandoffs` so the run cap is real
  across both sources, not doubled.
- **`@falcon_bot continue`** / **`tiếp tục`** / **`status`** — report-only: replies with
  `report.statusReply()` built from `ledger.get(bug_id)`. Never takes action, even if the
  ledger shows a stalled/errored state — that's a deliberate v1 scope cut (see Q&A below).
  **Renamed from `continue` to `status`** (2026-07-29): the keyword `continue`/`tiếp tục`
  still MATCHES here (people type it), but the command's *name* is `status`, freeing the word
  "continue" to mean something else — re-diagnose — on the ops-channel surface below. One
  word, one meaning, per surface. When a message matches both keyword sets, `status` wins:
  ambiguity resolves toward the read-only request, never the one that can open an MR.

**Discovery mechanism**: for each configured channel (`config.channels`), `readChannel` over
the last `COMMAND_LOOKBACK_DAYS` (default 14), filtered to parents with `replies>0`; each such
thread is re-fetched via `threadJson` and any reply past a **per-bug cursor**
(`ledger.getCommandCursor`/`setCommandCursor`, backed by `data/state/commands.json`, same
atomic-write shape as `watermark.json`) is checked for a command. This bounds the per-run API
calls to "threads with new activity in the lookback window" — cheap regardless of how many
bugs the bot has EVER processed (**this bot serves several apps' shared channels** — an
unbounded lookback would grow forever).

### Ops-channel admin surface (`ops-commands.js`, added 2026-07-29)

A single dedicated channel (`OPS_CHANNEL` in `.env`) for whoever runs the bot to reconfigure it
live, without touching the container. Authorization here is **admins only** — a materially
higher bar than the in-thread roster check above, because these commands can change what model
runs, how often the bot runs, and who else is trusted:

- **The admin set** (`adminUidSet(config)`) = `config.env.ADMINS` (the overlay's `admins`
  array) **plus** the bootstrap admin, `config.fallbackSlackUserId` from `config/config.json`.
  The bootstrap admin is compiled in, never stored in the overlay, and `admin remove` on it is
  refused with an explanation — there must be no sequence of Slack commands that leaves the
  bot with zero admins.
- A non-admin's command is silently ignored (logged only) — same anti-probing posture as the
  in-thread roster check: replying "unauthorized" would both spam the channel and confirm the
  command surface exists to whoever is poking at it.
- **Unlike the in-thread commands, an ADMIN's failure DOES reply in-channel** for the cases
  `applyCommand` can name a reason for — invalid key, invalid model, invalid cron, and unknown
  thread (Slack API rejects the URL) all get a specific `opsErrReply`. An admin who typed a
  command must never be left guessing whether it worked. **Exception**: an unparseable
  `recheck`/`continue` URL never reaches that logic — `parseOpsCommand`'s `toUrl()` check maps
  it straight to `{cmd: "unknown"}`, the SAME bucket as a plain typo'd verb, so it gets the
  generic `help` listing instead of a targeted error — indistinguishable from having mistyped
  the verb entirely. (A genuine UX gap, not a doc gap — recorded separately, out of this
  task's scope.) An unrecognized verb after the mention (still from an admin) likewise gets the
  `help` text — an @-mention here is unambiguous intent to command the bot, unlike a passerby
  thread reply.
- **Commands** — `parseOpsCommand` → `applyCommand` (parse → authorize → dispatch, see
  `ops-commands.js`):
  - `help` — list the commands.
  - `config show` — every Slack-settable key, its current value, and its **source**
    (`overlay` / `env` / `default`) — see `runtime-config.js` below.
  - `config set model.<selector|diagnose|fix|learn> <model>` — set one job's model; rejected
    if `<model>` isn't in `config/config.json`'s `allowedModels`.
  - `config set cron <minutes>` — set `RUN_INTERVAL_MIN`; bounded 5–1440
    (`runtime-config.js#CRON_MIN/CRON_MAX`).
  - `config reset <model.xxx|cron>` — drop that overlay key, falling back to `.env`.
  - `admin list` / `admin add @user` / `admin remove @user` — manage the extra-admins list.
  - `recheck <slack-thread-url>` — fresh re-diagnose of that thread
    (`pipeline.processOneHandoff(..., {bypassClaim: true})`, same bypass as in-thread `fu`).
  - `continue <slack-thread-url>` — re-diagnose, but seeded with the bot's **prior persisted
    report** (`data/state/reports/<bug_id>.md`) as extra context, falling back to a fresh check
    if none exists. Unlike in-thread `status`, this DOES take action — see the rename note
    above for why the same word means different things on the two surfaces.
  - Both `recheck`/`continue` share `fixesThisRun` with the main scan too, and deliberately do
    NOT touch the watermark — an out-of-band action on one thread must not perturb channel
    scan bookkeeping.
- **Discovery mechanism**: `pollOpsCommands` reads TOP-LEVEL messages in `OPS_CHANNEL` since a
  reserved cursor (`ledger.getCommandCursor("__ops__")`, the same `commands.json` file as the
  in-thread cursors, under a key that can never collide with a real bug_id/Slack ts). The bot's
  own posts are filtered out by uid so it never reads its own output as input.
- **Startup guard**: `main.js#assertChannelsDisjoint` refuses to start if `OPS_CHANNEL` is also
  one of the channels in `config.channels` — otherwise one message would be walked by BOTH the
  support-thread pass and the ops pass, under two different authorization rules.

### The config overlay (`runtime-config.js`)

Every mutation above (`config set/reset`, `admin add/remove`) writes to
`data/state/runtime-config.json` via `openRuntimeConfig(stateDir, {allowedModels})`, and
`config.js#loadConfig` re-reads and merges it over `.env` at the top of **every** run
(`main.js#refreshRuntimeConfig`) — so a change takes effect within one `RUN_INTERVAL_MIN`, no
restart, no redeploy. `sanitize(raw, allowedModels)` is **the security boundary for the whole
feature**: only the keys it explicitly builds (`models.<job>`, `runIntervalMin`, `admins`,
`updatedAt`/`updatedBy`) survive being read back — a hand-edited (or attacker-written)
`runtime-config.json` carrying `AUTO_DEPLOY`/`DRY_RUN`/`TEST_MODE` therefore cannot influence
the bot at all, because `config.js` never even sees those keys. `applyCommand`'s dispatch (and
`runtime-config.js#setModel` for an unknown job) ALSO rejects an unknown `config set`/`config
reset` key with a helpful message — but that's convenience, not enforcement: `parseOpsCommand`
itself does no key validation at all, it passes whatever key was typed straight through.
`sanitize()` is the one check that can't be bypassed even by a hand-edited file.

## State (all under `data/state/` = `/state` in container)

| Path | What |
|---|---|
| `seen.jsonl` | append-only ledger; LAST line per bug_id wins; states: skipped/tagged/dry-run/error/pending-merge/merged/deploying/pushed/push-error/deployed/deploy-error/closed |
| `watermark.json` | per-channel last-processed slack ts — the PRIMARY dedup |
| `commands.json` | per-bug_id highest reply ts already checked for an in-thread command, PLUS the ops-channel cursor under the reserved key `__ops__` (§commands) |
| `runtime-config.json` | Slack-settable overlay written by ops-channel `config`/`admin` commands: per-job models, cron interval (`RUN_INTERVAL_MIN`), extra admin UIDs. Merged over `.env` at the top of every run (`config.js`); `runtime-config.js#sanitize()` is the only path anything reaches this file through — an unknown key here is simply dropped, never read |
| `knowledge/` | learn KB: **entries.jsonl** (append-only SOURCE OF TRUTH, every learn ever, kael-shape + `hidden` flag), **archive/YYYY-MM.md** (browsable per-month history), sections/<app>.md (latest per app), recent-commits.md (small AI window — latest per app, 400-line cap), last-learned.json (shas), last-run (slot stamp) |
| `reports/<bug_id>.md` | dev-facing report (`report.js#devReport`) — full diagnose model text (+ fix report on the FIX path); persisted for TAG+FIX outcomes, ALWAYS incl. DRY_RUN |
| `wt/<bug_id>` | fix worktrees (removed after success; stale ones auto-cleaned at next attempt) |
| `logs/<runId>/<bug_id>-{diagnose,fix}.log` | RAW model output per session — first stop when debugging |
| `screenshots/<bug_id>/` | downloaded customer screenshots |
| `git-credentials` | transient store (0600) so private-repo fetches auth; origins stay tokenless |
| `LOCK` / `PAUSED` | run mutual-exclusion / kill switch (`touch data/state/PAUSED`) |

## Rollout phases (env flips only — `.env`, NO inline comments in that file!)

| Phase | Env | Meaning |
|---|---|---|
| 0 | `DRY_RUN=1` | everything runs, all writes printed |
| 1 | `TEST_MODE=1 AUTO_MERGE=0` | real MRs (no merge); ALL replies → TEST_CHANNEL |
| 2 | `TEST_MODE=1 AUTO_MERGE=1` | + merge-on-green |
| 2.5 | `TEST_MODE=0 TEST_PRODUCTION=1` | normal routing — replies land in the REAL threads — but every post/upload comment opens with `[TEST PRODUCTION]` |
| 3 | flags off, ANTHROPIC_API_KEY | live replies in real threads, team machine |
| 4 | `AUTO_DEPLOY=1` | bot deploys its merged fixes (LAST switch) |

`TEST_MODE` and `TEST_PRODUCTION` are mutually exclusive — `loadConfig` THROWS if both
are truthy, and since TEST_MODE defaults true, `TEST_PRODUCTION=1` alone also throws
(you must write `TEST_MODE=0` explicitly). The marker is applied in `slack.js` only
(post text + uploadReport comment), BEFORE the DRY_RUN check so dry-run previews show
the exact outgoing text. Reactions and MRs carry no marker (reactions have no text;
phase-1 MRs never had one either — consistent).

Reactions (👀 at checking, 🤖 at fix-start) are OPT-IN (`REACTIONS=1`, default OFF — user
feedback: they read as spam, and 👀 on a then-skipped thread misleads). When enabled they are
the ONE thing that hits the real thread even in TEST_MODE (can't be redirected; deliberate).
The checking/skip/tag/fix **comments** are normal posts — DRY_RUN prints them, TEST_MODE
redirects them like any other reply. The checking comment is likewise opt-in (`CHECKING_COMMENT=1`).
`REPORT_LANGUAGE=vi|en` (vi default) — verdict labels/enums stay English or `parseVerdict`
breaks. `COMMANDS_ENABLED=1` + `COMMAND_LOOKBACK_DAYS` (default 14) turn on BOTH §commands
surfaces above (in-thread AND ops-channel — one switch) — independent of the phase table (it's
a trigger source, not a routing mode); still fully subject to whatever
DRY_RUN/TEST_MODE/TEST_PRODUCTION phase is active. `OPS_CHANNEL` (also used for run-summary/
alert posts, unrelated to §commands) doubles as the ops-command channel once COMMANDS_ENABLED
is on — `main.js#assertChannelsDisjoint` refuses to start if it collides with a scanned support
channel in `config.channels`.

`DIAGNOSE_MODEL` / `LEARN_MODEL` are per-job model overrides, each falling back to a legacy var
when unset (`DIAGNOSE_MODEL → FIX_MODEL`, `LEARN_MODEL → SELECTOR_MODEL`) so an existing `.env`
with no per-job models behaves identically. All four job models (`selector`/`diagnose`/`fix`/
`learn`) are additionally overridable live via the ops-channel `config set model.<job> <model>`
command, which takes precedence over both the job env var and its legacy fallback — see
§commands above for the full precedence chain (overlay > job env > legacy env > default,
`config.js#pickModel`).

## Operate

```bash
HOME=$PWD/home ./bin/node src/main.js --once                            # one run
launchctl kickstart -k gui/$(id -u)/com.falcon-fix-bot.daemon           # restart the hourly daemon
tail -f data/logs/daemon.out.log                                        # what it is doing
touch data/state/PAUSED                                                 # pause (rm to resume)
npm test                                                                # MUST stay green (count only grows)
# node --test test/<file>.test.js — always a FILE path, never a directory (Node 22 trap)
node scripts/ledger-repair.js --state data/state list [--state-filter <s>]        # inspect the ledger
node scripts/ledger-repair.js --state data/state set <bug_id> <new_state> [--note "..."]  # repair a wedged entry
node scripts/kb-regen.js --state data/state    # rebuild sections/recent-commits/archive from entries.jsonl (after hiding/editing entries)
```

Secrets: `./secrets` (0600, gitignored) — see [[bot-deploy]] (pull-env.sh from GitLab CI/CD vars). Includes
`slack-roster.json` (username→Slack UID, PRIVATE by team policy — regenerate per
[[bot-edge-cases]] §roster).

## Rules for maintainers

- Every risky step is deterministic code with a test. If you add a side effect (post, push,
  merge, tag), it MUST respect DRY_RUN, be allowlist/caps-gated, and get a test.
- Never add a tag-push outside `deploy.js` — a guard test enforces this and will fail.
- Fail closed: parse ambiguity → null → SKIP; missing counters/caps → TAG; unparseable
  GraphQL → reject. Preserve this bias in any change.
- The container is the blast radius for `--dangerously-skip-permissions` model sessions —
  don't widen mounts casually.
