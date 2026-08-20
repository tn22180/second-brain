# repo-audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily 06:00 job that sweeps the five prod Avada apps for security and code-hygiene problems, reports only what is new to Telegram, and — once explicitly enabled — opens one security MR and one cleanup MR per repo.

**Architecture:** A new `audit` command inside `prod-error-autofix`, reusing its registry, worktrees, `claude -p` wrapper, sqlite store, rate gate and Telegram notifier. Per app: a read-only security agent and an eslint-driven hygiene pass run in one worktree, a supervisor agent turns both into one Vietnamese report, and a sqlite ledger keeps the report to *new* findings so it does not become noise. Shipped alongside a switch-off of the prod-error daemon's own MR opening.

**Tech Stack:** Bun + TypeScript (strict), `bun:sqlite`, `bun:test`, the repos' own eslint 6.3 + babel-eslint, `claude -p` headless, launchd.

**Spec:** `docs/specs/2026-08-19-repo-audit-design.md` — read it before Task 1. Every "why" in this plan is argued there.

## Global Constraints

- Runtime is **Bun**, not node. Tests are `bun test ./test` — never bare `bun test` from the repo root, which walks `projects/` and hangs.
- TypeScript strict. No `any` in exported signatures. Every new module takes its side effects as an injected dependency (`Runner`, `ClaudeRunner`, `Fetcher`) so unit tests are hermetic.
- **No new runtime dependencies.** knip appears in this plan only as an optional dev tool invoked by absolute path; it is not added to `package.json`.
- Never write into a working checkout under `projects/Falcon/`. All repo work happens in a worktree under `~/.cache/prod-autofix/wt`.
- Never put a credential on a command line, in a log, or in a Telegram message. A secret finding is reported as `file:line` + kind, never the value.
- Models: security `claude-opus-5`, triage/supervisor `claude-sonnet-5`. Overridable by env, defaults pinned in code.
- Telegram failure is returned, never thrown — it may not fail a run.
- Report text is Vietnamese, matching `buildMrMessage`'s register in `src/notify/telegram.ts`.
- `total_cost_usd` is labelled *quy đổi (chạy trên gói)*, never as money spent.
- Existing behaviour of the Slack pipeline must not change except where Task 1 says so.

---

### Task 1: Switch off the prod-error daemon's MR opening

The daemon keeps listening, triaging and replying. It stops pushing branches and opening MRs. 58 sat unreviewed as of 2026-08-04.

`!input.allowMr` currently falls into the **infra** branch (`src/pipeline.ts:438`), which sets status `infra` and replies "infra class — reported, no MR". Reusing that path for a deliberate switch-off would file every prod error as infra and say something untrue in the thread. This task gives the switch its own status, its own reply and its own state-machine handling.

