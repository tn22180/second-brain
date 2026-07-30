import {existsSync, symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {spawnRunner, type Runner} from '../gcloud/run';

/**
 * Isolated checkouts for the fix.
 *
 * Worktrees live under `~/.cache/prod-autofix/wt`, never inside a repo:
 * `seo/jest.config.js` had to add `testPathIgnorePatterns: ['<rootDir>/.claude/worktrees/']`
 * because a worktree is a full checkout and jest collected every test twice. Keeping
 * them outside any rootDir avoids that class of problem for all five apps.
 *
 * Tuan's own working trees are never touched: `blogs` sits on a feature branch 26
 * commits behind master, `seo` on another. Every fix starts from `origin/<base>`.
 */

export interface WorktreeInput {
  repoPath: string;
  baseBranch: string;
  branch: string;
  dir: string;
  timeoutMs: number;
}

export interface Worktree {
  dir: string;
  branch: string;
  baseSha: string;
}

export type WorktreeResult = {ok: true; value: Worktree} | {ok: false; detail: string};

export function branchNameFor(appName: string, fingerprint: string, attempt: number): string {
  const app = appName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const suffix = attempt > 1 ? `-a${attempt}` : '';
  return `fix/prod-${app}-${fingerprint}${suffix}`;
}

export function worktreeDirFor(worktreeRoot: string, repo: string, fingerprint: string, attempt: number): string {
  return join(worktreeRoot, `${repo}-${fingerprint}${attempt > 1 ? `-a${attempt}` : ''}`);
}

export async function createWorktree(
  input: WorktreeInput,
  runner: Runner = spawnRunner
): Promise<WorktreeResult> {
  const git = (args: string[]) => runner(['git', '-C', input.repoPath, ...args], input.timeoutMs);

  if (input.branch === input.baseBranch) {
    return {ok: false, detail: `refusing to work directly on ${input.baseBranch}`};
  }
  if (existsSync(input.dir)) {
    return {ok: false, detail: `${input.dir} already exists — a previous job did not clean up`};
  }

  const fetched = await git(['fetch', '--quiet', 'origin', input.baseBranch]);
  if (fetched.code !== 0) {
    return {ok: false, detail: `fetch failed: ${(fetched.stderr || fetched.stdout).trim().slice(0, 300)}`};
  }

  const sha = await git(['rev-parse', `origin/${input.baseBranch}`]);
  if (sha.code !== 0) {
    return {ok: false, detail: `origin/${input.baseBranch} does not resolve — wrong base branch for this repo?`};
  }
  const baseSha = sha.stdout.trim();

  // -B so a leftover branch from an earlier attempt is reset rather than colliding.
  const added = await git(['worktree', 'add', '-B', input.branch, input.dir, baseSha]);
  if (added.code !== 0) {
    return {ok: false, detail: `worktree add failed: ${(added.stderr || added.stdout).trim().slice(0, 300)}`};
  }

  return {ok: true, value: {dir: input.dir, branch: input.branch, baseSha}};
}

/**
 * Symlinks the main checkout's `node_modules` into a fresh worktree.
 *
 * `git worktree add` gives a clean checkout with no dependencies installed, and
 * without this the jest baseline cannot run at all: `npx jest` finds no local jest,
 * fetches a current one, and a current jest refuses `blogs` outright —
 * "Multiple configurations found" — because that repo has both a `jest.config.js`
 * and a `jest` key in `package.json`. The pinned jest 24 in the repo tolerates it.
 * Observed live on 2026-07-30 as a failed baseline, which then blocks the MR.
 *
 * A symlink rather than an install: `yarn install` per job would cost minutes, and
 * CI installs immutably anyway, so the resolved tree is the same one the repo uses.
 */
export async function linkNodeModules(
  input: {repoPath: string; worktreeDir: string},
  fs: {existsSync: (p: string) => boolean; symlinkSync: (a: string, b: string) => void} = {
    existsSync,
    symlinkSync
  }
): Promise<{linked: string[]; missing: string[]}> {
  const linked: string[] = [];
  const missing: string[] = [];
  // Root plus the workspace packages, which have their own trees in some repos.
  const candidates = [
    'node_modules',
    'packages/functions/node_modules',
    'packages/assets/node_modules'
  ];
  for (const rel of candidates) {
    const source = join(input.repoPath, rel);
    const target = join(input.worktreeDir, rel);
    if (!fs.existsSync(source)) continue;
    if (fs.existsSync(target)) continue;
    try {
      fs.symlinkSync(source, target);
      linked.push(rel);
    } catch {
      missing.push(rel);
    }
  }
  return {linked, missing};
}

export async function removeWorktree(
  input: {repoPath: string; dir: string; timeoutMs: number},
  runner: Runner = spawnRunner
): Promise<{ok: boolean; detail: string | undefined}> {
  const res = await runner(
    ['git', '-C', input.repoPath, 'worktree', 'remove', '--force', input.dir],
    input.timeoutMs
  );
  if (res.code !== 0) {
    return {ok: false, detail: (res.stderr || res.stdout).trim().slice(0, 300)};
  }
  await runner(['git', '-C', input.repoPath, 'worktree', 'prune'], input.timeoutMs);
  return {ok: true, detail: undefined};
}

/** `git worktree list --porcelain` → the dirs this project owns. */
export function parseWorktreeList(stdout: string, worktreeRoot: string): string[] {
  return stdout
    .split('\n')
    .filter(l => l.startsWith('worktree '))
    .map(l => l.slice('worktree '.length).trim())
    .filter(dir => dir.startsWith(worktreeRoot));
}

export async function listOwnedWorktrees(
  input: {repoPath: string; worktreeRoot: string; timeoutMs: number},
  runner: Runner = spawnRunner
): Promise<string[]> {
  const res = await runner(['git', '-C', input.repoPath, 'worktree', 'list', '--porcelain'], input.timeoutMs);
  if (res.code !== 0) return [];
  return parseWorktreeList(res.stdout, input.worktreeRoot);
}
