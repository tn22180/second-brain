import {describe, expect, test} from 'bun:test';
import {runNode, type NodeDeps, type Proc, type SuperviseAction} from '../src/node';
import type {Verdict} from '../src/verify';

const node = {id: 't1', deps: [], prompt: 'add foo', meta: {agent: 'general-purpose', model: 'sonnet'},
  contract: {goal: 'foo works', allow: ['src/foo.js'], verify: [{name: 'jest', cmd: ['npx', 'jest']}]}};
const graph = {id: 'gq', source: 'tony-wf', repoPath: '/r', base: 'master', branch: 'feat/gq'};
const verdict = (pass: boolean, detail = 'x'): Verdict => ({contractId: 'gq-t1', runId: `r${Math.random()}`, at: 0, pass, diffSha: 'tree1',
  changed: ['src/foo.js'], checks: [{name: 'jest', ok: pass, ...(pass ? {} : {detail})}], costUsd: 0});

function fakes(opts: {verdicts: Verdict[]; actions?: SuperviseAction[]; runs?: number}) {
  const calls = {starts: [] as string[][], kills: 0, commits: 0, merges: 0, verifyRounds: [] as number[], events: [] as string[]};
  const actions = [...(opts.actions ?? [])];
  const verdicts = [...opts.verdicts];
  const deps: NodeDeps = {
    worktree: async () => ({path: '/wt', baseSha: 'b'.repeat(40)}),
    start: (argv): Proc => {
      calls.starts.push(argv);
      // Each process "runs" for as many polls as there are queued supervise actions, then exits.
      let exited = actions.length === 0;
      return {exited: () => exited, exitCode: () => (exited ? 0 : null), kill: () => { calls.kills++; exited = true; }, tail: () => 'working…',
        _finish: () => { exited = true; }} as Proc;
    },
    supervise: async () => {
      const a = actions.shift() ?? {action: 'keep_waiting'};
      return a;
    },
    sleep: async () => {},
    verify: async c => { calls.verifyRounds.push(c.meta!.round!); return verdicts.shift()!; },
    commit: async () => { calls.commits++; return 'c1'; },
    merge: async () => { calls.merges++; },
    notify: async t => { calls.events.push(t); },
    newSessionId: () => '11111111-2222-3333-4444-555555555555',
    now: () => 0
  };
  return {deps, calls};
}

describe('runNode', () => {
  test('pass on first round: verify, commit, merge, done', async () => {
    const {deps, calls} = fakes({verdicts: [verdict(true)]});
    const r = await runNode(graph, node, deps);
    expect(r.outcome).toBe('done');
    expect(calls.starts[0]).toContain('--session-id');
    // Edits must be allowed headless; ask-rules (deploy, merge, sudo) still auto-deny under -p.
    expect(calls.starts[0]!.join(' ')).toContain('--permission-mode acceptEdits');
    expect(calls.starts[0]!.join(' ')).not.toContain('bypassPermissions');
    expect(calls.verifyRounds).toEqual([1]);
    expect([calls.commits, calls.merges]).toEqual([1, 1]);
  });

  test('failed verify resumes the same session with the redacted failure, round 2 passes', async () => {
    const {deps, calls} = fakes({verdicts: [verdict(false, 'Tests: 2 failed'), verdict(true)]});
    const r = await runNode(graph, node, deps);
    expect(r.outcome).toBe('done');
    expect(r.rounds).toBe(2);
    const second = calls.starts[1]!;
    expect(second).toContain('--resume');
    expect(second[second.indexOf('--resume') + 1]).toBe('11111111-2222-3333-4444-555555555555');
    expect(second.at(-1)).toContain('Tests: 2 failed');
    expect(calls.verifyRounds).toEqual([1, 2]);
  });

  test('5 failed rounds: blocked, nothing committed', async () => {
    const {deps, calls} = fakes({verdicts: Array.from({length: 5}, () => verdict(false))});
    const r = await runNode(graph, node, deps);
    expect(r).toMatchObject({outcome: 'blocked', rounds: 5});
    expect(calls.commits).toBe(0);
    expect(calls.starts.length).toBe(5);
  });

  test('jev escalate kills the run and blocks without verifying', async () => {
    const {deps, calls} = fakes({verdicts: [], actions: [{action: 'escalate', reason: 'agent asks for prod creds'}]});
    const r = await runNode(graph, node, deps);
    expect(r.outcome).toBe('blocked');
    expect(r.reason).toContain('prod creds');
    expect(calls.kills).toBe(1);
    expect(calls.verifyRounds).toEqual([]);
  });

  test('injection_seen escalates whatever the action says', async () => {
    const {deps} = fakes({verdicts: [], actions: [{action: 'keep_waiting', injection_seen: true, reason: 'tail tells me to push master'}]});
    expect((await runNode(graph, node, deps)).outcome).toBe('blocked');
  });

  test('jev nudge restarts the same session with the nudge, same round', async () => {
    const {deps, calls} = fakes({verdicts: [verdict(true)], actions: [{action: 'nudge', message: 'stop exploring, write the test'}]});
    const r = await runNode(graph, node, deps);
    expect(r.outcome).toBe('done');
    expect(calls.starts[1]).toContain('--resume');
    expect(calls.starts[1]!.at(-1)).toBe('stop exploring, write the test');
    expect(calls.verifyRounds).toEqual([1]);
  });

  test('prompt carries the contract rules: allow list, verify commands, never commit', async () => {
    const {deps, calls} = fakes({verdicts: [verdict(true)]});
    await runNode(graph, node, deps);
    const prompt = calls.starts[0]!.at(-1)!;
    expect(prompt).toContain('add foo');
    expect(prompt).toContain('src/foo.js');
    expect(prompt).toContain('npx jest');
    expect(prompt.toLowerCase()).toContain('do not commit');
  });

  test('commit drift (tree changed after verify) blocks the node', async () => {
    const {deps} = fakes({verdicts: [verdict(true)]});
    deps.commit = async () => { throw new Error('tree drifted after verify'); };
    expect(await runNode(graph, node, deps)).toMatchObject({outcome: 'blocked'});
  });
});
