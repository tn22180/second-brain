import type {Check} from './verify';

export interface LearnRow {
  contractId: string;
  pass: boolean;
  claimedDone: boolean;
  agent: string | null;
  model: string | null;
  round: number | null;
  checks: Check[];
}

export interface Learned {
  byExecutor: {agent: string; model: string; tasks: number; falseDoneTasks: number; falseDoneRate: number; avgRounds: number}[];
  failingChecks: {name: string; tasks: number}[];
  securityKinds: {kind: string; tasks: number}[];
  proposals: string[];
  note?: string;
}

// Thresholds are deliberately conservative: a proposal edits the routing every future run uses,
// so it needs the same pattern on several distinct tasks, not one bad afternoon.
const FALSE_DONE_RATE = 0.4;
const CHECK_TASKS = 3;
const SECURITY_TASKS = 2;

const count = <T>(pairs: [string, T][]) => {
  const m = new Map<string, Set<T>>();
  for (const [k, v] of pairs) (m.get(k) ?? m.set(k, new Set()).get(k)!).add(v);
  return [...m].map(([k, s]) => ({k, n: s.size})).sort((a, b) => b.n - a.n || a.k.localeCompare(b.k));
};

/**
 * Read the ledger and say what the next run should do differently. Output is advice for a human
 * (an MR to the skill), never an edit: the same data that shows a pattern can come from a flaky
 * check, and only a person can tell those apart.
 */
export function learn(rows: LearnRow[], opts: {minTasks?: number} = {}): Learned {
  const minTasks = opts.minTasks ?? 10;
  const claimed = rows.filter(r => r.claimedDone && r.agent);

  const groups = new Map<string, LearnRow[]>();
  for (const r of claimed) {
    const key = `${r.agent}/${r.model ?? '?'}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  const byExecutor = [...groups].map(([key, rs]) => {
    const [agent, model] = key.split('/') as [string, string];
    const tasks = new Map<string, {bad: boolean; rounds: number}>();
    for (const r of rs) {
      const t = tasks.get(r.contractId) ?? {bad: false, rounds: 0};
      t.bad ||= !r.pass;
      t.rounds = Math.max(t.rounds, r.round ?? 1);
      tasks.set(r.contractId, t);
    }
    const vals = [...tasks.values()];
    const bad = vals.filter(v => v.bad).length;
    return {agent, model, tasks: vals.length, falseDoneTasks: bad, falseDoneRate: bad / vals.length,
      avgRounds: vals.reduce((s, v) => s + v.rounds, 0) / vals.length};
  }).sort((a, b) => b.falseDoneRate - a.falseDoneRate || b.tasks - a.tasks);

  // "n1: eslint" (integration verify) is the same check as "eslint" on the node.
  const fails = rows.flatMap(r => r.checks.filter(c => !c.ok && c.name !== 'security').map(c => [c.name.replace(/^[^:]+:\s+/, ''), r.contractId] as [string, string]));
  const failingChecks = count(fails).map(({k, n}) => ({name: k, tasks: n}));
  const sec = rows.flatMap(r => r.checks.filter(c => c.name === 'security' && !c.ok).map(c => [(c.detail ?? '').match(/review:\s*(\S+)/)?.[1] ?? 'unknown', r.contractId] as [string, string]));
  const securityKinds = count(sec).map(({k, n}) => ({kind: k, tasks: n}));

  const totalTasks = new Set(claimed.map(r => r.contractId)).size;
  if (totalTasks < minTasks) {
    return {byExecutor, failingChecks, securityKinds, proposals: [], note: `${totalTasks}/${minTasks} tasks — not enough evidence to propose a change`};
  }
  const proposals: string[] = [];
  for (const e of byExecutor) {
    if (e.tasks >= minTasks / 2 && e.falseDoneRate >= FALSE_DONE_RATE) {
      proposals.push(`tony-wf routing: ${e.agent}/${e.model} claimed done on ${e.falseDoneTasks}/${e.tasks} tasks the verifier then failed (avg ${e.avgRounds.toFixed(1)} rounds) — move its task shapes up a model tier or split them smaller.`);
    }
  }
  for (const c of failingChecks.filter(c => c.tasks >= CHECK_TASKS)) {
    proposals.push(`tony-wf §7 dispatch prompt: \`${c.name}\` failed on ${c.tasks} tasks after the agent said done — tell executors to run it before claiming done.`);
  }
  for (const s of securityKinds.filter(s => s.tasks >= SECURITY_TASKS)) {
    proposals.push(`tony-wf §8 checklist: security review flagged \`${s.kind}\` on ${s.tasks} tasks — add it as a row so the executor checks it up front.`);
  }
  return {byExecutor, failingChecks, securityKinds, proposals};
}

export function learnReport(l: Learned, days: number): string {
  const lines = [`# harness learn — last ${days} days`, ''];
  if (l.note) lines.push(`> ${l.note}`, '');
  lines.push('## Proposals', '', ...(l.proposals.length ? l.proposals.map(p => `- [ ] ${p}`) : ['- none']), '');
  lines.push('## Executors', '', '| agent/model | tasks | false-done | rate | avg rounds |', '|---|---|---|---|---|');
  for (const e of l.byExecutor) lines.push(`| ${e.agent}/${e.model} | ${e.tasks} | ${e.falseDoneTasks} | ${(e.falseDoneRate * 100).toFixed(0)}% | ${e.avgRounds.toFixed(1)} |`);
  lines.push('', '## Failing checks (distinct tasks)', '', ...(l.failingChecks.length ? l.failingChecks.map(c => `- ${c.name}: ${c.tasks}`) : ['- none']));
  lines.push('', '## Security findings (distinct tasks)', '', ...(l.securityKinds.length ? l.securityKinds.map(s => `- ${s.kind}: ${s.tasks}`) : ['- none']), '');
  return lines.join('\n');
}
