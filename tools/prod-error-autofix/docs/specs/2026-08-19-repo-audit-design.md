# repo-audit — daily security + hygiene sweep across the five prod apps

Design, 2026-08-19. Brief: `../../../../jobs/security/security.md`.

A new `audit` command inside `prod-error-autofix`. Every morning at 06:00 local it walks the
five apps in `src/registry.ts:37`, runs a security pass and a code-hygiene pass over each, and
sends one Telegram message with what is **new since the last run**.

**It does not fix anything and it opens no merge requests.** Scope decision taken 2026-08-19:
the MRs this fleet already produces are not being reviewed, so a second source of unreviewed MRs
makes the backlog worse rather than the code better. The audit reads and reports. A fix lane can
be designed later, against a signal that has been watched for a while — that is a separate spec,
not a flag left half-wired in this one.

It shares this project's registry, worktrees, Telegram notifier, `claude -p` wrapper and sqlite
state. It does not touch the Slack pipeline, and it runs as its own launchd job so that a broken
audit cannot take prod-error alerting down with it.

## Why it lives here and not in its own tool

Everything the audit needs already exists in this repo and was earned the hard way:

| Need | Already here |
|---|---|
| Which repos, which base branch | `src/registry.ts:37`, re-derived from disk by `test/registry.disk.test.ts` |
| An isolated checkout that never touches Tuan's working tree | `src/git/worktree.ts` |
| Headless Claude with cost and timeout accounting | `src/agent/claudeCli.ts` |
| Telegram that can never fail a job | `src/notify/telegram.ts` |
| Reclaiming worktrees a dead run left behind | `src/git/worktreeGc.ts` |
| A launchd plist generated per machine | `src/setup/plist.ts` |
| A `doctor` that refuses to say "ready" while a dependency is missing | `src/setup/doctor.ts` |

A separate tool duplicates six infrastructure files and gives the registry two copies to drift
apart. Extracting a shared library means refactoring a pipeline that is live. The command goes
here; the README grows a second section.

## Measured facts this design rests on

Every number below was produced on 2026-08-19 against the repos on disk, not assumed.

**All five repos are plain JavaScript.** No `tsconfig.json`, no `typescript` dependency
anywhere. `seo/packages/functions/src` is 1090 `.js` against 10 `.ts`; the other four are 100%
`.js`. Anything TypeScript-only — `ts-prune`, knip's type-aware modes — is out.

**Every repo has eslint 6.3 installed locally** with a `.eslintrc.js` at the root and one per
package. `node_modules/.bin/eslint` is present in all five.

**The repo eslint configs do not enable the rules we want.** They extend `google` + `prettier`
and set `prettier/prettier: error`. `env` is `browser, es6` — not `node`. So the audit brings
its own rule set rather than reusing the repo's.

**A borrowed rule set works and the signal is small.** Running APC's own eslint binary with
`--no-eslintrc` and an audit config enabling `no-undef` and `no-unused-vars`:

```
files scanned: 180 | with findings: 2
{"no-unused-vars":5}
packages/functions/src/config/subscription/plans.js:2  'isShopInstallBeforePricing' is defined but never used
packages/functions/src/const/default.js:5              'CONTENT_TYPES' is defined but never used
```

Five findings across 180 files, in seconds, with zero `no-undef`. That is a report a human will
actually read.

**The eslint config file must be written inside the repo.** Pointing `-c` at a config outside the
repo fails before linting anything:

```
Error: Failed to load parser 'babel-eslint' declared in '--config': Cannot find module 'babel-eslint'
```

eslint resolves the parser relative to the config file's own directory. The audit writes
`.audit.eslintrc.json` into the worktree — never into a working checkout.

**knip is not a drop-in.** knip 5.88.1 against APC with a hand-written workspace config reported
**248 unused files** while `packages/functions/src` holds 180 `.js` in total: it swept the whole
repo, and a CommonJS Firebase-functions tree with dynamic `require()` is exactly where reachability
analysis guesses wrong. Project-level dead code stays behind a per-repo config that is off until
that repo's output has been read by a human.

**A tool can print to stdout before its JSON.** The knip run emitted
`Template file == 3000 == 5002 == 127.0.0.1` — from a repo config module being loaded — ahead of
the JSON document. Any parser that assumes stdout *is* the JSON will break on a repo that logs at
require time. Machine output is read from a file, not from stdout.

