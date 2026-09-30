import {describe, expect, test} from 'bun:test';
import {schedule, type NodeOutcome} from '../src/scheduler';

type N = {id: string; deps: string[]};
const g = (...nodes: N[]) => nodes;
const n = (id: string, ...deps: string[]): N => ({id, deps});
const tick = () => new Promise(r => setTimeout(r, 1));

describe('schedule', () => {
  test('respects deps and runs independent nodes concurrently up to the cap', async () => {
    let live = 0;
    let peak = 0;
    const started: string[] = [];
    const res = await schedule(g(n('a'), n('b'), n('c'), n('d', 'a', 'b', 'c')), 2, async node => {
      started.push(node.id);
      live++;
      peak = Math.max(peak, live);
      await tick();
      live--;
      return 'done';
    });
    expect(peak).toBe(2);
    expect(started.at(-1)).toBe('d');
    expect(res).toEqual({a: 'done', b: 'done', c: 'done', d: 'done'});
  });

  test('a blocked node skips its descendants but independent branches finish', async () => {
    const ran: string[] = [];
    const res = await schedule(g(n('a'), n('b', 'a'), n('c', 'b'), n('x')), 3, async node => {
      ran.push(node.id);
      return (node.id === 'a' ? 'blocked' : 'done') as NodeOutcome;
    });
    expect(res).toEqual({a: 'blocked', b: 'skipped', c: 'skipped', x: 'done'});
    expect(ran.sort()).toEqual(['a', 'x']);
  });

  test('an executor that throws counts as blocked, never crashes the run', async () => {
    const res = await schedule(g(n('a'), n('b', 'a')), 1, async () => {
      throw new Error('boom');
    });
    expect(res).toEqual({a: 'blocked', b: 'skipped'});
  });

  test('already-done nodes (resume) are not re-run', async () => {
    const ran: string[] = [];
    const res = await schedule(g(n('a'), n('b', 'a')), 2, async node => (ran.push(node.id), 'done'), {a: 'done'});
    expect(ran).toEqual(['b']);
    expect(res).toEqual({a: 'done', b: 'done'});
  });
});
