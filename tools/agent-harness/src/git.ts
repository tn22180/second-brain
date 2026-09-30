import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawnRunner, type Runner} from '../../prod-error-autofix/src/gcloud/run';

const GIT_TIMEOUT = 60_000;

export interface StagedDiff {
  changed: string[];
  /** `git write-tree` of the staged index — the identity open-mr.mjs re-checks before pushing. */
  sha: string;
  /** Staged diff text, for the security reviewer. */
  diff: string;
}

export function inScope(file: string, allow: string[]): boolean {
  return allow.some(a => (a.endsWith('/') ? file.startsWith(a) : file === a));
}

/**
 * The change exactly as `open-mr.mjs` will commit it: `git add -- <allow>`, then identify the
 * staged index by its tree sha. A tree sha, not a hash of `git diff` text: the two sides decode
 * stdout differently (whole buffer vs per chunk), and a split multibyte char would make an
 * identical diff look changed. Staging (not `git diff HEAD`) is what pulls in new test files.
 * The index is reset afterwards so open-mr starts from the same clean state.
 */
export async function stagedDiff(repoPath: string, allow: string[], runner: Runner = spawnRunner): Promise<StagedDiff> {
  const run = (args: string[]) => runner(['git', ...args], GIT_TIMEOUT, {cwd: repoPath});
  const git = async (args: string[]) => {
    const r = await run(args);
    if (r.code !== 0 || r.timedOut) throw new Error(`git ${args[0]} failed: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
    return r.stdout;
  };
  // `git add` aborts on a pathspec that matches nothing, and an allowed-but-untouched new file
  // is legal. Keep entries that exist on disk or are tracked (a deleted tracked file must still
  // be staged as a deletion).
  const present: string[] = [];
  for (const a of allow) {
    if (existsSync(join(repoPath, a)) || (await run(['ls-files', '--error-unmatch', '--', a])).code === 0) {
      present.push(a);
    }
  }
  if (present.length) await git(['add', '-A', '--', ...present]);
  try {
    const names = await git(['diff', '--cached', '--name-only']);
    return {
      changed: names.split('\n').map(s => s.trim()).filter(Boolean),
      sha: (await git(['write-tree'])).trim(),
      diff: await git(['diff', '--cached', '--binary'])
    };
  } finally {
    await git(['reset', '-q']);
  }
}

export interface WorktreeState {
  /** Modified or untracked paths outside allow — the checks would see them, the push would not. */
  outside: string[];
  /** Gitignored paths inside allow — same problem the other way round. */
  ignoredInAllow: string[];
}

// jira-fix symlinks node_modules into the worktree and some repos don't ignore it at the root.
const exempt = (p: string) => p.split('/').includes('node_modules');

/**
 * Everything on disk that differs from HEAD, classified against allow. Postconditions run on
 * the working tree, but only the allowed paths get committed, so any other difference means
 * the verdict describes a tree that will never be pushed.
 */
export async function worktreeState(repoPath: string, allow: string[], runner: Runner = spawnRunner): Promise<WorktreeState> {
  const r = await runner(['git', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored'], GIT_TIMEOUT, {cwd: repoPath});
  if (r.code !== 0 || r.timedOut) throw new Error(`git status failed: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
  const parts = r.stdout.split('\0');
  const outside: string[] = [];
  const ignoredInAllow: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    if (xy[0] === 'R' || xy[0] === 'C') i++; // -z puts the rename source in the next field
    if (exempt(path)) continue;
    const touchesAllow = inScope(path, allow) || (path.endsWith('/') && allow.some(a => a.startsWith(path)));
    if (xy === '!!') {
      if (touchesAllow) ignoredInAllow.push(path);
    } else if (!inScope(path, allow)) {
      outside.push(path);
    }
  }
  return {outside, ignoredInAllow};
}

export async function headSha(repoPath: string, runner: Runner = spawnRunner): Promise<string> {
  const r = await runner(['git', 'rev-parse', 'HEAD'], GIT_TIMEOUT, {cwd: repoPath});
  if (r.code !== 0 || r.timedOut) throw new Error(`git rev-parse failed: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
  return r.stdout.trim();
}
