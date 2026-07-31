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

/** How long to keep reading a killed process's output before abandoning the pipe. */
const DRAIN_GRACE_MS = 2000;

const TIMED_OUT = Symbol('timed out');

/**
 * Spawns a command and *always* returns, even when the child misbehaves.
 *
 * Two failure modes, both hit live on 2026-07-30 by job `te44sp`, which hung for
 * 11.8 hours and — with a concurrency cap — froze the whole queue behind it:
 *
 *  - `proc.kill()` signals only the direct child. `claude` spawns its own children,
 *    and they inherit the stdout pipe, so killing the parent leaves the pipe open.
 *  - Reading that pipe is awaited together with `proc.exited`, so an open pipe means
 *    the await never settles. The timeout fired, the kill landed, and the promise
 *    stayed pending anyway.
 *
 * So: the child gets its own process group and the whole group is signalled, and the
 * read is raced against the deadline rather than trusted to end on its own.
 */
export const spawnRunner: Runner = async (args, timeoutMs, opts) => {
  const proc = Bun.spawn(args, {
    stdout: 'pipe',
    stderr: 'pipe',
    // Verified on this machine: with `detached`, pgid === pid, and killing -pid
    // took a 3-process tree to 0.
    detached: true,
    ...(opts?.cwd ? {cwd: opts.cwd} : {})
  });

  const killTree = () => {
    try {
      process.kill(-proc.pid, 'SIGKILL');
    } catch {
      try {
        proc.kill(9);
      } catch {
        // Already gone.
      }
    }
  };

  const collected: Promise<RunResult> = (async () => {
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);
    return {code, stdout, stderr, timedOut: false};
  })();
  // The abandoned branch must never surface as an unhandled rejection.
  collected.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof TIMED_OUT>(resolve => {
    timer = setTimeout(() => {
      killTree();
      resolve(TIMED_OUT);
    }, timeoutMs);
  });

  const settled = await Promise.race([collected, deadline]);
  if (timer) clearTimeout(timer);
  if (settled !== TIMED_OUT) return settled;

  // The kill is sent. Whatever output already arrived is worth having, but a pipe a
  // grandchild still holds is not worth waiting on.
  const drained = await Promise.race([
    collected,
    Bun.sleep(DRAIN_GRACE_MS).then((): typeof TIMED_OUT => TIMED_OUT)
  ]);
  if (drained !== TIMED_OUT) return {...drained, timedOut: true};
  return {
    code: -1,
    stdout: '',
    stderr: `killed after ${timeoutMs}ms; output pipe still held by a child process`,
    timedOut: true
  };
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
