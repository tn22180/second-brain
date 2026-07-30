/**
 * Thin wrapper around the `gcloud` CLI.
 *
 * Injectable on purpose: every probe in this project takes a `Runner`, so the
 * decision logic is unit-testable without a network, and the one test that does
 * hit GCP is explicitly an integration test.
 */

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface RunOptions {
  /**
   * Working directory. Needed because macOS `env` has no `-C` — the BSD build
   * rejects it outright — so a command that must run inside a repo cannot be
   * wrapped, it has to be spawned there.
   */
  cwd?: string;
}

export type Runner = (args: string[], timeoutMs: number, opts?: RunOptions) => Promise<RunResult>;

export const spawnRunner: Runner = async (args, timeoutMs, opts) => {
  const proc = Bun.spawn(args, {stdout: 'pipe', stderr: 'pipe', ...(opts?.cwd ? {cwd: opts.cwd} : {})});
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);
    return {code, stdout, stderr, timedOut};
  } finally {
    clearTimeout(timer);
  }
};

export type GcloudFailure = 'auth' | 'not_found' | 'permission' | 'timeout' | 'other';

/**
 * Auth is singled out because it is the one failure worth short-circuiting on:
 * without credentials no probe can work, so the job is parked as `blocked`
 * before a single model token is spent.
 */
export function classifyFailure(result: RunResult): GcloudFailure {
  if (result.timedOut) return 'timeout';
  const text = `${result.stderr}\n${result.stdout}`.toLowerCase();
  if (
    text.includes('reauthentication required') ||
    text.includes('reauthentication failed') ||
    text.includes('gcloud auth login') ||
    text.includes('your default credentials were not found') ||
    text.includes('does not have valid credentials') ||
    text.includes('invalid_grant') ||
    text.includes('unauthenticated') ||
    text.includes('401')
  ) {
    return 'auth';
  }
  if (text.includes('permission') || text.includes('forbidden') || text.includes('403')) {
    return 'permission';
  }
  if (text.includes('not_found') || text.includes('not found') || text.includes('404')) {
    return 'not_found';
  }
  return 'other';
}

export interface GcloudOk<T> {
  ok: true;
  value: T;
}
export interface GcloudErr {
  ok: false;
  failure: GcloudFailure;
  detail: string;
}
export type GcloudResult<T> = GcloudOk<T> | GcloudErr;

export function err(result: RunResult): GcloudErr {
  const failure = classifyFailure(result);
  const detail = (result.stderr || result.stdout).trim().split('\n').slice(0, 3).join(' | ').slice(0, 500);
  return {ok: false, failure, detail};
}