**Four of five repos carry their own `security` skill.** `seo`, `ai-product-copy`,
`llm-ai-search-seo` and `avada-image-optimizer` each have `.claude/skills/security/`. **`blogs`
has no `.claude/skills/` at all.** Running the agent with `cwd` set to the worktree makes each
repo's own `CLAUDE.md` and skills load — so the security pass is repo-specific for free on four
apps, and demonstrably weaker on `blogs`. That gap is reported, not papered over.

## Shape of one job

One job is one app. Apps run sequentially.

```
prepare   worktree from origin/<base>  →  ~/.cache/prod-autofix/wt/audit-<repo>-<date>
          linkNodeModules (src/git/worktree.ts:134) — root, functions, assets
             │
  ┌──────────┴───────────┬────────────────────────┐
  │ Lane A  SECURITY     │ Lane B  HYGIENE        │
  │ claude -p, opus      │ eslint (repo binary)   │
  │ read-only tools      │ + audit rule set       │
  │ cwd = worktree       │        ↓               │
  │ loads repo CLAUDE.md │ agent triage, sonnet   │
  │ + .claude/skills/    │ real? false positive?  │
  └──────────┬───────────┴───────────┬────────────┘
             │                       │
        Lane C  SUPERVISOR — claude -p, sonnet
        reads both structured results + the ledger diff
        writes the Telegram report
             │
          Telegram          worktree removed, nothing pushed
```

The worktree is read-only in practice: no lane may write to it except the one generated eslint
config, which is deleted before the worktree is torn down.

Lane A and Lane B are independent and run concurrently within a job. Lane C waits for both.

### Lane A — security

`claude -p` with the read-only tool set, modelled on `ANALYZE_TOOLS` (`src/agent/claudeCli.ts:142`):
`Read`, `Grep`, `Glob`, `Bash(git log:*)`, `Bash(git diff:*)`, `Bash(rg:*)`, `Bash(ls:*)`,
`Bash(cat:*)`. No `Edit`, no `Write`, no network. `cwd` is the worktree so the repo's own
`CLAUDE.md` and `.claude/skills/security/` load.

Scope is the **whole repo**, not a diff — this is a sweep, not a review of one change. To keep it
bounded the prompt names the surfaces that matter for a Shopify app with Firestore:

1. Shop scoping — a Firestore query or handler that reads/writes without filtering on the
   caller's own shop id. Cross-shop IDOR is the top risk in this fleet.
2. Trusted request input — shop domain, plan, quota, price or role read from body/query rather
   than from the session or Firestore.
3. Secrets in the tree — literal keys, tokens, service-account JSON, including in comments,
   fixtures and docs.
4. Secrets reaching a log or a command line — a logger printing a token, a whole config object,
   or a full request header.
5. Unauthenticated or wrongly-authenticated endpoints, webhook handlers with no HMAC check.

Output is a JSON array validated against a schema — `{file, line, severity, title, why, fix}` —
the same discipline `src/agent/analysisSchema.ts` already applies. Prose instead of JSON is a
failed lane, not a lane with no findings.

**Severity is capped at what a sweep can prove.** A finding whose `file:line` does not resolve in
the worktree is dropped before it reaches the report; an agent that invents a citation to look
useful is worse than one that finds nothing.

### Lane B — hygiene

Deterministic first, agent second.

**Step 1, eslint.** Write `.audit.eslintrc.json` into the worktree:

```json
{
  "root": true,
  "parser": "babel-eslint",
  "parserOptions": {"ecmaVersion": 2020, "sourceType": "module", "ecmaFeatures": {"jsx": true}},
  "env": {"node": true, "es6": true, "browser": true, "jest": true},
  "rules": {
    "no-undef": "error",
    "no-unused-vars": ["error", {"args": "none", "varsIgnorePattern": "^_"}]
  }
}
```

Run the repo's own binary — `node_modules/.bin/eslint` via the symlinked tree — with
`--no-eslintrc -c .audit.eslintrc.json --format json --output-file <cache>/eslint-<repo>.json`
over that repo's package source dirs. `--output-file` rather than stdout, for the reason
measured above. The config file is deleted from the worktree as soon as the lane finishes, so it
can never reach a branch.

`no-undef` is the brief's *"thiếu import hàm hay biến"*: a symbol used with nothing importing or
declaring it. `no-unused-vars` is the in-file half of *"code không dùng"*.

