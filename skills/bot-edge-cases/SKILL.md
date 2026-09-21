---
name: bot-edge-cases
description: The troubleshooting catalog for falcon-fix-bot — every known edge case, failure mode, and operational procedure with symptoms and remedies - stale locks, wedged bug_ids, deploy orphans, corrupt ledger, quiet runs, model nondeterminism, Slack/claude auth breakage, secrets rotation, slack-roster regeneration, duplicate MRs, and the .env/compose traps. Read when the bot misbehaves or before an operational change.
---

# Edge cases & troubleshooting

First stop for ANY misbehavior: `data/state/logs/<runId>/<bug_id>-{diagnose,fix}.log`
(raw model output) and `data/state/seen.jsonl` (last line per bug_id = current state).

## Run-level

| Symptom | Cause | Remedy |
|---|---|---|
| Run exits immediately, silent | `data/state/PAUSED` exists, or another run holds LOCK | `rm data/state/PAUSED`; LOCK auto-taken-over when provably dead (see next row) |
| "LOCK held by a live/fresh run" but nothing is running | pre-2026-07-21 images: killed container left a LOCK with `pid:1`, and the next container's pid-probe found ITSELF alive → blocked up to 2h. Fixed: live runs heartbeat the LOCK mtime every 60s; a lock is stale when (same host + other pid) pid is dead / ts>2h, OTHERWISE (foreign host, or pid==ours) mtime silent >5min | it self-heals within ~5min on current images; manual: verify `docker ps` shows nothing, then `rm data/state/LOCK` |
| Run produced NO output at all | Quiet hour — no new Slack messages since watermark; summary is silent-when-empty BY DESIGN | nothing to do; check `watermark.json` if suspicious |
| Learn didn't fire at 08:15/18:30 | learn runs INSIDE the hourly loop — it fires on the FIRST run at/after a LEARN_AT slot; daemon down over a slot = catch-up on next run (one learn, watermark covers the gap) | ensure the daemon runs; check `knowledge/last-run` mtime vs the slot |
| Bad/garbage learn summary in the KB | model produced junk for one app | set `"hidden": true` on that line in `knowledge/entries.jsonl`, then `node scripts/kb-regen.js --state data/state` — sections/recent-commits/archive all regenerate without it |
| Whole run aborted, watermark unchanged | scan or selector threw (slk auth, invalid selector JSON after retry) | that's the fail-safe working — no bugs lost; fix the cause, rerun |
| Same bugs reprocessed | watermark/ledger deleted (how phase demos force reruns) or run crashed pre-advance | expected; ledger `has()` still guards fixed ones only if their ledger lines survive |

## Giám sát ngoài (2026-07-22)

- **Container watchdog**: launchd `com.falcon-fix-bot.watchdog` trên HOST chạy
  `scripts/watchdog.sh` mỗi 5 phút — container mất → 1 alert vào OPS_CHANNEL (marker
  `data/state/watchdog-down-alerted` chống spam, dòng đầu = lý do), sống lại → báo phục hồi.
  Phân biệt 2 lý do: `container-down` (daemon OK, container mất) vs `daemon-down`
  (docker treo/tắt) — đổi lý do thì alert lại 1 lần vì cách sửa khác nhau.
  **Docker daemon wedge (23/08/2026, mất 2.5 ngày mới phát hiện)**: VM của Docker
  Desktop chết → MỌI lệnh `docker` treo vô hạn (không phải trả lỗi). `docker ps` trong
  watchdog treo 2.5 ngày, nhánh alert không bao giờ chạy, và launchd `StartInterval`
  KHÔNG chạy bản sao thứ 2 khi bản cũ còn sống → watchdog mù vĩnh viễn, bot chết im
  lặng. Đã vá: mọi lệnh docker bọc `run_timeout` (dùng `timeout`, fallback `perl alarm`),
  ghi output ra FILE tạm chứ không qua pipe (pipe vẫn treo chờ EOF nếu tiến trình con
  còn giữ đầu ghi), `curl --max-time 15`, script luôn `exit 0`. Guard:
  `test/watchdog.test.js`. Dấu hiệu nhận biết ca này: `ps -eo pid,etime,command | grep docker`
  thấy `docker ps` chạy hàng ngày, và `com.docker.backend` phải `kill -9` (SIGTERM không ăn),
  rồi `open -a Docker`. Cài lại:
  `cp scripts/com.falcon-fix-bot.watchdog.plist ~/Library/LaunchAgents/ && launchctl load ...`.
  **Máy mới**: watchdog KHÔNG tự theo Docker — Mac: copy plist + launchctl load (sửa path
  trong plist nếu repo ở chỗ khác); Linux: `crontab -e` →
  `*/5 * * * * /bin/bash /path/to/falcon-fix-bot/scripts/watchdog.sh`. Script tự bash thuần,
  chạy mọi OS. Bot chính thì chỉ cần repo + secrets/ + .env + `docker compose up -d`
  (restart: unless-stopped nên tự dậy sau reboot nếu Docker khởi động cùng máy).
