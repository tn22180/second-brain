import {afterEach, describe, expect, test} from 'bun:test';
import {existsSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {stagedDiff} from '../src/git';
import {commitVerified, ensureIntegration, mergeNode, nodeWorktree, paths} from '../src/worktree';
import {makeRepo, sh, write} from './helpers';

const cleanup: string[] = [];
afterEach(() => {
  for (const d of cleanup.splice(0)) rmSync(d, {recursive: true, force: true});
});
const setup = () => {
  const repo = makeRepo();
  const g = {id: 'gq', repoPath: repo, base: 'master', branch: 'feat/gq'};
  const p = paths(g, 'n1');
  cleanup.push(repo, p.integration, p.node, paths(g, 'n2').node);
  return {repo, g};
};

describe('worktree', () => {
  test('integration branch is cut from base and reused on resume', async () => {
    const {repo, g} = setup();
    const base = sh(repo, 'git', 'rev-parse', 'master').trim();
    const i1 = await ensureIntegration(g);
    expect(sh(i1, 'git', 'rev-parse', 'HEAD').trim()).toBe(base);
    expect(sh(i1, 'git', 'branch', '--show-current').trim()).toBe('feat/gq');
    expect(await ensureIntegration(g)).toBe(i1);
  });

  test('node worktree starts at the integration tip; commit only the verified tree; merge back', async () => {
    const {g} = setup();
    const integ = await ensureIntegration(g);
    const n = await nodeWorktree(g, 'n1');
    expect(n.baseSha).toBe(sh(integ, 'git', 'rev-parse', 'HEAD').trim());
    write(n.path, 'src/a.js', 'module.exports = 42;\n');
    write(n.path, 'stray.txt', 'not allowed\n');
    const staged = await stagedDiff(n.path, ['src/a.js']);
    const sha = await commitVerified(n.path, ['src/a.js'], staged.sha, 'n1: change a');
    expect(sh(n.path, 'git', 'show', '--name-only', '--format=', sha).trim()).toBe('src/a.js');
    await mergeNode(g, 'n1', 'merge n1');
    expect(sh(integ, 'git', 'show', 'HEAD:src/a.js')).toBe('module.exports = 42;\n');
    expect(existsSync(n.path)).toBe(false);
  });

  test('commit refuses when the tree drifted after verify', async () => {
    const {g} = setup();
    await ensureIntegration(g);
    const n = await nodeWorktree(g, 'n1');
    write(n.path, 'src/a.js', 'module.exports = 1.5;\n');
    const staged = await stagedDiff(n.path, ['src/a.js']);
    write(n.path, 'src/a.js', 'module.exports = 9;\n');
    await expect(commitVerified(n.path, ['src/a.js'], staged.sha, 'x')).rejects.toThrow('drift');
    expect(sh(n.path, 'git', 'rev-parse', 'HEAD').trim()).toBe(n.baseSha);
  });

  test('a later node sees the merged work of its deps', async () => {
    const {g} = setup();
    await ensureIntegration(g);
    const n1 = await nodeWorktree(g, 'n1');
    write(n1.path, 'src/a.js', 'module.exports = 7;\n');
    await commitVerified(n1.path, ['src/a.js'], (await stagedDiff(n1.path, ['src/a.js'])).sha, 'n1');
    await mergeNode(g, 'n1', 'merge n1');
    const n2 = await nodeWorktree(g, 'n2');
    expect(sh(n2.path, 'git', 'show', 'HEAD:src/a.js')).toBe('module.exports = 7;\n');
  });

  test('graph branch equal to base is refused', async () => {
    const {g} = setup();
    await expect(ensureIntegration({...g, branch: 'master'})).rejects.toThrow('base');
  });

  test('baseRef overrides origin/base (local commits not yet pushed)', async () => {
    const {repo, g} = setup();
    write(repo, 'src/local.js', 'x\n');
    sh(repo, 'git', 'add', '-A');
    sh(repo, 'git', 'commit', '-qm', 'local only');
    sh(repo, 'git', 'branch', 'side', 'HEAD~1');
    const integ = await ensureIntegration({...g, baseRef: 'side'});
    expect(sh(integ, 'git', 'rev-parse', 'HEAD').trim()).toBe(sh(repo, 'git', 'rev-parse', 'side').trim());
  });
});
