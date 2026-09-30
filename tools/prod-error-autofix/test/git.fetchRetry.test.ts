import {describe, expect, test} from 'bun:test';
import type {RunResult, Runner} from '../src/gcloud/run';
import {createWorktree} from '../src/git/worktree';

const input = {
  repoPath: '/nonexistent/repo',
  baseBranch: 'master',
  branch: 'fix/prod-x-abc',
  dir: '/nonexistent/wt/x-abc',
  timeoutMs: 1000
};

const ok = (stdout = ''): RunResult => ({code: 0, stdout, stderr: '', timedOut: false});
const fail = (stderr: string): RunResult => ({code: 128, stdout: '', stderr, timedOut: false});

function fakeGit(fetchResults: RunResult[]) {
  const calls: string[][] = [];
  let fetches = 0;
  const runner: Runner = async args => {
    calls.push(args);
    const sub = args[3];
    if (sub === 'fetch') return fetchResults[Math.min(fetches++, fetchResults.length - 1)]!;
    if (sub === 'rev-parse' && args[4] === 'origin/master') return ok('base1234\n');
    if (sub === 'rev-parse') return fail('no such ref');
    return ok();
  };
  return {runner, fetchCount: () => fetches};
}

describe('createWorktree fetch retry', () => {
  test('transient failure then success → ok after 2 fetches, backoff slept once', async () => {
    const git = fakeGit([fail('fatal: unable to access: Could not resolve host: git.avada.net'), ok()]);
    const sleeps: number[] = [];
    const res = await createWorktree(input, git.runner, async ms => void sleeps.push(ms));
    expect(res.ok).toBe(true);
    expect(git.fetchCount()).toBe(2);
    expect(sleeps).toEqual([2000]);
  });

  test('3 transient failures → fail naming 3 attempts, backoff 2s then 5s', async () => {
    const git = fakeGit([
      fail('error: RPC failed; Error in the HTTP2 framing layer'),
      fail('fatal: unable to access: The requested URL returned error: 530'),
      fail('fatal: the remote end hung up unexpectedly: early EOF')
    ]);
    const sleeps: number[] = [];
    const res = await createWorktree(input, git.runner, async ms => void sleeps.push(ms));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.detail).toContain('3 attempts');
    expect(res.detail).toContain('fetch failed');
    expect(git.fetchCount()).toBe(3);
    expect(sleeps).toEqual([2000, 5000]);
  });

  test('auth error → fails after 1 attempt, no sleep', async () => {
    const git = fakeGit([fail('fatal: Authentication failed for https://git.avada.net/avada/x.git')]);
    const sleeps: number[] = [];
    const res = await createWorktree(input, git.runner, async ms => void sleeps.push(ms));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.detail).toContain('1 attempt');
    expect(git.fetchCount()).toBe(1);
    expect(sleeps).toEqual([]);
  });

  test('403 and unknown ref are not retried', async () => {
    for (const msg of [
      'fatal: unable to access: The requested URL returned error: 403',
      "fatal: couldn't find remote ref nope"
    ]) {
      const git = fakeGit([fail(msg)]);
      const res = await createWorktree(input, git.runner, async () => {});
      expect(res.ok).toBe(false);
      expect(git.fetchCount()).toBe(1);
    }
  });
});
