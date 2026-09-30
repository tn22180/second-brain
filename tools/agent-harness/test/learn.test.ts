import {describe, expect, test} from 'bun:test';
import {learn, type LearnRow} from '../src/learn';

const row = (contract: string, pass: boolean, o: Partial<LearnRow> = {}): LearnRow => ({
  contractId: contract, pass, claimedDone: true, agent: 'general-purpose', model: 'sonnet', round: 1,
  checks: [{name: 'jest', ok: pass, ...(pass ? {} : {detail: 'Tests: 1 failed'})}], ...o
});

describe('learn', () => {
  test('too little evidence: no proposals, says how much is missing', () => {
    const r = learn([row('a', true), row('b', false)], {minTasks: 5});
    expect(r.proposals).toEqual([]);
    expect(r.note).toContain('2/5');
  });

  test('executor that false-dones on most of its tasks gets a routing proposal; a good one does not', () => {
    const rows = [
      ...['a', 'b', 'c', 'd', 'e'].flatMap(t => [row(t, false, {model: 'haiku', agent: 'cavecrew-builder'}), row(t, true, {model: 'haiku', agent: 'cavecrew-builder', round: 2})]),
      ...['f', 'g', 'h', 'i', 'j'].map(t => row(t, true, {model: 'opus'}))
    ];
    const r = learn(rows, {minTasks: 5});
    const ex = r.byExecutor.find(e => e.model === 'haiku')!;
    expect(ex).toMatchObject({tasks: 5, falseDoneTasks: 5, falseDoneRate: 1, avgRounds: 2});
    expect(r.proposals.some(p => p.includes('cavecrew-builder/haiku') && p.includes('5/5'))).toBe(true);
    expect(r.proposals.some(p => p.includes('opus'))).toBe(false);
  });

  test('a check that keeps failing across tasks becomes a pre-done instruction', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map(t => row(t, false, {checks: [{name: 'eslint', ok: false, detail: 'x'}, {name: 'jest', ok: true}]}));
    const r = learn(rows, {minTasks: 5});
    expect(r.failingChecks[0]).toEqual({name: 'eslint', tasks: 5});
    expect(r.proposals.some(p => p.includes('eslint'))).toBe(true);
  });

  test('integration check names are folded to the node check name', () => {
    const rows = ['a', 'b', 'c'].map(t => row(t, false, {checks: [{name: 'n1: eslint', ok: false}]}));
    expect(learn(rows, {minTasks: 1}).failingChecks[0]!.name).toBe('eslint');
  });

  test('repeated security finding kinds are surfaced for the tony-wf security list', () => {
    const sec = (t: string) => row(t, false, {checks: [{name: 'security', ok: false, detail: 'review: fail-open-authz-unenforced-guard src/x.js:1'}]});
    const r = learn([sec('a'), sec('b'), row('c', true), row('d', true), row('e', true)], {minTasks: 5});
    expect(r.securityKinds[0]).toEqual({kind: 'fail-open-authz-unenforced-guard', tasks: 2});
    expect(r.proposals.some(p => p.includes('fail-open-authz-unenforced-guard'))).toBe(true);
  });

  test('runs not claimed by an agent (integration verify) do not count as executor tasks', () => {
    const r = learn([row('x', true, {claimedDone: false, agent: 'graph-integration', model: null})], {minTasks: 1});
    expect(r.byExecutor).toEqual([]);
  });
});