**Step 2, agent triage.** `claude -p` sonnet, read-only, given the eslint JSON and asked one
question per finding: is this real, or is it a false positive — re-exported, referenced by a
dynamic `require()`, a deliberate placeholder. Output `{fp, verdict: 'real'|'false_positive'|
'unsure', reason}`.

Triage exists to keep the report honest, not to authorise anything. `false_positive` findings are
dropped from the message and recorded in the ledger so they are not re-reported every morning;
`real` and `unsure` are both reported, labelled as such. Nothing acts on any verdict.

**Step 3, project-level dead code — off by default.** A new registry field `auditKnip: false` on
every app. When a repo's knip config has been written and a human has read one run's output, that
repo flips to `true` and knip's `files` and `exports` results join the report.

### Lane C — supervisor

The third agent in the brief. It does not re-scan anything; it reads Lane A's findings, Lane B's
triaged findings, and the ledger diff, and produces the Telegram message body in Vietnamese,
matching the register of `buildMrMessage` (`src/notify/telegram.ts`).

Its judgement is ordering and compression: which of the new findings goes at the top, what a
human needs to read at 06:00, what collapses into a count. Orchestration around it is code —
which lane ran, what failed, what the ledger says — so a lane crash produces a report saying so
rather than a missing message.

## The ledger — why this does not become noise in a week

The same five unused constants will be found every morning until someone deletes them. Reported
verbatim each day, the message is muted inside a week and the whole thing is dead. So findings
are stateful.

New table in the existing sqlite db (alongside `alerts`, `mr_events`, `baselines`, `cursor`,
`seen_events` — `src/state/store.ts:128`):

```sql
CREATE TABLE IF NOT EXISTS audit_findings (
  fp            TEXT PRIMARY KEY,
  app           TEXT NOT NULL,
  kind          TEXT NOT NULL,        -- 'security' | 'hygiene'
  file          TEXT NOT NULL,
  rule          TEXT,                 -- eslint rule id, or the security category
  title         TEXT NOT NULL,
  severity      TEXT NOT NULL,
  first_seen_ms INTEGER NOT NULL,
  last_seen_ms  INTEGER NOT NULL,
  status        TEXT NOT NULL,        -- 'open' | 'resolved' | 'false_positive' | 'accepted'
  verdict       TEXT                  -- Lane B triage, null for security findings
);
CREATE INDEX IF NOT EXISTS audit_findings_app ON audit_findings(app, status);
CREATE INDEX IF NOT EXISTS audit_findings_seen ON audit_findings(last_seen_ms DESC);
```

`fp` is a hash of `app | file | rule | normalised title`. Normalisation strips digits, uuids,
hex blobs and quoted identifiers, so the same finding keeps its fingerprint when a line moves —
the same trick `src/fingerprint.ts` already uses on alert text. **The line number is deliberately
not in the fingerprint**: an unrelated edit above it must not resurface a finding as new.

Each run classifies every finding as:

| | means | in the daily message |
|---|---|---|
| **new** | `fp` not in the table | listed in full |
| **carried** | seen before, still open | one count line |
| **resolved** | in the table as open, absent this run | one count line, then `status='resolved'` |

The daily message carries the new findings in full and one line each for carried and resolved.
Every Monday the message is a full digest of everything open — so a backlog someone stopped
reading about is put back in front of them once a week rather than never.

`accepted` is set by hand, by a human, and suppresses a finding permanently. Nothing in the
pipeline may write `accepted` on its own.

## Report

One Telegram message per run, after all five apps finish — not one per app. Five messages at
06:00 is five notifications nobody reads.

```
🔎 Audit 2026-08-19 · 5 app

🔴 SEO · 2 mới
  packages/functions/src/handlers/api/getFaqs.js:41
  query thiếu where('shopId') — đọc được FAQ shop khác
  packages/functions/src/services/redirect.js:88
  console.log in nguyên req.headers (có Authorization)

🟡 APC · 1 mới
  packages/functions/src/const/default.js:5
  CONTENT_TYPES khai rồi không dùng

BLOG, AEO, IMG-OPT: không có gì mới
Tồn: 14 · Đã hết: 3 · blogs vẫn chưa có .claude/skills
Lane lỗi: không
```

Telegram failure never fails a run: `sendTelegram` returns its failure rather than throwing
(`src/notify/telegram.ts`) and that contract is kept. A run whose message could not be delivered
still writes the ledger, and the next run's "new" set is correct.

