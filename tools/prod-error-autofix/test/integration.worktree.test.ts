import {afterAll, describe, expect, test} from 'bun:test';
import {existsSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {buildConfig} from '../src/config';
import {resolveApp} from '../src/registry';
import {branchNameFor, createWorktree, listOwnedWorktrees, removeWorktree} from '../src/git/worktree';

/**
 * Creates and removes a real worktree in a real repo. Local only — nothing is
 * pushed, and opening a merge request is deliberately never done from a test.
 *
 *   AUTOFIX_INTEGRATION=1 bun test ./test/integration.worktree.test.ts
 */
const enabled = process.env.AUTOFIX_INTEGRATION === '1';
const cfg = buildConfig({SLACK_BOT_TOKEN: 'x', SLACK_ERROR_CHANNEL_ID: 'x'});
const it = enabled ? test : test.skip;

const app = resolveApp('APC', cfg)!;
const fingerprint = 'itest01';
const dir = join(cfg.paths.worktreeRoot, `${app.repo}-${fingerprint}`);
const branch = branchNameFor(app.appName, fingerprint, 1);

afterAll(async () => {
  if (!enabled) return;
  if (existsSync(dir)) {
    await removeWorktree({repoPath: app.repoPath, dir, timeoutMs: 60_000});
    rmSync(dir, {recursive: true, force: true});
  }
  // Leave no branch behind in Tuan's checkout.
  Bun.spawnSync(['git', '-C', app.repoPath, 'branch', '-D', branch]);
});

describe('worktree lifecycle (integration)', () => {
  it(
    'creates a worktree at origin base, then removes it cleanly',
    async () => {
      const created = await createWorktree(
        {repoPath: app.repoPath, baseBranch: app.defaultBranch, branch, dir, timeoutMs: 120_000},
        undefined
      );
      if (!created.ok) throw new Error(`createWorktree failed: ${created.detail}`);
      console.log(`  worktree ${created.value.dir} at ${created.value.baseSha.slice(0, 8)} on ${branch}`);

      expect(existsSync(join(dir, 'package.json'))).toBe(true);
      expect(existsSync(join(dir, 'jest.config.js'))).toBe(true);

      // It must sit at origin/<base>, not at whatever Tuan has checked out.
      const head = Bun.spawnSync(['git', '-C', dir, 'rev-parse', 'HEAD']);
      expect(new TextDecoder().decode(head.stdout).trim()).toBe(created.value.baseSha);

      const originBase = Bun.spawnSync(['git', '-C', app.repoPath, 'rev-parse', `origin/${app.defaultBranch}`]);
      expect(created.value.baseSha).toBe(new TextDecoder().decode(originBase.stdout).trim());

      // And it must be outside every repo, or jest would collect its tests twice.
      expect(dir.startsWith(cfg.paths.worktreeRoot)).toBe(true);
      expect(dir.includes('projects/Falcon')).toBe(false);

      const owned = await listOwnedWorktrees({
        repoPath: app.repoPath,
        worktreeRoot: cfg.paths.worktreeRoot,
        timeoutMs: 60_000
      });
      expect(owned).toContain(dir);

      const removed = await removeWorktree({repoPath: app.repoPath, dir, timeoutMs: 60_000});
      expect(removed.ok).toBe(true);
      expect(existsSync(dir)).toBe(false);

      const after = await listOwnedWorktrees({
        repoPath: app.repoPath,
        worktreeRoot: cfg.paths.worktreeRoot,
        timeoutMs: 60_000
      });
      expect(after).not.toContain(dir);
    },
    300_000
  );

  it(
    'refuses to reuse a directory a previous job left behind',
    async () => {
      const first = await createWorktree(
        {repoPath: app.repoPath, baseBranch: app.defaultBranch, branch, dir, timeoutMs: 120_000},
        undefined
      );
      expect(first.ok).toBe(true);
      const second = await createWorktree(
        {repoPath: app.repoPath, baseBranch: app.defaultBranch, branch, dir, timeoutMs: 120_000},
        undefined
      );
      expect(second.ok).toBe(false);
      if (second.ok) return;
      expect(second.detail).toContain('already exists');
      await removeWorktree({repoPath: app.repoPath, dir, timeoutMs: 60_000});
    },
    300_000
  );
});
