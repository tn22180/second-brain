import {afterEach, describe, expect, test} from 'bun:test';
import {rmSync} from 'node:fs';
import {join} from 'node:path';
import {parseGraph} from '../src/graph';
import {openLedger} from '../src/ledger';
import type {Proc} from '../src/node';
import {runGraph} from '../src/run-graph';
import {paths} from '../src/worktree';
import {makeRepo, sh, write} from './helpers';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';

const cleanup: string[] = [];
afterEach(() => {
  for (const d of cleanup.splice(0)) rmSync(d, {recursive: true, force: true});
});

const done = (): Proc => ({exited: () => true, exitCode: () => 0, kill: () => {}, tail: () => 'DONE'});

function setup(nodes: unknown[]) {
  const repo = makeRepo();
  const raw = {id: 'g1', source: 'test', repoPath: repo, base: 'master', branch: 'feat/g1', maxParallel: 2, nodes};
  const r = parseGraph(raw);
  if (!r.ok) throw new Error(r.error);
  const g = r.graph;
  cleanup.push(repo, paths(g, '_').integration, ...g.nodes.map(n => paths(g, n.id).node));
  const ledger = openLedger(join(mkdtempSync(join(tmpdir(), 'rg-')), 'l.db'));
  const dms: string[] = [];
  return {repo, g, ledger, dms};
}
const n = (id: string, deps: string[], file: string, check: string[]) => ({
  id, deps, prompt: `edit ${file}`, contract: {goal: `${id} goal`, allow: [file], verify: [{name: 'check', cmd: check}]}
});

describe('runGraph', () => {
  test('two parallel nodes and a dependent one land on the integration branch', async () => {
    const {g, ledger, dms} = setup([
      n('a', [], 'src/a.js', ['grep', '-q', '10', 'src/a.js']),
      n('b', [], 'src/b.js', ['grep', '-q', '20', 'src/b.js']),
      n('c', ['a', 'b'], 'src/c.js', ['sh', '-c', 'grep -q 10 src/a.js && grep -q 20 src/b.js && test -f src/c.js'])
    ]);
    const edits: Record<string, [string, string]> = {a: ['src/a.js', 'module.exports = 10;\n'], b: ['src/b.js', 'module.exports = 20;\n'], c: ['src/c.js', 'x\n']};
    const res = await runGraph(g, {
      ledger,
      notify: async t => { dms.push(t); },
      start: (argv, cwd) => {
        const id = cwd.split('-').at(-1)!;
        write(cwd, ...edits[id]!);
        return done();
      },
      supervise: async () => ({action: 'keep_waiting'}),
      sleep: async () => {}
    });
    expect(res.outcomes).toEqual({a: 'done', b: 'done', c: 'done'});
    const integ = paths(g, '_').integration;
    expect(sh(integ, 'git', 'show', 'HEAD:src/c.js')).toBe('x\n');
    expect(sh(integ, 'git', 'show', 'HEAD:src/a.js')).toBe('module.exports = 10;\n');
    expect(ledger.graphNodes('g1').c).toMatchObject({state: 'done', rounds: 1});
    expect(dms.at(-1)).toContain('<b>g1</b>');
    expect(dms.at(-1)).toContain('ready to push');
    // The push gate asks the ledger about the branch tip's tree; the merge commit's tree must
    // itself have been verified, with every node's checks run on the combined code.
    const tipTree = sh(integ, 'git', 'rev-parse', 'HEAD^{tree}').trim();
    expect(res.integrationRunId).toBeTruthy();
    expect(ledger.passed(res.integrationRunId!, tipTree)).toBe(true);
  });

  test('combined code failing a node check (each node passed alone) is not ready to push', async () => {
    const {g, ledger, dms} = setup([
      n('a', [], 'src/a.js', ['sh', '-c', '! grep -q conflict src/b.js']),
      n('b', [], 'src/b.js', ['true'])
    ]);
    const res = await runGraph(g, {
      ledger, notify: async t => { dms.push(t); },
      start: (argv, cwd) => {
        const id = cwd.split('-').at(-1)!;
        write(cwd, `src/${id}.js`, id === 'b' ? 'conflict\n' : 'fine\n');
        return done();
      },
      supervise: async () => ({action: 'keep_waiting'}), sleep: async () => {}
    });
    expect(res.outcomes).toEqual({a: 'done', b: 'done'});
    expect(res.integrationRunId).toBeUndefined();
    expect(dms.at(-1)).toContain('integration verify FAILED');
  });

  test('a node that never satisfies its contract blocks itself and its dependents, not its sibling', async () => {
    const {g, ledger, dms} = setup([
      n('a', [], 'src/a.js', ['false']),
      n('b', [], 'src/b.js', ['true']),
      n('c', ['a'], 'src/c.js', ['true'])
    ]);
    const res = await runGraph(g, {
      ledger,
      notify: async t => { dms.push(t); },
      start: (argv, cwd) => {
        const id = cwd.split('-').at(-1)!;
        write(cwd, `src/${id}.js`, `// ${Math.random()}\n`);
        return done();
      },
      supervise: async () => ({action: 'keep_waiting'}),
      sleep: async () => {}
    });
    expect(res.outcomes).toEqual({a: 'blocked', b: 'done', c: 'skipped'});
    expect(ledger.graphNodes('g1').a).toMatchObject({state: 'blocked', rounds: 5});
    expect(dms.at(-1)).toContain('BLOCKED');
    expect(ledger.stats(0)).toMatchObject({tasksFalseDone: 1});
  });

  test('resume: done nodes from the ledger are not re-run', async () => {
    const {g, ledger} = setup([n('a', [], 'src/a.js', ['true']), n('b', ['a'], 'src/b.js', ['true'])]);
    ledger.setNode('g1', 'a', {state: 'done', rounds: 1});
    const started: string[] = [];
    await runGraph(g, {
      ledger, notify: async () => {},
      start: (argv, cwd) => {
        started.push(cwd.split('-').at(-1)!);
        write(cwd, 'src/b.js', 'b\n');
        return done();
      },
      supervise: async () => ({action: 'keep_waiting'}), sleep: async () => {}
    });
    expect(started).toEqual(['b']);
  });

  test('identical checks from several nodes run once in the integration verify', async () => {
    const {g, ledger} = setup([
      n('a', [], 'src/a.js', ['sh', '-c', 'echo x >> ../runs.log']),
      n('b', [], 'src/b.js', ['sh', '-c', 'echo x >> ../runs.log'])
    ]);
    const res = await runGraph(g, {
      ledger, notify: async () => {},
      start: (argv, cwd) => {
        write(cwd, `src/${cwd.split('-').at(-1)}.js`, 'y\n');
        return done();
      },
      supervise: async () => ({action: 'keep_waiting'}), sleep: async () => {}
    });
    const checks = ledger.run(res.integrationRunId!)!.checks;
    const shared = checks.filter(c => c.name.includes('check'));
    expect(shared.map(c => c.name)).toEqual(['a+b: check']);
  });
});
