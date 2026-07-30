import {describe, expect, test} from 'bun:test';
import type {RunResult, Runner} from '../src/gcloud/run';
import {parseJestJson, resolveTestCmd, runJest} from '../src/verify/jest';
import {describeSmoke, measureBaseline, reproduceCheck, smokeGate} from '../src/verify/smoke';

const REPO = '/wt/blogs';

function jestJson(over: {
  success?: boolean;
  suites?: {name: string; status?: string; assertions?: {fullName: string; status: string}[]}[];
  numTotalTests?: number;
  numRuntimeErrorTestSuites?: number;
}): string {
  const suites = over.suites ?? [];
  return JSON.stringify({
    success: over.success ?? true,
    numTotalTests: over.numTotalTests ?? 10,
    numTotalTestSuites: suites.length,
    numFailedTests: 0,
    numRuntimeErrorTestSuites: over.numRuntimeErrorTestSuites ?? 0,
    testResults: suites.map(s => ({
      name: s.name,
      status: s.status ?? 'passed',
      message: '',
      assertionResults: (s.assertions ?? []).map(a => ({
        fullName: a.fullName,
        title: a.fullName,
        status: a.status,
        failureMessages: a.status === 'failed' ? ['boom'] : [],
        ancestorTitles: []
      }))
    }))
  });
}

const ok = (stdout: string, code = 0): RunResult => ({code, stdout, stderr: '', timedOut: false});

describe('parseJestJson', () => {
  test('keys are repo-relative so a baseline survives a different worktree', () => {
    const json = jestJson({
      success: false,
      suites: [
        {
          name: `${REPO}/packages/functions/src/__tests__/tag.test.js`,
          status: 'failed',
          assertions: [
            {fullName: 'tags lists them', status: 'failed'},
            {fullName: 'tags handles empty', status: 'passed'}
          ]
        }
      ]
    });
    const summary = parseJestJson(json, REPO)!;
    expect(summary.failures).toEqual(['packages/functions/src/__tests__/tag.test.js::tags lists them']);
    expect(summary.ok).toBe(false);
  });

  test('a suite that fails to load is recorded at suite level', () => {
    // The three long-standing module-resolution failures on blogs master look like this.
    const json = jestJson({
      success: false,
      suites: [{name: `${REPO}/a.test.js`, status: 'failed', assertions: []}]
    });
    expect(parseJestJson(json, REPO)!.failures).toEqual(['a.test.js::<suite did not run>']);
  });

  test('a clean run has no failures', () => {
    const json = jestJson({suites: [{name: `${REPO}/a.test.js`, assertions: [{fullName: 'x', status: 'passed'}]}]});
    const s = parseJestJson(json, REPO)!;
    expect(s.failures).toEqual([]);
    expect(s.ok).toBe(true);
  });

  test('jest output wrapped in other stdout still parses', () => {
    const json = jestJson({suites: []});
    expect(parseJestJson(`warning: something\n${json}\n`, REPO)).toBeDefined();
  });

  test('unreadable output is undefined, not a crash', () => {
    expect(parseJestJson('no json here', REPO)).toBeUndefined();
    expect(parseJestJson('{"nope": 1}', REPO)).toBeUndefined();
  });
});

