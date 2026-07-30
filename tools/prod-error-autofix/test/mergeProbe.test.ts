import {describe, expect, test} from 'bun:test';
import type {RunResult, Runner} from '../src/gcloud/run';
import {probeMerge} from '../src/git/mergeProbe';

function result(over: Partial<RunResult> = {}): RunResult {
  return {code: 0, stdout: '', stderr: '', timedOut: false, ...over};
}

/** Replies per git subcommand instead of per position, so tests stay readable. */
function gitRunner(byCommand: Record<string, RunResult>): {runner: Runner; calls: string[][]} {
  const calls: string[][] = [];
  const runner: Runner = async args => {
    calls.push(args);
    const sub = args.slice(3).find(a => !a.startsWith('-')) ?? args[3] ?? '';
    const key = Object.keys(byCommand).find(k => args.includes(k)) ?? sub;
    return byCommand[key] ?? result();
  };
  return {runner, calls};
}

const input = {
  repoPath: '/repo',
  baseBranch: 'master',
  fixSha: 'aaaa111',
  fixBranch: 'fix/prod-blog-abc',
  timeoutMs: 5000
};

describe('probeMerge', () => {
  test('not merged yet: is-ancestor exits 1, which is an answer not an error', async () => {
    const {runner} = gitRunner({
      fetch: result(),
      'cat-file': result(),
      'merge-base': result({code: 1}),
      'ls-remote': result({stdout: 'aaaa111\trefs/heads/fix/prod-blog-abc'})
    });
    const res = await probeMerge(input, runner);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toMatchObject({merged: false, mergedAtMs: undefined, branchStillExists: true});
  });

  test('merged: the landing commit dates the merge, not the base tip', async () => {
    const {runner} = gitRunner({
      fetch: result(),
      'cat-file': result(),
      'merge-base': result({code: 0}),
      'ls-remote': result({stdout: ''}),
      // newest first; the last line is the commit that carried the fix in
      'rev-list': result({stdout: 'cccc333\nbbbb222\n'}),
      show: result({stdout: '2026-07-29T10:00:00+07:00\n'})
    });
    const res = await probeMerge(input, runner);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.merged).toBe(true);
    expect(res.value.landedSha).toBe('bbbb222');
    expect(res.value.mergedAtMs).toBe(Date.parse('2026-07-29T10:00:00+07:00'));
    expect(res.value.branchStillExists).toBe(false);
  });

  test('a fast-forward with no intermediate commit dates from the fix itself', async () => {
    const {runner} = gitRunner({
      fetch: result(),
      'cat-file': result(),
      'merge-base': result({code: 0}),
      'ls-remote': result({stdout: ''}),
      'rev-list': result({stdout: '\n'}),
      show: result({stdout: '2026-07-30T01:02:03Z\n'})
    });
    const res = await probeMerge(input, runner);
    expect(res.ok && res.value.landedSha).toBe('aaaa111');
  });

  test('a failed fetch is a probe failure, never "not merged"', async () => {
    const {runner} = gitRunner({fetch: result({code: 128, stderr: 'Could not resolve host: gitlab.com'})});
    const res = await probeMerge(input, runner);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.detail).toContain('Could not resolve host');
  });

  test('an unknown fix sha is a probe failure', async () => {
    const {runner} = gitRunner({fetch: result(), 'cat-file': result({code: 1})});
    const res = await probeMerge(input, runner);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.detail).toContain('not present');
  });

  test('a real is-ancestor error is distinguished from exit 1', async () => {
    const {runner} = gitRunner({
      fetch: result(),
      'cat-file': result(),
      'merge-base': result({code: 128, stderr: 'fatal: bad revision'})
    });
    const res = await probeMerge(input, runner);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.detail).toContain('bad revision');
  });

  test('no GitLab API is consulted anywhere', async () => {
    const {runner, calls} = gitRunner({
      fetch: result(),
      'cat-file': result(),
      'merge-base': result({code: 1}),
      'ls-remote': result({stdout: ''})
    });
    await probeMerge(input, runner);
    const flat = calls.flat().join(' ');
    expect(flat).not.toContain('glab');
    expect(flat).not.toContain('api/v4');
    expect(calls.every(c => c[0] === 'git')).toBe(true);
  });

  test('branch existence is only checked when we know the branch name', async () => {
    const {runner, calls} = gitRunner({
      fetch: result(),
      'cat-file': result(),
      'merge-base': result({code: 1})
    });
    const res = await probeMerge({...input, fixBranch: undefined}, runner);
    expect(res.ok && res.value.branchStillExists).toBe(false);
    expect(calls.flat()).not.toContain('ls-remote');
  });
});
