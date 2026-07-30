import {spawnRunner, type Runner} from '../gcloud/run';
import {runJest, type JestSummary} from './jest';

/**
 * The gate between a diff and an MR.
 *
 * Two questions, both answered by running things rather than by reading the diff:
 *
 *  1. Did the fix break anything? Compared against a baseline of what was *already*
 *     failing on the base commit. Necessary, not belt-and-braces: three suites fail
 *     on untouched `blogs` master from module resolution, and APC has a failing test
 *     on a clean tree right now. A single jest run would flag every job as a
 *     regression.
 *  2. Does the new test actually reproduce the bug? A test that passes with the fix
 *     reverted proves nothing. So the source changes are stashed, the new test is run
 *     alone, and it has to fail.
 */

export interface BaselineInput {
  repoPath: string;
  testCmd: string[];
  timeoutMs: number;
}

export interface BaselineResult {
  ok: boolean;
  failures: string[];
  detail: string | undefined;
}

/** Run on a clean worktree at the base commit, before the fix is applied. */
export async function measureBaseline(
  input: BaselineInput,
  runner: Runner = spawnRunner
): Promise<BaselineResult> {
  const run = await runJest(
    {repoPath: input.repoPath, testCmd: input.testCmd, extraArgs: [], timeoutMs: input.timeoutMs},
    runner
  );
  if (!run.summary) return {ok: false, failures: [], detail: run.detail};
  return {ok: true, failures: run.summary.failures, detail: undefined};
}

export interface ReproduceResult {
  ran: boolean;
  ok: boolean;
  /** True when the test failed only because a stashed new file went missing. */
  suiteLevelOnly: boolean;
  detail: string | undefined;
}

/**
 * Reverts just the source changes, runs the new tests, and requires failure.
 *
 * The test files themselves are deliberately left in the tree; only `sourceFiles`
 * are stashed. A failed `stash pop` is reported loudly rather than swallowed — that
 * is the one outcome here that can lose work.
 */
export async function reproduceCheck(
  input: {
    repoPath: string;
    testCmd: string[];
    sourceFiles: string[];
    testFiles: string[];
    timeoutMs: number;
  },
  runner: Runner = spawnRunner
): Promise<ReproduceResult> {
  if (!input.sourceFiles.length || !input.testFiles.length) {
    return {ran: false, ok: false, suiteLevelOnly: false, detail: 'nothing to stash or nothing to run'};
  }
  const git = (args: string[]) => runner(['git', '-C', input.repoPath, ...args], input.timeoutMs);

  const stash = await git(['stash', 'push', '--include-untracked', '--', ...input.sourceFiles]);
  if (stash.code !== 0) {
    return {
      ran: false,
      ok: false,
      suiteLevelOnly: false,
      detail: `could not stash the fix: ${(stash.stderr || stash.stdout).trim().slice(0, 300)}`
    };
  }

  const run = await runJest(
    {
      repoPath: input.repoPath,
      testCmd: input.testCmd,
      extraArgs: ['--runTestsByPath', ...input.testFiles],
      timeoutMs: input.timeoutMs
    },
    runner
  );

  const pop = await git(['stash', 'pop']);
  if (pop.code !== 0) {
    return {
      ran: true,
      ok: false,
      suiteLevelOnly: false,
      detail:
        `THE FIX IS STILL STASHED — \`git stash pop\` failed in ${input.repoPath}: ` +
        (pop.stderr || pop.stdout).trim().slice(0, 300)
    };
  }

  if (!run.summary) {
    return {ran: true, ok: false, suiteLevelOnly: false, detail: run.detail};
  }
  if (run.summary.ok) {
    return {
      ran: true,
      ok: false,
      suiteLevelOnly: false,
      detail: 'the new test passes with the fix reverted, so it does not reproduce the bug'
    };
  }
  const suiteLevelOnly =
    run.summary.failures.length > 0 && run.summary.failures.every(f => f.endsWith('<suite did not run>'));
  return {
    ran: true,
    ok: true,
    suiteLevelOnly,
    detail: suiteLevelOnly
      ? 'the suite failed to load with the fix reverted (a new file went with it) rather than failing an assertion'
      : undefined
  };
}

export type SmokeFailure =
  | 'jest_failed'
  | 'new_failures'
  | 'reproduce_not_failing'
  | 'stash_failed'
  | 'no_baseline';

export interface SmokeInput {
  repoPath: string;
  testCmd: string[];
  /** Failing keys on the base commit. Cached per (repo, base_sha) by the caller. */
  baseline: string[] | undefined;
  sourceFiles: string[];
  testFiles: string[];
  timeoutMs: number;
}

export interface SmokeOutcome {
  ok: boolean;
  failure: SmokeFailure | undefined;
  detail: string | undefined;
  newFailures: string[];
  /** Baseline failures the fix happens to have resolved. Worth saying in the MR. */
  fixedFailures: string[];
  baselineCount: number;
  after: JestSummary | undefined;
  reproduce: ReproduceResult | undefined;
}

export async function smokeGate(input: SmokeInput, runner: Runner = spawnRunner): Promise<SmokeOutcome> {
  const empty = {
    newFailures: [] as string[],
    fixedFailures: [] as string[],
    baselineCount: input.baseline?.length ?? 0,
    after: undefined,
    reproduce: undefined
  };

  if (!input.baseline) {
    return {
      ...empty,
      ok: false,
      failure: 'no_baseline',
      detail: 'no baseline for this base commit, so a new failure cannot be told from an old one'
    };
  }

  const after = await runJest(
    {repoPath: input.repoPath, testCmd: input.testCmd, extraArgs: [], timeoutMs: input.timeoutMs},
    runner
  );
  if (!after.summary) {
    return {...empty, ok: false, failure: 'jest_failed', detail: after.detail};
  }

  const baseline = new Set(input.baseline);
  const now = new Set(after.summary.failures);
  const newFailures = [...now].filter(f => !baseline.has(f)).sort();
  const fixedFailures = [...baseline].filter(f => !now.has(f)).sort();

  if (newFailures.length) {
    return {
      ...empty,
      ok: false,
      failure: 'new_failures',
      detail: `${newFailures.length} test(s) fail that passed on the base commit`,
      newFailures,
      fixedFailures,
      after: after.summary,
      reproduce: undefined
    };
  }

  const reproduce = await reproduceCheck(
    {
      repoPath: input.repoPath,
      testCmd: input.testCmd,
      sourceFiles: input.sourceFiles,
      testFiles: input.testFiles,
      timeoutMs: input.timeoutMs
    },
    runner
  );

  const base = {
    newFailures,
    fixedFailures,
    baselineCount: input.baseline.length,
    after: after.summary,
    reproduce
  };

  if (!reproduce.ok) {
    const stashLost = reproduce.detail?.includes('STILL STASHED') ?? false;
    return {
      ...base,
      ok: false,
      failure: stashLost ? 'stash_failed' : 'reproduce_not_failing',
      detail: reproduce.detail
    };
  }

  return {...base, ok: true, failure: undefined, detail: undefined};
}

/** One line for the Slack reply and the MR body. */
export function describeSmoke(outcome: SmokeOutcome): string {
  const after = outcome.after;
  const counts = after ? `${after.totalTests} tests, ${after.failures.length} failing` : 'jest did not run';
  const baseline = `baseline ${outcome.baselineCount} failing`;
  const repro = outcome.reproduce?.ok
    ? outcome.reproduce.suiteLevelOnly
      ? 'reproduce test fails without the fix (suite load)'
      : 'reproduce test fails without the fix'
    : 'reproduce check did not pass';
  return `${counts} · ${baseline} · ${repro}`;
}