describe('runJest', () => {
  test('failing tests are a valid result, not a failure to run', async () => {
    const runner: Runner = async () =>
      ok(jestJson({success: false, suites: [{name: `${REPO}/a.test.js`, status: 'failed', assertions: [{fullName: 't', status: 'failed'}]}]}), 1);
    const run = await runJest({repoPath: REPO, testCmd: ['npx', 'jest', '--ci'], extraArgs: [], timeoutMs: 1000}, runner);
    expect(run.summary?.failures).toHaveLength(1);
    expect(run.detail).toBeUndefined();
  });

  test('jest not running at all is distinguished', async () => {
    const runner: Runner = async () => ({code: 1, stdout: '', stderr: 'command not found: npx', timedOut: false});
    const run = await runJest({repoPath: REPO, testCmd: ['npx', 'jest'], extraArgs: [], timeoutMs: 1000}, runner);
    expect(run.summary).toBeUndefined();
    expect(run.detail).toContain('command not found');
  });

  test('a timeout is reported as such', async () => {
    const runner: Runner = async () => ({code: 143, stdout: '', stderr: '', timedOut: true});
    const run = await runJest({repoPath: REPO, testCmd: ['npx', 'jest'], extraArgs: [], timeoutMs: 5}, runner);
    expect(run.timedOut).toBe(true);
  });

  test('the registry command is used verbatim, with --json appended', async () => {
    let seen: string[] = [];
    let cwd: string | undefined;
    const runner: Runner = async (args, _timeout, opts) => {
      seen = args;
      cwd = opts?.cwd;
      return ok(jestJson({suites: []}));
    };
    await runJest({repoPath: REPO, testCmd: ['npx', 'jest', '--ci'], extraArgs: ['--runTestsByPath', 'a.test.js'], timeoutMs: 1}, runner);
    expect(seen.join(' ')).toBe('npx jest --ci --json --silent --runTestsByPath a.test.js');
    // Spawned with cwd, not wrapped: macOS `env` has no -C, so `env -C <dir>` would
    // die with "illegal option -- C" and every jest run would look like a failure.
    expect(cwd).toBe(REPO);
    expect(seen).not.toContain('env');
  });
});

describe('measureBaseline', () => {
  test('records what was already failing', async () => {
    const runner: Runner = async () =>
      ok(jestJson({
        success: false,
        suites: [{name: `${REPO}/known.test.js`, status: 'failed', assertions: []}]
      }), 1);
    const base = await measureBaseline({repoPath: REPO, testCmd: ['npx', 'jest'], timeoutMs: 1000}, runner);
    expect(base.ok).toBe(true);
    expect(base.failures).toEqual(['known.test.js::<suite did not run>']);
  });

  test('a jest that will not run is not an empty baseline', async () => {
    const runner: Runner = async () => ({code: 1, stdout: 'boom', stderr: '', timedOut: false});
    const base = await measureBaseline({repoPath: REPO, testCmd: ['npx', 'jest'], timeoutMs: 1000}, runner);
    expect(base.ok).toBe(false);
    expect(base.failures).toEqual([]);
  });
});

