import type {Contract} from './contract';
import type {GraphNode} from './graph';
import {redact} from './redact';
import type {NodeOutcome} from './scheduler';
import type {Verdict} from './verify';

export const MAX_ROUNDS = 5;
// A nudge restarts the process; past this many in one round the agent is not converging.
const MAX_NUDGES = 3;
const POLL_MS = 60_000;
const ROUND_WALL_MS = 45 * 60_000;

export interface Proc {
  exited(): boolean;
  exitCode(): number | null;
  kill(): void;
  /** Last lines of the run's output, for the supervisor. */
  tail(): string;
}

/** `jev supervise` output. */
export interface SuperviseAction {
  action: 'keep_waiting' | 'answer_question' | 'nudge' | 'escalate' | 'collect';
  reason?: string;
  message?: string;
  answer?: string;
  injection_seen?: boolean;
}

export interface NodeDeps {
  worktree(): Promise<{path: string; baseSha: string}>;
  start(argv: string[], cwd: string): Proc;
  supervise(input: {goal: string; tail: string; elapsed_s: number; quiet_s: number; new_output: boolean; looping: boolean; exited: boolean}): Promise<SuperviseAction>;
  sleep(ms: number): Promise<void>;
  verify(c: Contract): Promise<Verdict>;
  commit(wt: string, allow: string[], diffSha: string, message: string): Promise<string>;
  merge(message: string): Promise<void>;
  notify(text: string): Promise<void>;
  newSessionId(): string;
  now(): number;
}

export interface NodeResult {
  outcome: NodeOutcome;
  rounds: number;
  reason?: string;
  runIds: string[];
}

interface GraphInfo {
  id: string;
  source: string;
}

export function buildPrompt(node: GraphNode): string {
  const c = node.contract;
  return [
    node.prompt,
    '',
    '## Contract (fixed before you started; an independent verifier checks it)',
    `Goal: ${c.goal}`,
    `You may change ONLY these paths: ${c.allow.join(', ')}`,
    'Postconditions, each must exit 0:',
    ...c.verify.map(v => `- ${v.name}: \`${v.cmd.join(' ')}\``),
    ...(c.reproduce ? [`New tests must fail with your source change reverted: \`${c.reproduce.testCmd.join(' ')}\``] : []),
    '',
    'Rules: do not commit, do not push, do not stash, do not touch files outside the list. Run the',
    'postconditions yourself before you stop. When done, end with one line: DONE or BLOCKED: <why>.'
  ].join('\n');
}

const failureText = (v: Verdict) =>
  redact(
    [
      'Harness verify FAILED. Fix it without leaving the allowed paths, then re-run the checks.',
      ...v.checks.filter(c => !c.ok).map(c => `- ${c.name}: ${c.detail ?? 'failed'}`)
    ].join('\n')
  );

/**
 * One node, end to end: dispatch `cc -p` in its worktree, let `jev supervise` watch it, verify
 * the result independently, resume the same session with the failure until it passes or the
 * round cap is hit, then commit exactly the verified tree and merge it into the integration branch.
 */
export async function runNode(graph: GraphInfo, node: GraphNode, deps: NodeDeps): Promise<NodeResult> {
  const {path, baseSha} = await deps.worktree();
  const sid = deps.newSessionId();
  const model = node.meta?.model;
  const argvFor = (text: string, resume: boolean) => [
    'cc', '-p', '--permission-mode', 'acceptEdits', ...(resume ? ['--resume', sid] : ['--session-id', sid]),
    ...(model ? ['--model', model] : []), '--output-format', 'text', text
  ];
  const runIds: string[] = [];
  const blocked = async (rounds: number, reason: string): Promise<NodeResult> => {
    await deps.notify(`⛔ ${node.id} blocked (round ${rounds}): ${redact(reason).slice(0, 200)}`);
    return {outcome: 'blocked', rounds, reason, runIds};
  };

  let message = buildPrompt(node);
  let resume = false;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    let nudges = 0;
    let proc = deps.start(argvFor(message, resume), path);
    resume = true;
    const started = deps.now();
    let lastTail = '';
    let quietSince = started;
    for (;;) {
      if (proc.exited()) break;
      await deps.sleep(POLL_MS);
      if (proc.exited()) break;
      const tail = proc.tail();
      const now = deps.now();
      if (tail !== lastTail) quietSince = now;
      if (now - started > ROUND_WALL_MS) {
        proc.kill();
        return blocked(round, `round exceeded ${ROUND_WALL_MS / 60_000} min`);
      }
      const a = await deps.supervise({goal: node.contract.goal, tail, elapsed_s: (now - started) / 1000,
        quiet_s: (now - quietSince) / 1000, new_output: tail !== lastTail, looping: false, exited: false});
      lastTail = tail;
      // An instruction in the agent's output that tries to steer the supervisor is an attack, not a hint.
      if (a.injection_seen || a.action === 'escalate') {
        proc.kill();
        return blocked(round, `jev escalate: ${a.reason ?? 'no reason'}`);
      }
      if (a.action === 'nudge' || a.action === 'answer_question') {
        if (++nudges > MAX_NUDGES) {
          proc.kill();
          return blocked(round, `${MAX_NUDGES} nudges without converging`);
        }
        proc.kill();
        proc = deps.start(argvFor(a.message ?? a.answer ?? a.reason ?? 'continue', true), path);
      }
    }

    const contract: Contract = {...node.contract, id: `${graph.id}-${node.id}`, source: graph.source, repoPath: path, baseSha,
      meta: {...node.meta, round}};
    const v = await deps.verify(contract);
    runIds.push(v.runId);
    if (v.pass) {
      try {
        await deps.commit(path, node.contract.allow, v.diffSha, `${node.id}: ${node.contract.goal}`.slice(0, 200));
        await deps.merge(`Merge node ${node.id} (${v.runId})`);
      } catch (e) {
        return blocked(round, e instanceof Error ? e.message : String(e));
      }
      return {outcome: 'done', rounds: round, runIds};
    }
    message = failureText(v);
  }
  return blocked(MAX_ROUNDS, `verify still failing after ${MAX_ROUNDS} rounds`);
}
