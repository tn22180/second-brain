import {redact} from './redact';
import {randomUUID} from 'node:crypto';
import {spawnClaude, type ClaudeRunner} from '../../prod-error-autofix/src/agent/claudeCli';
import {spawnRunner, type Runner} from '../../prod-error-autofix/src/gcloud/run';
import {securityGate} from '../../prod-error-autofix/src/verify/security';
import type {Contract} from './contract';
import {headSha, inScope, stagedDiff, worktreeState} from './git';
import {reproduce} from './reproduce';

export interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface Verdict {
  contractId: string;
  runId: string;
  at: number;
  pass: boolean;
  /** Tree sha of the staged index (see git.ts); open-mr.mjs refuses a push that doesn't match. */
  diffSha: string;
  changed: string[];
  checks: Check[];
  costUsd: number;
}

export interface VerifyDeps {
  runner?: Runner;
  claude?: ClaudeRunner;
  now?: () => number;
  securityTimeoutMs?: number;
}

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
    contractId: contract.id,
    runId: `${contract.id}-${randomUUID().slice(0, 8)}`,
    at: now(),
    pass: checks.length > 0 && checks.every(c => c.ok),
    diffSha,
    changed,
    // One choke point: every detail is a command's output or an error message.
    checks: checks.map(c => (c.detail ? {...c, detail: redact(c.detail)} : c)),
    costUsd
  });

  // base and scope failing stop the run: no command should execute against a tree nobody approved.
  try {
    const head = await headSha(contract.repoPath);
    if (head !== contract.baseSha) {
      // A commit the agent made would be pushed with the MR, yet sit outside the staged diff
      // that scope and security look at.
      checks.push({name: 'base', ok: false, detail: `HEAD ${head.slice(0, 8)} is not baseSha ${contract.baseSha.slice(0, 8)} — agent must not commit`});
      return verdict('', []);
    }
    checks.push({name: 'base', ok: true});
  } catch (e) {
    checks.push({name: 'base', ok: false, detail: errMsg(e)});
    return verdict('', []);
  }

  let staged;
  try {
    staged = await stagedDiff(contract.repoPath, contract.allow);
    const scopeError = await scopeProblem(contract, staged.changed);
    if (scopeError) {
      checks.push({name: 'scope', ok: false, detail: scopeError});
      return verdict(staged.sha, staged.changed);
    }
  } catch (e) {
    checks.push({name: 'scope', ok: false, detail: errMsg(e)});
    return verdict(staged?.sha ?? '', staged?.changed ?? []);
  }
  checks.push({name: 'scope', ok: true, detail: `${staged.changed.length} file(s)`});

  for (const v of contract.verify) {
    const timeoutMs = v.timeoutMs ?? DEFAULT_CMD_TIMEOUT;
    try {
      const r = await runner(v.cmd, timeoutMs, {cwd: contract.repoPath});
      const ok = r.code === 0 && !r.timedOut;
      checks.push({
        name: v.name,
        ok,
        ...(r.timedOut
          ? {detail: `timed out after ${timeoutMs}ms`}
          : ok ? {} : {detail: (r.stderr || r.stdout).trim().slice(-300)})
      });
    } catch (e) {
      checks.push({name: v.name, ok: false, detail: errMsg(e)});
    }
  }

  if (contract.reproduce) {
    const testFiles = staged.changed.filter(isTestFile);
    const sourceFiles = staged.changed.filter(f => !isTestFile(f));
    try {
      const r = await reproduce(
        {repoPath: contract.repoPath, testCmd: contract.reproduce.testCmd, sourceFiles, testFiles, timeoutMs: DEFAULT_CMD_TIMEOUT},
        runner
      );
      checks.push({name: 'reproduce', ...r});
    } catch (e) {
      checks.push({name: 'reproduce', ok: false, detail: errMsg(e)});
    }
  }

  if (contract.security) {
    try {
      const limit = deps.securityTimeoutMs ?? SECURITY_TIMEOUT;
      // Own deadline on top of the gate's: spawnClaude kills only the parent, and a child that
      // keeps the pipe open would otherwise hold verify past any timeout.
      const s = await Promise.race([
        securityGate(
          {
            diff: staged.diff,
            repoPath: contract.repoPath,
            appName: contract.security.appName,
            rootCause: contract.goal,
            model: contract.security.model ?? 'opus',
            timeoutMs: limit
          },
          {claude: deps.claude ?? spawnClaude}
        ),
        // Grace so the gate's own review_unavailable wins when claude does exit on time.
        Bun.sleep(limit >= 60_000 ? limit + 5_000 : limit).then(() => {
          throw new Error(`security review timed out after ${limit}ms`);
        })
      ]);
      costUsd += s.costUsd ?? 0;
      const findings = s.findings.map(f => `${f.rule} ${f.file}:${f.line}`).join('; ');
      checks.push({name: 'security', ok: s.ok, ...(s.ok ? {} : {detail: `${s.failure}: ${findings || s.detail || ''}`})});
    } catch (e) {
      checks.push({name: 'security', ok: false, detail: errMsg(e)});
    }
  }

  // The verdict must describe the tree the checks ran on: a formatter, `jest -u`, or a restore
  // that didn't round-trip would otherwise leave sha X on a run that tested Y.
  try {
    const after = await stagedDiff(contract.repoPath, contract.allow);
    const problem = after.sha !== staged.sha ? 'tree changed while checks ran' : await scopeProblem(contract, after.changed);
    checks.push({name: 'stable', ok: !problem, ...(problem ? {detail: problem} : {})});
  } catch (e) {
    checks.push({name: 'stable', ok: false, detail: errMsg(e)});
  }

  return verdict(staged.sha, staged.changed);
}

async function scopeProblem(contract: Contract, changed: string[]): Promise<string | undefined> {
  const stray = changed.filter(f => !inScope(f, contract.allow));
  if (!changed.length) return 'empty diff';
  if (stray.length) return `outside allow: ${stray.join(', ')}`;
  const state = await worktreeState(contract.repoPath, contract.allow);
  if (state.outside.length) return `working tree outside allow: ${state.outside.join(', ')}`;
  if (state.ignoredInAllow.length) {
    return `ignored file inside allow (tests see it, the commit will not): ${state.ignoredInAllow.join(', ')}`;
  }
  return undefined;
}
