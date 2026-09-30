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