**Files:**
- Modify: `src/config.ts` — add `fixEnabled`
- Modify: `src/state/stateMachine.ts` — handle status `fix_disabled`
- Modify: `src/state/stateMachine.ts:15` — add `fix_disabled` to `AlertStatus`, and `fix_disabled` to `DecisionReason` (`stateMachine.ts:30`). Both unions live here, not in `store.ts`
- Modify: `src/pipeline.ts:435-443` — branch before the infra check
- Modify: `src/slack/reply.ts` — add `replyFixDisabled`
- Modify: `.env.example`, `README.md`
- Test: `test/stateMachine.test.ts`, `test/config.test.ts`, `test/slack.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `Config.fixEnabled: boolean`; `AlertStatus` gains `'fix_disabled'`. Task 8 reuses neither — the audit MR lane has its own switch.

- [ ] **Step 1: Write the failing config test**

```ts
// test/config.test.ts
test('the fix lane is off unless AUTOFIX_FIX_ENABLED says otherwise', () => {
  expect(buildConfig({...BASE_ENV}).fixEnabled).toBe(false);
  expect(buildConfig({...BASE_ENV, AUTOFIX_FIX_ENABLED: 'true'}).fixEnabled).toBe(true);
  expect(buildConfig({...BASE_ENV, AUTOFIX_FIX_ENABLED: 'false'}).fixEnabled).toBe(false);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test ./test/config.test.ts -t 'fix lane is off'`
Expected: FAIL — `fixEnabled` is undefined.

- [ ] **Step 3: Add the flag**

```ts
// src/config.ts, in the returned object
    // Off since 2026-08-19. The daemon still triages and still replies in the
    // thread; it stops opening MRs, because 58 were sitting unreviewed and an MR
    // nobody reads is worse than no MR. Audit MRs are the reviewed lane now.
    fixEnabled: env.AUTOFIX_FIX_ENABLED === 'true',
```

Add `fixEnabled: boolean;` to the `Config` interface.

- [ ] **Step 4: Run it and watch it pass**

Run: `bun test ./test/config.test.ts -t 'fix lane is off'`
Expected: PASS.

- [ ] **Step 5: Write the failing state-machine test**

```ts
// test/stateMachine.test.ts
test('a job parked by the fix switch is quiet and does not re-run', () => {
  const d = decide({...BASE, existing: {...ROW, status: 'fix_disabled'}});
  expect(d.run).toBe(false);
  expect(d.nextStatus).toBe('fix_disabled');
  expect(d.reason).toBe('fix_disabled');
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `bun test ./test/stateMachine.test.ts -t 'fix switch'`
Expected: FAIL — no case for `fix_disabled`.

- [ ] **Step 7: Handle the status**

```ts
// src/state/stateMachine.ts — add to BOTH unions (AlertStatus:15, DecisionReason:30)
  | 'fix_disabled'

// src/state/stateMachine.ts, in the switch on existing.status
    // Analysed once, reported once. Re-running costs a full ANALYZE for an answer
    // already in the thread, so a repeat alert is silent until the switch is back on.
    case 'fix_disabled':
      return quiet('fix_disabled', 'fix_disabled', input, {reply: false});
```

- [ ] **Step 8: Run it and watch it pass**

Run: `bun test ./test/stateMachine.test.ts -t 'fix switch'`
Expected: PASS.

- [ ] **Step 9: Write the failing reply test**

```ts
// test/slack.test.ts
test('the fix-disabled reply says why and where the analysis stops', () => {
  const text = replyFixDisabled({
    fingerprint: 'abc123', appName: 'SEO', attempt: 1, analysis: ANALYSIS
  });
  expect(text).toContain('SEO');
  expect(text).toContain('abc123');
  // The analysis is the whole point of still running — it has to be in there.
  expect(text).toContain(ANALYSIS.rootCause.slice(0, 30));
  // And it must not imply an MR is coming.
  expect(text).not.toMatch(/merge_request|MR đã mở/);
});
```

- [ ] **Step 10: Run it and watch it fail**

Run: `bun test ./test/slack.test.ts -t 'fix-disabled reply'`
Expected: FAIL — `replyFixDisabled` is not exported.

- [ ] **Step 11: Write the reply**

```ts
// src/slack/reply.ts
export function replyFixDisabled(input: ReplyBase & {analysis: Analysis}): string {
  return [
    `*${input.appName}* · \`${input.fingerprint}\``,
    '',
    `*Nguyên nhân.* ${input.analysis.rootCause}`,
    `*Cơ chế.* ${input.analysis.mechanism}`,
    '',
    ...input.analysis.citations.map(c => `• \`${c.file}:${c.line}\` — ${c.why}`),
    '',
    'Auto-fix đang tắt từ 2026-08-19 — phân tích tới đây, không mở MR.',
    'Bật lại: `AUTOFIX_FIX_ENABLED=true`.'
  ].join('\n');
}
```

- [ ] **Step 12: Run it and watch it pass**

Run: `bun test ./test/slack.test.ts -t 'fix-disabled reply'`
Expected: PASS.

- [ ] **Step 13: Wire the branch into the pipeline**

Insert **before** the infra check at `src/pipeline.ts:438`, so a real infra error still reports as infra:

```ts
  // Analysis is worth having even with the fix lane off — it is what the thread
  // is for. Everything downstream of it costs a FIX, a jest baseline, a security
  // review and a reviewer's attention, so it all stops here.
  if (!cfg.fixEnabled) {
    const replied = await say(
      reply.replyFixDisabled({fingerprint, appName: alert.appName, attempt, analysis: verified})
    );
    await learn(deps, {
      app, alert, fingerprint, attempt, analysis: verified, status: 'fix_disabled',
      outcome: 'fix lane disabled — analysed and reported, no MR',
      rounds: analysis.rounds.length, costUsd, message: input.message
    });
    return await finish('fix_disabled', 'fix lane disabled', {replied});
  }
```

- [ ] **Step 14: Run the whole suite**

Run: `bun test ./test`
Expected: PASS. `test/pipeline.test.ts` may need `fixEnabled: true` added to its config fixture — that is the correct fix, since those tests assert the MR path.

- [ ] **Step 15: Document it**

Add `AUTOFIX_FIX_ENABLED=false` to `.env.example` with the comment from Step 3, and a paragraph to `README.md` under "What it will and will not do" saying the fix lane is off and how to turn it back on.

- [ ] **Step 16: Commit**

```bash
git add src/config.ts src/state/stateMachine.ts src/state/store.ts src/pipeline.ts src/slack/reply.ts test .env.example README.md
git commit -m "feat: stop the prod-error daemon opening MRs

Off by default behind AUTOFIX_FIX_ENABLED. The daemon still listens, triages
and replies in the thread with the full analysis; it no longer pushes a branch
or opens an MR. 58 were unreviewed as of 2026-08-04.

Given its own status and reply rather than reusing the infra branch, which
would have filed every prod error as infra and said so in the thread."
```

---

### Task 2: Registry fields for the audit

**Files:**
- Modify: `src/registry.ts`
- Test: `test/registry.disk.test.ts`

**Interfaces:**
- Produces: `AppSpec.auditLintPaths: string[]` (repo-relative dirs to lint) and `AppSpec.auditKnip: boolean`. Task 3 consumes `auditLintPaths`; Task 9 consumes `auditKnip`.

- [ ] **Step 1: Write the failing disk test**

```ts
// test/registry.disk.test.ts
test('every auditLintPaths entry exists on disk', () => {
  for (const app of listApps(cfg)) {
    expect(app.auditLintPaths.length).toBeGreaterThan(0);
    for (const rel of app.auditLintPaths) {
      expect(existsSync(join(app.repoPath, rel))).toBe(true);
    }
  }
});

test('knip is off everywhere until a repo config has been read by a human', () => {
  for (const app of listApps(cfg)) expect(app.auditKnip).toBe(false);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test ./test/registry.disk.test.ts -t auditLintPaths`
Expected: FAIL — property does not exist.

- [ ] **Step 3: Add the fields**

Package lists read off disk on 2026-08-19 — `seo` has five packages, `blogs` four, AEO three, so a blind `packages/*` would lint `copyright` and `dashboard` too:

```ts
// src/registry.ts — in AppSpec
  /**
   * Repo-relative dirs the audit lints. Only the packages holding hand-written
   * app code: `copyright` and `dashboard` are generated or vendor trees and
   * would drown the report.
   */
  auditLintPaths: string[];
  /** knip needs a per-repo config; false until one exists and a human has read a run. */
  auditKnip: boolean;
```

Per app: `seo` `['packages/functions/src', 'packages/assets/src', 'packages/scripttag/src']`; `blogs` `['packages/functions/src', 'packages/assets/src']`; `ai-product-copy` `['packages/functions/src', 'packages/assets/src', 'packages/scripttag/src']`; `llm-ai-search-seo` `['packages/functions/src', 'packages/assets/src']`; `avada-image-optimizer` `['packages/functions/src', 'packages/assets/src', 'packages/scripttag/src']`. Every app gets `auditKnip: false`.

- [ ] **Step 4: Run it and watch it pass**

Run: `bun test ./test/registry.disk.test.ts`
Expected: PASS. A failure here means a path guess was wrong — fix the registry, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/registry.ts test/registry.disk.test.ts
git commit -m "feat(registry): auditLintPaths and auditKnip per app"
```

---

### Task 3: The eslint runner

**Files:**
- Create: `src/audit/eslint.ts`
- Test: `test/audit.eslint.test.ts`
- Test fixture: `test/fixtures/eslint-output.json`

**Interfaces:**
- Consumes: `AppSpec.auditLintPaths` (Task 2), `Runner` from `src/gcloud/run.ts`.
- Produces:

```ts
export interface LintFinding {file: string; line: number; rule: string; message: string}
export type LintResult =
  | {ok: true; findings: LintFinding[]; filesScanned: number}
  | {ok: false; failure: 'spawn' | 'config' | 'unreadable'; detail: string};
export const AUDIT_ESLINTRC: string;              // the JSON config, verbatim
export function parseEslintJson(raw: string): LintResult;
export async function runEslint(input: RunEslintInput, runner?: Runner): Promise<LintResult>;
export interface RunEslintInput {
  worktreeDir: string; lintPaths: string[]; outFile: string; timeoutMs: number;
}
```

- [ ] **Step 1: Write the failing parse tests**

```ts
// test/audit.eslint.test.ts
import {describe, expect, test} from 'bun:test';
import {parseEslintJson} from '../src/audit/eslint';

const REAL = JSON.stringify([
  {filePath: '/wt/seo/packages/functions/src/const/default.js', messages: [
    {ruleId: 'no-unused-vars', line: 5, message: "'CONTENT_TYPES' is defined but never used."}
  ]},
  {filePath: '/wt/seo/packages/functions/src/ok.js', messages: []}
]);

test('findings come back with a repo-relative path', () => {
  const r = parseEslintJson(REAL);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.filesScanned).toBe(2);
  expect(r.findings).toHaveLength(1);
  expect(r.findings[0]!.rule).toBe('no-unused-vars');
  expect(r.findings[0]!.line).toBe(5);
});

// knip printed `Template file == 3000 == 5002 == 127.0.0.1` ahead of its JSON on
// 2026-08-19, from a repo config module logging at require time. Any repo can do it.
test('junk printed before the JSON does not kill the run', () => {
  const r = parseEslintJson(`Template file == 3000 == 5002\n${REAL}`);
  expect(r.ok).toBe(true);
});

test('output that is not JSON at all is a named failure, not a crash', () => {
  const r = parseEslintJson('Cannot find module babel-eslint');
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.failure).toBe('unreadable');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun test ./test/audit.eslint.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the parser**

```ts
// src/audit/eslint.ts
/**
 * Runs each repo's own eslint 6.3 with a rule set the repo does not have.
 *
 * The repos extend `google` + `prettier` with `env: browser, es6` — no `node`, and
 * neither `no-undef` nor `no-unused-vars` enabled. So the audit brings its own
 * config rather than reusing theirs.
 *
 * That config has to be written INSIDE the worktree. eslint resolves `parser`
 * relative to the config file's own directory, and a config outside the repo dies
 * with `Failed to load parser 'babel-eslint'` before it lints anything.
 */
export const AUDIT_ESLINTRC = JSON.stringify(
  {
    root: true,
    parser: 'babel-eslint',
    parserOptions: {ecmaVersion: 2020, sourceType: 'module', ecmaFeatures: {jsx: true}},
    env: {node: true, es6: true, browser: true, jest: true},
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', {args: 'none', varsIgnorePattern: '^_'}]
    }
  },
  null,
  2
);

interface RawFile {filePath: string; messages: {ruleId: string | null; line: number; message: string}[]}

/** Takes the first balanced array in the text: a repo module may log before eslint writes. */
export function parseEslintJson(raw: string): LintResult {
  const start = raw.indexOf('[');
  if (start < 0) return {ok: false, failure: 'unreadable', detail: raw.trim().slice(0, 300)};
  let parsed: RawFile[];
  try {
    parsed = JSON.parse(raw.slice(start)) as RawFile[];
  } catch {
    return {ok: false, failure: 'unreadable', detail: raw.trim().slice(0, 300)};
  }
  const findings: LintFinding[] = [];
  for (const file of parsed) {
    for (const m of file.messages) {
      if (!m.ruleId) continue;
      findings.push({file: file.filePath, line: m.line, rule: m.ruleId, message: m.message});
    }
  }
  return {ok: true, findings, filesScanned: parsed.length};
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `bun test ./test/audit.eslint.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing runner tests**

```ts
test('exit 1 means findings, not failure', async () => {
  const runner = async () => ({code: 1, stdout: '', stderr: '', timedOut: false});
  const r = await runEslint(INPUT, runner);
  expect(r.ok).toBe(true);
});

test('exit 2 is a config failure and names it', async () => {
  const runner = async () => ({
    code: 2, stdout: '', stderr: "Failed to load parser 'babel-eslint'", timedOut: false
  });
  const r = await runEslint(INPUT, runner);
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.failure).toBe('config');
  expect(r.detail).toContain('babel-eslint');
});

test('paths come back relative to the worktree', async () => {
  // ...runner writes REAL to INPUT.outFile; assert findings[0].file === 'packages/functions/src/const/default.js'
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `bun test ./test/audit.eslint.test.ts -t exit`
Expected: FAIL — `runEslint` not exported.

- [ ] **Step 7: Write the runner**

```ts
export async function runEslint(input: RunEslintInput, runner: Runner = spawnRunner): Promise<LintResult> {
  const rcPath = join(input.worktreeDir, '.audit.eslintrc.json');
  await Bun.write(rcPath, AUDIT_ESLINTRC);
  try {
    const res = await runner(
      [
        join(input.worktreeDir, 'node_modules', '.bin', 'eslint'),
        '--no-eslintrc',
        '-c', rcPath,
        '--format', 'json',
        // Not stdout: a repo module that logs at require time contaminates it.
        '--output-file', input.outFile,
        ...input.lintPaths
      ],
      input.timeoutMs,
      {cwd: input.worktreeDir}
    );
    // 0 = clean, 1 = findings exist. Both are successful runs.
    if (res.code > 1 || res.timedOut) {
      return {ok: false, failure: 'config', detail: (res.stderr || res.stdout).trim().slice(0, 300)};
    }
    const raw = await Bun.file(input.outFile).text().catch(() => '');
    if (!raw.trim()) return {ok: true, findings: [], filesScanned: 0};
    const parsed = parseEslintJson(raw);
    if (!parsed.ok) return parsed;
    return {
      ...parsed,
      findings: parsed.findings.map(f => ({...f, file: relative(input.worktreeDir, f.file)}))
    };
  } finally {
    // Never allowed to reach a branch. `finally` so a thrown parse still cleans up.
    await unlink(rcPath).catch(() => {});
  }
}
```

- [ ] **Step 8: Run them and watch them pass**

Run: `bun test ./test/audit.eslint.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/audit/eslint.ts test/audit.eslint.test.ts
git commit -m "feat(audit): eslint runner with its own rule set

The repos' own configs enable neither no-undef nor no-unused-vars. The config
is written into the worktree because eslint resolves the parser relative to the
config file, and removed in a finally so it can never reach a branch. Machine
output is read from a file: a repo module logging at require time contaminates
stdout ahead of the JSON."
```

---

### Task 4: The ledger

Without this the same five unused constants are reported every morning and the message is muted inside a week.

**Files:**
- Create: `src/audit/findingFp.ts`
- Create: `src/audit/ledger.ts`
- Modify: `src/state/store.ts` — new table + methods
- Test: `test/audit.ledger.test.ts`

**Interfaces:**
- Consumes: `LintFinding` (Task 3), `Store`.
- Produces:

```ts
export function normaliseTitle(text: string): string;
export function findingFp(input: {app: string; file: string; rule: string; title: string}): string;

export type FindingKind = 'security' | 'hygiene';
export type FindingStatus = 'open' | 'resolved' | 'false_positive' | 'accepted';
export interface AuditFinding {
  fp: string; app: string; kind: FindingKind; file: string; line: number;
  rule: string; title: string; severity: string; verdict?: string;
}
export interface LedgerDiff {
  fresh: AuditFinding[]; carried: number; resolved: number; suppressed: number;
}
export function classify(store: Store, app: string, found: AuditFinding[], nowMs: number): LedgerDiff;
```

- [ ] **Step 1: Write the failing fingerprint tests**

```ts
// test/audit.ledger.test.ts
test('a finding keeps its fingerprint when the line moves', () => {
  const a = findingFp({app: 'SEO', file: 'src/a.js', rule: 'no-unused-vars', title: "'X' is defined but never used"});
  const b = findingFp({app: 'SEO', file: 'src/a.js', rule: 'no-unused-vars', title: "'X' is defined but never used"});
  expect(a).toBe(b);
});

test('digits and ids are normalised out of the title', () => {
  expect(normaliseTitle('shop 8812 failed at 2026-08-19T04:00Z'))
    .toBe(normaliseTitle('shop 91 failed at 2026-07-01T09:30Z'));
});

test('a different file or rule is a different finding', () => {
  const base = {app: 'SEO', file: 'src/a.js', rule: 'no-unused-vars', title: 't'};
  expect(findingFp(base)).not.toBe(findingFp({...base, file: 'src/b.js'}));
  expect(findingFp(base)).not.toBe(findingFp({...base, rule: 'no-undef'}));
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun test ./test/audit.ledger.test.ts -t fingerprint`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the fingerprint**

```ts
// src/audit/findingFp.ts
import {createHash} from 'node:crypto';

/**
 * Strips what moves between runs so the same problem keeps one identity: digits,
 * uuids, hex blobs and timestamps. The **line number is deliberately not part of
 * the fingerprint** — an unrelated edit above a finding must not resurface it as new.
 */
export function normaliseTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
    .replace(/\b[0-9a-f]{16,}\b/g, '<hex>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findingFp(input: {app: string; file: string; rule: string; title: string}): string {
  const key = [input.app, input.file, input.rule, normaliseTitle(input.title)].join('|');
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `bun test ./test/audit.ledger.test.ts -t fingerprint`
Expected: PASS.

- [ ] **Step 5: Write the failing ledger tests**

```ts
test('first sighting is fresh, second is carried', () => {
  const store = new Store(':memory:');
  const f = [FINDING];
  expect(classify(store, 'SEO', f, 1000).fresh).toHaveLength(1);
  const second = classify(store, 'SEO', f, 2000);
  expect(second.fresh).toHaveLength(0);
  expect(second.carried).toBe(1);
});

test('a finding that stops appearing is resolved once, then forgotten', () => {
  const store = new Store(':memory:');
  classify(store, 'SEO', [FINDING], 1000);
  expect(classify(store, 'SEO', [], 2000).resolved).toBe(1);
  expect(classify(store, 'SEO', [], 3000).resolved).toBe(0);
});

// Set by a human, never by the pipeline. Suppressing forever is a decision, not a step.
test('accepted findings are suppressed and never re-reported', () => {
  const store = new Store(':memory:');
  classify(store, 'SEO', [FINDING], 1000);
  store.setAuditFindingStatus(FINDING_FP, 'accepted');
  const d = classify(store, 'SEO', [FINDING], 2000);
  expect(d.fresh).toHaveLength(0);
  expect(d.carried).toBe(0);
  expect(d.suppressed).toBe(1);
});

test('a finding coming back after being resolved is fresh again', () => {
  const store = new Store(':memory:');
  classify(store, 'SEO', [FINDING], 1000);
  classify(store, 'SEO', [], 2000);
  expect(classify(store, 'SEO', [FINDING], 3000).fresh).toHaveLength(1);
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `bun test ./test/audit.ledger.test.ts`
Expected: FAIL — `classify` not exported.

- [ ] **Step 7: Add the table and the methods**

```sql
-- src/state/store.ts, in migrate()
CREATE TABLE IF NOT EXISTS audit_findings (
  fp            TEXT PRIMARY KEY,
  app           TEXT NOT NULL,
  kind          TEXT NOT NULL,
  file          TEXT NOT NULL,
  line          INTEGER NOT NULL,
  rule          TEXT,
  title         TEXT NOT NULL,
  severity      TEXT NOT NULL,
  verdict       TEXT,
  first_seen_ms INTEGER NOT NULL,
  last_seen_ms  INTEGER NOT NULL,
  status        TEXT NOT NULL,
  mr_url        TEXT
);
CREATE INDEX IF NOT EXISTS audit_findings_app ON audit_findings(app, status);
CREATE INDEX IF NOT EXISTS audit_findings_seen ON audit_findings(last_seen_ms DESC);
```

Methods on `Store`: `getAuditFinding(fp)`, `upsertAuditFinding(row, nowMs)`, `openAuditFindings(app)`, `setAuditFindingStatus(fp, status)`, `setAuditFindingMr(fp, url)`.

- [ ] **Step 8: Write `classify`**

```ts
// src/audit/ledger.ts
export function classify(store: Store, app: string, found: AuditFinding[], nowMs: number): LedgerDiff {
  const seen = new Set(found.map(f => f.fp));
  const fresh: AuditFinding[] = [];
  let carried = 0;
  let suppressed = 0;

  for (const f of found) {
    const prior = store.getAuditFinding(f.fp);
    // A human's decision outranks the scanner's, in both directions.
    if (prior?.status === 'accepted' || prior?.status === 'false_positive') {
      suppressed++;
      store.upsertAuditFinding(f, nowMs);
      continue;
    }
    if (prior && prior.status === 'open') carried++;
    else fresh.push(f);
    store.upsertAuditFinding(f, nowMs);
  }

  let resolved = 0;
  for (const row of store.openAuditFindings(app)) {
    if (seen.has(row.fp)) continue;
    store.setAuditFindingStatus(row.fp, 'resolved');
    resolved++;
  }
  return {fresh, carried, resolved, suppressed};
}
```

`upsertAuditFinding` sets `status='open'` on insert and on a row previously `resolved`, and leaves `accepted` / `false_positive` alone.

- [ ] **Step 9: Run them and watch them pass**

Run: `bun test ./test/audit.ledger.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/audit/findingFp.ts src/audit/ledger.ts src/state/store.ts test/audit.ledger.test.ts
git commit -m "feat(audit): finding ledger so the report only carries what is new

The line number is not in the fingerprint: an edit above a finding must not
resurface it as new. accepted and false_positive are human decisions and are
never written by the pipeline."
```

---

### Task 5: The security lane

**Files:**
- Create: `src/audit/securitySchema.ts`
- Create: `src/audit/securityLane.ts`
- Test: `test/audit.security.test.ts`

**Interfaces:**
- Consumes: `ClaudeRunner` (`src/agent/claudeCli.ts`), `App` (`src/registry.ts`).
- Produces:

```ts
export interface SecurityFinding {
  file: string; line: number; severity: 'high' | 'medium' | 'low';
  category: 'shop_scoping' | 'untrusted_input' | 'secret' | 'secret_in_log' | 'authn' | 'other';
  title: string; why: string; fix: string;
}
export function validateSecurity(text: string): {ok: true; value: SecurityFinding[]} | {ok: false; errors: string[]};
export function redactSecret(text: string): string;
export const SECURITY_TOOLS: string[];
export async function runSecurityLane(input, claude?): Promise<SecurityLaneResult>;
```

- [ ] **Step 1: Write the failing schema tests**

```ts
test('prose instead of JSON is a failed lane, not an empty one', () => {
  const r = validateSecurity('I looked at the repo and it seems fine.');
  expect(r.ok).toBe(false);
});

test('an empty array is a valid answer', () => {
  const r = validateSecurity('```json\n[]\n```');
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value).toHaveLength(0);
});

test('a finding missing a field is rejected with the field named', () => {
  const r = validateSecurity('[{"file":"a.js","line":1}]');
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors.join(' ')).toContain('severity');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun test ./test/audit.security.test.ts -t schema`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schema**

Reuse `extractJson`'s approach from `src/agent/analysisSchema.ts` — take the **last** balanced value, because a model that restates the schema before answering puts the real answer second. Validate every field, collecting errors rather than throwing on the first.

- [ ] **Step 4: Run them and watch them pass**

Run: `bun test ./test/audit.security.test.ts -t schema`
Expected: PASS.

- [ ] **Step 5: Write the failing redaction test**

```ts
// The Telegram group is a wider audience than the repo. A secret finding says
// where and what kind, never the value.
test('a token-shaped string in a title is stripped', () => {
  expect(redactSecret('key is sk_live_<fixture>'))
    .toBe('key is <redacted>');
  expect(redactSecret('shpat_<fixture>'))
    .toBe('<redacted>');
});

test('ordinary prose is left alone', () => {
  expect(redactSecret('missing where(shopId) on the query'))
    .toBe('missing where(shopId) on the query');
});
```

- [ ] **Step 6: Run it and watch it fail, then implement, then watch it pass**

Run: `bun test ./test/audit.security.test.ts -t redact`
Implement `redactSecret` matching `sk_`/`shpat_`/`shpca_`/`ghp_` prefixes, bare runs of 32+ base64/hex chars, and `Bearer <x>`. Expected after: PASS.

- [ ] **Step 7: Write the failing lane tests**

```ts
test('a citation that does not resolve in the worktree is dropped', async () => {
  const claude = async () => ok(JSON.stringify([
    {file: 'src/real.js', line: 3, severity: 'high', category: 'shop_scoping', title: 't', why: 'w', fix: 'f'},
    {file: 'src/invented.js', line: 9, severity: 'high', category: 'other', title: 't', why: 'w', fix: 'f'}
  ]));
  const r = await runSecurityLane({...INPUT, fileExists: p => p.endsWith('real.js')}, claude);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.findings).toHaveLength(1);
  expect(r.dropped).toBe(1);
});

test('a timeout is a named lane failure, not zero findings', async () => {
  const claude = async () => ({ok: false, failure: 'timeout' as const, /* ... */});
  const r = await runSecurityLane(INPUT, claude);
  expect(r.ok).toBe(false);
});

test('the lane gets no write tools', () => {
  expect(SECURITY_TOOLS).not.toContain('Edit');
  expect(SECURITY_TOOLS).not.toContain('Write');
});
```

- [ ] **Step 8: Run them and watch them fail**

Run: `bun test ./test/audit.security.test.ts`
Expected: FAIL — `runSecurityLane` not exported.

- [ ] **Step 9: Write the lane**

`cwd` is the worktree so the repo's own `CLAUDE.md` and `.claude/skills/security/` load — four of five repos have one; `blogs` has no `.claude/skills/` at all and the caller reports that gap. Tools are `ANALYZE_TOOLS` minus the gcloud entry. The prompt names the five surfaces from the spec's Lane A section and demands a JSON array and nothing else. Findings whose `file:line` does not resolve are dropped and counted — an agent that invents a citation to look useful is worse than one that finds nothing.

- [ ] **Step 10: Run them and watch them pass**

Run: `bun test ./test/audit.security.test.ts`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/audit/securitySchema.ts src/audit/securityLane.ts test/audit.security.test.ts
git commit -m "feat(audit): read-only security lane

Runs in the worktree so each repo's own CLAUDE.md and .claude/skills/security
load. Prose instead of JSON is a failed lane, not an empty one. Citations that
do not resolve are dropped and counted, and secret values are redacted before
anything leaves the process."
```

---

### Task 6: The triage lane

**Files:**
- Create: `src/audit/triage.ts`
- Test: `test/audit.triage.test.ts`

**Interfaces:**
- Consumes: `LintFinding` (Task 3), `ClaudeRunner`.
- Produces: `export type Verdict = 'delete' | 'keep' | 'unsure';` and `runTriage(input, claude?): Promise<TriageResult>` returning `{fp, verdict, reason}[]`.

- [ ] **Step 1: Write the failing tests**

```ts
test('only delete verdicts are eligible for the cleanup MR', async () => {
  const claude = async () => ok(JSON.stringify([
    {fp: 'a', verdict: 'delete', reason: 'no reference anywhere'},
    {fp: 'b', verdict: 'keep', reason: 'reached by a dynamic require'},
    {fp: 'c', verdict: 'unsure', reason: 'could not tell'}
  ]));
  const r = await runTriage({findings: THREE, ...INPUT}, claude);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.deletable.map(v => v.fp)).toEqual(['a']);
});

// A verdict for a finding that was never sent is a hallucinated id.
test('verdicts for unknown fingerprints are discarded', async () => {
  const claude = async () => ok('[{"fp":"zzz","verdict":"delete","reason":"x"}]');
  const r = await runTriage({findings: THREE, ...INPUT}, claude);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.deletable).toHaveLength(0);
});

// A missing verdict must never default to delete.
test('a finding the agent skipped is unsure, not deletable', async () => {
  const claude = async () => ok('[{"fp":"a","verdict":"delete","reason":"x"}]');
  const r = await runTriage({findings: THREE, ...INPUT}, claude);
  if (!r.ok) return;
  expect(r.verdicts.find(v => v.fp === 'b')!.verdict).toBe('unsure');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun test ./test/audit.triage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the lane**

Read-only tools. The prompt hands over the eslint findings and asks per finding whether the symbol is genuinely unreferenced or reached another way — re-exported, dynamic `require()`, a deliberate placeholder. Unknown `fp`s are dropped; findings with no verdict default to `unsure`.

- [ ] **Step 4: Run them and watch them pass**

Run: `bun test ./test/audit.triage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audit/triage.ts test/audit.triage.test.ts
git commit -m "feat(audit): triage lane over the eslint findings

Defaults are the safe direction: an unknown fingerprint is discarded and a
finding the agent skipped is unsure, never deletable."
```

---

### Task 7: The supervisor and the report

**Files:**
- Create: `src/audit/report.ts`
- Create: `src/audit/supervisor.ts`
- Test: `test/audit.report.test.ts`

**Interfaces:**
- Consumes: `LedgerDiff` (Task 4), `SecurityFinding` (Task 5), `Verdict` (Task 6).
- Produces: `renderReport(input: ReportInput): string` (pure, no agent) and `runSupervisor(input, claude?): Promise<string>` which falls back to `renderReport` on any agent failure.

- [ ] **Step 1: Write the failing tests**

```ts
test('a quiet run says so in one line rather than going silent', () => {
  const text = renderReport({date: '2026-08-19', apps: ALL_QUIET, digest: false});
  expect(text).toContain('không có gì mới');
});

test('a failed lane is named, not swallowed', () => {
  const text = renderReport({date: '2026-08-19', apps: [{...SEO, securityLane: 'timeout'}], digest: false});
  expect(text).toContain('Lane lỗi');
  expect(text).toContain('SEO');
});

test('secret values never reach the message', () => {
  const text = renderReport({date: '2026-08-19', apps: [WITH_TOKEN_IN_TITLE], digest: false});
  expect(text).not.toContain('shpat_<fixture>');
  expect(text).toContain('<redacted>');
});

test('the gap in blogs is reported every run until someone fixes the repo', () => {
  const text = renderReport({date: '2026-08-19', apps: WITH_BLOGS_NO_SKILLS, digest: false});
  expect(text).toContain('.claude/skills');
});

test('cost is labelled as an equivalence, never as money spent', () => {
  expect(renderReport({...BASE, costUsd: 4.2})).toContain('quy đổi (chạy trên gói)');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun test ./test/audit.report.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `renderReport`**

Pure function, the shape from the spec's Report section: new findings in full per app, one line each for carried / resolved, the failed lanes, the `blogs` skills gap, and the cost line. Every title passes through `redactSecret` on the way in.

- [ ] **Step 4: Run them and watch them pass**

Run: `bun test ./test/audit.report.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing supervisor fallback test**

```ts
// Findings must never be lost to a prose failure.
test('an agent failure falls back to the rendered report', async () => {
  const claude = async () => ({ok: false, failure: 'timeout' as const, text: '', /* ... */});
  const text = await runSupervisor(INPUT, claude);
  expect(text).toBe(renderReport(INPUT));
});

test('an agent that answers with nothing also falls back', async () => {
  const claude = async () => ok('   ');
  expect(await runSupervisor(INPUT, claude)).toBe(renderReport(INPUT));
});
```

- [ ] **Step 6: Run them, implement the fallback, run them again**

Run: `bun test ./test/audit.report.test.ts -t fallback`
Expected after implementing: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/audit/report.ts src/audit/supervisor.ts test/audit.report.test.ts
git commit -m "feat(audit): supervisor with a code fallback for the report

The supervisor orders and compresses; it is not allowed to be the only path to
a message. Any agent failure renders the same findings from code, so a prose
failure never loses a finding."
```

---

### Task 8: The MR lane

The one task that pushes. Everything in it fails closed.

**Files:**
- Modify: `src/git/openMr.ts:112` — prefix allowlist
- Modify: `src/git/worktree.ts:36` — `auditBranchName`
- Create: `src/audit/mr.ts`
- Test: `test/openMr.test.ts`, `test/audit.mr.test.ts`

**Interfaces:**
- Consumes: `SecurityFinding` (Task 5), triage verdicts (Task 6), `openMr`, `createWorktree`, `checkMrCaps`.
- Produces: `auditBranchName(kind: 'security' | 'cleanup', repo: string, dateStr: string): string` and `runMrLane(input): Promise<MrLaneResult>`.

- [ ] **Step 1: Write the failing guard tests**

```ts
// test/openMr.test.ts
test('an audit branch is allowed', async () => {
  const r = await openMr({...INPUT, branch: 'audit/security-seo-20260819'}, runnerThatSucceeds);
  expect(r.failure).not.toBe('refused');
});

test('everything outside the allowlist is still refused', async () => {
  for (const branch of ['master', 'main', 'feature/x', 'hotfix/y']) {
    const r = await openMr({...INPUT, branch}, runnerThatSucceeds);
    expect(r.failure).toBe('refused');
  }
});

test('pushing onto the base branch is still refused', async () => {
  const r = await openMr({...INPUT, branch: 'master', baseBranch: 'master'}, runnerThatSucceeds);
  expect(r.failure).toBe('refused');
});
```

- [ ] **Step 2: Run them and watch the audit one fail**

Run: `bun test ./test/openMr.test.ts`
Expected: the audit-branch test FAILs; the refusal tests already pass.

- [ ] **Step 3: Widen the guard by exactly one entry**

```ts
// src/git/openMr.ts
/**
 * The guard is what stops a bug pushing to master. It gets an allowlist rather
 * than being removed: `fix/prod-` for the Slack pipeline, `audit/` for the daily
 * sweep. Nothing else pushes.
 */
const ALLOWED_BRANCH_PREFIXES = ['fix/prod-', 'audit/'];

if (!ALLOWED_BRANCH_PREFIXES.some(p => input.branch.startsWith(p))) {
  return {/* ...refused, detail: `branch ${input.branch} is not an allowed prefix` */};
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `bun test ./test/openMr.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing MR-lane tests**

```ts
// test/audit.mr.test.ts
test('a diff touching a file no finding named is refused', async () => {
  const r = await runMrLane({...INPUT, findings: [{file: 'src/a.js', ...}]}, {
    ...deps, diffFiles: async () => ['src/a.js', 'src/unrelated.js']
  });
  expect(r.pushed).toBe(false);
  expect(r.refusal).toBe('out_of_scope');
});

test('forbidden files are refused outright', async () => {
  for (const f of ['.env', '.env.local', 'yarn.lock', '.gitlab-ci.yml', 'firebase.json', '.firebaserc', 'package.json']) {
    const r = await runMrLane(INPUT, {...deps, diffFiles: async () => [f]});
    expect(r.refusal).toBe('forbidden_file');
  }
});

test('a red jest run means no push', async () => {
  const r = await runMrLane(INPUT, {...deps, jest: async () => ({ok: false, detail: '3 failing'})});
  expect(r.pushed).toBe(false);
  expect(r.refusal).toBe('tests_failed');
});

test('the two lanes get two worktrees and two branches', async () => {
  const r = await runBothMrLanes(INPUT, deps);
  expect(r.security.branch).toBe('audit/security-seo-20260819');
  expect(r.cleanup.branch).toBe('audit/cleanup-seo-20260819');
  expect(r.security.worktreeDir).not.toBe(r.cleanup.worktreeDir);
});

test('the MR cap is honoured', async () => {
  // checkMrCaps says no -> no push, refusal 'capped'
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `bun test ./test/audit.mr.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Write the lane**

Order per lane: create its own worktree from `origin/<base>` → run the fix agent restricted to the files the findings named → `git diff --name-only` → scope gate → forbidden-file gate → repo jest → `openMr`. Any gate failing returns before the push with a named refusal. Cleanup deletes declarations only — no file deletion, no export removal, because `require()` is dynamic in these trees and knip has not earned that call yet (spec, Measured facts).

- [ ] **Step 8: Run them and watch them pass**

Run: `bun test ./test/audit.mr.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/git/openMr.ts src/git/worktree.ts src/audit/mr.ts test/openMr.test.ts test/audit.mr.test.ts
git commit -m "feat(audit): security and cleanup MR lanes

The openMr branch guard becomes an allowlist of two prefixes rather than being
removed -- it is what stops a bug pushing to master. Every gate fails closed:
out-of-scope file, forbidden file, red jest or a hit cap all return before the
push with a named refusal."
```

---

### Task 9: The `audit` command

**Files:**
- Create: `src/audit/job.ts` — one app
- Create: `src/audit/run.ts` — all apps
- Modify: `bin/autofix.ts` — `case 'audit'`
- Modify: `src/config.ts` — the `AUDIT_*` block
- Test: `test/audit.job.test.ts`, `test/cli.test.ts`

**Interfaces:**
- Consumes: every task above.
- Produces: `runAuditJob(app, deps): Promise<AppAuditResult>` and `runAudit(cfg, deps): Promise<AuditRunResult>`.

- [ ] **Step 1: Write the failing job tests**

```ts
test('the worktree is removed even when a lane throws', async () => {
  const removed: string[] = [];
  await runAuditJob(APP, {...deps, securityLane: async () => {throw new Error('boom')},
    removeWorktree: async d => {removed.push(d); return {ok: true, detail: undefined}}});
  expect(removed).toHaveLength(1);
});

test('one app failing does not stop the others', async () => {
  const r = await runAudit(CFG, {...deps, job: async app => {
    if (app.appName === 'SEO') throw new Error('boom');
    return OK_RESULT;
  }});
  expect(r.apps.filter(a => a.ok)).toHaveLength(4);
  expect(r.apps.find(a => a.appName === 'SEO')!.ok).toBe(false);
});

test('the run cap stops the sweep and reports what finished', async () => {
  const r = await runAudit({...CFG, runTimeoutMs: 0}, deps);
  expect(r.stoppedEarly).toBe(true);
});

test('one message per run, not one per app', async () => {
  const sent: string[] = [];
  await runAudit(CFG, {...deps, sendTelegram: async (_c, t) => {sent.push(t); return {ok: true}}});
  expect(sent).toHaveLength(1);
});

test('a Telegram failure still leaves the ledger written', async () => {
  const store = new Store(':memory:');
  await runAudit(CFG, {...deps, store, sendTelegram: async () => ({ok: false, detail: 'down'})});
  expect(store.openAuditFindings('SEO').length).toBeGreaterThan(0);
});

test('AUDIT_MR_ENABLED off means the MR lane is never called', async () => {
  let called = 0;
  await runAudit({...CFG, mrEnabled: false}, {...deps, runMrLane: async () => {called++; return NONE}});
  expect(called).toBe(0);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun test ./test/audit.job.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the orchestration**

Per app: worktree → `linkNodeModules` → Lane A and Lane B concurrently (`Promise.allSettled`, so one lane's failure cannot take the other down) → triage → ledger `classify` → optional MR lane → remove worktree in a `finally`. Apps run sequentially; the run stops when `AUDIT_RUN_TIMEOUT_MS` is exceeded and reports which apps finished. One Telegram message at the end.

- [ ] **Step 4: Add the config block**

`AUDIT_ENABLED` (default `true`), `AUDIT_MR_ENABLED` (default `false`), the three model vars, the five timeouts, `AUDIT_DIGEST_WEEKDAY` (default `1`). Values from the spec's Configuration table.

- [ ] **Step 5: Add the CLI case**

```ts
// bin/autofix.ts
    case 'audit': {
      const all = argv.includes('--all');
      const only = argv.find(a => a.startsWith('--app='))?.slice('--app='.length);
      // ...runAudit / runAuditJob, print the report to stdout as well as Telegram
    }
```

`--dry-run` prints the report and writes neither the ledger nor an MR.

- [ ] **Step 6: Run the suite**

Run: `bun test ./test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/audit/job.ts src/audit/run.ts bin/autofix.ts src/config.ts test
git commit -m "feat(audit): the audit command

Apps run sequentially, lanes concurrently within an app, and the worktree is
removed in a finally. One app failing does not stop the sweep and one message
goes out per run, not per app."
```

---

### Task 10: Scheduling and doctor

**Files:**
- Modify: `src/setup/plist.ts` — a calendar variant
- Modify: `src/setup/init.ts` — write the second plist
- Modify: `src/setup/doctor.ts` — three checks
- Test: `test/setup.test.ts`

**Interfaces:**
- Produces: `renderAuditPlist(input: AuditPlistInput): string`.

- [ ] **Step 1: Write the failing plist tests**

```ts
test('the audit job is a one-shot on a calendar, not a KeepAlive listener', () => {
  const xml = renderAuditPlist(INPUT);
  expect(xml).toContain('<key>StartCalendarInterval</key>');
  expect(xml).toContain('<key>Hour</key>');
  expect(xml).toContain('<integer>6</integer>');
  // KeepAlive on a program that exits restarts it in a loop.
  expect(xml).not.toContain('<key>KeepAlive</key>');
});

test('it runs audit --all, not daemon', () => {
  expect(renderAuditPlist(INPUT)).toContain('<string>audit</string>');
  expect(renderAuditPlist(INPUT)).not.toContain('<string>daemon</string>');
});

test('its logs do not collide with the daemon logs', () => {
  const xml = renderAuditPlist(INPUT);
  expect(xml).toContain('audit.log');
  expect(xml).not.toContain('daemon.log');
});
```

- [ ] **Step 2: Run them, implement, run them again**

Run: `bun test ./test/setup.test.ts -t plist`
Reuse `daemonPath` and `xmlEscape` unchanged. Expected after: PASS.

- [ ] **Step 3: Write the failing doctor tests**

```ts
// Read on 2026-08-19: seo/APC/AEO on git.avada.net, blogs/img-opt on gitlab.com.
// Two of five legitimately still live on gitlab.com, so the check records the host
// and flags a CHANGE rather than asserting one correct host.
test('a remote host change since the last check is flagged', () => {
  const r = checkRemotes({previous: {seo: 'gitlab.com'}, current: {seo: 'git.avada.net'}});
  expect(r.changed).toEqual(['seo']);
});

test('a stale base branch is reported as ambiguous, not as an error', () => {
  const r = describeBaseAge({repo: 'blogs', ageDays: 45});
  expect(r).toContain('45');
  // A dead mirror and a quiet repo look identical from here; say so.
  expect(r).toMatch(/quiet|không phân biệt|cannot tell/i);
});

test('doctor refuses to call MRs ready without a non-interactive push credential', () => {
  const r = checkPushCredential({mrEnabled: true, helpers: ['osxkeychain'], canPush: false});
  expect(r.ok).toBe(false);
});
```

- [ ] **Step 4: Run them, implement, run them again**

Run: `bun test ./test/setup.test.ts -t doctor`

The push-credential check only runs when `AUDIT_MR_ENABLED=true`, and never puts a credential on a command line. Expected after: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/setup test/setup.test.ts
git commit -m "feat(audit): 06:00 launchd job and three doctor checks

A calendar one-shot, not a KeepAlive listener -- KeepAlive on a program that
exits restarts it in a loop. doctor records each repo's remote host and flags a
change rather than asserting one correct host: two of the five legitimately
still live on gitlab.com. It also reports the age of origin/<base>, because a
dead mirror and a quiet repo look identical and the audit would silently scan
last month's code."
```

---

### Task 11: Documentation

**Files:**
- Modify: `README.md`
- Modify: `../../jobs/security/security.md` — the `## Progress` table
- Test: none. Verified by reading.

- [ ] **Step 1: Write the README section**

A `## The daily audit` section: what it does, what it will and will not do, how to run it by hand (`bun run bin/autofix.ts audit --all --dry-run`), the `AUDIT_*` vars, and how to turn the MR lane on. Correct the existing "over SSH" claim at `README.md:61` — the remotes are HTTPS across two hosts.

- [ ] **Step 2: Mark the brief complete**

Fill in the `## Progress` table in the brief: rounds used, security verdict and notes per task.

- [ ] **Step 3: Run the full verification and paste the output**

```bash
bun test ./test
bun run typecheck
```

No claim of "passing" without the output in front of you.

- [ ] **Step 4: Commit**

```bash
git add README.md ../../jobs/security/security.md
git commit -m "docs(autofix): the daily audit, and fix the SSH claim in the README"
```

---

## Self-Review

**Spec coverage.** Lane A → Task 5. Lane B eslint → Task 3, triage → Task 6, knip flag → Task 2 (field) and Task 9 (read). Lane C → Task 7. Ledger → Task 4. Report → Task 7. MRs → Task 8. Scheduling → Task 10. Configuration → Tasks 2, 9. Failure handling → Tasks 3, 5, 7, 9. Testing → every task. Known gaps: `blogs` skills gap asserted in Task 7, remote drift in Task 10, cost reported in Task 7. The prod-error switch-off, added to the spec's intro on 2026-08-19, is Task 1.

**Placeholders.** None. Tasks 5, 6, 8 and 9 describe prompt and orchestration bodies in prose rather than pasting them — the tests pin the observable contract, and a prompt written blind here would be rewritten during execution anyway.

**Type consistency.** `LintFinding` (Task 3) feeds `AuditFinding` (Task 4) and `runTriage` (Task 6). `SecurityFinding` (Task 5) feeds `renderReport` (Task 7) and `runMrLane` (Task 8). `findingFp` (Task 4) is the only id used across tasks. `AlertStatus` gains `fix_disabled` in Task 1 and is not touched again.
