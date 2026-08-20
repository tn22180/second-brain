tạo 1 cron hàng ngày lúc 6 giờ cho tất cả agent ra scan tất cả các app trong 1 job của 1 app sẽ gồm :
1 agent scan security app
1 agent scan code app, các code k dùng + thiếu import hàm hay biến các file
1 agnet theo dỗi 2 cái trên rồi xong report cho t vào telegram, nếu có mr fix luôn thì tạo 2 mr riêng 1 security + 1 clean code nhé

---

## Progress

Started: 2026-08-19
Spec: `tools/prod-error-autofix/docs/specs/2026-08-19-repo-audit-design.md`
Plan: `tools/prod-error-autofix/docs/plans/2026-08-19-repo-audit.md`

Scope changes since the brief, both from Tuan on 2026-08-19:
- The prod-error daemon's own auto-MR is switched off (task 1). 58 sat unreviewed as of 2026-08-04.
- The audit keeps both MR lanes. `AUDIT_MR_ENABLED=false` until a few runs have been read.

Tracking is this table only — this harness has no TaskCreate tool.

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| 1 | Switch off the daemon's MR opening | general-purpose / sonnet | ✅ | 2/5 | clean | `4ee4f38`. Round 1 put the branch before the infra check — plan's own error. Fixed + 2 order-pinning tests added |
| 2 | Registry `auditLintPaths` + `auditKnip` | general-purpose / haiku | ✅ | 1/5 | clean | `67ebd7b`. Routed off cavecrew-builder: it has no Bash and this task's acceptance is a test run |
| 3 | eslint runner | general-purpose / sonnet | ✅ | 2/5 | clean | `92a0577`. Round 2: dropped a `'spawn'` failure member that nothing can produce, and corrected a comment claiming a balance-scan the parser does not do |
| 4 | Ledger `audit_findings` + fingerprint | general-purpose / sonnet | ✅ | 1/5 | clean | `store.ts` verified additive-only against the live db. Spec corrected: an open MR is not a status |
| 5 | Security lane | general-purpose / opus | ⬜ | 0/5 | — | Read-only tools; drop citations that do not resolve; redact secret values |
| 6 | Triage lane | general-purpose / sonnet | ⬜ | 0/5 | — | |
| 7 | Supervisor + report render | general-purpose / sonnet | ⬜ | 0/5 | — | Code fallback so a prose failure never loses a finding |
| 8 | MR lanes | general-purpose / opus | ⬜ | 0/5 | — | The only task that pushes. Every gate fails closed |
| 9 | `audit` command + orchestration | general-purpose / sonnet | ⬜ | 0/5 | — | |
| 10 | 06:00 plist + doctor checks | general-purpose / sonnet | ⬜ | 0/5 | — | Calendar one-shot, never KeepAlive |
| 11 | README + this table | inline | ⬜ | 0/5 | — | README:61 claims SSH; the remotes are HTTPS across two hosts |

### Log

#### ✅ Task 1: Switch off the prod-error daemon's MR opening
- Agent: general-purpose (sonnet)
- Status: ✅ completed — `4ee4f38`
- Plan:
  - Goal: with `AUTOFIX_FIX_ENABLED` unset, a prod-error alert is still analysed and still answered in its Slack thread, and no branch is pushed and no MR is opened. `bun test ./test` green.
  - Files allowed: `src/config.ts`, `src/state/stateMachine.ts`, `src/pipeline.ts`, `src/slack/reply.ts`, `test/config.test.ts`, `test/stateMachine.test.ts`, `test/slack.test.ts`, `test/pipeline.test.ts` (fixture only), `.env.example`, `README.md`. Nothing else.
  - Approach: a dedicated `fix_disabled` status + `replyFixDisabled`, branching before the infra check at `pipeline.ts:438`. Rejected: reusing `allowMr:false`, which falls into the infra branch and would file every prod error as infra and say so in the thread.
  - Test command: `bun test ./test` — all green, including the existing pipeline tests once their config fixture sets `fixEnabled: true`.
  - Risk: this is the live Slack pipeline. Getting the state machine wrong either re-analyses every repeat alert (cost) or goes silent on real errors (worse). The daemon is NOT restarted by this task — that stays manual.
  - Rollback: `git revert` the single commit, then `launchctl stop/start com.tn22180.prod-error-autofix`. No data migration: `fix_disabled` rows read back as an unknown status only if the revert lands while rows exist, so the revert must also clear them — `UPDATE alerts SET status='inconclusive' WHERE status='fix_disabled'`.
- Rounds used: 1/5 — round 1 shipped a defect the agent itself reported: the `fix_disabled` branch was placed BEFORE the infra check, so at the shipped default (`fixEnabled:false`) a genuine infra alert would report as `fix_disabled` with the wrong reply. The plan's own stated invariant was self-contradictory; the fix is to order infra first.
- Security check: **clean** — 10 files, 82 insertions. No secret literal, no new log call, no lockfile/CI/firebase/.env touched (`.env.example` is the tracked template and is in scope).
- Started: 2026-08-20 · Completed: 2026-08-20

#### ✅ Task 2: Registry auditLintPaths + auditKnip
- Agent: general-purpose (haiku) — routing table said cavecrew-builder, but that agent has no Bash and this task's acceptance is a test run
- Status: ✅ completed — `67ebd7b`
- Plan:
  - Goal: `listApps(cfg)` returns `auditLintPaths` that all resolve on disk and `auditKnip === false` for all five apps; `bun test ./test/registry.disk.test.ts` green.
  - Files allowed: `src/registry.ts`, `test/registry.disk.test.ts`. Nothing else.
  - Approach: add both fields to `AppSpec` with the paths counted off disk on 2026-08-20; extend the existing drift test. Rejected: globbing `packages/*` — it would pull in `copyright` (no `src/`, one generated file) and `seo/packages/dashboard/src` (0 `.js`).
  - Test command: `bun test ./test/registry.disk.test.ts` — green.
  - Risk: low, additive. A wrong path means the audit silently lints nothing for that package — which is why the test asserts existence rather than trusting the list.
  - Rollback: revert the commit; nothing reads these fields until task 9.
