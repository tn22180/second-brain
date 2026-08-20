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
| 5 | Security lane | general-purpose / opus | ✅ | 1/5 | clean | Redaction verified by hand: 14/14, incl. `glpat-` and `sk-ant-api03-`. Spec corrected on tool list, schema and redaction scope |
| 6 | Triage lane | general-purpose / sonnet | ✅ | 2/5 | clean | `8257b0e`. Round 2: a `no-undef` finding could reach `deletable`, which would have deleted the line that *uses* the symbol |
| 7 | Supervisor + report render | general-purpose / sonnet | ✅ | 1/5 | clean | `83de9f3`. Redacts again at render, incl. the `file` path and lane-failure detail |
| 8 | MR lanes | general-purpose / opus | ✅ | 1/5 | clean | `c8f8e2d`. 63 tests, none pushes. **Open decision: the green-jest gate makes `blogs` structurally unable to ever produce an MR** |
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

#### ✅ Task 5: Security lane
- Agent: general-purpose (opus) — routing table sends security-sensitive work to opus; the cost of a wrong call here is a missed cross-shop leak
- Status: ✅ completed
- Plan:
  - Goal: `runSecurityLane()` returns validated `SecurityFinding[]` from a read-only agent run, drops citations that do not resolve in the worktree (counting them), names a lane failure instead of reporting zero findings, and redacts secret values before the finding object exists. `bun test ./test/audit.security.test.ts` green, `bun run typecheck` clean.
  - Files allowed: `src/audit/securitySchema.ts` (new), `src/audit/securityLane.ts` (new), `test/audit.security.test.ts` (new). Nothing else.
  - Approach: agent runs with `cwd` = worktree so each repo's own `CLAUDE.md` and `.claude/skills/security/` load; tools are `ANALYZE_TOOLS` minus the gcloud entry, no Edit/Write. Rejected: importing `extractJson` from `analysisSchema.ts` — verified 2026-08-20 that it rejects arrays outright (`!Array.isArray(parsed)`, `analysisSchema.ts:61`), and this lane answers with an array.
  - Test command: `bun test ./test/audit.security.test.ts` **and** `bun run typecheck`.
  - Risk: the lane reads whole prod repos. Two failure modes matter: an invented `file:line` that sends a reviewer hunting a bug that does not exist, and a real secret quoted verbatim into a finding that is then written to `state.db` and Telegram. Both are covered by tests rather than by trust.
  - Rollback: delete the three new files; nothing imports them until task 9.
- Redaction is a hard requirement here, not a nicety: `audit_findings.title` is persisted to disk (task 4), so stripping on the way out would be too late.
- Rounds used: 1/5
- Security check: **clean**. Three new files, no existing file modified, no network call, no new dependency. `SECURITY_TOOLS` carries no `Edit`/`Write`. Test fixtures use synthetic or vendor-doc example tokens, not live credentials — checked, since a secret hidden in a fixture is exactly what this check exists for.
- Redaction verified independently rather than taken on report: 14 strings through `redactSecret`, 9 token-shaped and 5 ordinary, **14/14 correct**. The two that matter are `glpat-…` and `sk-ant-api03-…`, which a `_`-only separator would have leaked whole — this fleet issues the first and consumes the second. File paths, `risk-assessment-service` and `pk-lookup` pass through untouched.
- Agent's report was wrong on one detail: it placed `ANALYZE_TOOLS` at `claudeCli.ts:136`; it is at **142**, as the spec said. Its substantive point stood — the constant has ten entries and the spec listed eight.
- Carried into task 7: `SecurityLaneResult.hasSecuritySkill` now exists and `renderReport` must actually print it. The plan already tests for the string; the field feeding it did not exist until now.
- Carried into task 9: `runSecurityLane` is a single shot bounded by wall clock only — this CLI build has no `--max-turns`. `AUDIT_SECURITY_TIMEOUT_MS` must be sized for `seo` (2491 lint-scoped files), not the median repo. Also decide whether to pass a brain slice at all: `input.brainSlice` feeds `appendSystemPrompt`, and the brain is currently ~23k against a 6000 budget.
- Started: 2026-08-20 · Completed: 2026-08-20