The `claude -p` cost of the run is appended as *quy đổi (chạy trên gói)* — the same wording
already used — because `total_cost_usd` is an API equivalence, not money billed on this plan.

## No merge requests, and no half-wired switch for them

The brief asked for two MRs per repo. That was cut on 2026-08-19: the MRs this fleet already
opens are sitting unreviewed, and a scanner that adds ten more a day makes the queue worse, not
the code better. The audit writes nothing to any branch.

This is a removal, not a disabled feature. There is **no `AUDIT_MR_ENABLED`**, no branch naming,
no fix agent, no jest gate and no push path — a flag that is off still has to be maintained,
still reads as "nearly working", and is the thing most likely to be flipped by accident on a
machine nobody is watching at 06:00. `openMr` keeps its `fix/prod-` guard
(`src/git/openMr.ts:112`) exactly as written, and `checkMrCaps` is untouched.

The audit therefore needs no write credentials at all, which also sidesteps the HTTPS credential
question recorded under Known gaps.

A fix lane, when it is wanted, gets its own spec — written against a signal that has been read
for a few weeks, including how many of these findings turned out to be real.

## Scheduling

A second launchd job, `com.tn22180.repo-audit`, generated by `autofix init` the way the daemon
plist already is (`src/setup/plist.ts`). It differs from the daemon plist in three ways:

- `StartCalendarInterval` `{Hour: 6, Minute: 0}` instead of `RunAtLoad` + `KeepAlive`
  (`src/setup/plist.ts:91`). A one-shot, not a listener: `KeepAlive` on a program that exits
  would restart it in a loop.
- `ProgramArguments` ends in `audit --all` rather than `daemon`.
- Its own `audit.log` / `audit.err.log` under the cache root.

06:00 is local time; launchd calendar intervals are local, so no UTC offset applies here. This is
not the "yesterday UTC" class of job — it reads the working tree as it stands, not a dated window.

The daemon is deliberately left alone. It is `KeepAlive` for Slack; putting a 06:00 timer inside
it ties an audit crash to prod-error alerting, and that trade has no upside.

## Configuration

New environment variables, all with working defaults, following the existing naming:

| Var | Default | Why |
|---|---|---|
| `AUDIT_ENABLED` | `true` | Kill switch that does not need the plist unloaded |
| `AUDIT_SECURITY_MODEL` | `claude-opus-5` | A weak reviewer here costs more than it saves |
| `AUDIT_TRIAGE_MODEL` | `claude-sonnet-5` | Judging a fixed list, not searching |
| `AUDIT_SUPERVISOR_MODEL` | `claude-sonnet-5` | Ordering and prose, from structured input |
| `AUDIT_SECURITY_TIMEOUT_MS` | `15m` | Whole-repo sweep, larger than the 6m diff review |
| `AUDIT_TRIAGE_TIMEOUT_MS` | `6m` | |
| `AUDIT_SUPERVISOR_TIMEOUT_MS` | `5m` | |
| `AUDIT_ESLINT_TIMEOUT_MS` | `10m` | `seo` is 1090 files |
| `AUDIT_JOB_TIMEOUT_MS` | `45m` | Per app, a ceiling — the lane budgets above sum to ~36m |
| `AUDIT_RUN_TIMEOUT_MS` | `150m` | Whole run. Five apps at the per-app ceiling would be 3h45 and land mid-morning; the run cap is what actually bounds it, and a run that hits it reports the apps it finished |
| `AUDIT_DIGEST_WEEKDAY` | `1` | Monday full digest |

`AppSpec` (`src/registry.ts`) gains two fields, both derived from disk and covered by the
existing drift test:

- `auditLintPaths: string[]` — the package source dirs to lint. `seo` has five packages, `blogs`
  four, AEO three; linting `packages/*` blindly would lint `copyright` and `dashboard` too.
- `auditKnip: boolean` — `false` on all five at first.

## Failure handling

| Failure | Result |
|---|---|
| Lane A times out or returns prose | That app's security lane is `failed`; hygiene still reports; the message names the failure |
| eslint exits ≥ 2 (config or parse error) | Hygiene lane `failed`, named in the message; the run continues |
| eslint exits 1 | Normal — that is "findings exist" |
| Worktree cannot be created | App skipped, named in the message |
| Lane C fails | Message is rendered by a plain code fallback from the structured results; findings are never lost to a prose failure |
| Telegram fails | Logged; ledger still written |

