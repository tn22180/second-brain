import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {preflightChecks, startProc, superviseJev} from './adapters';
import type {Graph} from './graph';
import type {Ledger} from './ledger';
import {runNode, type NodeDeps} from './node';
import {redact} from './redact';
import {schedule, type NodeState} from './scheduler';
import {verify} from './verify';
import type {Contract} from './contract';
import {combinedWorktree, commitVerified, ensureIntegration, mergeNode, nodeWorktree, removeWorktree} from './worktree';

export interface RunGraphOpts {
  ledger: Ledger;
  notify: (html: string) => Promise<void>;
  start?: NodeDeps['start'];
  supervise?: NodeDeps['supervise'];
  sleep?: NodeDeps['sleep'];
  preflight?: NodeDeps['preflight'];
  logDir?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Serialise git operations that touch the integration branch or the shared worktree list. */
function mutex() {
  let tail = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn);
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
}

/**
 * Run every node of the graph to a verified, merged commit on `graph.branch`, or block it.
 * Ends at a local integration branch: pushing stays in a Claude session, where git_guard is.
 */
/** Every node's checks, run once more on the merged code: two nodes can each pass alone and still break each other. */
async function verifyCombined(graph: Graph, ledger: Ledger): Promise<{runId?: string; failed?: string}> {
  const wt = await combinedWorktree(graph);
  try {
    const security = graph.nodes.find(n => n.contract.security)?.contract.security;
    const c: Contract = {
      id: `${graph.id}-integration`,
      source: graph.source,
      goal: `integration of ${graph.order.join(', ')}`,
      repoPath: wt.path,
      baseSha: wt.baseSha,
      allow: [...new Set(graph.nodes.flatMap(n => n.contract.allow))],
      verify: graph.order.flatMap(id => graph.nodes.find(n => n.id === id)!.contract.verify.map(v => ({...v, name: `${id}: ${v.name}`}))),
      ...(security ? {security} : {}),
      meta: {agent: 'graph-integration'}
    };
    const v = await verify(c);
    ledger.recordVerdict(v, c, false);
    return v.pass ? {runId: v.runId} : {failed: v.checks.filter(x => !x.ok).map(x => `${x.name}: ${x.detail ?? 'failed'}`).join('; ')};
  } finally {
    await removeWorktree(graph, wt.path).catch(() => {});
  }
}

export async function runGraph(
  graph: Graph,
  opts: RunGraphOpts
): Promise<{outcomes: Record<string, NodeState>; integration: string; integrationRunId?: string}> {
  const {ledger} = opts;
  const title = `<b>${esc(graph.id)}</b>`;
  const dm = (line: string) => opts.notify(`${title}\n${esc(redact(line))}`).catch(() => {});
  const logDir = opts.logDir ?? join(homedir(), '.cache', 'agent-harness', 'graphs', graph.id);
  mkdirSync(logDir, {recursive: true});
  const lock = mutex();
  const integration = await ensureIntegration(graph);

  const prior: Record<string, NodeState> = {};
  for (const [id, s] of Object.entries(ledger.graphNodes(graph.id))) if (s.state === 'done') prior[id] = 'done';

  const ordered = graph.order.map(id => graph.nodes.find(n => n.id === id)!);
  const outcomes = await schedule(ordered, graph.maxParallel, async node => {
    ledger.setNode(graph.id, node.id, {state: 'running', rounds: 0});
    const r = await runNode(graph, node, {
      worktree: () => lock(() => nodeWorktree(graph, node.id)),
      preflight: opts.preflight ?? preflightChecks,
      start: (argv, cwd) => (opts.start ?? ((a, c) => startProc(a, c, join(logDir, `${node.id}.log`))))(argv, cwd),
      supervise: opts.supervise ?? superviseJev,
      sleep: opts.sleep ?? (ms => new Promise(res => setTimeout(res, ms))),
      verify: async c => {
        const v = await verify(c);
        ledger.recordVerdict(v, c, true);
        return v;
      },
      commit: commitVerified,
      merge: m => lock(() => mergeNode(graph, node.id, m)),
      notify: t => dm(t),
      newSessionId: randomUUID,
      now: Date.now
    });
    ledger.setNode(graph.id, node.id, {state: r.outcome, rounds: r.rounds, runIds: r.runIds, reason: r.reason});
    return r.outcome;
  }, prior);

  for (const [id, s] of Object.entries(outcomes)) if (s === 'skipped') ledger.setNode(graph.id, id, {state: 'skipped', rounds: 0});
  const icon: Record<NodeState, string> = {done: '✅', blocked: '⛔', skipped: '⏭'};
  const allDone = Object.values(outcomes).every(s => s === 'done');
  const lines = graph.order.map(id => `${icon[outcomes[id]!]} ${id}`).join(' · ');
  if (!allDone) {
    await dm(`BLOCKED — ${lines}`);
    return {outcomes, integration};
  }
  const combined = await verifyCombined(graph, ledger).catch(e => ({failed: e instanceof Error ? e.message : String(e)}) as {runId?: string; failed?: string});
  if (!combined.runId) {
    await dm(`integration verify FAILED — ${lines}\n${(combined.failed ?? '').slice(0, 300)}`);
    return {outcomes, integration};
  }
  await dm(`ready to push ${graph.branch} — ${lines}`);
  return {outcomes, integration, integrationRunId: combined.runId};
}
