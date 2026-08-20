import {join, relative} from 'node:path';
import {unlink} from 'node:fs/promises';
import {spawnRunner} from '../gcloud/run';
import type {Runner} from '../gcloud/run';

export interface LintFinding {
  file: string;
  line: number;
  rule: string;
  message: string;
}

export type LintResult =
  | {ok: true; findings: LintFinding[]; filesScanned: number}
  | {ok: false; failure: 'config' | 'unreadable'; detail: string};

export interface RunEslintInput {
  worktreeDir: string;
  lintPaths: string[];
  outFile: string;
  timeoutMs: number;
}

/**
 * Runs each repo's own eslint 6.8.0 with a rule set the repo does not have.
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

interface RawFile {
  filePath: string;
  messages: {ruleId: string | null; line: number; message: string}[];
}

/**
 * Slices from the first `[` to the end and parses that. Junk BEFORE the report is
 * the observed case — a repo config module logging at require time, seen on
 * 2026-08-19 — and this drops it. Junk after would still fail, which is fine: it
 * has never happened and guessing at it would mean scanning for balance.
 */
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

export async function runEslint(input: RunEslintInput, runner: Runner = spawnRunner): Promise<LintResult> {
  const rcPath = join(input.worktreeDir, '.audit.eslintrc.json');
  await Bun.write(rcPath, AUDIT_ESLINTRC);
  try {
    const res = await runner(
      [
        join(input.worktreeDir, 'node_modules', '.bin', 'eslint'),
        '--no-eslintrc',
        '-c',
        rcPath,
        '--format',
        'json',
        // Not stdout: a repo module that logs at require time contaminates it.
        '--output-file',
        input.outFile,
        ...input.lintPaths
      ],
      input.timeoutMs,
      {cwd: input.worktreeDir}
    );
    // 0 = clean, 1 = findings exist. Both are successful runs.
    if (res.code > 1 || res.timedOut) {
      return {ok: false, failure: 'config', detail: (res.stderr || res.stdout).trim().slice(0, 300)};
    }
    const raw = await Bun.file(input.outFile)
      .text()
      .catch(() => '');
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
