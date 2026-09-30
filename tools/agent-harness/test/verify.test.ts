import {describe, expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {spawnRunner} from '../../prod-error-autofix/src/gcloud/run';
import type {Contract} from '../src/contract';
import {verify} from '../src/verify';
import {makeRepo, sh, write} from './helpers';

const FAKE_JEST = ['node', resolve(import.meta.dir, 'fixtures/fake-jest.cjs')];
const head = (repo: string) => sh(repo, 'git', 'rev-parse', 'HEAD').trim();

const contractFor = (repoPath: string, over: Partial<Contract> = {}): Contract => ({
  id: 'T-1', source: 'test', goal: 'change a', repoPath, baseSha: head(repoPath),
  allow: ['src/a.js'], verify: [{name: 'true', cmd: ['true']}], ...over
});

const changedRepo = () => {
  const repo = makeRepo();
  write(repo, 'src/a.js', 'module.exports = 3;\n');
  return repo;
};

describe('verify', () => {
  test('passes when base, scope, commands and stability pass', async () => {
    const v = await verify(contractFor(changedRepo()));
    expect(v.pass).toBe(true);
    expect(v.checks.map(c => c.name)).toEqual(['base', 'scope', 'true', 'stable']);
    expect(v.diffSha).toMatch(/^[0-9a-f]{40}$/);
    expect(v.runId).toStartWith('T-1-');
  });

  test('empty diff fails scope', async () => {
    const v = await verify(contractFor(makeRepo()));
    expect(v.pass).toBe(false);
    expect(v.checks[1]).toMatchObject({name: 'scope', ok: false, detail: 'empty diff'});
  });

  test('allow entry naming a dir without trailing slash fails scope and stops', async () => {
    const v = await verify(contractFor(changedRepo(), {allow: ['src'], verify: [{name: 'never', cmd: ['false']}]}));
    expect(v.checks.map(c => c.name)).toEqual(['base', 'scope']);
    expect(v.checks[1]).toMatchObject({ok: false, detail: 'outside allow: src/a.js'});
  });

  test('failing command fails the verdict but later checks still run', async () => {
    const v = await verify(contractFor(changedRepo(), {verify: [{name: 'no', cmd: ['false']}, {name: 'yes', cmd: ['true']}]}));
    expect(v.pass).toBe(false);
    expect(v.checks.map(c => [c.name, c.ok])).toEqual([['base', true], ['scope', true], ['no', false], ['yes', true], ['stable', true]]);
  });

  test('timed-out command fails the check', async () => {
    const v = await verify(contractFor(changedRepo(), {verify: [{name: 'hang', cmd: ['sleep', '5'], timeoutMs: 200}]}));
    expect(v.checks[2]).toMatchObject({name: 'hang', ok: false});
    expect(v.checks[2].detail).toContain('timed out');
  });

  test('security review unavailable blocks', async () => {
    const claude = async () => ({
      ok: false, text: '', costUsd: undefined, numTurns: undefined, sessionId: undefined,
      permissionDenials: [], failure: 'timeout' as const, detail: 'timeout'
    });
    const v = await verify(contractFor(changedRepo(), {security: {appName: 'APC'}}), {claude});
    expect(v.pass).toBe(false);
    const s = v.checks.find(c => c.name === 'security')!;
    expect(s.ok).toBe(false);
    expect(s.detail).toStartWith('review_unavailable');
  });

  test('a security review that never returns fails at its deadline', async () => {
    const claude = () => new Promise<never>(() => {});
    const v = await verify(contractFor(changedRepo(), {security: {appName: 'APC'}}), {claude, securityTimeoutMs: 100});
    expect(v.checks.find(c => c.name === 'security')).toMatchObject({ok: false, detail: 'security review timed out after 100ms'});
  });

  test('a throwing runner is a failed check, not a crash', async () => {
    const runner = async (args: string[], t: number, o?: {cwd?: string}) => {
      if (args[0] !== 'git') throw new Error('spawn ENOENT');
      return spawnRunner(args, t, o);
    };
    const v = await verify(contractFor(changedRepo()), {runner});
    expect(v.pass).toBe(false);
    expect(v.checks[2]).toMatchObject({name: 'true', ok: false, detail: 'spawn ENOENT'});
  });

  // C2: a commit the agent made itself would ride along with the push unseen.
  test('HEAD moved past baseSha fails base and stops', async () => {
    const repo = makeRepo();
    const base = head(repo);
    write(repo, 'src/b.js', 'module.exports = "sneak";\n');
    sh(repo, 'git', 'commit', '-qam', 'sneak');
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    const v = await verify(contractFor(repo, {baseSha: base}));
    expect(v.pass).toBe(false);
    expect(v.checks.map(c => c.name)).toEqual(['base']);
    expect(v.checks[0].detail).toContain('HEAD');
  });

  // C1: checks run on the working tree; anything there outside allow is untested-by-push.
  test('modified tracked file outside allow fails scope', async () => {
    const repo = changedRepo();
    write(repo, 'src/b.js', 'module.exports = "cfg the tests depend on";\n');
    const v = await verify(contractFor(repo));
    expect(v.checks[1]).toMatchObject({name: 'scope', ok: false, detail: 'working tree outside allow: src/b.js'});
  });

  test('untracked file outside allow fails scope', async () => {
    const repo = changedRepo();
    write(repo, '__mocks__/x.js', 'x\n');
    const v = await verify(contractFor(repo));
    expect(v.checks[1]).toMatchObject({ok: false, detail: 'working tree outside allow: __mocks__/x.js'});
  });

  test('gitignored file inside an allowed dir fails scope', async () => {
    const repo = makeRepo();
    write(repo, '.gitignore', 'src/gen.js\n');
    sh(repo, 'git', 'add', '.gitignore');
    sh(repo, 'git', 'commit', '-qm', 'ignore');
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    write(repo, 'src/gen.js', 'generated, never committed\n');
    const v = await verify(contractFor(repo, {allow: ['src/']}));
    expect(v.checks[1]).toMatchObject({ok: false, detail: 'ignored file inside allow (tests see it, the commit will not): src/gen.js'});
  });

  test('node_modules and ignored build output outside allow are fine', async () => {
    const repo = makeRepo();
    write(repo, '.gitignore', 'lib/\n');
    sh(repo, 'git', 'add', '.gitignore');
    sh(repo, 'git', 'commit', '-qm', 'ignore');
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    write(repo, 'lib/a.js', 'built\n');
    write(repo, 'node_modules/x/index.js', 'dep\n');
    const v = await verify(contractFor(repo));
    expect(v.checks[1]).toMatchObject({name: 'scope', ok: true});
  });

  // I3: the verdict must describe the tree the checks actually ran on.
  test('a command that rewrites an allowed file fails stable', async () => {
    const repo = changedRepo();
    const v = await verify(contractFor(repo, {verify: [{name: 'fmt', cmd: ['sh', '-c', 'echo "// formatted" >> src/a.js']}]}));
    expect(v.pass).toBe(false);
    expect(v.checks.at(-1)).toMatchObject({name: 'stable', ok: false});
  });

  // I2: reproduce without git stash (the stash stack is shared by every worktree of the repo).
  describe('reproduce', () => {
    const reproRepo = () => {
      const repo = makeRepo();
      sh(repo, 'git', 'stash', 'push', '--include-untracked', '-m', 'tuan-unrelated', '--', 'src/b.js');
      write(repo, 'src/b.js', 'module.exports = "someone else";\n');
      sh(repo, 'git', 'stash', 'push', '-m', 'tuan-unrelated');
      write(repo, 'src/a.js', 'module.exports = 3;\n');
      return repo;
    };

    test('passes when the new test fails without the source change, and restores the tree', async () => {
      const repo = reproRepo();
      write(repo, 'src/__tests__/a.test.js', 'if (require("../a.js") !== 3) process.exit(1);\n');
      const before = readFileSync(join(repo, 'src/a.js'), 'utf8');
      const v = await verify(contractFor(repo, {allow: ['src/a.js', 'src/__tests__/'], reproduce: {testCmd: FAKE_JEST}}));
      expect(v.checks.find(c => c.name === 'reproduce')).toMatchObject({ok: true});
      expect(readFileSync(join(repo, 'src/a.js'), 'utf8')).toBe(before);
      expect(sh(repo, 'git', 'stash', 'list')).toContain('tuan-unrelated');
      expect(sh(repo, 'git', 'stash', 'list').trim().split('\n')).toHaveLength(1);
      expect(v.checks.find(c => c.name === 'stable')).toMatchObject({ok: true});
    });

    test('fails when the new test passes without the source change', async () => {
      const repo = reproRepo();
      write(repo, 'src/__tests__/a.test.js', 'process.exit(0);\n');
      const v = await verify(contractFor(repo, {allow: ['src/a.js', 'src/__tests__/'], reproduce: {testCmd: FAKE_JEST}}));
      expect(v.checks.find(c => c.name === 'reproduce')).toMatchObject({ok: false});
    });

    test('a brand-new source file is removed for the run and put back', async () => {
      const repo = makeRepo();
      write(repo, 'src/new.js', 'module.exports = 5;\n');
      write(repo, 'src/__tests__/n.test.js', 'try { require("../new.js"); } catch { process.exit(1); }\n');
      const v = await verify(contractFor(repo, {allow: ['src/new.js', 'src/__tests__/'], reproduce: {testCmd: FAKE_JEST}}));
      expect(v.checks.find(c => c.name === 'reproduce')).toMatchObject({ok: true});
      expect(readFileSync(join(repo, 'src/new.js'), 'utf8')).toBe('module.exports = 5;\n');
    });

    test('no new test file fails closed', async () => {
      const v = await verify(contractFor(changedRepo(), {reproduce: {testCmd: FAKE_JEST}}));
      expect(v.checks.find(c => c.name === 'reproduce')).toMatchObject({ok: false, detail: 'needs both a source change and a new test file'});
    });
  });
});
