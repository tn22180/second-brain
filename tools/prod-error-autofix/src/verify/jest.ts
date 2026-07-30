import {existsSync} from 'node:fs';
import {join, relative} from 'node:path';
import {spawnRunner, type Runner} from '../gcloud/run';

/**
 * Reads `jest --json`.
 *
 * Shape verified against the installed jest on 2026-07-30: top level carries
 * `success`, `numFailedTests`, `numFailedTestSuites`, `numRuntimeErrorTestSuites`
 * and `testResults[]`; each suite has an absolute `name`, a `status`, a `message`
 * and `assertionResults[]`, and each assertion has `fullName` and `status`.
 */

export interface JestSummary {
  ok: boolean;
  totalTests: number;
  totalSuites: number;
  /** `<repo-relative suite path>::<test full name>`, or `::<suite did not run>`. */
  failures: string[];
  runtimeErrorSuites: number;
}

const SUITE_LEVEL = '<suite did not run>';

/**
 * Keys are repo-relative on purpose: a baseline is cached per (repo, base_sha) and
 * compared across *different* worktree paths, so absolute paths would never match.
 */
export function parseJestJson(stdout: string, repoPath: string): JestSummary | undefined {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  let root: Record<string, unknown>;
  try {
    root = JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (!Array.isArray(root.testResults)) return undefined;

  const failures: string[] = [];
  for (const suiteRaw of root.testResults) {
    const suite = (suiteRaw ?? {}) as Record<string, unknown>;
    const name = typeof suite.name === 'string' ? suite.name : '';
    const rel = name ? relative(repoPath, name) || name : 'unknown';
    const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : [];
    let sawFailedTest = false;
    for (const aRaw of assertions) {
      const a = (aRaw ?? {}) as Record<string, unknown>;
      if (a.status === 'failed') {
        sawFailedTest = true;
        const full = typeof a.fullName === 'string' && a.fullName ? a.fullName : String(a.title ?? 'unnamed');
        failures.push(`${rel}::${full}`);
      }
    }
    // A suite that throws while loading reports failed with no assertions at all.
    // Those are the three long-standing module-resolution failures on blogs master.
    if (!sawFailedTest && suite.status === 'failed') failures.push(`${rel}::${SUITE_LEVEL}`);
  }

  return {
    ok: root.success === true,
    totalTests: typeof root.numTotalTests === 'number' ? root.numTotalTests : 0,
    totalSuites: typeof root.numTotalTestSuites === 'number' ? root.numTotalTestSuites : 0,
    failures: failures.sort(),
    runtimeErrorSuites:
      typeof root.numRuntimeErrorTestSuites === 'number' ? root.numRuntimeErrorTestSuites : 0
  };
}

export interface JestRunInput {
  repoPath: string;
  /** From the registry, e.g. `['npx','jest','--ci']`. */
  testCmd: string[];
  extraArgs: string[];
  timeoutMs: number;
}

/**
 * Pins the jest that runs and the config it uses.
 *
 * Two problems this solves, both seen live on 2026-07-30:
 *
 *  - `npx jest` in a worktree with no local jest fetches a *current* jest, whose
 *    behaviour differs from the version the repo pins (24.9.0 across all five apps).
 *  - `blogs` carries both a `jest.config.js` and a `jest` key in `package.json`.
 *    A current jest refuses that outright — "Implicit config resolution does not
 *    allow multiple configuration files" — and the baseline run fails, which blocks
 *    the MR for a reason that has nothing to do with the fix. An explicit `--config`
 *    removes the ambiguity for every version.
 */
export function resolveTestCmd(
  dir: string,
  testCmd: string[],
  fs: {existsSync: (p: string) => boolean} = {existsSync}
): string[] {
  const localJest = join(dir, 'node_modules', '.bin', 'jest');
  const cmd = fs.existsSync(localJest) ? [localJest, ...testCmd.slice(2)] : [...testCmd];
  const config = join(dir, 'jest.config.js');
  if (fs.existsSync(config) && !cmd.some(a => a.startsWith('--config'))) cmd.push('--config', config);
  return cmd;
}

export interface JestRun {
  summary: JestSummary | undefined;
  timedOut: boolean;
  /** Set when jest could not be run or its output could not be read. */
  detail: string | undefined;
}

export async function runJest(input: JestRunInput, runner: Runner = spawnRunner): Promise<JestRun> {
  // Spawned with cwd rather than wrapped in `env -C`: macOS `env` rejects -C.
  const args = [...resolveTestCmd(input.repoPath, input.testCmd), '--json', '--silent', ...input.extraArgs];
  const res = await runner(args, input.timeoutMs, {cwd: input.repoPath});
  if (res.timedOut) {
    return {summary: undefined, timedOut: true, detail: `jest timed out after ${input.timeoutMs}ms`};
  }
  const summary = parseJestJson(res.stdout, input.repoPath);
  if (!summary) {
    // A non-zero exit with unreadable output means jest itself did not run —
    // distinguishable from "tests failed", which still produces valid JSON.
    return {
      summary: undefined,
      timedOut: false,
      detail: `could not read jest --json output (exit ${res.code}): ${(res.stderr || res.stdout).trim().slice(0, 300)}`
    };
  }
  return {summary, timedOut: false, detail: undefined};
}
