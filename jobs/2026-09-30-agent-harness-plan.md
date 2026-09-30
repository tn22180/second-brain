# Agent Harness (step 1: contract + verifier + gate + ledger) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every agent run that wants to leave the machine (MR today; message/deploy later) must first pass an independent verifier bound to the exact diff, and every run lands in a ledger that says whether the agent's "done" was true.

**Architecture:** New Bun/TS package `tools/agent-harness/`. A run is described by a JSON *contract* written before the agent starts (goal, worktree, allowed files, postcondition commands). `harness verify` runs the checks itself (scope → commands → reproduce → security), writes a *verdict* carrying a sha256 of the staged diff, records it in a SQLite ledger and DMs Tuan on Telegram. The first consumer is the `jira-fix` skill: its `open-mr.mjs` refuses to push unless given a passing verdict whose `diffSha` equals the diff it is about to commit. The generic pieces already proven in `prod-error-autofix` (process runner, `reproduceCheck`, `securityGate`, `spawnClaude`) are imported, not copied.

**Tech Stack:** Bun 1.x, TypeScript, `bun:sqlite`, `bun test`; Node 22 + `node:test` for the jira-fix side (it is plain `.mjs`, no deps).

**Spec:** this conversation's agreed design (2026-09-30), summarised here because no separate spec file exists:
- Harness = 4 parts: task contract written before the run · verifier independent of the agent · gate (nothing leaves without verify pass + Tuan's approval) · ledger.
- JEV (`jev supervise`) is for fast supervision decisions only and is **never** the verifier. JEV + the loop are step 2, not this plan.
- Pilot on `jira-fix` only. Metric: share of runs where the agent claimed done but the verifier failed.
- Do not build a fifth fix system; reuse autofix's verify/security code.
- Alerts go to Tuan's personal Telegram DM only (Hermes bot → chat 1178722633), never a group.

## Global Constraints

- Package lives at `/Users/nguyentuan/Documents/second-brain/tools/agent-harness/`. Imports from `../prod-error-autofix/src/...` by relative path — no copy, no npm publish. (Second consumer; extract into a shared package only when a third appears.)
- Fail closed everywhere: a thrown error, timeout, missing file or unparseable output is a failed check, never a pass.
- Security review unavailable = block (autofix's `REVIEW_UNAVAILABLE_IS_A_BLOCK = true` semantics).
- Telegram: token read at send time from `~/.hermes/.env` var `TELEGRAM_BOT_TOKEN`, chat `1178722633`. Never print, log or persist the token. A failed notify never fails the verify.
- Never `git push`, deploy or post to Jira/Slack from the harness. Only `open-mr.mjs` pushes, and only after the gate.
- Ledger path default `~/.cache/agent-harness/ledger.db`, overridable by `AGENT_HARNESS_DB` (tests use a temp path).
- Comments: why only, per `~/.claude/CLAUDE.md`. Code/comments in English; jira-fix `.mjs` user-facing strings stay Vietnamese like the rest of that skill.
- `~/.claude/skills/jira-fix/` is not a git repo (second-brain mirrors it nightly). Its changes are verified by `node --test`, not committed from there.

## Review Focus

1. **Agent edits after verify** — the verdict must stop matching. `open-mr.mjs` recomputes the staged-diff sha and refuses on mismatch (Task 6 test `rejects a verdict whose diffSha does not match`).
2. **Brand-new untracked test file** — must be inside the hashed diff and the scope check, not silently skipped (Task 2 test `includes untracked files in changed and sha`).
3. **A postcondition command that hangs** — must end as a failed check at its timeout, not hang the harness (Task 3 test `timed-out command fails the check`).
4. **Claude down during security review** — must block, not pass (Task 3 test `security review unavailable blocks`).
5. **Allow entry that is a directory** — files under it pass scope, a sibling outside fails, and an empty diff fails (Task 2 tests `directory allow entry`, `empty diff fails scope`).

---

## File Structure

```
tools/agent-harness/
  package.json
  tsconfig.json
  src/contract.ts      Contract type, parseContract() — validation only
  src/git.ts           stagedDiff(): changed files + sha256 of `git diff --cached --binary`; inScope()
  src/verify.ts        verify(): runs the checks in order, returns Verdict
  src/ledger.ts        openLedger(), recordVerdict(), recordDecision(), stats()
  src/notify.ts        notifyTelegram() — Hermes bot DM, token read at send time
  bin/harness.ts       CLI: verify | decide | stats
  test/helpers.ts      makeRepo() temp git repo
  test/contract.test.ts
  test/git.test.ts
  test/verify.test.ts
  test/ledger.test.ts
  test/cli.test.ts
~/.claude/skills/jira-fix/
  scripts/lib/verdict.mjs        checkVerdict() pure + stagedDiffSha()
  scripts/open-mr.mjs            + required --verdict (non-dry-run)
  test/verdict.test.mjs
  references/workflow.md         Phase 4 writes contract.json, Phase 6 runs harness verify
  references/contract.example.json
```

---

### Task 1: Package scaffold + contract

**Files:**
- Create: `tools/agent-harness/package.json`, `tools/agent-harness/tsconfig.json`, `tools/agent-harness/src/contract.ts`
- Test: `tools/agent-harness/test/contract.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface VerifyCommand { name: string; cmd: string[]; timeoutMs?: number }
  export interface Contract {
    id: string; source: string; goal: string;
    repoPath: string;            // absolute worktree path
    allow: string[];             // files/dirs (dir entries end with '/') the diff may touch
    verify: VerifyCommand[];     // postconditions, each must exit 0
    reproduce?: { testCmd: string[] };            // new tests must FAIL with source stashed
    security?: { appName: string; model?: string };
  }
  export function parseContract(raw: unknown): { ok: true; contract: Contract } | { ok: false; error: string }
  ```

- [ ] **Step 1: Scaffold**

`tools/agent-harness/package.json`:
```json
{
  "name": "agent-harness",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Contract + independent verifier + diff-bound gate + ledger for agent runs.",
  "scripts": { "test": "bun test", "typecheck": "tsc --noEmit", "harness": "bun run bin/harness.ts" },
  "devDependencies": { "@types/bun": "^1.1.14", "typescript": "^5.7.2" }
}
```
`tools/agent-harness/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ESNext", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true, "types": ["bun-types"]
  },
  "include": ["src", "bin", "test"]
}
```
Run: `~/.bun/bin/bun install --cwd /Users/nguyentuan/Documents/second-brain/tools/agent-harness`

- [ ] **Step 2: Write the failing test**

`test/contract.test.ts`:
```ts
import {describe, expect, test} from 'bun:test';
import {parseContract} from '../src/contract';

const base = {
  id: 'FAL-720-g1', source: 'jira-fix', goal: 'bind integration key to shop',
  repoPath: '/tmp/wt/apc-FAL-720', allow: ['packages/functions/src/a.js'],
  verify: [{name: 'jest', cmd: ['npx', 'jest', '--ci', 'a.test.js']}]
};

describe('parseContract', () => {
  test('accepts a minimal contract', () => {
    const r = parseContract(base);
    expect(r.ok).toBe(true);
  });
  test('rejects a contract with no postcondition', () => {
    const r = parseContract({...base, verify: []});
    expect(r).toEqual({ok: false, error: 'verify: at least one postcondition command is required'});
  });
  test('rejects empty allow', () => {
    expect(parseContract({...base, allow: []}).ok).toBe(false);
  });
  test('rejects relative repoPath', () => {
    expect(parseContract({...base, repoPath: 'wt/x'}).ok).toBe(false);
  });
  test('rejects id with path characters', () => {
    expect(parseContract({...base, id: '../x'}).ok).toBe(false);
  });
  test('rejects a command given as a shell string', () => {
    expect(parseContract({...base, verify: [{name: 'x', cmd: 'npx jest'}]}).ok).toBe(false);
  });
  test('rejects allow entries escaping the repo', () => {
    expect(parseContract({...base, allow: ['../secrets.env']}).ok).toBe(false);
    expect(parseContract({...base, allow: ['/etc/passwd']}).ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run it, expect FAIL** (`Cannot find module '../src/contract'`)

Run: `~/.bun/bin/bun test --cwd /Users/nguyentuan/Documents/second-brain/tools/agent-harness test/contract.test.ts`

- [ ] **Step 4: Implement `src/contract.ts`**

```ts
import {isAbsolute} from 'node:path';

export interface VerifyCommand { name: string; cmd: string[]; timeoutMs?: number }
export interface Contract {
  id: string;
  source: string;
  goal: string;
  repoPath: string;
  allow: string[];
  verify: VerifyCommand[];
  reproduce?: {testCmd: string[]};
  security?: {appName: string; model?: string};
}

type Parsed = {ok: true; contract: Contract} | {ok: false; error: string};

const isStrArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string' && x.length > 0);

/**
 * A contract is written before the agent runs, so the agent cannot move its own goalposts.
 * Validation only — no defaults are invented here: a missing postcondition is an error,
 * because "no check" is exactly the silent pass this harness exists to prevent.
 */
export function parseContract(raw: unknown): Parsed {
  const c = raw as Partial<Contract> | null;
  if (!c || typeof c !== 'object') return {ok: false, error: 'contract must be an object'};
  // The id becomes a file name and a ledger key.
  if (typeof c.id !== 'string' || !/^[A-Za-z0-9._-]+$/.test(c.id) || c.id.includes('..')) {
    return {ok: false, error: 'id: [A-Za-z0-9._-]+ only'};
  }
  for (const k of ['source', 'goal'] as const) {
    if (typeof c[k] !== 'string' || !c[k]) return {ok: false, error: `${k}: required`};
  }
  if (typeof c.repoPath !== 'string' || !isAbsolute(c.repoPath)) {
    return {ok: false, error: 'repoPath: absolute path required'};
  }
  if (!isStrArray(c.allow)) return {ok: false, error: 'allow: at least one path required'};
  if (c.allow.some(p => isAbsolute(p) || p.split('/').includes('..'))) {
    return {ok: false, error: 'allow: repo-relative paths only'};
  }
  if (!Array.isArray(c.verify) || c.verify.length === 0) {
    return {ok: false, error: 'verify: at least one postcondition command is required'};
  }
  for (const v of c.verify) {
    // argv, never a shell string: the contract is data and must not smuggle a pipeline.
    if (!v || typeof v.name !== 'string' || !v.name || !isStrArray(v.cmd)) {
      return {ok: false, error: 'verify: each entry needs name and cmd as a non-empty string array'};
    }
  }
  if (c.reproduce !== undefined && !isStrArray(c.reproduce?.testCmd)) {
    return {ok: false, error: 'reproduce.testCmd: string array required'};
  }
  if (c.security !== undefined && (typeof c.security?.appName !== 'string' || !c.security.appName)) {
    return {ok: false, error: 'security.appName: required'};
  }
  return {ok: true, contract: c as Contract};
}
```

- [ ] **Step 5: Run it, expect PASS (7 tests)**

- [ ] **Step 6: Commit**
```bash
git -C /Users/nguyentuan/Documents/second-brain add tools/agent-harness/package.json tools/agent-harness/tsconfig.json tools/agent-harness/bun.lock tools/agent-harness/src/contract.ts tools/agent-harness/test/contract.test.ts
git -C /Users/nguyentuan/Documents/second-brain commit -m "feat(agent-harness): task contract with fail-closed validation"
```

---

### Task 2: Staged-diff identity + scope

**Files:**
- Create: `tools/agent-harness/src/git.ts`, `tools/agent-harness/test/helpers.ts`
- Test: `tools/agent-harness/test/git.test.ts`

**Interfaces:**
- Consumes: `Runner`, `spawnRunner` from `../../prod-error-autofix/src/gcloud/run` (`(args: string[], timeoutMs: number, opts?: {cwd?: string}) => Promise<{code, stdout, stderr, timedOut}>`)
- Produces:
  ```ts
  export interface StagedDiff { changed: string[]; sha: string; diff: string }
  export async function stagedDiff(repoPath: string, allow: string[], runner?: Runner): Promise<StagedDiff>
  export function inScope(file: string, allow: string[]): boolean
  ```
  `sha` = sha256 hex of `git diff --cached --binary` after `git add -- <allow>`; the index is reset afterwards. `open-mr.mjs` (Task 6) computes the same bytes the same way.

- [ ] **Step 1: Test helper `test/helpers.ts`**

```ts
import {mkdtempSync, writeFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';

export function sh(cwd: string, ...args: string[]) {
  const r = Bun.spawnSync(args, {cwd});
  if (r.exitCode !== 0) throw new Error(`${args.join(' ')}: ${r.stderr.toString()}`);
  return r.stdout.toString();
}

export function write(root: string, rel: string, body: string) {
  mkdirSync(dirname(join(root, rel)), {recursive: true});
  writeFileSync(join(root, rel), body);
}

/** A committed repo with src/a.js and src/b.js. */
export function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'harness-'));
  sh(dir, 'git', 'init', '-q', '-b', 'master');
  sh(dir, 'git', 'config', 'user.email', 't@t');
  sh(dir, 'git', 'config', 'user.name', 't');
  write(dir, 'src/a.js', 'module.exports = 1;\n');
  write(dir, 'src/b.js', 'module.exports = 2;\n');
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-qm', 'init');
  return dir;
}
```

- [ ] **Step 2: Write the failing test `test/git.test.ts`**

```ts
import {describe, expect, test} from 'bun:test';
import {inScope, stagedDiff} from '../src/git';
import {makeRepo, sh, write} from './helpers';

