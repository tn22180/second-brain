import {describe, expect, test} from 'bun:test';
import type {RunResult, Runner} from '../src/gcloud/run';
import {fingerprintFromDir, sweepWorktrees} from '../src/git/worktreeGc';
import {archiveBranchTip} from '../src/git/worktree';
import type {App} from '../src/registry';

const ok = (over: Partial<RunResult> = {}): RunResult => ({code: 0, stdout: '', stderr: '', timedOut: false, ...over});

const ROOT = '/home/u/.cache/prod-autofix/wt';

function app(over: Partial<App> = {}): App {
  return {
    appName: 'BLOG',
    repo: 'blogs',
    repoPath: '/repos/blogs',
    prodProject: 'avada-blog-app',
    defaultBranch: 'master',
    testCmd: ['npx', 'jest', '--ci'],
    alertHandler: 'x.js',
    ...over
  };
}

/**
 * Scripts git. `dirs` is what `worktree list` reports; `dirty` is the set of dirs that
 * have something staged after `add -A`.
 */
function gitRunner(over: {dirs?: string[]; dirty?: string[]; removeFails?: string[]} = {}): {
  runner: Runner;
  seen: () => string[];
} {
  const seen: string[] = [];
  const dirs = over.dirs ?? [];
  const runner: Runner = async args => {
    const joined = args.join(' ');
    seen.push(joined);
    if (joined.includes('worktree list')) {
      return ok({stdout: dirs.map(d => `worktree ${d}\nHEAD abc\n`).join('\n')});
    }
    if (joined.includes('diff --cached')) {
      const dir = args[2];
      return ok({stdout: (over.dirty ?? []).includes(dir!) ? 'src/x.js\n' : ''});
    }
    if (joined.includes('rev-parse HEAD')) return ok({stdout: 'dead1234\n'});
    if (joined.includes('worktree remove')) {
      const target = args[args.length - 1]!;
      return (over.removeFails ?? []).includes(target) ? ok({code: 1, stderr: 'locked'}) : ok();
    }
    return ok();
  };
  return {runner, seen: () => seen};
}

describe('fingerprintFromDir', () => {
  test('reads the fingerprint back out of the dir name', () => {
    expect(fingerprintFromDir(`${ROOT}/blogs-1a2b`, 'blogs')).toBe('1a2b');
    expect(fingerprintFromDir(`${ROOT}/blogs-1a2b-a2`, 'blogs')).toBe('1a2b');
  });

  test('a dir belonging to another repo is not this repo to sweep', () => {
    expect(fingerprintFromDir(`${ROOT}/seo-1a2b`, 'blogs')).toBeUndefined();
    expect(fingerprintFromDir(`${ROOT}/blogs`, 'blogs')).toBeUndefined();
  });
});

/**
 * The pipeline reclaims its own worktree on every exit path it reaches. This covers
 * the paths it does not reach: a killed process, or a hang that `reclaimStale` frees.
 * Seven such orphans, 7.3 GB, filled this machine's disk on 2026-07-31.
 */
