export type NodeOutcome = 'done' | 'blocked';
export type NodeState = NodeOutcome | 'skipped';

/**
 * Run a DAG: a node starts once every dep is done, at most `cap` at a time. A blocked node
 * skips everything downstream of it; unrelated branches keep going, so one stuck task does not
 * waste the rest of the run. `prior` carries outcomes from an earlier, interrupted run.
 */
export async function schedule<T extends {id: string; deps: string[]}>(
  nodes: T[],
  cap: number,
  exec: (node: T) => Promise<NodeOutcome>,
  prior: Record<string, NodeState> = {}
): Promise<Record<string, NodeState>> {
  const state: Record<string, NodeState | 'running' | 'pending'> = {};
  for (const n of nodes) state[n.id] = prior[n.id] === 'done' ? 'done' : 'pending';
  const running = new Set<Promise<void>>();

  const settle = () => {
    // Propagate skips until nothing changes: a pending node with any failed ancestor can never run.
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of nodes) {
        if (state[n.id] === 'pending' && n.deps.some(d => state[d] === 'blocked' || state[d] === 'skipped')) {
          state[n.id] = 'skipped';
          changed = true;
        }
      }
    }
  };

  for (;;) {
    settle();
    const ready = nodes.filter(n => state[n.id] === 'pending' && n.deps.every(d => state[d] === 'done'));
    for (const n of ready) {
      if (running.size >= cap) break;
      state[n.id] = 'running';
      const p: Promise<void> = exec(n)
        .catch((): NodeOutcome => 'blocked')
        .then(outcome => {
          state[n.id] = outcome;
          running.delete(p);
        });
      running.add(p);
    }
    if (running.size === 0) break;
    await Promise.race(running);
  }
  settle();
  return Object.fromEntries(nodes.map(n => [n.id, state[n.id] as NodeState]));
}
