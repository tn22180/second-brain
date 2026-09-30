import {randomUUID} from 'node:crypto';
import {spawnClaude, type ClaudeRunner} from '../../prod-error-autofix/src/agent/claudeCli';
import {spawnRunner, type Runner} from '../../prod-error-autofix/src/gcloud/run';
import {securityGate} from '../../prod-error-autofix/src/verify/security';
import {reproduceCheck} from '../../prod-error-autofix/src/verify/smoke';
import type {Contract} from './contract';
import {inScope, stagedDiff} from './git';

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
    checks,
    costUsd
  });

  let staged;
  try {
    staged = await stagedDiff(contract.repoPath, contract.allow);
  } catch (e) {
    checks.push({name: 'scope', ok: false, detail: errMsg(e)});
    return verdict('', []);
  }
  // Scope failing stops the run: no command should execute against a diff nobody approved.
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
    // reproduceCheck is jest-specific: it appends `--runTestsByPath <tests>` itself and parses
    // jest's summary, so testCmd is the bare jest invocation.
    const testFiles = staged.changed.filter(isTestFile);
    const sourceFiles = staged.changed.filter(f => !isTestFile(f));
    try {
      const r = await reproduceCheck(
        {repoPath: contract.repoPath, testCmd: contract.reproduce.testCmd, sourceFiles, testFiles, timeoutMs: DEFAULT_CMD_TIMEOUT},
        runner
      );
      checks.push({name: 'reproduce', ok: r.ran && r.ok, ...(r.detail ? {detail: r.detail} : {})});
    } catch (e) {
      checks.push({name: 'reproduce', ok: false, detail: errMsg(e)});
    }
  }

  if (contract.security) {
    try {
      const s = await securityGate(
        {
          diff: staged.diff,
          repoPath: contract.repoPath,
          appName: contract.security.appName,
          rootCause: contract.goal,
          model: contract.security.model ?? 'opus',
          timeoutMs: SECURITY_TIMEOUT
        },
        {claude: deps.claude ?? spawnClaude}
      );
      costUsd += s.costUsd ?? 0;
      const findings = s.findings.map(f => `${f.rule} ${f.file}:${f.line}`).join('; ');
      checks.push({name: 'security', ok: s.ok, ...(s.ok ? {} : {detail: `${s.failure}: ${findings || s.detail || ''}`})});
    } catch (e) {
      checks.push({name: 'security', ok: false, detail: errMsg(e)});
    }
  }

  return verdict(staged.sha, staged.changed);
}