#### ✅ Task 6: Triage lane
- Agent: general-purpose (sonnet)
- Status: ✅ completed — `8257b0e`
- Plan:
  - Goal: `runTriage()` returns a verdict for **every** finding it was given, only `delete` is eligible for the cleanup MR, a verdict for a fingerprint that was never sent is discarded, and a finding the agent skipped comes back `unsure`. `bun test ./test/audit.triage.test.ts` green, `bun run typecheck` clean.
  - Files allowed: `src/audit/triage.ts` (new), `test/audit.triage.test.ts` (new). Nothing else.
  - Approach: reuse `extractJsonArray` (`securitySchema.ts:86`, exported by task 5) rather than write a third JSON extractor; read-only tools; every default points the safe way. Rejected: letting the agent's array be the answer directly — an id it invented would then authorise a deletion.
  - Test command: `bun test ./test/audit.triage.test.ts` **and** `bun run typecheck`.
  - Risk: this verdict is what task 8 will turn into a deletion. `delete` on something reached by a dynamic `require()` removes live code. Hence: unknown id discarded, missing verdict is `unsure`, and only an explicit `delete` counts.
  - Rollback: delete the two new files; nothing imports them until task 9.
- Rounds used: 2/5
- Security check: **clean** — two new files, no existing file modified, `TRIAGE_TOOLS` carries no `Edit`/`Write`, no network call, no secret literal.
- **Round 2, found on review — the one that mattered.** The prompt lumped `no-undef` in with `no-unused-vars` and offered the same `delete/keep/unsure` vocabulary for both, and `deletable` was any `delete` vote. But `no-undef` means a symbol is *used* with nothing defining or importing it: the repair is to add an import. A `delete` verdict on one, carried into task 8, would have deleted the line that uses the symbol. Fixed two ways — the prompt now says so, and `deletable` is filtered to `no-unused-vars` fingerprints regardless of how the agent voted, so a bad prompt alone cannot re-open it. Test added.
- Started: 2026-08-20 · Completed: 2026-08-20

#### ✅ Task 7: Supervisor + report render
- Agent: general-purpose (sonnet)
- Status: ✅ completed — `83de9f3`
- Plan:
  - Goal: `renderReport()` is a pure function producing the Vietnamese Telegram body from structured results, and `runSupervisor()` falls back to it on any agent failure so a prose failure can never lose a finding. `bun test ./test/audit.report.test.ts` green, `bun run typecheck` clean.
  - Files allowed: `src/audit/report.ts` (new), `src/audit/supervisor.ts` (new), `test/audit.report.test.ts` (new). Nothing else.
  - Approach: code renders, agent only orders and compresses. Rejected: letting the agent be the sole path to a message — one timeout at 06:00 would then mean no report at all on a morning findings existed.
  - Test command: `bun test ./test/audit.report.test.ts` **and** `bun run typecheck`.
  - Risk: this is the only thing Tuan actually reads. Two failure modes: going silent on a quiet run (looks identical to a broken run) and burying a real finding under carried-over noise.
  - Rollback: delete the three new files; nothing imports them until task 9.
- Must print the `blogs` gap: `SecurityLaneResult.hasSecuritySkill` exists as of task 5 and the plan already tests for the string `.claude/skills`.
- Dispatched while task 6 was still finishing. `src/audit/triage.ts` already exports `Verdict` and `TriageVerdict`; task 7 imports them and is forbidden from touching that file.
- Rounds used: 1/5
- Security check: **clean** — three new files, no existing file modified, no network call, no secret literal.
- Better than specified, kept: it redacts again at render — including `f.file` and each lane-failure `detail`. Task 5 deliberately spared `file` at construction because a blunt rule that eats `packages/functions/src/handlers/pubsub/handleProdErrorAlert.js` is a rule someone turns off. Doing it at the render boundary covers that case anyway, and the 14-string probe already proved real paths survive untouched.
- Carried into task 9: `AppReportInput` needs `openFindings: AuditFinding[]`, because `LedgerDiff` carries only `fresh` plus counts and the Monday digest needs the full open backlog. Task 9 fills it from `store.openAuditFindings(app)` on digest days.
- The plan's Task 7 pseudo-tests used an illustrative per-app shape (`{...SEO, securityLane: 'timeout'}`) that matches no real type from tasks 4–6. The agent built `AppReportInput`/`ReportInput` from the actual `LedgerDiff`/`AuditFinding` types instead. Correct call — `AuditFinding` already unifies security and hygiene findings via `kind`.
- Started: 2026-08-20 · Completed: 2026-08-20