describe('inScope', () => {
  test('exact file', () => expect(inScope('src/a.js', ['src/a.js'])).toBe(true));
  test('directory allow entry', () => {
    expect(inScope('src/__tests__/a.test.js', ['src/__tests__/'])).toBe(true);
    expect(inScope('src/__testsX/a.js', ['src/__tests__/'])).toBe(false);
  });
  test('sibling outside', () => expect(inScope('src/b.js', ['src/a.js'])).toBe(false));
});

describe('stagedDiff', () => {
  test('includes untracked files in changed and sha', async () => {
    const repo = makeRepo();
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    write(repo, 'src/__tests__/a.test.js', 'test("x",()=>{});\n');
    const d = await stagedDiff(repo, ['src/a.js', 'src/__tests__/']);
    expect(d.changed.sort()).toEqual(['src/__tests__/a.test.js', 'src/a.js']);
    expect(d.sha).toMatch(/^[0-9a-f]{64}$/);
    // index left clean for the next step (open-mr does its own add)
    expect(sh(repo, 'git', 'diff', '--cached', '--name-only')).toBe('');
  });
  test('changes outside allow are not staged or hashed', async () => {
    const repo = makeRepo();
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    const before = await stagedDiff(repo, ['src/a.js']);
    write(repo, 'src/b.js', 'module.exports = 9;\n');
    const after = await stagedDiff(repo, ['src/a.js']);
    expect(after.sha).toBe(before.sha);
    expect(after.changed).toEqual(['src/a.js']);
  });
  test('an edit after hashing changes the sha', async () => {
    const repo = makeRepo();
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    const one = await stagedDiff(repo, ['src/a.js']);
    write(repo, 'src/a.js', 'module.exports = 4;\n');
    const two = await stagedDiff(repo, ['src/a.js']);
    expect(two.sha).not.toBe(one.sha);
  });
  test('empty diff returns no changed files', async () => {
    const repo = makeRepo();
    const d = await stagedDiff(repo, ['src/a.js']);
    expect(d.changed).toEqual([]);
  });
});
```

- [ ] **Step 3: Run, expect FAIL** (`Cannot find module '../src/git'`)

- [ ] **Step 4: Implement `src/git.ts`**

```ts
import {createHash} from 'node:crypto';
import {spawnRunner, type Runner} from '../../prod-error-autofix/src/gcloud/run';