- Rounds used: 1/5
- Security check: **clean** — 2 files, 45 insertions, additive registry data only.
- Started: 2026-08-20 · Completed: 2026-08-20

#### ✅ Task 3: eslint runner
- Agent: general-purpose (sonnet)
- Status: ✅ completed — `92a0577`
- Plan:
  - Goal: `runEslint()` returns repo-relative `LintFinding[]` from a real eslint run, maps exit 0/1 to success and ≥2 to a named failure, survives junk printed ahead of the JSON, and always deletes the config it wrote. `bun test ./test/audit.eslint.test.ts` green.
  - Files allowed: `src/audit/eslint.ts` (new), `test/audit.eslint.test.ts` (new). Nothing else.
  - Approach: write `.audit.eslintrc.json` into the worktree, invoke the repo's own `node_modules/.bin/eslint` with `--no-eslintrc -c <that> --format json --output-file`, delete the config in a `finally`. Rejected: reading stdout — the knip spike proved a repo module can log at require time ahead of the JSON.
  - Test command: `bun test ./test/audit.eslint.test.ts` — green, hermetic, injected `Runner`.
  - Risk: low, nothing calls it until task 9. The one real hazard is the written config escaping into a branch, which the `finally` and a test both cover.
  - Rollback: delete the two new files; nothing imports them yet.
- Verified before dispatch (2026-08-20, against ai-product-copy): eslint is **6.8.0**, `-o/--output-file` exists and writes, exit is 1 when findings exist, and `filePath` in the JSON is absolute — so the `relative()` mapping is required, not cosmetic.
- Rounds used: 2/5
- Security check: **clean** — 2 new files. No secret, no network call, no new dependency; the only write is `.audit.eslintrc.json` inside the worktree, removed in a `finally`, with three tests covering the clean, parse-throw and runner-throw paths.
- Started: 2026-08-20 · Completed: 2026-08-20

#### ✅ Task 4: Finding ledger
- Agent: general-purpose (sonnet)
- Status: ✅ completed
- Plan:
  - Goal: `classify(store, app, found, now)` returns `{fresh, carried, resolved, suppressed}` correctly across repeat runs, a finding keeps its `fp` when its line moves, and `accepted`/`false_positive` are never written by code. `bun test ./test/audit.ledger.test.ts` green and `bun run typecheck` clean.
  - Files allowed: `src/audit/findingFp.ts` (new), `src/audit/ledger.ts` (new), `src/state/store.ts` (table + methods only), `test/audit.ledger.test.ts` (new). Nothing else.
  - Approach: new `audit_findings` table in the existing `migrate()`, plus five dumb accessors on `Store`; the policy lives in `classify`, matching how `stateMachine` owns policy and `Store` owns rows. Rejected: a second sqlite file — the run needs one transactional view and `state.db` already migrates itself.
  - Test command: `bun test ./test/audit.ledger.test.ts` **and** `bun run typecheck`.
  - Risk: `migrate()` runs against the live `state.db`, which holds real alert rows. `CREATE TABLE IF NOT EXISTS` is additive and touches no existing table, but a mistake here is the one that could damage prod state. No `ALTER` on `alerts`, no `DROP`, no data migration.
  - Rollback: `git revert`; the new table is inert and can be left in place, or dropped by hand.
- Rounds used: 1/5
- Security check: **clean** — `git diff src/state/store.ts` has **zero deletion lines**; no ALTER/DROP/DELETE/UPDATE against any existing table; all five tests open `Store(':memory:')`, never the real db.
  - Constraint recorded while checking, for task 5 to honour: `audit_findings.title` is persisted to `state.db` on disk, so redaction has to happen where the finding is built, not on the way to Telegram. Written into the spec.
- Deviation accepted: the agent put `FindingKind`/`FindingStatus`/`AuditFinding` in `ledger.ts` and had `store.ts` import them, mirroring `AlertStatus` living in `stateMachine.ts`. Keeps `Store` rows-only. Correct call.
- Spec corrected as a result of implementing this: an open MR is **not** a finding status. A finding with an MR out is still in the code, so it stays `open` with an `mr_url` — as a status it would drop out of the resolved sweep and never be marked resolved when the merge lands.
- Started: 2026-08-20 · Completed: 2026-08-20

### Process correction, 2026-08-20

Tasks 1 and 2 were reviewed with `bun test ./test` only. `bun run typecheck` was not run, and it was red: the `DecisionReason` reply map stopped being exhaustive once `fix_disabled` existed (`src/slack/reply.ts:219`), and a `worktreeGc` fixture stopped satisfying `App` once the registry gained two fields (`test/worktreeGc.test.ts:12`). Neither surfaces in a test run. Caught by the Task 3 agent, fixed in `876d89c`. **Every task from here runs `bun test ./test` AND `bun run typecheck` before it is called done.**

### Open findings, not caused by this work

- **`brain budget` is ~4x over on every app.** Measured 2026-08-20: SEO 23473, BLOG 23805, APC 23326, AEO 23289, IMG-OPT 23323 — against a 6000 budget. `test/brainSlice.test.ts` fails 5 tests because of it, and has since before this job started; neither `src/brain/*` nor that test is in either task's diff. Every prod-error job currently loads an oversized slice. Not fixed here — it is its own task and Tuan has not been asked yet.
