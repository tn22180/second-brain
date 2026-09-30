import {describe, expect, test} from 'bun:test';
import {parseGraph} from '../src/graph';

const node = (id: string, deps: string[] = [], allow = [`src/${id}.js`]) => ({
  id, deps, prompt: `do ${id}`,
  contract: {goal: `g ${id}`, allow, verify: [{name: 'jest', cmd: ['npx', 'jest']}]}
});
const graph = (nodes: unknown[], over: Record<string, unknown> = {}) => ({
  id: 'seo-quota', source: 'tony-wf', repoPath: '/abs/seo', base: 'master', branch: 'feat/seo-quota', nodes, ...over
});
const err = (raw: unknown) => {
  const r = parseGraph(raw);
  return r.ok ? '' : r.error;
};

describe('parseGraph', () => {
  test('valid diamond parses with topo order and default parallelism', () => {
    const r = parseGraph(graph([node('d', ['b', 'c']), node('b', ['a']), node('c', ['a']), node('a')]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const order = r.graph.order;
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
    expect(r.graph.maxParallel).toBe(3);
  });
  test('unknown dep', () => expect(err(graph([node('a', ['zz'])]))).toContain('unknown dep zz'));
  test('duplicate id', () => expect(err(graph([node('a'), node('a')]))).toContain('duplicate node a'));
  test('cycle', () => expect(err(graph([node('a', ['b']), node('b', ['a'])]))).toContain('cycle'));
  test('self dep is a cycle', () => expect(err(graph([node('a', ['a'])]))).toContain('cycle'));
  test('branch must not be the base', () => expect(err(graph([node('a')], {branch: 'master'}))).toContain('branch'));
  test('base branches are never a target', () => expect(err(graph([node('a')], {branch: 'main'}))).toContain('branch'));
  test('empty graph', () => expect(err(graph([]))).toContain('nodes'));
  test('node contract must not set id/repoPath/baseSha — runner owns them', () => {
    const n = {...node('a'), contract: {...node('a').contract, baseSha: 'a'.repeat(40)}};
    expect(err(graph([n]))).toContain('baseSha');
  });
  test('node contract still validated (verify required)', () => {
    const n = {...node('a'), contract: {goal: 'g', allow: ['src/a.js'], verify: []}};
    expect(err(graph([n]))).toContain('verify');
  });
  test('concurrent nodes with overlapping allow are refused', () => {
    expect(err(graph([node('a', [], ['src/']), node('b', [], ['src/b.js'])]))).toContain('overlap');
    expect(err(graph([node('a', [], ['src/x.js']), node('b', [], ['src/x.js'])]))).toContain('overlap');
  });
  test('ordered nodes may touch the same files', () => {
    expect(parseGraph(graph([node('a', [], ['src/x.js']), node('b', ['a'], ['src/x.js'])])).ok).toBe(true);
  });
  test('transitively ordered nodes may overlap too', () => {
    expect(parseGraph(graph([node('a', [], ['src/x.js']), node('m', ['a']), node('b', ['m'], ['src/x.js'])])).ok).toBe(true);
  });
  test('node ids are safe path segments', () => expect(err(graph([node('../x')]))).toContain('id'));
  test('maxParallel bounds', () => expect(err(graph([node('a')], {maxParallel: 0}))).toContain('maxParallel'));
});
