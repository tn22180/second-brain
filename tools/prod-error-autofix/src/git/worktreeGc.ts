import {basename} from 'node:path';
import type {Runner} from '../gcloud/run';
import type {App} from '../registry';
import {commitWip, listOwnedWorktrees, removeWorktree} from './worktree';

/**
 * Sweeps worktrees no job owns any more.
 *
 * The pipeline reclaims its own worktree on every exit path, but only if it reaches
 * one: a process that is killed — or hangs and is reclaimed by `reclaimStale` — leaves
 * a full checkout behind with nothing left to clean it. That is how seven worktrees,
 * 7.3 GB, filled this machine's disk on 2026-07-31 and left the daemon unable to run
 * a single command.
 *
 * Anything found is committed to its own branch first, so an interrupted job's work
 * survives in the main repo. A worktree whose commit fails is left alone and reported:
 * losing the work is worse than losing the disk.
 */

export interface SweepResult {
  removed: string[];
  /** Dirs whose uncommitted work was committed before removal, with the sha. */
  preserved: {dir: string; sha: string}[];
  /** Dirs left in place because a job still owns them. */
  inFlight: string[];
  failed: {dir: string; detail: string}[];
}

/**
 * `blogs-1a2b` → `1a2b`, `blogs-1a2b-a2` → `1a2b`.
 *
 * Returns undefined for a dir that does not belong to this repo, so a sweep can never
 * reach across into another repo's checkouts.
 */
export function fingerprintFromDir(dir: string, repo: string): string | undefined {
  const name = basename(dir);
  const prefix = `${repo}-`;
  if (!name.startsWith(prefix)) return undefined;
  const rest = name.slice(prefix.length).replace(/-a\d+$/, '');
  return rest || undefined;
}

export async function sweepWorktrees(
  input: {
    apps: App[];
    worktreeRoot: string;
    /** Fingerprints of jobs still running; their worktrees are left alone. */
    activeFingerprints: Set<string>;
    timeoutMs: number;
  },
  runner?: Runner
): Promise<SweepResult> {
  const result: SweepResult = {removed: [], preserved: [], inFlight: [], failed: []};

  for (const app of input.apps) {
    const dirs = await listOwnedWorktrees(
      {repoPath: app.repoPath, worktreeRoot: input.worktreeRoot, timeoutMs: input.timeoutMs},
      runner
    );
    for (const dir of dirs) {
      const fingerprint = fingerprintFromDir(dir, app.repo);
      if (!fingerprint) continue;
      if (input.activeFingerprints.has(fingerprint)) {
        result.inFlight.push(dir);
        continue;
      }

      const wip = await commitWip(
        {
          worktreeDir: dir,
          message:
            `wip(prod-autofix): orphaned worktree for ${fingerprint}\n\n` +
            'The job that owned this never finished. Committed so the checkout could be reclaimed; ' +
            'it had no smoke gate and no review.',
          timeoutMs: input.timeoutMs
        },
        runner
      );
      if (!wip.ok) {
        result.failed.push({dir, detail: wip.detail ?? 'could not commit'});
        continue;
      }
      if (wip.sha) result.preserved.push({dir, sha: wip.sha});

      const removed = await removeWorktree({repoPath: app.repoPath, dir, timeoutMs: input.timeoutMs}, runner);
      if (removed.ok) result.removed.push(dir);
      else result.failed.push({dir, detail: removed.detail ?? 'could not remove'});
    }
  }

  return result;
}