A worktree is always removed at the end of a job, and a run that dies mid-way leaves them for
`worktreeGc` (`src/git/worktreeGc.ts`), which already exists because seven abandoned worktrees
filled this machine's disk on 2026-07-31.

## Testing

Hermetic `bun test`, no network, run as `bun test ./test` — never bare `bun test` from the repo
root, which walks `projects/`:

- Fingerprint normalisation: line moves keep `fp`; a different file or rule changes it; digits,
  uuids and quoted identifiers are stripped.
- eslint JSON parsing, including a file whose content is preceded by junk — the exact failure the
  knip spike produced.
- eslint exit-code mapping: 0 clean, 1 findings, ≥2 failure.
- Ledger classification: new / carried / resolved, and that `accepted` is never written by code.
- Report rendering: zero findings, one app failing, digest day, and the "everything quiet" case.
- Worktree hygiene: `.audit.eslintrc.json` is gone from the worktree before teardown, and no
  lane leaves a modified file behind — `git status --porcelain` in the worktree is empty at the
  end of a job.
- Secret redaction: a finding whose title carries a token-shaped string is reported by
  `file:line` and kind, with the value stripped.
- Registry drift: `auditLintPaths` resolve on disk, extending `test/registry.disk.test.ts`.

Integration, behind `AUDIT_INTEGRATION=1`, read-only: run the real eslint pass against one real
repo and assert the JSON shape and a non-crashing exit. There is no push path to guard in a test
because there is no push path.

## What this will not do

- It will not edit, commit, push, open an MR, merge or deploy. It has no code path that does.
- It will not touch a working checkout. Everything happens in a worktree under
  `~/.cache/prod-autofix/wt`, and the only file it writes there is the eslint config it deletes
  again.
- It will not delete code. Not a file, not an export, not a variable — a finding is a sentence in
  a report and nothing more.
- It will not "fix" a committed secret by deleting the line. A committed secret is burned: it is
  reported, named as needing rotation, and left for a human. Precedent: incident `n9axd7`.
- It will not quote a secret it finds. The report carries `file:line` and what kind of credential
  it is, never the value — the Telegram group is a wider audience than the repo.

## Known gaps, stated rather than hidden

- **`blogs` has no `.claude/skills/`.** Its security lane runs without repo-specific knowledge
  while the other four do not. Reported every run until someone fixes the repo.
- **Hygiene is in-file only.** Dead files and dead exports need per-repo knip configs that do not
  exist yet; the measured 248-vs-180 result is why they are not being guessed at.
- **Cost is unmeasured.** Five apps × three agents ≈ 15 `claude -p` runs a day. The first week's
  runs report their own cost; widening scope to `joy`, `avachat` or the libs is a decision to take
  after seeing that number, not before.
- **The remotes are HTTPS, not SSH, and they are not all on the same host.** Read on
  2026-08-19:

  | repo | `origin` (push) |
  |---|---|
  | `seo` | `https://git.avada.net/avada/seo.git` (`gitlab-old` → gitlab.com) |
  | `ai-product-copy` | `https://git.avada.net/avada/ai-product-copy.git` |
  | `llm-ai-search-seo` | `https://git.avada.net/avada/llm-ai-search-seo.git` |
  | `blogs` | `https://gitlab.com/avada/blogs.git` |
  | `avada-image-optimizer` | `https://gitlab.com/avada/avada-image-optimizer.git` |

  This contradicts the README, which states MRs are opened "over SSH" (`README.md:61`) — a claim
  written before the `git.avada.net` cutover. The credential half of it does not affect this
  design, because the audit never pushes. The **staleness** half does:

  Every job starts with `git fetch origin <base>` and cuts a worktree from `origin/<base>`
  (`src/git/worktree.ts`). A checkout still pointing at `gitlab.com` for a project that has moved
  fetches a mirror that stopped receiving merges — so the audit would scan last month's code and
  report findings that were fixed weeks ago, or miss ones that exist now. Nothing in the run
  would look wrong. That failure mode has already bitten this fleet once, in the other direction:
  merges pushed to the dead mirror never reached prod.

  So `doctor` records the host each repo's `origin` resolves to and flags a **change** since the
  last check, rather than asserting one correct host — two of the five legitimately still live on
  gitlab.com today. A run additionally reports the age of `origin/<base>` per app; a base branch
  whose newest commit is weeks old is either a quiet repo or a dead remote, and the report says
  which one it cannot tell apart.
