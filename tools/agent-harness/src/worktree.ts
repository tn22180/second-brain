import {existsSync, symlinkSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {spawnRunner, type Runner} from '../../prod-error-autofix/src/gcloud/run';

const GIT_TIMEOUT = 120_000;

export interface GraphRef {
  id: string;
  repoPath: string;
  base: string;
  baseRef?: string;
  linkPaths?: string[];
  branch: string;
}

/** Sibling dirs, the `<repo>-wt-<x>` convention the rest of the workspace already uses. */
export function paths(g: GraphRef, nodeId: string) {
  return {
    integration: `${g.repoPath}-wt-${g.id}`,
    node: `${g.repoPath}-wt-${g.id}-${nodeId}`,
    nodeBranch: `${g.branch}--${nodeId}`
  };
}

async function git(cwd: string, args: string[], runner: Runner = spawnRunner): Promise<string> {
  const r = await runner(['git', ...args], GIT_TIMEOUT, {cwd});
  if (r.code !== 0 || r.timedOut) throw new Error(`git ${args[0]} failed: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
  return r.stdout.trim();
}

const ok = async (cwd: string, args: string[]) => (await spawnRunner(['git', ...args], GIT_TIMEOUT, {cwd})).code === 0;

// Worktrees don't carry node_modules. Product repos hoist to the root (yarn 4); second-brain keeps
// one per tool, named in the graph's linkPaths.
function linkDeps(repoPath: string, wt: string, extra: string[] = []) {
  for (const rel of ['node_modules', ...extra]) {
    const src = join(repoPath, rel);
    const dst = join(wt, rel);
    if (existsSync(src) && !existsSync(dst) && existsSync(dirname(dst))) symlinkSync(src, dst);
  }
}

/** The integration worktree on `g.branch`, cut from fresh `origin/<base>` (or local base with no remote). */
export async function ensureIntegration(g: GraphRef): Promise<string> {
  if (g.branch === g.base) throw new Error(`branch ${g.branch} is the base`);
  const {integration} = paths(g, '_');
  if (existsSync(integration)) return integration;
  const baseRef = await resolveBaseRef(g, true);
  const exists = await ok(g.repoPath, ['rev-parse', '--verify', '-q', `refs/heads/${g.branch}`]);
  await git(g.repoPath, exists ? ['worktree', 'add', '-q', integration, g.branch] : ['worktree', 'add', '-q', '-b', g.branch, integration, baseRef]);
  linkDeps(g.repoPath, integration, g.linkPaths);
  return integration;
}

async function resolveBaseRef(g: GraphRef, fetch: boolean): Promise<string> {
  if (g.baseRef) return g.baseRef;
  if (fetch && (await ok(g.repoPath, ['remote', 'get-url', 'origin']))) await git(g.repoPath, ['fetch', '-q', 'origin', g.base]);
  return (await ok(g.repoPath, ['rev-parse', '--verify', '-q', `origin/${g.base}`])) ? `origin/${g.base}` : g.base;
}

/**
 * A detached scratch worktree at the integration branch's base with the branch's whole tree
 * staged and checked out — so `harness verify` sees the combined change as one diff and records
 * the branch tip's own tree, which is what the push gate asks the ledger about.
 */
export async function combinedWorktree(g: GraphRef): Promise<{path: string; baseSha: string}> {
  const scratch = `${g.repoPath}-wt-${g.id}-_combined`;
  if (existsSync(scratch)) await git(g.repoPath, ['worktree', 'remove', '--force', scratch]);
  const baseSha = await git(g.repoPath, ['merge-base', g.branch, await resolveBaseRef(g, false)]);
  await git(g.repoPath, ['worktree', 'add', '-q', '--detach', scratch, baseSha]);
  await git(scratch, ['read-tree', '-m', '-u', g.branch]);
  await git(scratch, ['reset', '-q']);
  linkDeps(g.repoPath, scratch, g.linkPaths);
  return {path: scratch, baseSha};
}

export async function removeWorktree(g: GraphRef, path: string): Promise<void> {
  await git(g.repoPath, ['worktree', 'remove', '--force', path]);
}

/** A node's own worktree, cut from the integration tip so it builds on its deps' merged work. */
export async function nodeWorktree(g: GraphRef, nodeId: string): Promise<{path: string; baseSha: string}> {
  const p = paths(g, nodeId);
  if (!existsSync(p.node)) {
    const tip = await git(p.integration, ['rev-parse', 'HEAD']);
    const exists = await ok(g.repoPath, ['rev-parse', '--verify', '-q', `refs/heads/${p.nodeBranch}`]);
    await git(g.repoPath, exists ? ['worktree', 'add', '-q', p.node, p.nodeBranch] : ['worktree', 'add', '-q', '-b', p.nodeBranch, p.node, tip]);
    linkDeps(g.repoPath, p.node, g.linkPaths);
  }
  return {path: p.node, baseSha: await git(p.node, ['rev-parse', 'HEAD'])};
}

/**
 * Commit exactly the tree the verifier passed. Re-stage the allowed paths and compare the
 * write-tree with the verdict's sha: an agent (or a formatter) touching files after verify
 * would otherwise land unverified code on the branch.
 */
export async function commitVerified(wt: string, allow: string[], diffSha: string, message: string): Promise<string> {
  const present: string[] = [];
  for (const a of allow) if (existsSync(join(wt, a)) || (await ok(wt, ['ls-files', '--error-unmatch', '--', a]))) present.push(a);
  if (present.length) await git(wt, ['add', '-A', '--', ...present]);
  const tree = await git(wt, ['write-tree']);
  if (tree !== diffSha) {
    await git(wt, ['reset', '-q']);
    throw new Error(`tree drifted after verify: ${tree.slice(0, 8)} != ${diffSha.slice(0, 8)}`);
  }
  await git(wt, ['commit', '-q', '-m', message]);
  return git(wt, ['rev-parse', 'HEAD']);
}

/** Merge a finished node into the integration branch and drop its worktree + local branch. */
export async function mergeNode(g: GraphRef, nodeId: string, message: string): Promise<void> {
  const p = paths(g, nodeId);
  await git(p.integration, ['merge', '-q', '--no-ff', '-m', message, p.nodeBranch]);
  await git(g.repoPath, ['worktree', 'remove', '--force', p.node]);
  await git(g.repoPath, ['branch', '-q', '-D', p.nodeBranch]);
}