#### ✅ Task 8: MR lanes
- Agent: general-purpose (opus) — the only task with a push path
- Status: ✅ completed — `c8f8e2d`
- Plan:
  - Goal: `runMrLane()` refuses before pushing on any of: a diff touching a file no finding named, a forbidden file, a red jest run, or a hit cap — each with a named refusal. `openMr` accepts `audit/` branches and still refuses everything else. `bun test ./test/audit.mr.test.ts ./test/openMr.test.ts` green, `bun run typecheck` clean.
  - Files allowed: `src/git/openMr.ts` (guard only), `src/git/worktree.ts` (add `auditBranchName`), `src/audit/mr.ts` (new), `test/openMr.test.ts`, `test/audit.mr.test.ts` (new). Nothing else.
  - Approach: widen the branch guard to an allowlist of exactly two prefixes rather than removing it, and gate the push behind four fail-closed checks in a fixed order. Rejected: dropping the guard and relying on the caller — that guard is the last thing standing between a bug and `master`.
  - Test command: `bun test ./test/audit.mr.test.ts`, `bun test ./test/openMr.test.ts`, `bun run typecheck`.
  - Risk: highest of the eleven. A wrong scope gate pushes an agent's unrelated edits; a wrong cleanup deletes live code reached by a dynamic `require()`; a wrong guard pushes to `master`. Mitigation is that nothing here runs at all until task 9 wires it behind `AUDIT_MR_ENABLED=false`, and every test is hermetic — no test may perform a real push.
  - Rollback: revert the commit. `openMr`'s guard returns to a single prefix; no branch can have been created because the feature is off by default.
- Depends on tasks 5 and 6, both committed (`27b630e`, `8257b0e`). Runs concurrently with task 7, which owns different files.
- Rounds used: 1/5
- Security check: **clean**, verified line by line because this is the push task. `openMr.ts` changes the guard and nothing else — the base-branch refusal is byte-for-byte unchanged. `worktree.ts` has zero deletion lines. `mr.ts` handles no token: the remotes are HTTPS and authentication is the ambient credential helper's job. Tests are hermetic — zero real `spawn`, no repo under `projects/Falcon/` read, and refusal tests assert no `push` argv ever reached the fake runner.
- Kept, better than specified: untracked files are unioned into the scope gate. `git diff --name-only` alone misses a file the agent *created*, which would then slip past the check entirely. A created file is by definition outside the findings' file set, so it refuses as `out_of_scope`.
- Kept: cleanup eligibility is re-derived at the push boundary (`rule === 'no-unused-vars' && verdict === 'delete'`) rather than trusted from task 6. Two independent barriers against the `no-undef` deletion.

#### ✅ Task 8b: Jest gate compares against the base, not against green
- Agent: general-purpose (opus) — it loosens a push gate
- Status: ✅ completed — `2842b2a`
- Plan:
  - Goal: the jest gate refuses only on failures the base branch did **not** already have. `blogs`, whose master carries three long-standing module-resolution failures, can produce an MR again; a fix that breaks a previously-passing test still refuses. `bun test ./test/audit.mr.test.ts` green, `bun run typecheck` clean.
  - Files allowed: `src/audit/mr.ts`, `test/audit.mr.test.ts`. Nothing else.
  - Approach: measure the baseline on the clean worktree *before* the agent edits anything, cached by `(repo, baseSha)` through `store.getBaseline`/`putBaseline` — the same shape `pipeline.ts:504-512` already uses. Rejected: skipping known-bad suites by name, which would go stale silently.
  - Test command: `bun test ./test/audit.mr.test.ts` **and** `bun run typecheck`.
  - Risk: this makes a push gate *weaker*. Getting the comparison backwards would push an MR that breaks tests. Mitigated by requiring a test for each direction, and by a baseline that fails to measure being treated as a refusal rather than as "no known failures".
  - Rollback: revert; the gate returns to requiring green, and `blogs` returns to never producing an MR.
- Chosen by Tuan 2026-08-20 (option A over "label the refusal" or "leave it").
- Rounds used: 1/5
- Security check: **clean**. Two files, and the semantics were verified by hand rather than taken on report, because this loosens a push gate:
  - comparison direction: `jest.summary.failures.filter(f => !before.has(f))` — failures now that the base did not have. Right way round; backwards would have pushed MRs that break tests.
  - ordering: baseline measured at `mr.ts:349`, fix agent runs at `:373` — measured **before** any edit, so it measures the base and not the fix.
  - `no_baseline` refuses (`mr.ts:363`), and a failed measurement is never cached, so the next run retries rather than inheriting an empty set.
- Gate order now: nothing_to_fix → worktree → **baseline** → agent → diff → scope → forbidden → jest-no-summary → new-failures → caps → openMr. Refusing on baseline *before* the agent means a run that can never push does not pay for one.
- 35 tests, none of the original 26 changed an assertion.
- Started: 2026-08-20 · Completed: 2026-08-20