describe('reproduceCheck', () => {
  const files = {sourceFiles: ['packages/functions/src/x.js'], testFiles: ['packages/functions/src/__tests__/x.test.js']};

  /** Scripts git and jest calls; records the order so stash/pop ordering is testable. */
  function scripted(opts: {stashCode?: number; popCode?: number; jest: string; jestCode?: number}): {
    runner: Runner;
    order: string[];
  } {
    const order: string[] = [];
    const runner: Runner = async args => {
      const joined = args.join(' ');
      if (joined.includes('stash push')) {
        order.push('stash');
        return ok('', opts.stashCode ?? 0);
      }
      if (joined.includes('stash pop')) {
        order.push('pop');
        return ok('', opts.popCode ?? 0);
      }
      order.push('jest');
      return ok(opts.jest, opts.jestCode ?? 0);
    };
    return {runner, order};
  }

  test('the test failing without the fix is the pass condition', async () => {
    const {runner, order} = scripted({
      jest: jestJson({success: false, suites: [{name: `${REPO}/packages/functions/src/__tests__/x.test.js`, status: 'failed', assertions: [{fullName: 'x throws', status: 'failed'}]}]}),
      jestCode: 1
    });
    const res = await reproduceCheck({repoPath: REPO, testCmd: ['npx', 'jest'], ...files, timeoutMs: 1000}, runner);
    expect(res.ok).toBe(true);
    expect(res.suiteLevelOnly).toBe(false);
    // The fix must go back into the tree, always.
    expect(order).toEqual(['stash', 'jest', 'pop']);
  });

  test('a test that passes without the fix does not reproduce anything', async () => {
    const {runner} = scripted({jest: jestJson({success: true, suites: []})});
    const res = await reproduceCheck({repoPath: REPO, testCmd: ['npx', 'jest'], ...files, timeoutMs: 1000}, runner);
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('does not reproduce');
  });

  test('a suite-level failure counts but is flagged as weaker', async () => {
    const {runner} = scripted({
      jest: jestJson({success: false, suites: [{name: `${REPO}/packages/functions/src/__tests__/x.test.js`, status: 'failed', assertions: []}]}),
      jestCode: 1
    });
    const res = await reproduceCheck({repoPath: REPO, testCmd: ['npx', 'jest'], ...files, timeoutMs: 1000}, runner);
    expect(res.ok).toBe(true);
    expect(res.suiteLevelOnly).toBe(true);
    expect(res.detail).toContain('failed to load');
  });

  test('a failed stash does not run jest at all', async () => {
    const {runner, order} = scripted({stashCode: 1, jest: ''});
    const res = await reproduceCheck({repoPath: REPO, testCmd: ['npx', 'jest'], ...files, timeoutMs: 1000}, runner);
    expect(res.ran).toBe(false);
    expect(res.detail).toContain('could not stash');
    expect(order).toEqual(['stash']);
  });

  test('a failed pop is shouted about — that is the case that loses work', async () => {
    const {runner} = scripted({popCode: 1, jest: jestJson({success: false, suites: []}), jestCode: 1});
    const res = await reproduceCheck({repoPath: REPO, testCmd: ['npx', 'jest'], ...files, timeoutMs: 1000}, runner);
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('THE FIX IS STILL STASHED');
  });

  test('only source files are stashed; the new test stays in the tree', async () => {
    let stashArgs: string[] = [];
    const runner: Runner = async args => {
      if (args.join(' ').includes('stash push')) {
        stashArgs = args;
        return ok('');
      }
      if (args.join(' ').includes('stash pop')) return ok('');
      return ok(jestJson({success: false, suites: []}), 1);
    };
    await reproduceCheck({repoPath: REPO, testCmd: ['npx', 'jest'], ...files, timeoutMs: 1000}, runner);
    expect(stashArgs).toContain('packages/functions/src/x.js');
    expect(stashArgs).not.toContain('packages/functions/src/__tests__/x.test.js');
    expect(stashArgs).toContain('--include-untracked');
  });
});

