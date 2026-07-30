import {spawnRunner, type Runner} from '../gcloud/run';

/**
 * Has a fix branch landed on the base branch, and when?
 *
 * Deliberately git-only. `glab auth status` on this machine returns 401 with no
 * token in the config, keyring or environment, while git operations are wired
 * over SSH — so the GitLab API is not available but `git fetch` is. Everything
 * here works with the SSH key alone.
 */

export interface MergeInfo {
  merged: boolean;
  mergedAtMs: number | undefined;
  /** Commit that carried the fix onto the base branch, when identifiable. */
  landedSha: string | undefined;
  branchStillExists: boolean;
}

export type MergeProbeResult = {ok: true; value: MergeInfo} | {ok: false; detail: string};

export interface ProbeMergeInput {
  repoPath: string;
  baseBranch: string;
  fixSha: string;
  fixBranch: string | undefined;
  timeoutMs: number;
}

export async function probeMerge(
  input: ProbeMergeInput,
  runner: Runner = spawnRunner
): Promise<MergeProbeResult> {
  const {repoPath, baseBranch, fixSha, timeoutMs} = input;
  const git = (args: string[]) => runner(['git', '-C', repoPath, ...args], timeoutMs);

  const fetched = await git(['fetch', '--quiet', 'origin', baseBranch]);
  if (fetched.code !== 0) {
    return {ok: false, detail: (fetched.stderr || fetched.stdout).trim().slice(0, 300)};
  }

  const known = await git(['cat-file', '-e', `${fixSha}^{commit}`]);
  if (known.code !== 0) {
    return {ok: false, detail: `fix sha ${fixSha} not present in ${repoPath}`};
  }

  const ancestor = await git(['merge-base', '--is-ancestor', fixSha, `origin/${baseBranch}`]);
  // git returns 0 for ancestor, 1 for not, anything else is a real error.
  if (ancestor.code !== 0 && ancestor.code !== 1) {
    return {ok: false, detail: (ancestor.stderr || ancestor.stdout).trim().slice(0, 300)};
  }
  const merged = ancestor.code === 0;

  let branchStillExists = false;
  if (input.fixBranch) {
    const ls = await git(['ls-remote', '--heads', 'origin', input.fixBranch]);
    branchStillExists = ls.code === 0 && ls.stdout.trim().length > 0;
  }

  if (!merged) return {ok: true, value: {merged: false, mergedAtMs: undefined, landedSha: undefined, branchStillExists}};

  // The oldest commit on the ancestry path from the fix to the base tip is the
  // commit that put it there — the merge commit, or the fast-forward child. Its
  // committer date is when the fix landed.
  //
  // Using the base tip's own date instead would drift forward every time anyone
  // pushes, which would keep mergedAtMs ahead of deployedAtMs and pin the
  // fingerprint at `awaiting_deploy` forever.
  const path = await git(['rev-list', '--ancestry-path', `${fixSha}..origin/${baseBranch}`]);
  const shas = path.code === 0 ? path.stdout.trim().split('\n').filter(Boolean) : [];
  const landedSha = shas.length ? shas[shas.length - 1] : fixSha;

  const when = await git(['show', '-s', '--format=%cI', landedSha!]);
  const mergedAtMs = when.code === 0 ? parseIso(when.stdout) : undefined;

  return {ok: true, value: {merged: true, mergedAtMs, landedSha, branchStillExists}};
}

function parseIso(value: string): number | undefined {
  const ms = Date.parse(value.trim());
  return Number.isFinite(ms) ? ms : undefined;
}