const GIT_TIMEOUT = 60_000;

export interface StagedDiff { changed: string[]; sha: string; diff: string }

export function inScope(file: string, allow: string[]): boolean {
  return allow.some(a => (a.endsWith('/') ? file.startsWith(a) : file === a));
}

/**
 * The diff exactly as `open-mr.mjs` will commit it: `git add -- <allow>` then
 * `git diff --cached --binary`. Hashing the staged form (not `git diff HEAD`) is what
 * pulls brand-new test files in — `git diff HEAD` never shows untracked files.
 * The index is reset afterwards so open-mr starts from the same clean state.
 */
export async function stagedDiff(repoPath: string, allow: string[], runner: Runner = spawnRunner): Promise<StagedDiff> {
  const git = async (args: string[]) => {
    const r = await runner(['git', ...args], GIT_TIMEOUT, {cwd: repoPath});
    if (r.code !== 0 || r.timedOut) throw new Error(`git ${args[0]} failed: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
    return r.stdout;
  };
  // `git add` aborts on a pathspec that matches nothing, and an allowed-but-untouched new
  // file is legal. Keep entries that exist on disk or are tracked (a tracked, deleted file
  // must still be staged as a deletion).
  const present: string[] = [];
  for (const a of allow) {
    if (existsSync(join(repoPath, a))) { present.push(a); continue; }
    const r = await runner(['git', 'ls-files', '--error-unmatch', '--', a], GIT_TIMEOUT, {cwd: repoPath});
    if (r.code === 0) present.push(a);
  }
  if (present.length) await git(['add', '-A', '--', ...present]);
  try {
    const diff = await git(['diff', '--cached', '--binary']);
    const names = await git(['diff', '--cached', '--name-only']);
    return {
      changed: names.split('\n').map(s => s.trim()).filter(Boolean),
      sha: createHash('sha256').update(diff).digest('hex'),
      diff
    };
  } finally {
    await git(['reset', '-q']);
  }
}
```

Add to the imports of `src/git.ts`: `import {existsSync} from 'node:fs';` and `import {join} from 'node:path';`.

- [ ] **Step 5: Run, expect PASS (7 tests).**

- [ ] **Step 6: Commit**
```bash
git -C /Users/nguyentuan/Documents/second-brain add tools/agent-harness/src/git.ts tools/agent-harness/test/helpers.ts tools/agent-harness/test/git.test.ts
git -C /Users/nguyentuan/Documents/second-brain commit -m "feat(agent-harness): staged-diff sha and scope check"
```

---

### Task 3: Verifier

**Files:**
- Create: `tools/agent-harness/src/verify.ts`
- Test: `tools/agent-harness/test/verify.test.ts`

**Interfaces:**
- Consumes: `Contract` (Task 1); `stagedDiff`, `inScope` (Task 2); from autofix: `reproduceCheck(input:{repoPath,testCmd,sourceFiles,testFiles,timeoutMs}, runner) => Promise<{ran,ok,suiteLevelOnly,detail}>` (`src/verify/smoke.ts`), `securityGate(input:{diff,repoPath,appName,rootCause,model,timeoutMs}, deps:{claude?}) => Promise<{ok,failure,findings,reviewed,costUsd,detail}>` (`src/verify/security.ts`), `ClaudeRunner` (`src/agent/claudeCli.ts`).
- Produces:
  ```ts
  export interface Check { name: string; ok: boolean; detail?: string }
  export interface Verdict {
    contractId: string; runId: string; at: number; pass: boolean;
    diffSha: string; changed: string[]; checks: Check[]; costUsd: number;
  }
  export interface VerifyDeps { runner?: Runner; claude?: ClaudeRunner; now?: () => number }
  export async function verify(contract: Contract, deps?: VerifyDeps): Promise<Verdict>
  export const isTestFile: (f: string) => boolean
  ```

Order: `scope` → each `verify[]` command → `reproduce` (if set) → `security` (if set). A failing `scope` stops the run (nothing else is meaningful on the wrong diff); later checks all run so the verdict shows every failure at once.

- [ ] **Step 1: Write the failing test `test/verify.test.ts`**

```ts
import {describe, expect, test} from 'bun:test';
import {verify} from '../src/verify';
import type {Contract} from '../src/contract';
import {makeRepo, write} from './helpers';

const contractFor = (repoPath: string, over: Partial<Contract> = {}): Contract => ({
  id: 'T-1', source: 'test', goal: 'change a', repoPath,
  allow: ['src/a.js'], verify: [{name: 'true', cmd: ['true']}], ...over
});

describe('verify', () => {
  test('passes when scope and commands pass', async () => {
    const repo = makeRepo();
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    const v = await verify(contractFor(repo));
    expect(v.pass).toBe(true);
    expect(v.checks.map(c => c.name)).toEqual(['scope', 'true']);
    expect(v.diffSha).toMatch(/^[0-9a-f]{64}$/);
  });

  test('empty diff fails scope', async () => {
    const v = await verify(contractFor(makeRepo()));
    expect(v.pass).toBe(false);
    expect(v.checks[0]).toMatchObject({name: 'scope', ok: false});
  });

  test('allow entry naming a dir without trailing slash fails scope and stops', async () => {
    const repo = makeRepo();
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    // `git add src` stages the whole dir, but inScope treats 'src' as an exact file —
    // the ambiguity must fail closed, and no command may run on an unapproved diff.
    const v = await verify(contractFor(repo, {allow: ['src'], verify: [{name: 'never', cmd: ['false']}]}));
    expect(v.checks).toEqual([{name: 'scope', ok: false, detail: 'outside allow: src/a.js'}]);
  });

  test('failing command fails the verdict but later checks still run', async () => {
    const repo = makeRepo();
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    const v = await verify(contractFor(repo, {verify: [{name: 'no', cmd: ['false']}, {name: 'yes', cmd: ['true']}]}));
    expect(v.pass).toBe(false);
    expect(v.checks.map(c => [c.name, c.ok])).toEqual([['scope', true], ['no', false], ['yes', true]]);
  });

  test('timed-out command fails the check', async () => {
    const repo = makeRepo();
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    const v = await verify(contractFor(repo, {verify: [{name: 'hang', cmd: ['sleep', '5'], timeoutMs: 200}]}));
    expect(v.checks[1]).toMatchObject({name: 'hang', ok: false});
    expect(v.checks[1].detail).toContain('timed out');
  });

  test('security review unavailable blocks', async () => {
    const repo = makeRepo();
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    const claude = async () => ({ok: false, text: '', costUsd: undefined, numTurns: undefined, sessionId: undefined,
      permissionDenials: [], failure: 'timeout' as const, detail: 'timeout'});
    const v = await verify(contractFor(repo, {security: {appName: 'APC'}}), {claude});
    expect(v.pass).toBe(false);
    expect(v.checks.at(-1)).toMatchObject({name: 'security', ok: false});
  });

  test('a throwing runner is a failed check, not a crash', async () => {
    const repo = makeRepo();
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    const real = (await import('../../prod-error-autofix/src/gcloud/run')).spawnRunner;
    let calls = 0;
    const runner = async (args: string[], t: number, o?: {cwd?: string}) => {
      if (args[0] !== 'git' && ++calls) throw new Error('spawn ENOENT');
      return real(args, t, o);
    };
    const v = await verify(contractFor(repo), {runner});
    expect(v.pass).toBe(false);
    expect(v.checks[1]).toMatchObject({name: 'true', ok: false});
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`Cannot find module '../src/verify'`)

- [ ] **Step 3: Implement `src/verify.ts`**

```ts
import {randomUUID} from 'node:crypto';
import {spawnRunner, type Runner} from '../../prod-error-autofix/src/gcloud/run';
import {reproduceCheck} from '../../prod-error-autofix/src/verify/smoke';
import {securityGate} from '../../prod-error-autofix/src/verify/security';
import {spawnClaude, type ClaudeRunner} from '../../prod-error-autofix/src/agent/claudeCli';
import type {Contract} from './contract';
import {inScope, stagedDiff} from './git';

export interface Check { name: string; ok: boolean; detail?: string }
export interface Verdict {
  contractId: string; runId: string; at: number; pass: boolean;
  diffSha: string; changed: string[]; checks: Check[]; costUsd: number;
}
export interface VerifyDeps { runner?: Runner; claude?: ClaudeRunner; now?: () => number }

const DEFAULT_CMD_TIMEOUT = 15 * 60_000;
const SECURITY_TIMEOUT = 20 * 60_000;

export const isTestFile = (f: string) => /(^|\/)__tests__\/|\.(test|spec)\.[cm]?[jt]sx?$/.test(f);

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/**
 * Runs the contract's checks itself — the agent's own "tests pass" is a claim, this is the
 * evidence. Every failure mode (throw, timeout, bad output) becomes `ok: false`.
 */
export async function verify(contract: Contract, deps: VerifyDeps = {}): Promise<Verdict> {
  const runner = deps.runner ?? spawnRunner;
  const now = deps.now ?? Date.now;
  const checks: Check[] = [];
  let costUsd = 0;
  const verdict = (diffSha: string, changed: string[]): Verdict => ({
    contractId: contract.id, runId: `${contract.id}-${randomUUID().slice(0, 8)}`, at: now(),
    pass: checks.length > 0 && checks.every(c => c.ok), diffSha, changed, checks, costUsd
  });

  let staged;
  try {
    staged = await stagedDiff(contract.repoPath, contract.allow);
  } catch (e) {
    checks.push({name: 'scope', ok: false, detail: errMsg(e)});
    return verdict('', []);
  }
  const stray = staged.changed.filter(f => !inScope(f, contract.allow));
  if (!staged.changed.length || stray.length) {
    checks.push({name: 'scope', ok: false, detail: stray.length ? `outside allow: ${stray.join(', ')}` : 'empty diff'});
    return verdict(staged.sha, staged.changed);
  }
  checks.push({name: 'scope', ok: true, detail: `${staged.changed.length} file(s)`});

  for (const v of contract.verify) {
    const timeoutMs = v.timeoutMs ?? DEFAULT_CMD_TIMEOUT;
    try {
      const r = await runner(v.cmd, timeoutMs, {cwd: contract.repoPath});
      const ok = r.code === 0 && !r.timedOut;
      checks.push({
        name: v.name, ok,
        detail: r.timedOut ? `timed out after ${timeoutMs}ms` : ok ? undefined : (r.stderr || r.stdout).trim().slice(-300)
      });
    } catch (e) {
      checks.push({name: v.name, ok: false, detail: errMsg(e)});
    }
  }

  if (contract.reproduce) {
    const testFiles = staged.changed.filter(isTestFile);
    const sourceFiles = staged.changed.filter(f => !isTestFile(f));
    try {
      const r = await reproduceCheck(
        {repoPath: contract.repoPath, testCmd: [...contract.reproduce.testCmd, ...testFiles], sourceFiles, testFiles, timeoutMs: DEFAULT_CMD_TIMEOUT},
        runner
      );
      checks.push({name: 'reproduce', ok: r.ran && r.ok, detail: r.detail});
    } catch (e) {
      checks.push({name: 'reproduce', ok: false, detail: errMsg(e)});
    }
  }

  if (contract.security) {
    try {
      const s = await securityGate(
        {diff: staged.diff, repoPath: contract.repoPath, appName: contract.security.appName,
          rootCause: contract.goal, model: contract.security.model ?? 'opus', timeoutMs: SECURITY_TIMEOUT},
        {claude: deps.claude ?? spawnClaude}
      );
      costUsd += s.costUsd ?? 0;
      checks.push({
        name: 'security', ok: s.ok,
        detail: s.ok ? undefined : `${s.failure}: ${s.findings.map(f => `${f.rule} ${f.file}:${f.line}`).join('; ') || s.detail || ''}`
      });
    } catch (e) {
      checks.push({name: 'security', ok: false, detail: errMsg(e)});
    }
  }

  return verdict(staged.sha, staged.changed);
}
```

- [ ] **Step 4: Run, expect PASS (7 tests).** If `security review unavailable blocks` passes for the wrong reason (e.g. `patterns`), print `v.checks.at(-1).detail` and confirm it starts with `review_unavailable`; add `expect(v.checks.at(-1)!.detail).toStartWith('review_unavailable')`.

- [ ] **Step 5: Typecheck** — `~/.bun/bin/bun run --cwd /Users/nguyentuan/Documents/second-brain/tools/agent-harness typecheck` → no errors.

- [ ] **Step 6: Commit**
```bash
git -C /Users/nguyentuan/Documents/second-brain add tools/agent-harness/src/verify.ts tools/agent-harness/test/verify.test.ts
git -C /Users/nguyentuan/Documents/second-brain commit -m "feat(agent-harness): independent verifier, fail-closed checks"
```

---

### Task 4: Ledger

**Files:**
- Create: `tools/agent-harness/src/ledger.ts`
- Test: `tools/agent-harness/test/ledger.test.ts`

**Interfaces:**
- Consumes: `Verdict` (Task 3), `Contract` (Task 1)
- Produces:
  ```ts
  export type Decision = 'approved' | 'rejected';
  export interface Stats { runs: number; claimedDone: number; falseDone: number; falseDoneRate: number | null; passed: number; approved: number; rejected: number }
  export function openLedger(path?: string): Ledger
  export class Ledger {
    recordVerdict(v: Verdict, c: Contract, claimedDone: boolean): void
    recordDecision(runId: string, d: Decision, at?: number): boolean   // false = unknown runId
    stats(sinceMs: number): Stats
    close(): void
  }
  ```

- [ ] **Step 1: Write the failing test `test/ledger.test.ts`**

```ts
import {describe, expect, test} from 'bun:test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openLedger} from '../src/ledger';
import type {Verdict} from '../src/verify';
import type {Contract} from '../src/contract';

const c: Contract = {id: 'T-1', source: 'jira-fix', goal: 'g', repoPath: '/x', allow: ['a'], verify: [{name: 'n', cmd: ['true']}]};
const v = (runId: string, pass: boolean, at = 1000): Verdict =>
  ({contractId: 'T-1', runId, at, pass, diffSha: 'ab', changed: ['a'], checks: [{name: 'scope', ok: pass}], costUsd: 0.5});
const db = () => openLedger(join(mkdtempSync(join(tmpdir(), 'ledger-')), 'l.db'));

describe('ledger', () => {
  test('false-done = claimed done but verifier failed', () => {
    const l = db();
    l.recordVerdict(v('r1', true), c, true);
    l.recordVerdict(v('r2', false), c, true);
    l.recordVerdict(v('r3', false), c, false);
    expect(l.stats(0)).toMatchObject({runs: 3, claimedDone: 2, falseDone: 1, falseDoneRate: 0.5, passed: 1});
  });
  test('rate is null with no claimed runs', () => {
    expect(db().stats(0).falseDoneRate).toBeNull();
  });
  test('decision on unknown run returns false', () => {
    expect(db().recordDecision('nope', 'approved')).toBe(false);
  });
  test('decisions counted, window respected', () => {
    const l = db();
    l.recordVerdict(v('old', true, 10), c, true);
    l.recordVerdict(v('new', true, 5000), c, true);
    expect(l.recordDecision('new', 'approved', 5001)).toBe(true);
    expect(l.stats(1000)).toMatchObject({runs: 1, approved: 1, rejected: 0});
  });
  test('re-recording the same runId is refused', () => {
    const l = db();
    l.recordVerdict(v('r1', true), c, true);
    expect(() => l.recordVerdict(v('r1', false), c, true)).toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `src/ledger.ts`**

```ts
import {Database} from 'bun:sqlite';
import {mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import type {Contract} from './contract';
import type {Verdict} from './verify';

export type Decision = 'approved' | 'rejected';
export interface Stats {
  runs: number; claimedDone: number; falseDone: number; falseDoneRate: number | null;
  passed: number; approved: number; rejected: number;
}

export const defaultLedgerPath = () =>
  process.env.AGENT_HARNESS_DB || join(homedir(), '.cache', 'agent-harness', 'ledger.db');

export class Ledger {
  constructor(private db: Database) {
    db.run(`CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      source TEXT NOT NULL,
      goal TEXT NOT NULL,
      at_ms INTEGER NOT NULL,
      claimed_done INTEGER NOT NULL,
      pass INTEGER NOT NULL,
      diff_sha TEXT NOT NULL,
      changed_json TEXT NOT NULL,
      checks_json TEXT NOT NULL,
      cost_usd REAL NOT NULL,
      decision TEXT,
      decided_ms INTEGER
    )`);
  }

  recordVerdict(v: Verdict, c: Contract, claimedDone: boolean): void {
    // PRIMARY KEY makes a replayed verdict throw instead of silently rewriting history.
    this.db.run(
      `INSERT INTO runs (run_id, contract_id, source, goal, at_ms, claimed_done, pass, diff_sha, changed_json, checks_json, cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [v.runId, c.id, c.source, c.goal, v.at, claimedDone ? 1 : 0, v.pass ? 1 : 0, v.diffSha,
        JSON.stringify(v.changed), JSON.stringify(v.checks), v.costUsd]
    );
  }

  recordDecision(runId: string, d: Decision, at = Date.now()): boolean {
    const r = this.db.run(`UPDATE runs SET decision = ?, decided_ms = ? WHERE run_id = ?`, [d, at, runId]);
    return r.changes === 1;
  }

  stats(sinceMs: number): Stats {
    const row = this.db.query(
      `SELECT COUNT(*) runs,
              COALESCE(SUM(claimed_done), 0) claimed,
              COALESCE(SUM(claimed_done = 1 AND pass = 0), 0) falseDone,
              COALESCE(SUM(pass), 0) passed,
              COALESCE(SUM(decision = 'approved'), 0) approved,
              COALESCE(SUM(decision = 'rejected'), 0) rejected
       FROM runs WHERE at_ms >= ?`
    ).get(sinceMs) as {runs: number; claimed: number; falseDone: number; passed: number; approved: number; rejected: number};
    return {
      runs: row.runs, claimedDone: row.claimed, falseDone: row.falseDone,
      falseDoneRate: row.claimed ? row.falseDone / row.claimed : null,
      passed: row.passed, approved: row.approved, rejected: row.rejected
    };
  }

  close() { this.db.close(); }
}

export function openLedger(path = defaultLedgerPath()): Ledger {
  mkdirSync(dirname(path), {recursive: true});
  return new Ledger(new Database(path, {create: true}));
}
```

- [ ] **Step 4: Run, expect PASS (5 tests)**

- [ ] **Step 5: Commit**
```bash
git -C /Users/nguyentuan/Documents/second-brain add tools/agent-harness/src/ledger.ts tools/agent-harness/test/ledger.test.ts
git -C /Users/nguyentuan/Documents/second-brain commit -m "feat(agent-harness): run ledger with false-done rate"
```

---

### Task 5: CLI + Telegram DM

**Files:**
- Create: `tools/agent-harness/src/notify.ts`, `tools/agent-harness/bin/harness.ts`
- Test: `tools/agent-harness/test/cli.test.ts`

**Interfaces:**
- Consumes: `parseContract` (T1), `verify`, `Verdict` (T3), `openLedger` (T4)
- Produces (CLI, exit codes are the contract other scripts rely on):
  - `harness verify <contract.json> --out <verdict.json> [--claimed-done] [--no-notify]` → writes verdict JSON, records ledger, exit `0` pass / `1` fail / `2` bad contract or usage.
  - `harness decide <runId> approved|rejected` → exit `0` / `1` unknown runId / `2` usage.
  - `harness stats [--days N]` (default 30) → prints Stats JSON.
  - `export function formatVerdict(v: Verdict, goal: string): string` (Telegram text)
  - `export async function notifyTelegram(text: string, opts?: {envFile?: string; chatId?: string; fetchImpl?: typeof fetch}): Promise<boolean>`

- [ ] **Step 1: Write the failing test `test/cli.test.ts`**

```ts
import {describe, expect, test} from 'bun:test';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {makeRepo, write} from './helpers';
import {formatVerdict, notifyTelegram} from '../src/notify';

const BIN = resolve(import.meta.dir, '../bin/harness.ts');
const run = (args: string[], env: Record<string, string>) => {
  const r = Bun.spawnSync([process.execPath, 'run', BIN, ...args], {env: {...process.env, ...env}});
  return {code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString()};
};

describe('harness CLI', () => {
  test('verify → ledger → decide → stats', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cli-'));
    const env = {AGENT_HARNESS_DB: join(tmp, 'l.db')};
    const repo = makeRepo();
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    const cfile = join(tmp, 'c.json');
    writeFileSync(cfile, JSON.stringify({id: 'T-1', source: 'test', goal: 'g', repoPath: repo, allow: ['src/a.js'], verify: [{name: 'ok', cmd: ['true']}]}));
    const out = join(tmp, 'v.json');

    const v = run(['verify', cfile, '--out', out, '--claimed-done', '--no-notify'], env);
    expect(v.code).toBe(0);
    const verdict = JSON.parse(readFileSync(out, 'utf8'));
    expect(verdict.pass).toBe(true);

    expect(run(['decide', verdict.runId, 'approved'], env).code).toBe(0);
    expect(run(['decide', 'nope', 'approved'], env).code).toBe(1);
    const s = JSON.parse(run(['stats'], env).out);
    expect(s).toMatchObject({runs: 1, claimedDone: 1, falseDone: 0, approved: 1});
  });

  test('bad contract exits 2 and records nothing', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cli-'));
    const env = {AGENT_HARNESS_DB: join(tmp, 'l.db')};
    const cfile = join(tmp, 'c.json');
    writeFileSync(cfile, JSON.stringify({id: 'T-1', verify: []}));
    expect(run(['verify', cfile, '--out', join(tmp, 'v.json'), '--no-notify'], env).code).toBe(2);
    expect(JSON.parse(run(['stats'], env).out).runs).toBe(0);
  });

  test('failing verify exits 1', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cli-'));
    const repo = makeRepo();
    const cfile = join(tmp, 'c.json');
    writeFileSync(cfile, JSON.stringify({id: 'T-2', source: 'test', goal: 'g', repoPath: repo, allow: ['src/a.js'], verify: [{name: 'ok', cmd: ['true']}]}));
    expect(run(['verify', cfile, '--out', join(tmp, 'v.json'), '--no-notify'], {AGENT_HARNESS_DB: join(tmp, 'l.db')}).code).toBe(1);
  });
});

describe('notify', () => {
  test('format marks false-done loudly', () => {
    const text = formatVerdict({contractId: 'FAL-1-g1', runId: 'r', at: 0, pass: false, diffSha: 'x', changed: ['a'],
      checks: [{name: 'scope', ok: true}, {name: 'jest', ok: false, detail: '2 failed'}], costUsd: 0}, 'goal');
    expect(text).toContain('❌ FAL-1-g1');
    expect(text).toContain('jest: 2 failed');
  });
  test('reads token from env file, never returns it, false on HTTP error', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'n-'));
    const envFile = join(tmp, '.env');
    writeFileSync(envFile, 'OTHER=1\nTELEGRAM_BOT_TOKEN="abc:def"\n');
    let url = '';
    const ok = await notifyTelegram('hi', {envFile, chatId: '1', fetchImpl: (async (u: string) => { url = u; return new Response('{}', {status: 200}); }) as unknown as typeof fetch});
    expect(ok).toBe(true);
    expect(url).toBe('https://api.telegram.org/botabc:def/sendMessage');
    const bad = await notifyTelegram('hi', {envFile, chatId: '1', fetchImpl: (async () => new Response('', {status: 403})) as unknown as typeof fetch});
    expect(bad).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `src/notify.ts`**

```ts
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import type {Verdict} from './verify';

// Tuan's personal DM via the Hermes (work) bot — never a group chat (decided 2026-09-30).
const DEFAULT_ENV_FILE = join(homedir(), '.hermes', '.env');
const DEFAULT_CHAT_ID = '1178722633';

export function formatVerdict(v: Verdict, goal: string): string {
  const head = `${v.pass ? '✅' : '❌'} ${v.contractId} — ${goal}`;
  const lines = v.checks.map(c => `${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
  return [head, ...lines, `files: ${v.changed.length} · run ${v.runId}`].join('\n');
}

function readVar(envFile: string, name: string): string | undefined {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0 && line.slice(0, eq).trim() === name) return line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

/** Best effort: returns false instead of throwing, and never includes the token in anything it returns or logs. */
export async function notifyTelegram(
  text: string,
  opts: {envFile?: string; chatId?: string; fetchImpl?: typeof fetch} = {}
): Promise<boolean> {
  try {
    const token = readVar(opts.envFile ?? DEFAULT_ENV_FILE, 'TELEGRAM_BOT_TOKEN');
    if (!token) return false;
    const res = await (opts.fetchImpl ?? fetch)(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({chat_id: opts.chatId ?? DEFAULT_CHAT_ID, text}),
      signal: AbortSignal.timeout(15_000)
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Implement `bin/harness.ts`**

```ts
#!/usr/bin/env bun
import {readFileSync, writeFileSync} from 'node:fs';
import {parseContract} from '../src/contract';
import {openLedger, type Decision} from '../src/ledger';
import {formatVerdict, notifyTelegram} from '../src/notify';
import {verify} from '../src/verify';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (n: string) => rest.includes(`--${n}`);
const opt = (n: string) => { const i = rest.indexOf(`--${n}`); return i > -1 ? rest[i + 1] : undefined; };
const usage = (msg: string): never => { console.error(msg); process.exit(2); };

if (cmd === 'verify') {
  const file = rest[0];
  const out = opt('out');
  if (!file || !out) usage('usage: harness verify <contract.json> --out <verdict.json> [--claimed-done] [--no-notify]');
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file!, 'utf8')); } catch (e) { usage(`contract unreadable: ${(e as Error).message}`); }
  const parsed = parseContract(raw);
  if (!parsed.ok) usage(`contract invalid: ${parsed.error}`);
  const contract = (parsed as {ok: true; contract: import('../src/contract').Contract}).contract;
  const v = await verify(contract);
  writeFileSync(out!, JSON.stringify(v, null, 2));
  const ledger = openLedger();
  ledger.recordVerdict(v, contract, flag('claimed-done'));
  ledger.close();
  console.log(formatVerdict(v, contract.goal));
  if (!flag('no-notify')) await notifyTelegram(formatVerdict(v, contract.goal));
  process.exit(v.pass ? 0 : 1);
}

if (cmd === 'decide') {
  const [runId, d] = rest;
  if (!runId || (d !== 'approved' && d !== 'rejected')) usage('usage: harness decide <runId> approved|rejected');
  const ledger = openLedger();
  const ok = ledger.recordDecision(runId, d as Decision);
  ledger.close();
  if (!ok) { console.error(`unknown runId ${runId}`); process.exit(1); }
  process.exit(0);
}

if (cmd === 'stats') {
  const days = Number(opt('days') ?? 30);
  const ledger = openLedger();
  console.log(JSON.stringify(ledger.stats(Date.now() - days * 86_400_000), null, 2));
  ledger.close();
  process.exit(0);
}

usage('usage: harness verify|decide|stats');
```

- [ ] **Step 5: Run full suite, expect PASS** — `~/.bun/bin/bun test --cwd /Users/nguyentuan/Documents/second-brain/tools/agent-harness` → all tests from Tasks 1–5 pass; `bun run typecheck` clean.

- [ ] **Step 6: Live DM smoke (one real message)** — only after tests pass:
```bash
cd /Users/nguyentuan/Documents/second-brain/tools/agent-harness && ~/.bun/bin/bun -e 'import {notifyTelegram} from "./src/notify"; console.log(await notifyTelegram("agent-harness: smoke test DM"))'
```
Expected: `true`. Ask Tuan to confirm the DM arrived (personal chat, not a group).

- [ ] **Step 7: Commit**
```bash
git -C /Users/nguyentuan/Documents/second-brain add tools/agent-harness/src/notify.ts tools/agent-harness/bin/harness.ts tools/agent-harness/test/cli.test.ts
git -C /Users/nguyentuan/Documents/second-brain commit -m "feat(agent-harness): CLI verify/decide/stats + personal Telegram DM"
```

---

### Task 6: jira-fix gate — open-mr refuses without a matching verdict

**Files:**
- Create: `~/.claude/skills/jira-fix/scripts/lib/verdict.mjs`
- Modify: `~/.claude/skills/jira-fix/scripts/open-mr.mjs` (after the `stray` check, before `if (dryRun)`)
- Test: `~/.claude/skills/jira-fix/test/verdict.test.mjs`

**Interfaces:**
- Consumes: verdict JSON from Task 5 (`{pass, diffSha, contractId, runId, changed}`); `git()` from `scripts/lib/git.mjs` (`git(dir, args, {timeoutMs}) → {code, stdout, stderr}`)
- Produces:
  ```js
  export function checkVerdict(verdict, stagedSha) // → {ok: true} | {ok: false, failure: 'unverified'|'verify_failed'|'diff_changed', detail}
  export async function stagedDiffSha(dir, gitFn)   // sha256 hex of `git diff --cached --binary`
  ```

- [ ] **Step 1: Write the failing test `test/verdict.test.mjs`**

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkVerdict} from '../scripts/lib/verdict.mjs';

const good = {pass: true, diffSha: 'a'.repeat(64), contractId: 'FAL-1-g1', runId: 'r'};

test('accepts a passing verdict for the same diff', () => {
  assert.deepEqual(checkVerdict(good, 'a'.repeat(64)), {ok: true});
});
test('rejects a missing verdict', () => {
  assert.equal(checkVerdict(undefined, 'x').failure, 'unverified');
});
test('rejects a failed verdict', () => {
  assert.equal(checkVerdict({...good, pass: false}, good.diffSha).failure, 'verify_failed');
});
test('rejects a verdict whose diffSha does not match', () => {
  const r = checkVerdict(good, 'b'.repeat(64));
  assert.equal(r.failure, 'diff_changed');
});
test('rejects a verdict with a malformed sha', () => {
  assert.equal(checkVerdict({...good, diffSha: ''}, '').failure, 'unverified');
});
```

- [ ] **Step 2: Run, expect FAIL** — `node --test ~/.claude/skills/jira-fix/test/`

- [ ] **Step 3: Implement `scripts/lib/verdict.mjs`**

```js
import {createHash} from 'node:crypto';

/**
 * Gate đứng trước `git push`: chỉ đẩy đúng diff mà agent-harness đã tự verify.
 * So sha của diff đã stage chứ không so danh sách file — agent sửa thêm một dòng sau khi
 * verify thì tên file vẫn y nguyên, chỉ nội dung đổi.
 */
export function checkVerdict(verdict, stagedSha) {
  if (!verdict || typeof verdict !== 'object' || !/^[0-9a-f]{64}$/.test(verdict.diffSha ?? '')) {
    return {ok: false, failure: 'unverified', detail: 'thiếu verdict hợp lệ từ agent-harness'};
  }
  if (verdict.pass !== true) {
    return {ok: false, failure: 'verify_failed', detail: `verdict ${verdict.runId} không pass`};
  }
  if (verdict.diffSha !== stagedSha) {
    return {ok: false, failure: 'diff_changed', detail: `diff đã đổi sau khi verify (run ${verdict.runId}) — chạy lại harness verify`};
  }
  return {ok: true};
}

export async function stagedDiffSha(dir, gitFn) {
  const r = await gitFn(dir, ['diff', '--cached', '--binary'], {timeoutMs: 180_000});
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().slice(0, 300));
  return createHash('sha256').update(r.stdout).digest('hex');
}
```

- [ ] **Step 4: Wire into `open-mr.mjs`** — add import at top next to the git import:
```js
import {checkVerdict, stagedDiffSha} from './lib/verdict.mjs';
```
and insert immediately **after** the `if (stray.length) { ... }` block and **before** the `leftBehind` computation:
```js
  // Chỉ bỏ qua ở --dry-run: dry-run không đẩy gì, và là bước xem diff trước khi verify.
  if (!dryRun) {
    const verdictFile = arg('verdict');
    let verdict;
    try { verdict = JSON.parse(readFileSync(verdictFile, 'utf8')); } catch { verdict = undefined; }
    const gate = checkVerdict(verdict, await stagedDiffSha(dir, git));
    if (!gate.ok) {
      await git(dir, ['reset'], {timeoutMs: TIMEOUT});
      fail(gate.failure, gate.detail);
    }
  }
```
Also update the usage comment at the top of `open-mr.mjs` to show `--verdict verdict.json`.

- [ ] **Step 5: Run tests, expect PASS (5)**; then syntax-check: `node --check ~/.claude/skills/jira-fix/scripts/open-mr.mjs`.

- [ ] **Step 6: Integration check on a throwaway repo (no push):** create a temp repo + branch `fix/FAL-0-smoke`, a change in `src/a.js`, a contract allowing `src/a.js` with `verify: [{name:'ok', cmd:['true']}]`; run `harness verify … --out v.json --no-notify`; then edit `src/a.js` again; run `node open-mr.mjs --dir <repo> --base master --title t --body-file <empty> --allow-file <allow.txt> --verdict v.json`. Expected JSON: `"failure": "diff_changed"`, exit 1, and `git diff --cached` empty afterwards. Record the output in the task report. Do **not** configure a remote — the gate must fire before any push is attempted.

- [ ] **Step 7:** No commit (not a git repo). Report the test output.

---

### Task 7: jira-fix workflow uses the harness

**Files:**
- Create: `~/.claude/skills/jira-fix/references/contract.example.json`
- Modify: `~/.claude/skills/jira-fix/references/workflow.md` (Phase 4 gate section, Phase 6 MR section), `~/.claude/skills/jira-fix/SKILL.md` (one line in the phase list)

- [ ] **Step 1: `contract.example.json`**
```json
{
  "id": "FAL-720-g1",
  "source": "jira-fix",
  "goal": "integrationKeys: bind swagger token to the requesting shop",
  "repoPath": "/Users/nguyentuan/.cache/jira-fix/wt/ai-product-copy-FAL-720-bind-shop",
  "allow": ["packages/functions/src/handlers/proxy.js", "packages/functions/src/handlers/__tests__/proxy.test.js"],
  "verify": [
    {"name": "jest (touched tests)", "cmd": ["npx", "jest", "--ci", "packages/functions/src/handlers/__tests__/proxy.test.js"]},
    {"name": "docs-gate", "cmd": ["node", "scripts/docs-gate/index.js"]}
  ],
  "reproduce": {"testCmd": ["npx", "jest", "--ci"]},
  "security": {"appName": "APC"}
}
```

- [ ] **Step 2: workflow.md — Phase 4 (gate).** After the existing table spec, add:

> Khi Tuan duyệt nhóm nào, ghi `contract.json` cho nhóm đó **trước khi sửa code** (mẫu: `references/contract.example.json`): `allow` = đúng `allow.txt` vừa duyệt, `verify` = lệnh test của các test sẽ viết (+ `docs-gate` nếu repo có `scripts/docs-gate/`), `reproduce` luôn bật, `security` luôn bật. Hợp đồng viết trước để agent không tự dời cột mốc sau khi sửa.

- [ ] **Step 3: workflow.md — Phase 6 (MR).** Replace the step that runs `open-mr.mjs` (non-dry-run) with:

> 1. `open-mr.mjs --dry-run` như cũ để xem diff.
> 2. `bun run ~/Documents/second-brain/tools/agent-harness/bin/harness.ts verify contract.json --out verdict.json --claimed-done` — `--claimed-done` vì tới đây agent đã báo xong. Exit 1 = verifier bác: **không** mở MR, báo Tuan từng check fail, sửa rồi verify lại.
> 3. `open-mr.mjs … --verdict verdict.json`. Nó tự tính lại sha diff; sửa thêm bất cứ gì sau bước 2 → `diff_changed` → quay lại bước 2.
> 4. Khi Tuan nói duyệt/bác MR trong session: `harness decide <runId> approved|rejected` (runId trong verdict.json).

- [ ] **Step 4: SKILL.md** — in the phase list line for Phase 6 add: `(bắt buộc agent-harness verify → --verdict; xem workflow.md)`.

- [ ] **Step 5: Dry read-through** — open the three files and confirm every command path exists: `ls ~/Documents/second-brain/tools/agent-harness/bin/harness.ts`, `node --check …/open-mr.mjs`. Report.

---

### Task 8: Pilot + metric

**Files:** none new. Uses the ledger.

- [ ] **Step 1:** Next real `jira-fix` run goes through the new flow end to end (Tuan picks the ticket). Report: verdict checks, whether the MR opened, the DM.
- [ ] **Step 2:** After 10 runs or 2 weeks (whichever first): `bun run …/harness.ts stats --days 14`. Report `falseDoneRate`, `passed/runs`, `approved/rejected`. This number decides step 2: if falseDone is high the verifier is earning its keep and the JEV loop can drive on top of it; if a check fails for reasons unrelated to the fix (flaky jest, docs-gate noise), fix that check before any loop is allowed to act on verdicts.
- [ ] **Step 3:** Add the ledger to `harness/loops.yml`? No — the ledger only moves when Tuan runs jira-fix. Revisit when step 2 makes runs unattended.

---

## Not in this plan (step 2, separate plan)

- `claude -p` dispatcher + `jev supervise` poll loop (JSON stdin: `goal, tail, elapsed_s, quiet_s, new_output, looping, exited`; actions `keep_waiting|answer_question|nudge|escalate|collect`; honour `injection_seen`). Needs `~/.hermes/.env` sourced — `jev doctor` reports `key.present: false` without it.
- Telegram *approval* (reply-to-approve). Hermes already long-polls this bot's `getUpdates`; a second poller on the same token gets 409 Conflict. Approval must go through Hermes (plugin/handoff), not a new poller.
- Porting the gate to autofix / other sources.
- Note: `jira-fix/references/apps.json` lists Blog and Image-Optimizer remotes on gitlab.com; memory says the `avada` group there is read-only and image-optimizer moved to git.avada.net. Check before the pilot picks one of those repos.
