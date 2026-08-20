import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {existsSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AUDIT_ESLINTRC, parseEslintJson, runEslint} from '../src/audit/eslint';
import type {RunEslintInput} from '../src/audit/eslint';
import type {Runner, RunResult} from '../src/gcloud/run';

function result(over: Partial<RunResult> = {}): RunResult {
  return {code: 0, stdout: '', stderr: '', timedOut: false, ...over};
}

const REAL = JSON.stringify([
  {
    filePath: '/wt/seo/packages/functions/src/const/default.js',
    messages: [{ruleId: 'no-unused-vars', line: 5, message: "'CONTENT_TYPES' is defined but never used."}]
  },
  {filePath: '/wt/seo/packages/functions/src/ok.js', messages: []}
]);

describe('parseEslintJson', () => {
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
});

describe('runEslint', () => {
  let worktreeDir: string;
  let outFile: string;
  let rcPath: string;

  beforeEach(() => {
    worktreeDir = mkdtempSync(join(tmpdir(), 'audit-eslint-'));
    outFile = join(worktreeDir, 'eslint-out.json');
    rcPath = join(worktreeDir, '.audit.eslintrc.json');
  });

  afterEach(() => {
    rmSync(worktreeDir, {recursive: true, force: true});
  });

  function input(): RunEslintInput {
    return {worktreeDir, lintPaths: ['packages/functions/src'], outFile, timeoutMs: 5000};
  }

  test('exit 1 means findings, not failure', async () => {
    const runner: Runner = async () => result({code: 1});
    const r = await runEslint(input(), runner);
    expect(r.ok).toBe(true);
  });

  test('exit 2 is a config failure and names it', async () => {
    const runner: Runner = async () =>
      result({code: 2, stderr: "Failed to load parser 'babel-eslint'"});
    const r = await runEslint(input(), runner);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure).toBe('config');
    expect(r.detail).toContain('babel-eslint');
  });

  test('paths come back relative to the worktree', async () => {
    const abs = JSON.stringify([
      {
        filePath: join(worktreeDir, 'packages/functions/src/const/default.js'),
        messages: [{ruleId: 'no-unused-vars', line: 5, message: "'CONTENT_TYPES' is defined but never used."}]
      }
    ]);
    const runner: Runner = async (_args, _timeoutMs, opts) => {
      expect(opts?.cwd).toBe(worktreeDir);
      await Bun.write(outFile, abs);
      return result({code: 1});
    };
    const r = await runEslint(input(), runner);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.findings[0]!.file).toBe('packages/functions/src/const/default.js');
  });

  test('the config file is written into the worktree and removed after a clean run', async () => {
    let sawRcAtCallTime = false;
    const runner: Runner = async () => {
      sawRcAtCallTime = existsSync(rcPath);
      return result({code: 0});
    };
    await runEslint(input(), runner);
    expect(sawRcAtCallTime).toBe(true);
    expect(existsSync(rcPath)).toBe(false);
  });

  test('the generated config file is deleted even when parsing throws', async () => {
    // Valid JSON, valid array, but a record shape parseEslintJson does not expect:
    // no `messages` field, so the loop over `file.messages` throws past the
    // JSON.parse try/catch. The cleanup must still happen.
    const malformed = JSON.stringify([{filePath: '/wt/seo/a.js'}]);
    const runner: Runner = async () => {
      await Bun.write(outFile, malformed);
      return result({code: 1});
    };
    await expect(runEslint(input(), runner)).rejects.toThrow();
    expect(existsSync(rcPath)).toBe(false);
  });

  test('the config file is removed even when the runner itself throws', async () => {
    const runner: Runner = async () => {
      throw new Error('spawn failed');
    };
    await expect(runEslint(input(), runner)).rejects.toThrow('spawn failed');
    expect(existsSync(rcPath)).toBe(false);
  });

  test('AUDIT_ESLINTRC enables no-undef and no-unused-vars, which the repos do not', () => {
    const parsed = JSON.parse(AUDIT_ESLINTRC) as {rules: Record<string, unknown>; parser: string};
    expect(parsed.rules['no-undef']).toBe('error');
    expect(parsed.parser).toBe('babel-eslint');
  });
});
