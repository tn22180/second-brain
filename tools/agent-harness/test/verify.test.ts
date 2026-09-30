import {describe, expect, test} from 'bun:test';
import {spawnRunner} from '../../prod-error-autofix/src/gcloud/run';
import type {Contract} from '../src/contract';
import {verify} from '../src/verify';
import {makeRepo, write} from './helpers';

const contractFor = (repoPath: string, over: Partial<Contract> = {}): Contract => ({
  id: 'T-1', source: 'test', goal: 'change a', repoPath,
  allow: ['src/a.js'], verify: [{name: 'true', cmd: ['true']}], ...over
});

const changedRepo = () => {
  const repo = makeRepo();
  write(repo, 'src/a.js', 'module.exports = 3;\n');
  return repo;
};

describe('verify', () => {
  test('passes when scope and commands pass', async () => {
    const v = await verify(contractFor(changedRepo()));
    expect(v.pass).toBe(true);
    expect(v.checks.map(c => c.name)).toEqual(['scope', 'true']);
    expect(v.diffSha).toMatch(/^[0-9a-f]{40}$/);
    expect(v.runId).toStartWith('T-1-');
  });

  test('empty diff fails scope', async () => {
    const v = await verify(contractFor(makeRepo()));
    expect(v.pass).toBe(false);
    expect(v.checks[0]).toMatchObject({name: 'scope', ok: false, detail: 'empty diff'});
  });

  test('allow entry naming a dir without trailing slash fails scope and stops', async () => {
    // `git add src` stages the whole dir, but inScope treats 'src' as an exact file —
    // the ambiguity must fail closed, and no command may run on an unapproved diff.
    const v = await verify(contractFor(changedRepo(), {allow: ['src'], verify: [{name: 'never', cmd: ['false']}]}));
    expect(v.checks).toEqual([{name: 'scope', ok: false, detail: 'outside allow: src/a.js'}]);
    expect(v.pass).toBe(false);
  });

  test('failing command fails the verdict but later checks still run', async () => {
    const v = await verify(contractFor(changedRepo(), {verify: [{name: 'no', cmd: ['false']}, {name: 'yes', cmd: ['true']}]}));
    expect(v.pass).toBe(false);
    expect(v.checks.map(c => [c.name, c.ok])).toEqual([['scope', true], ['no', false], ['yes', true]]);
  });

  test('timed-out command fails the check', async () => {
    const v = await verify(contractFor(changedRepo(), {verify: [{name: 'hang', cmd: ['sleep', '5'], timeoutMs: 200}]}));
    expect(v.checks[1]).toMatchObject({name: 'hang', ok: false});
    expect(v.checks[1].detail).toContain('timed out');
  });

  test('security review unavailable blocks', async () => {
    const claude = async () => ({
      ok: false, text: '', costUsd: undefined, numTurns: undefined, sessionId: undefined,
      permissionDenials: [], failure: 'timeout' as const, detail: 'timeout'
    });
    const v = await verify(contractFor(changedRepo(), {security: {appName: 'APC'}}), {claude});
    expect(v.pass).toBe(false);
    expect(v.checks.at(-1)).toMatchObject({name: 'security', ok: false});
    expect(v.checks.at(-1)!.detail).toStartWith('review_unavailable');
  });

  test('a throwing runner is a failed check, not a crash', async () => {
    const runner = async (args: string[], t: number, o?: {cwd?: string}) => {
      if (args[0] !== 'git') throw new Error('spawn ENOENT');
      return spawnRunner(args, t, o);
    };
    const v = await verify(contractFor(changedRepo()), {runner});
    expect(v.pass).toBe(false);
    expect(v.checks[1]).toMatchObject({name: 'true', ok: false, detail: 'spawn ENOENT'});
  });

  test('reproduce with no new test file fails closed', async () => {
    // jest semantics of reproduceCheck are covered by prod-error-autofix/test/smoke.test.ts;
    // here: the wiring refuses to call a fix proven when there is no test to prove it.
    const v = await verify(contractFor(changedRepo(), {reproduce: {testCmd: ['npx', 'jest', '--ci']}}));
    expect(v.checks.find(x => x.name === 'reproduce')).toMatchObject({ok: false, detail: 'nothing to stash or nothing to run'});
    expect(v.pass).toBe(false);
  });
});
