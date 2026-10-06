import type {Contract, VerifyCommand} from './contract';
import type {GraphNode} from './graph';
import {redact} from './redact';
import type {NodeOutcome} from './scheduler';
import type {Verdict} from './verify';

export const MAX_ROUNDS = 5;
// A nudge restarts the process; past this many in one round the agent is not converging.
const MAX_NUDGES = 3;
const POLL_MS = 60_000;
const DEFAULT_WALL_MIN = 45;
export const DEFAULT_CODEX_MODEL = 'gpt-6-astra';

export interface Proc {
  exited(): boolean;
  exitCode(): number | null;
  kill(): void;
  /** Last lines of the run's output, for the supervisor. */
  tail(): string;
  /** Codex picks its own thread id; the adapter reads it back from the run's JSONL log. */
  threadId?(): string | undefined;
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
  worktree(): Promise<{path: string; baseSha: string; fresh: boolean}>;
  /** Run checks on the worktree as it is; returns one line per failing check. */
  preflight(cmds: VerifyCommand[], cwd: string): Promise<string[]>;
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
 * Coding goes to Codex unless the node opts into Claude: `meta.executor: 'claude'`. A Claude
 * alias left in `meta.model` (graphs written before the switch) does not pin Claude — only
 * a `gpt-*` model is passed through to Codex.
 */
export function argvFor(node: GraphNode, sid: string, text: string, resume: boolean, threadId?: string): string[] {
  const model = node.meta?.model;
  if (node.meta?.executor === 'claude') {
    return [
      'cc', '-p', '--permission-mode', 'acceptEdits', ...(resume ? ['--resume', sid] : ['--session-id', sid]),
      // stream-json: the log fills as the agent works, so the supervisor judges real progress
      // instead of an empty tail (text mode prints only at exit).
      ...(model ? ['--model', model] : []), '--output-format', 'stream-json', '--verbose', text
    ];
  }
  // Called directly, not via `cc codex`: that wrapper path dies on BSD `date +%N` and self-upgrades
  // over local edits. workspace-write keeps writes inside the worktree; `exec` never asks for approval.
  const opts = ['--json', '-m', model?.startsWith('gpt-') ? model : DEFAULT_CODEX_MODEL, '-c', 'sandbox_mode="workspace-write"'];
  return resume && threadId ? ['codex', 'exec', 'resume', ...opts, threadId, text] : ['codex', 'exec', ...opts, text];
}

/**
 * One node, end to end: dispatch Codex (or `cc -p`) in its worktree, let `jev supervise` watch it, verify
 * the result independently, resume the same session with the failure until it passes or the
 * round cap is hit, then commit exactly the verified tree and merge it into the integration branch.
 */
export async function runNode(graph: GraphInfo, node: GraphNode, deps: NodeDeps): Promise<NodeResult> {
  const {path, baseSha, fresh} = await deps.worktree();
  const sid = deps.newSessionId();
  const codex = node.meta?.executor !== 'claude';
  let threadId: string | undefined;
  let proc: Proc | undefined;
  const launch = (text: string, resume: boolean): Proc => {
    threadId = proc?.threadId?.() ?? threadId;
    // Codex without a thread id to resume (it died before printing one) starts over with the full task.
    const lost = codex && resume && !threadId;
    proc = deps.start(argvFor(node, sid, lost ? `${buildPrompt(node)}\n\n${text}` : text, resume && !lost, threadId), path);
    return proc;
  };
  const runIds: string[] = [];
  const wallMs = (node.wallMinutes ?? DEFAULT_WALL_MIN) * 60_000;
  const blocked = async (rounds: number, reason: string): Promise<NodeResult> => {
    await deps.notify(`⛔ ${node.id} blocked (round ${rounds}): ${redact(reason).slice(0, 200)}`);
    return {outcome: 'blocked', rounds, reason, runIds};
  };

  // Only on a fresh worktree: after a resume the tree holds the agent's work, not the base.
  const pre = node.contract.verify.filter(v => v.preflight);
  if (fresh && pre.length) {
    const failing = await deps.preflight(pre, path);
    if (failing.length) return blocked(0, `check fails before any change — fix the contract or env, not the code: ${failing.join('; ')}`);
  }

  const contractFor = (round: number): Contract => ({...node.contract, id: `${graph.id}-${node.id}`, source: graph.source,
    repoPath: path, baseSha, meta: {...node.meta, round}});
  const finish = async (v: Verdict, round: number): Promise<NodeResult> => {
    try {
      await deps.commit(path, node.contract.allow, v.diffSha, `${node.id}: ${node.contract.goal}`.slice(0, 200));
      await deps.merge(`Merge node ${node.id} (${v.runId})`);
    } catch (e) {
      return blocked(round, e instanceof Error ? e.message : String(e));
    }
    return {outcome: 'done', rounds: round, runIds};
  };

  let message = buildPrompt(node);
  let firstRound = 1;
  // A rerun finds the previous attempt's work still in the worktree. Check it before paying for
  // an agent: it may already pass (the old failure was the contract's), or the agent starts
  // from the concrete failure instead of re-deriving the task.
  if (!fresh) {
    const v = await deps.verify(contractFor(1));
    runIds.push(v.runId);
    if (v.pass) return finish(v, 1);
    message = `${message}\n\n## Work from a previous attempt is already in this worktree\n${failureText(v)}`;
    firstRound = 2;
  }

  let resume = false;
  for (let round = firstRound; round <= MAX_ROUNDS; round++) {
    let nudges = 0;
    let p = launch(message, resume);
    resume = true;
    const started = deps.now();
    let lastTail = '';
    let quietSince = started;
    for (;;) {
      if (p.exited()) break;
      await deps.sleep(POLL_MS);
      if (p.exited()) break;
      const tail = p.tail();
      const now = deps.now();
      if (tail !== lastTail) quietSince = now;
      if (now - started > wallMs) {
        p.kill();
        return blocked(round, `round exceeded ${wallMs / 60_000} min`);
      }
      const a = await deps.supervise({goal: node.contract.goal, tail, elapsed_s: (now - started) / 1000,
        quiet_s: (now - quietSince) / 1000, new_output: tail !== lastTail, looping: false, exited: false});
      lastTail = tail;
      // An instruction in the agent's output that tries to steer the supervisor is an attack, not a hint.
      if (a.injection_seen || a.action === 'escalate') {
        p.kill();
        return blocked(round, `jev escalate: ${a.reason ?? 'no reason'}`);
      }
      if (a.action === 'nudge' || a.action === 'answer_question') {
        if (++nudges > MAX_NUDGES) {
          p.kill();
          return blocked(round, `${MAX_NUDGES} nudges without converging`);
        }
        p.kill();
        p = launch(a.message ?? a.answer ?? a.reason ?? 'continue', true);
      }
    }

    const v = await deps.verify(contractFor(round));
    runIds.push(v.runId);
    if (v.pass) return finish(v, round);
    message = failureText(v);
  }
  return blocked(MAX_ROUNDS, `verify still failing after ${MAX_ROUNDS} rounds`);
}
