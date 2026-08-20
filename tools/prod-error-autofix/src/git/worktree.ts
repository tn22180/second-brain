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
  /** Set when an earlier attempt's commits were parked before the branch was reset. */
  archivedRef?: string;
}

export type WorktreeResult = {ok: true; value: Worktree} | {ok: false; detail: string};

export function branchNameFor(appName: string, fingerprint: string, attempt: number): string {
  const app = appName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const suffix = attempt > 1 ? `-a${attempt}` : '';
  return `fix/prod-${app}-${fingerprint}${suffix}`;
}

/**
 * The daily audit's branches. One per kind, never one shared: a reviewer approving
 * a security fix must not be approving a batch of deletions in the same diff.
 *
 * Repo and date are sanitised rather than trusted — a stray character in either
 * would otherwise reach `git push` as part of a ref name.
 */
export function auditBranchName(kind: 'security' | 'cleanup', repo: string, dateStr: string): string {
  const slug = repo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `audit/${kind}-${slug}-${dateStr.replace(/[^0-9]/g, '')}`;
}

export function worktreeDirFor(worktreeRoot: string, repo: string, fingerprint: string, attempt: number): string {
  return join(worktreeRoot, `${repo}-${fingerprint}${attempt > 1 ? `-a${attempt}` : ''}`);
}

/**
 * Parks a branch tip under `refs/autofix-archive/` when it holds commits the base
 * does not, so resetting the branch cannot lose them.
 *
 * Returns the archive ref, or undefined when there was nothing worth keeping — a
 * branch that does not exist, or one that is already contained in the base.
 */
export async function archiveBranchTip(
  input: {repoPath: string; branch: string; baseSha: string; timeoutMs: number},
  runner: Runner = spawnRunner
): Promise<string | undefined> {
  const git = (args: string[]) => runner(['git', '-C', input.repoPath, ...args], input.timeoutMs);

  const tip = await git(['rev-parse', '--verify', `refs/heads/${input.branch}`]);
  if (tip.code !== 0) return undefined;
  const sha = tip.stdout.trim();
  if (!sha) return undefined;

  // Already in the base — nothing on this branch that a reset would drop.
  const contained = await git(['merge-base', '--is-ancestor', sha, input.baseSha]);
  if (contained.code === 0) return undefined;

  const ref = `refs/autofix-archive/${input.branch.replace(/^fix\//, '')}-${sha.slice(0, 7)}`;
  const saved = await git(['update-ref', ref, sha]);
  return saved.code === 0 ? ref : undefined;
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

  // `-B` resets a leftover branch from an earlier attempt rather than colliding with
  // it — but that silently discards whatever that attempt committed. Seen on
  // 2026-07-31: rerunning fingerprint 1rzr1j4 after the state was cleared dropped a
  // finished fix commit to dangling, one `git gc` away from gone. Anything not already
  // contained in the base gets a ref of its own first.
  const archived = await archiveBranchTip({repoPath: input.repoPath, branch: input.branch, baseSha, timeoutMs: input.timeoutMs}, runner);

  const added = await git(['worktree', 'add', '-B', input.branch, input.dir, baseSha]);
  if (added.code !== 0) {
    return {ok: false, detail: `worktree add failed: ${(added.stderr || added.stdout).trim().slice(0, 300)}`};
  }

  return {ok: true, value: {dir: input.dir, branch: input.branch, baseSha, archivedRef: archived}};
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

/**
 * Commits whatever a failed job left behind, so the worktree can be reclaimed.
 *
 * A worktree is a full checkout — 2.0 GB each once `node_modules` is in it — and
 * keeping one per unfinished job filled this machine's disk on 2026-07-31: seven
 * worktrees, 7.3 GB, and the daemon then had no room to work. The work itself is a
 * handful of changed files, and a branch holds it for nothing: branch refs live in
 * the main repo and survive `worktree remove`.
 *
 * Returns `ok: true` with no sha when there was nothing to commit — that is the
 * normal case after `openMr`, which commits before it pushes.
 */
export async function commitWip(
  input: {worktreeDir: string; message: string; timeoutMs: number},
  runner: Runner = spawnRunner
): Promise<{ok: boolean; sha: string | undefined; detail: string | undefined}> {
  const git = (args: string[]) => runner(['git', '-C', input.worktreeDir, ...args], input.timeoutMs);

  const added = await git(['add', '-A']);
  if (added.code !== 0) {
    return {ok: false, sha: undefined, detail: (added.stderr || added.stdout).trim().slice(0, 300)};
  }
  const staged = await git(['diff', '--cached', '--name-only']);
  if (!staged.stdout.trim()) return {ok: true, sha: undefined, detail: undefined};

  const committed = await git(['commit', '-m', input.message]);
  if (committed.code !== 0) {
    return {ok: false, sha: undefined, detail: (committed.stderr || committed.stdout).trim().slice(0, 300)};
  }
  const head = await git(['rev-parse', 'HEAD']);
  return {ok: true, sha: head.code === 0 ? head.stdout.trim() : undefined, detail: undefined};
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