#### ✅ Task 10: 06:00 launchd job + doctor checks
- Agent: general-purpose (sonnet)
- Status: ✅ completed
- Plan:
  - Goal: `renderAuditPlist()` produces a calendar one-shot at 06:00 with its own logs, and `doctor` gains three checks — remote-host drift, base-branch age, and a non-interactive push credential (only when MRs are on). `bun test ./test/setup.test.ts` green, `bun run typecheck` clean.
  - Files allowed: `src/setup/plist.ts`, `src/setup/init.ts`, `src/setup/doctor.ts`, `test/setup.test.ts`. Nothing else.
  - Approach: reuse `daemonPath` and `xmlEscape` unchanged; the three checks are pure functions taking their inputs, so they need nothing from `src/config.ts` — which task 9 owns and is editing concurrently. Rejected: `KeepAlive` on the audit job, which would restart a program that exits, in a loop.
  - Test command: `bun test ./test/setup.test.ts` **and** `bun run typecheck`.
  - Risk: the plist is what makes this run unattended. A wrong `StartCalendarInterval` means it never fires, or fires in a loop; both are silent. The push-credential check is the one that must not put a credential on a command line.
  - Rollback: revert; the second plist is a separate file and can simply not be loaded.
- Runs concurrently with task 9, which owns `src/config.ts` and `bin/autofix.ts`.
- Rounds used: 1/5
- Security check: **clean**. `init.ts` shows deletions but they are a hoist of `toolPaths`/`bunBin` so both plists share them — the `write()` never-overwrite path is intact. No credential is handled, constructed or echoed anywhere in the diff; a test asserts the detail string never carries a token-shaped value.
- Plist verified: `StartCalendarInterval` Hour 6 Minute 0, no `KeepAlive`, no `RunAtLoad`, args end `audit --all`, logs `audit.log`/`audit.err.log`, own label `${label}-audit` because `launchctl` keys jobs by label and a shared one would replace the daemon's.

**GAP, must be closed before `AUDIT_MR_ENABLED=true`.** `checkPushCredential` is a pure function taking `canPush`, and **nothing in `src/` computes it** — verified by grep, the only hits are the parameter and its own doc comment. So the spec's promise that "doctor must prove a non-interactive push can authenticate before MRs are enabled" is currently a function waiting for a caller, not a gate.

Deliberately left unwired rather than faked: `git ls-remote` would prove *read* auth over HTTPS, which is not push auth, and reporting that as a pass would be worse than reporting nothing. Turning MRs on without closing this risks every audit MR failing at the push under launchd, where `osxkeychain` may not answer without a GUI session while `store` would.

### DECIDED — `blogs` could never produce an audit MR (option A, task 8b)

Gate 1 is "the repo's own jest must pass". `src/verify/jest.ts:57-58` records that `blogs` master carries **three long-standing module-resolution suite failures**. So the `blogs` MR lane will refuse `tests_failed` every single morning, forever, and the report will not distinguish that from "the fix broke the tests".

This is a defect in the spec, not in the implementation — the agent built what was specified. The machinery to fix it already exists and is what the Slack pipeline uses: `measureBaseline` (`src/verify/smoke.ts:32`) plus `store.getBaseline`/`putBaseline` (`store.ts:444`/`451`), which compare a run against the base sha's *own* failures instead of demanding green.

Tuan chose option A on 2026-08-20: change the gate to compare against the base rather than demand green. Implemented as task 8b above.

### Process correction, 2026-08-20

Tasks 1 and 2 were reviewed with `bun test ./test` only. `bun run typecheck` was not run, and it was red: the `DecisionReason` reply map stopped being exhaustive once `fix_disabled` existed (`src/slack/reply.ts:219`), and a `worktreeGc` fixture stopped satisfying `App` once the registry gained two fields (`test/worktreeGc.test.ts:12`). Neither surfaces in a test run. Caught by the Task 3 agent, fixed in `876d89c`. **Every task from here runs `bun test ./test` AND `bun run typecheck` before it is called done.**

### Open findings, not caused by this work

- **`brain budget` is ~4x over on every app.** Measured 2026-08-20: SEO 23473, BLOG 23805, APC 23326, AEO 23289, IMG-OPT 23323 — against a 6000 budget. `test/brainSlice.test.ts` fails 5 tests because of it, and has since before this job started; neither `src/brain/*` nor that test is in either task's diff. Every prod-error job currently loads an oversized slice. Not fixed here — it is its own task and Tuan has not been asked yet.
