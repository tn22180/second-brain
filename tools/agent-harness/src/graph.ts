import {isAbsolute} from 'node:path';
import {parseContract, type Contract} from './contract';

/** A node's contract minus what the runner fills in at dispatch (id, repoPath, baseSha). */
export type NodeContract = Omit<Contract, 'id' | 'repoPath' | 'baseSha' | 'source'>;

export interface GraphNode {
  id: string;
  deps: string[];
  prompt: string;
  contract: NodeContract;
  meta?: Contract['meta'];
  /** Per-round wall clock; default 45. A 7-part change on opus needs more. */
  wallMinutes?: number;
}

export interface Graph {
  id: string;
  source: string;
  /** Main checkout; worktrees are cut beside it. */
  repoPath: string;
  base: string;
  /** Ref to cut the integration branch from; default fresh `origin/<base>`. For unpushed local work. */
  baseRef?: string;
  /** Repo-relative dirs (nested node_modules) symlinked from the main checkout into every worktree. */
  linkPaths?: string[];
  /** Integration branch the runner builds. Never pushed by the runner. */
  branch: string;
  maxParallel: number;
  nodes: GraphNode[];
  /** Topological order. */
  order: string[];
}

type Parsed = {ok: true; graph: Graph} | {ok: false; error: string};

const SAFE_ID = /^[A-Za-z0-9._-]+$/;
const BASE_BRANCHES = new Set(['master', 'main', 'develop']);
const RUNNER_OWNED = ['id', 'repoPath', 'baseSha', 'source'] as const;

/** Two allow entries collide when equal or one is a directory ('x/') containing the other. */
function overlaps(a: string[], b: string[]): string | undefined {
  for (const x of a) {
    for (const y of b) {
      if (x === y || (x.endsWith('/') && y.startsWith(x)) || (y.endsWith('/') && x.startsWith(y))) return `${x} ~ ${y}`;
    }
  }
  return undefined;
}

export function parseGraph(raw: unknown): Parsed {
  const g = raw as Partial<Graph> | null;
  if (!g || typeof g !== 'object') return {ok: false, error: 'graph must be an object'};
  if (typeof g.id !== 'string' || !SAFE_ID.test(g.id) || g.id.includes('..')) return {ok: false, error: 'id: [A-Za-z0-9._-]+ only'};
  if (typeof g.source !== 'string' || !g.source) return {ok: false, error: 'source: required'};
  if (typeof g.repoPath !== 'string' || !isAbsolute(g.repoPath)) return {ok: false, error: 'repoPath: absolute path required'};
  if (typeof g.base !== 'string' || !g.base) return {ok: false, error: 'base: required'};
  if (typeof g.branch !== 'string' || !g.branch || g.branch === g.base || BASE_BRANCHES.has(g.branch)) {
    return {ok: false, error: 'branch: a feature branch, never the base'};
  }
  // Passed to git as an argument: no leading dash (option injection), no whitespace.
  if (g.baseRef !== undefined && (typeof g.baseRef !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(g.baseRef) || g.baseRef.startsWith('-'))) {
    return {ok: false, error: 'baseRef: a plain ref name'};
  }
  if (g.linkPaths !== undefined && (!Array.isArray(g.linkPaths) || g.linkPaths.some(p => typeof p !== 'string' || !p || isAbsolute(p) || p.split('/').includes('..')))) {
    return {ok: false, error: 'linkPaths: repo-relative paths, no ..'};
  }
  const maxParallel = g.maxParallel ?? 3;
  if (!Number.isInteger(maxParallel) || maxParallel < 1 || maxParallel > 8) return {ok: false, error: 'maxParallel: 1..8'};
  if (!Array.isArray(g.nodes) || g.nodes.length === 0) return {ok: false, error: 'nodes: at least one required'};

  const byId = new Map<string, GraphNode>();
  for (const n of g.nodes as GraphNode[]) {
    if (!n || typeof n.id !== 'string' || !SAFE_ID.test(n.id) || n.id.includes('..')) return {ok: false, error: 'node id: [A-Za-z0-9._-]+ only'};
    if (byId.has(n.id)) return {ok: false, error: `duplicate node ${n.id}`};
    if (!Array.isArray(n.deps) || n.deps.some(d => typeof d !== 'string')) return {ok: false, error: `node ${n.id}: deps must be string[]`};
    if (typeof n.prompt !== 'string' || !n.prompt) return {ok: false, error: `node ${n.id}: prompt required`};
    if (n.wallMinutes !== undefined && (!Number.isInteger(n.wallMinutes) || n.wallMinutes < 5 || n.wallMinutes > 180)) {
      return {ok: false, error: `node ${n.id}: wallMinutes 5..180`};
    }
    const c = n.contract as Record<string, unknown> | undefined;
    if (!c || typeof c !== 'object') return {ok: false, error: `node ${n.id}: contract required`};
    for (const k of RUNNER_OWNED) {
      if (k in c) return {ok: false, error: `node ${n.id}: contract.${k} is set by the runner`};
    }
    // Validate with placeholder runner fields, so node contracts get the same rules as standalone ones.
    const probe = parseContract({...c, id: `${g.id}-${n.id}`, source: g.source, repoPath: '/probe', baseSha: '0'.repeat(40), meta: n.meta});
    if (!probe.ok) return {ok: false, error: `node ${n.id}: ${probe.error}`};
    byId.set(n.id, n);
  }
  for (const n of byId.values()) {
    for (const d of n.deps) if (!byId.has(d)) return {ok: false, error: `node ${n.id}: unknown dep ${d}`};
  }

  // Kahn's algorithm; leftovers mean a cycle.
  const indeg = new Map([...byId.keys()].map(id => [id, byId.get(id)!.deps.length]));
  const queue = [...byId.keys()].filter(id => indeg.get(id) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const n of byId.values()) {
      if (n.deps.includes(id)) {
        indeg.set(n.id, indeg.get(n.id)! - 1);
        if (indeg.get(n.id) === 0) queue.push(n.id);
      }
    }
  }
  if (order.length !== byId.size) return {ok: false, error: `cycle among ${[...byId.keys()].filter(id => !order.includes(id)).join(', ')}`};

  // ancestors[id] = every node that must finish before id.
  const ancestors = new Map<string, Set<string>>();
  for (const id of order) {
    const set = new Set<string>();
    for (const d of byId.get(id)!.deps) {
      set.add(d);
      for (const a of ancestors.get(d)!) set.add(a);
    }
    ancestors.set(id, set);
  }
  // Nodes with no path between them may run at once; their files must not collide, or the
  // integration merge conflicts and each scope check vouches for a tree the other also edits.
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      const [a, b] = [order[i]!, order[j]!];
      if (ancestors.get(a)!.has(b) || ancestors.get(b)!.has(a)) continue;
      const hit = overlaps(byId.get(a)!.contract.allow, byId.get(b)!.contract.allow);
      if (hit) return {ok: false, error: `nodes ${a} and ${b} can run concurrently but allow sets overlap (${hit}) — add a dep or split files`};
    }
  }

  return {ok: true, graph: {...(g as Graph), maxParallel, nodes: [...byId.values()], order}};
}
