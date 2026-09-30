import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import type {Runner} from '../../prod-error-autofix/src/gcloud/run';
import {runJest} from '../../prod-error-autofix/src/verify/jest';

export interface ReproduceInput {
  repoPath: string;
  /** Bare jest invocation; `--json --runTestsByPath <tests>` is appended by runJest. */
  testCmd: string[];
  sourceFiles: string[];
  testFiles: string[];
  timeoutMs: number;
}

/**
 * Put the source files back to HEAD, run the new tests, require them to fail, restore the
 * agent's bytes. Not `git stash`: the stash stack is shared by every worktree of the repo,
 * so a pop can apply someone else's stash (autofix's reproduceCheck does exactly that when
 * the push had nothing to save — it still exits 0).
 */
export async function reproduce(input: ReproduceInput, runner?: Runner): Promise<{ok: boolean; detail?: string}> {
  if (!input.sourceFiles.length || !input.testFiles.length) {
    return {ok: false, detail: 'needs both a source change and a new test file'};
  }
  const saved = input.sourceFiles.map(f => {
    const path = join(input.repoPath, f);
    return {f, path, bytes: existsSync(path) ? readFileSync(path) : undefined};
  });
  try {
    for (const s of saved) {
      // Bytes, not decoded text: a lossy round trip would change the file under test.
      const atHead = Bun.spawnSync(['git', 'show', `HEAD:${s.f}`], {cwd: input.repoPath});
      if (atHead.exitCode === 0) {
        mkdirSync(dirname(s.path), {recursive: true});
        writeFileSync(s.path, atHead.stdout);
      } else {
        rmSync(s.path, {force: true});
      }
    }
    const run = await runJest(
      {repoPath: input.repoPath, testCmd: input.testCmd, extraArgs: ['--runTestsByPath', ...input.testFiles], timeoutMs: input.timeoutMs},
      runner
    );
    if (!run.summary) return {ok: false, detail: run.detail ?? 'test output unreadable'};
    if (run.summary.ok) return {ok: false, detail: 'the new test passes with the fix reverted, so it does not reproduce the bug'};
    return {ok: true};
  } finally {
    for (const s of saved) {
      if (s.bytes) {
        mkdirSync(dirname(s.path), {recursive: true});
        writeFileSync(s.path, s.bytes);
      } else {
        rmSync(s.path, {force: true});
      }
    }
  }
}