describe('sweepWorktrees', () => {
  test('an orphan is committed first, then removed', async () => {
    const {runner, seen} = gitRunner({dirs: [`${ROOT}/blogs-orph`], dirty: [`${ROOT}/blogs-orph`]});
    const res = await sweepWorktrees(
      {apps: [app()], worktreeRoot: ROOT, activeFingerprints: new Set(), timeoutMs: 1000},
      runner
    );
    expect(res.removed).toEqual([`${ROOT}/blogs-orph`]);
    expect(res.preserved).toEqual([{dir: `${ROOT}/blogs-orph`, sha: 'dead1234'}]);
    const commitAt = seen().findIndex(c => c.includes('commit -m'));
    const removeAt = seen().findIndex(c => c.includes('worktree remove'));
    expect(commitAt).toBeGreaterThan(-1);
    expect(removeAt).toBeGreaterThan(commitAt);
  });

  test('a running job keeps its worktree', async () => {
    const {runner, seen} = gitRunner({dirs: [`${ROOT}/blogs-live`]});
    const res = await sweepWorktrees(
      {apps: [app()], worktreeRoot: ROOT, activeFingerprints: new Set(['live']), timeoutMs: 1000},
      runner
    );
    expect(res.inFlight).toEqual([`${ROOT}/blogs-live`]);
    expect(res.removed).toEqual([]);
    expect(seen().some(c => c.includes('worktree remove'))).toBe(false);
  });

  test('a clean orphan is removed with nothing to preserve', async () => {
    const {runner} = gitRunner({dirs: [`${ROOT}/blogs-clean`]});
    const res = await sweepWorktrees(
      {apps: [app()], worktreeRoot: ROOT, activeFingerprints: new Set(), timeoutMs: 1000},
      runner
    );
    expect(res.removed).toEqual([`${ROOT}/blogs-clean`]);
    expect(res.preserved).toEqual([]);
  });

  /** Losing the work is worse than losing the disk. */
  test('a worktree whose commit fails is left in place and reported', async () => {
    const runner: Runner = async args => {
      const joined = args.join(' ');
      if (joined.includes('worktree list')) return ok({stdout: `worktree ${ROOT}/blogs-stuck\nHEAD abc\n`});
      if (joined.includes(' add ')) return ok({code: 1, stderr: 'index.lock exists'});
      return ok();
    };
    const res = await sweepWorktrees(
      {apps: [app()], worktreeRoot: ROOT, activeFingerprints: new Set(), timeoutMs: 1000},
      runner
    );
    expect(res.removed).toEqual([]);
    expect(res.failed[0]!.detail).toContain('index.lock');
  });

  test('a removal that fails is reported rather than counted as reclaimed', async () => {
    const {runner} = gitRunner({dirs: [`${ROOT}/blogs-locked`], removeFails: [`${ROOT}/blogs-locked`]});
    const res = await sweepWorktrees(
      {apps: [app()], worktreeRoot: ROOT, activeFingerprints: new Set(), timeoutMs: 1000},
      runner
    );
    expect(res.removed).toEqual([]);
    expect(res.failed[0]!.detail).toContain('locked');
  });
});

/**
 * `git worktree add -B` resets a leftover branch, which silently drops whatever an
 * earlier attempt committed. On 2026-07-31 a rerun of fingerprint 1rzr1j4 — after the
 * state DB was cleared — did exactly that to a finished fix commit, leaving it
 * dangling and one `git gc` from gone.
 */
describe('archiveBranchTip', () => {
  function git(over: {tip?: string; tipCode?: number; contained?: boolean}): {run: Runner; seen: () => string[]} {
    const seen: string[] = [];
    const run: Runner = async args => {
      const joined = args.join(' ');
      seen.push(joined);
      if (joined.includes('rev-parse --verify')) {
        return ok({code: over.tipCode ?? 0, stdout: over.tip ?? 'abcdef1234567\n'});
      }
      if (joined.includes('merge-base --is-ancestor')) return ok({code: over.contained ? 0 : 1});
      return ok();
    };
    return {run, seen: () => seen};
  }

  test('a branch with commits the base lacks is parked under refs/autofix-archive', async () => {
    const {run, seen} = git({contained: false});
    const ref = await archiveBranchTip(
      {repoPath: '/repos/blogs', branch: 'fix/prod-blog-1a2b', baseSha: 'base', timeoutMs: 1000},
      run
    );
    expect(ref).toBe('refs/autofix-archive/prod-blog-1a2b-abcdef1');
    expect(seen().some(c => c.includes('update-ref refs/autofix-archive/prod-blog-1a2b-abcdef1 abcdef1234567'))).toBe(true);
  });

  test('a branch already contained in the base is not archived', async () => {
    const {run, seen} = git({contained: true});
    expect(
      await archiveBranchTip({repoPath: '/r', branch: 'fix/prod-blog-x', baseSha: 'base', timeoutMs: 1000}, run)
    ).toBeUndefined();
    expect(seen().some(c => c.includes('update-ref'))).toBe(false);
  });

  test('a branch that does not exist yet is not an error', async () => {
    const {run} = git({tipCode: 1, tip: ''});
    expect(
      await archiveBranchTip({repoPath: '/r', branch: 'fix/prod-blog-new', baseSha: 'base', timeoutMs: 1000}, run)
    ).toBeUndefined();
  });
});