- **Learn-streak alert**: learn fail 2 lần LIÊN TIẾP cho một app → 1 alert ops
  ("KB đang cũ dần"); counter tại `knowledge/learn-failures.json`, reset khi thành công.

## Slack / auth

| Symptom | Cause | Remedy |
|---|---|---|
| `invalid_auth` / `not_authed` on a READ (conversations.history/replies, users.list) | bot token missing/typo'd, OR falcon_bot lacks the read scope | reads are **bot-token-only** now (migration 2026-07-24 — no more xoxc user token/cookie). Verify `secrets/slack-bot.token`, and that falcon_bot has `channels:history`/`groups:history`/`users:read` |
| `not_in_channel` on a channel READ | falcon_bot can only read history of channels it belongs to | `/invite @falcon_bot` into the channel (same fix as the post `channel_not_found` row) |
| Posts fail `TEST_MODE=1 requires TEST_CHANNEL` | deliberate guard | set TEST_CHANNEL in .env |
| Posts fail `channel_not_found` in live/test-production | falcon_bot is NOT a member of that channel (hit live: #blog-support C08928RK00H — MR merged fine but the thread got zero comments) | a human `/invite @falcon_bot` into every scanned channel; TEST_MODE never catches this because posts redirect |
| Reactions missing | MOST LIKELY: `REACTIONS=0` (the default since 2026-07-21 — emoji are opt-in). Else: bot token lacks `reactions:write` (best-effort, warns and continues) | set `REACTIONS=1` if wanted; or add the scope to falcon_bot |
| Tag mentions fall back to minhpt | `secrets/slack-roster.json` missing/stale (the `users.list` fuzzy token map rarely matches usernames) | regenerate: see §slack-roster below |
| Every diagnose suddenly errors + ops alerts | claude CLI broken / OAuth expired (`claude setup-token` on a real tty) | rotate `secrets/claude-oauth.token`; diagnose deliberately THROWS on total model failure — do not soften it back to silent SKIP |

## Fix path

| Symptom | Cause | Remedy |
|---|---|---|
| `EMPTY_DIFF: fix-bug subagent made no changes` | model declined / couldn't act. Historically ALSO the headless-permission block (fixed: `--dangerously-skip-permissions` for diagnose+fixer only) | read the fix log; if it ASKS for permission, the skip-permissions flag regressed |
| `MODEL_COMMITTED` | fix session ran git commit despite the ban | rejected by design; inspect the log — prompt drift in `claude/agents/fix-bug.md` |
| `MISMATCH: ...` | code at diagnosed file:line changed since diagnosis | normal — bug re-enters next run with fresh diagnosis |
| Same bug_id errors every run, mentions worktree | stale worktree/branch from a crash — auto-cleanup runs before create, so this should self-heal; if not: | `git -C data/repos/<app> worktree remove --force data/state/wt/<id>; git -C data/repos/<app> branch -D falcon-bot/<id>` |
| Duplicate MR risk after crash between push and ledger write | next run re-attempts → pushBranch hits non-fast-forward / GitLab rejects same-source-branch MR → error outcome, NO silent dup | close the stray branch/MR by hand; accepted-by-design tolerance |
| Fix "succeeded" but diff only shows edits, not the new file | can't happen anymore (`collectDiff` does `git add -N .`); if it recurs, that regressed | — |
| Report file not uploaded to Slack (TAG path) | bot token needs `files:write` (it already has it — check `data/state/logs` for `files.getUploadURLExternal`/`files.completeUploadExternal` errors if not) | `uploadReport` is best-effort and never throws — a failure only `console.warn`s, the TAG reply still goes out; `data/state/reports/<bug_id>.md` is ALWAYS written first (even DRY_RUN) so the dev report is never lost, just not delivered as a Slack file that run |
| Report upload landed in the wrong channel / no thread | `TEST_MODE=1` redirects `uploadReport` to `TEST_CHANNEL` and DROPS `thread_ts`, same as `post()` — expected, not a bug | check `TEST_MODE`/`TEST_CHANNEL` in `.env` |

## Deploy (phase 4)

| Symptom | Cause | Remedy |
|---|---|---|
| Ops alert "deploy state unknown — verify tag … manually" | crash left entries in `deploying` (the fence). NEVER auto-resumed | check GitLab: tag exists? pipeline ran? then `node scripts/ledger-repair.js --state data/state set <bug_id> <deployed\|deploy-error>` — one alert only (marker file) |
| App wedged: "tag already exists" | should be impossible now (stale local tags cleaned on failure + pre-cleared); if seen: | `git -C data/repos/<app> tag -d <tag>` and investigate |
| Deploy failed once, never retried | BY DESIGN — tag may be live; humans own recovery | fix manually; append ledger line to unblock future deploys |
| Deploy ran under DRY_RUN | can't — canDeploy denies on DRY_RUN (guard test) | — |

## Ledger

- Corrupt line → skipped with warning, everything keeps working. Known bounded gap: a torn
  write WITHOUT trailing newline swallows exactly the next ONE append.
- Repair tool: `scripts/ledger-repair.js` (reuses `src/ledger.js`'s `openLedger`; never edits
  lines in place — `set` always APPENDS a corrected line, last-line-wins):
  - `node scripts/ledger-repair.js --state data/state list [--state-filter <s>]` — print
    bug_id/app/state/tag/mr_url of the LAST line per bug_id, optionally filtered to one state.
  - `node scripts/ledger-repair.js --state data/state set <bug_id> <new_state> [--note "..."]` —
    append a corrected line, carrying prior fields forward (e.g. `mr_iid`), stamping
    `repaired_by:"ledger-repair"` (+ your note). Refuses unknown states with the valid list.

## Model nondeterminism (expected, not a bug)

The same bug can get `FIX/high` one run and `TAG` (medium) the next — observed live on the
metafield bug. The gate exists precisely because of this: only high-confidence crosses, and
a re-run may legitimately land elsewhere. Don't chase it; raise evidence quality instead
(the shop-context MISSING → medium cap is the main lever).

## §slack-roster — regenerate `secrets/slack-roster.json`

Team policy: Slack UIDs are NEVER committed (matches team-ops `support-handoff`'s local
roster.json convention). To rebuild after personnel changes:
1. Names+usernames: `~/WebstormProjects/falcon/team-ops/nhan-su/README.md` (table) — or the
   box clone `repos/team-ops/`.
2. Workspace directory (bot token, `users:read`):
   `curl -s -H "Authorization: Bearer $(cat secrets/slack-bot.token)" "https://slack.com/api/users.list?limit=200" | jq -r '.members[] | "\(.id)\t\(.name)\t\(.real_name)"'`
   — repeat with `&cursor=<next_cursor>` (from `.response_metadata.next_cursor`) until it's empty for a large workspace.
3. Join full name (diacritics-normalized) → UID; ambiguous duplicates (two "Nguyễn Tuấn Anh")
   disambiguate by @handle vs username (`anhnt3` ↔ `@Anh NT`); missing people fall back to TL
   automatically, so partial coverage is fine.
4. Write `{ "<username>": "U…" }` to `secrets/slack-roster.json`, chmod 600.

## Config / environment traps (each bit us once)

- **Startup throws "TEST_MODE=1 and TEST_PRODUCTION=1 are mutually exclusive"** — phase 2.5
  needs an EXPLICIT `TEST_MODE=0` in .env; TEST_MODE defaults ON, so setting only
  `TEST_PRODUCTION=1` hits this throw by design (fail-loud, not silent precedence).
- **`.env` must NOT contain inline comments** — older dotenv parsers keep them in the value
  and `bool("1  # x")` is false → silently disables DRY_RUN. Comments on their own lines.
- **compose pins STATE_DIR/REPOS_DIR/SECRETS_DIR in `environment:`** — env_file re-exports
  the HOST-relative paths from .env and would resolve to /app/secrets inside the container.
  Don't remove those three lines from docker-compose.yml.
- `node --test test/` (directory) on Node 22 dies MODULE_NOT_FOUND and looks like a red test —
  always pass file paths. `npm test` does it correctly.
- team-ops layout: currently the `falcon@falcon` plugin (top-level agents/skills/commands);
  `sync-claude-tools.js` probes plugin layout THEN legacy `claude-tools/`. If team skills
  count drops to 0 in the startup line, the team restructured again — fix the resolver.
- Origins of all clones are TOKENLESS; private-repo fetch auth comes from the credential
  store at `/state/git-credentials` (0600), written by main.js at startup. If pulls start
  failing auth, that file (or the gitlab token) is the suspect.
- `config/team-roster.json` is a FALLBACK snapshot; the live roster loads from the team-ops
  clone at runtime. After a reorg, refresh the bundled copy for offline-correctness but the
  bot already follows the live one.
- Rotating any secret = replace file under `secrets/` + restart the container (env_file and
  startup reads happen at boot).

## Known accepted risks (decisions, not oversights — see spec + final review)

- Model sessions run `--dangerously-skip-permissions` INSIDE the container; clones carry a
  read-write credential helper → a prompt-injected thread could theoretically drive raw git
  pushes. Bounded by: container blast radius, branch/MR/merge/deploy code gates, minhpt2-only
  token. Mitigation on file (pre-phase-3): read-only token in the helper, write token only in
  explicit push URLs.
- Reactions fire on the REAL thread even in TEST_MODE (user-approved visible signal).
- Duplicate work vs kael-autofix while both watch the same channels (distinct branch
  namespaces prevent collisions; kael uses fix/*, this bot falcon-bot/*).
- GitLab token appears in child-process argv for the duration of a push (single-user host;
  pre-existing pattern shared with kael).