describe('smokeGate', () => {
  const files = {sourceFiles: ['src/x.js'], testFiles: ['src/__tests__/x.test.js']};

  /** After-run then reproduce run, with git in between. */
  function runnerFor(afterJson: string, reproJson: string): Runner {
    let jestCalls = 0;
    return async args => {
      const joined = args.join(' ');
      if (joined.includes('stash')) return ok('');
      jestCalls++;
      return ok(jestCalls === 1 ? afterJson : reproJson, 1);
    };
  }

  const preexisting = ['known.test.js::<suite did not run>'];

  test('a pre-existing failure is not a regression', async () => {
    const after = jestJson({success: false, suites: [{name: `${REPO}/known.test.js`, status: 'failed', assertions: []}]});
    const repro = jestJson({success: false, suites: [{name: `${REPO}/src/__tests__/x.test.js`, status: 'failed', assertions: [{fullName: 'x', status: 'failed'}]}]});
    const out = await smokeGate(
      {repoPath: REPO, testCmd: ['npx', 'jest'], baseline: preexisting, ...files, timeoutMs: 1000},
      runnerFor(after, repro)
    );
    expect(out.ok).toBe(true);
    expect(out.newFailures).toEqual([]);
  });

  test('one new failure blocks the MR and names it', async () => {
    const after = jestJson({
      success: false,
      suites: [
        {name: `${REPO}/known.test.js`, status: 'failed', assertions: []},
        {name: `${REPO}/other.test.js`, status: 'failed', assertions: [{fullName: 'was passing', status: 'failed'}]}
      ]
    });
    const out = await smokeGate(
      {repoPath: REPO, testCmd: ['npx', 'jest'], baseline: preexisting, ...files, timeoutMs: 1000},
      runnerFor(after, '')
    );
    expect(out.ok).toBe(false);
    expect(out.failure).toBe('new_failures');
    expect(out.newFailures).toEqual(['other.test.js::was passing']);
  });

  test('a baseline failure the fix resolved is reported, not treated as noise', async () => {
    const after = jestJson({success: true, suites: []});
    const repro = jestJson({success: false, suites: [{name: `${REPO}/src/__tests__/x.test.js`, status: 'failed', assertions: [{fullName: 'x', status: 'failed'}]}]});
    const out = await smokeGate(
      {repoPath: REPO, testCmd: ['npx', 'jest'], baseline: preexisting, ...files, timeoutMs: 1000},
      runnerFor(after, repro)
    );
    expect(out.ok).toBe(true);
    expect(out.fixedFailures).toEqual(preexisting);
  });

  test('without a baseline the gate refuses rather than guessing', async () => {
    const out = await smokeGate(
      {repoPath: REPO, testCmd: ['npx', 'jest'], baseline: undefined, ...files, timeoutMs: 1000},
      runnerFor('', '')
    );
    expect(out.ok).toBe(false);
    expect(out.failure).toBe('no_baseline');
  });

  test('jest failing to run is not a regression verdict', async () => {
    const runner: Runner = async () => ({code: 1, stdout: 'boom', stderr: '', timedOut: false});
    const out = await smokeGate(
      {repoPath: REPO, testCmd: ['npx', 'jest'], baseline: [], ...files, timeoutMs: 1000},
      runner
    );
    expect(out.failure).toBe('jest_failed');
  });

  test('a lost stash is its own failure code', async () => {
    const runner: Runner = async args => {
      const joined = args.join(' ');
      if (joined.includes('stash pop')) return ok('conflict', 1);
      if (joined.includes('stash push')) return ok('');
      return ok(jestJson({success: false, suites: []}), 1);
    };
    const out = await smokeGate(
      {repoPath: REPO, testCmd: ['npx', 'jest'], baseline: [], ...files, timeoutMs: 1000},
      runner
    );
    expect(out.failure).toBe('stash_failed');
  });

  test('describeSmoke gives one line for the thread', async () => {
    const after = jestJson({success: true, numTotalTests: 164, suites: []});
    const repro = jestJson({success: false, suites: [{name: `${REPO}/src/__tests__/x.test.js`, status: 'failed', assertions: [{fullName: 'x', status: 'failed'}]}]});
    const out = await smokeGate(
      {repoPath: REPO, testCmd: ['npx', 'jest'], baseline: preexisting, ...files, timeoutMs: 1000},
      runnerFor(after, repro)
    );
    expect(describeSmoke(out)).toBe('164 tests, 0 failing · baseline 1 failing · reproduce test fails without the fix');
  });
});

describe('resolveTestCmd', () => {
  const has = (...paths: string[]) => ({existsSync: (p: string) => paths.some(x => p.endsWith(x))});

  test('prefers the repo-pinned jest over npx', () => {
    const cmd = resolveTestCmd('/wt', ['npx', 'jest', '--ci'], has('node_modules/.bin/jest'));
    expect(cmd[0]).toBe('/wt/node_modules/.bin/jest');
    expect(cmd).toContain('--ci');
    expect(cmd).not.toContain('npx');
  });

  test('passes --config explicitly, which is what unblocks blogs', () => {
    // blogs has both a jest.config.js and a `jest` key in package.json; a current
    // jest refuses that combination outright.
    const cmd = resolveTestCmd('/wt', ['npx', 'jest', '--ci'], has('jest.config.js'));
    expect(cmd.join(' ')).toContain('--config /wt/jest.config.js');
  });

  test('falls back to npx when the worktree has no local jest', () => {
    const cmd = resolveTestCmd('/wt', ['npx', 'jest', '--ci'], has('jest.config.js'));
    expect(cmd[0]).toBe('npx');
  });

  test('no config file means no --config flag invented', () => {
    const cmd = resolveTestCmd('/wt', ['npx', 'jest', '--ci'], has('node_modules/.bin/jest'));
    expect(cmd).not.toContain('--config');
  });

  test('an existing --config is respected', () => {
    const cmd = resolveTestCmd('/wt', ['npx', 'jest', '--ci', '--config=custom.js'], has('jest.config.js'));
    expect(cmd.filter(a => a.startsWith('--config')).length).toBe(1);
  });
});
