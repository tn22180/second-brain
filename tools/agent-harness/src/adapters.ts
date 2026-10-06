import {closeSync, existsSync, openSync, readFileSync, readSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import type {VerifyCommand} from './contract';
import type {Proc, SuperviseAction} from './node';
import {redact} from './redact';

const CC = join(homedir(), '.local', 'bin', 'cc');
const JEV = join(homedir(), '.local', 'bin', 'jev');
const HERMES_ENV = join(homedir(), '.hermes', '.env');
const TAIL_BYTES = 4000;
// An ANTHROPIC_* key in the environment switches `cc` from the subscription login to metered API.
const STRIP = new Set(['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT']);
const ACTIONS = new Set(['keep_waiting', 'answer_question', 'nudge', 'escalate', 'collect']);

export function childEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && !STRIP.has(k)) out[k] = v;
  return out;
}

/** KEY=v lines, `export KEY=v` too; read from disk so no credential ever sits on a command line. */
export function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim().replace(/^export\s+/, '');
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]!] = m[2]!.trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

function tailOf(path: string): string {
  try {
    const size = statSync(path).size;
    const fd = openSync(path, 'r');
    try {
      const len = Math.min(size, TAIL_BYTES);
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, size - len);
      return buf.toString('utf8');
    } finally {
      closeSync(fd);
    }
  } catch {
    return '';
  }
}

/**
 * First `thread.started` in a Codex `--json` log. The log is per node and appended across
 * rounds; a resumed run keeps the same thread, so the first one is the one to resume.
 */
export function codexThreadId(logFile: string): string | undefined {
  try {
    return readFileSync(logFile, 'utf8').match(/"type":"thread\.started","thread_id":"([^"]+)"/)?.[1];
  } catch {
    return undefined;
  }
}

/** Spawn with stdout+stderr appended to `logFile`; `cc` resolves to the telemetry wrapper. */
export function startProc(argv: string[], cwd: string, logFile: string): Proc {
  const cmd = argv[0] === 'cc' ? [CC, ...argv.slice(1)] : argv;
  // One append-mode fd for both streams: two file sinks on the same path overwrite each other.
  const fd = openSync(logFile, 'a');
  const child = Bun.spawn(cmd, {cwd, env: childEnv(process.env), stdin: 'ignore', stdout: fd, stderr: fd});
  let code: number | null = null;
  child.exited.then(c => {
    code = c;
    closeSync(fd);
  });
  return {
    exited: () => code !== null,
    exitCode: () => code,
    kill: () => child.kill(),
    tail: () => tailOf(logFile),
    threadId: () => codexThreadId(logFile)
  };
}

/**
 * Ask the supervisor. Any failure — crash, timeout, unparsable or unknown action — is
 * keep_waiting: a flaky supervisor must not kill good work, and the per-round wall clock in
 * runNode is what stops a run nobody is watching.
 */
export async function superviseWith(
  cmd: string[],
  env: Record<string, string>,
  input: Record<string, unknown>,
  timeoutMs = 90_000
): Promise<SuperviseAction> {
  try {
    const child = Bun.spawn(cmd, {env: {...childEnv(process.env), ...env}, stdin: new TextEncoder().encode(JSON.stringify(input)), stdout: 'pipe', stderr: 'pipe'});
    const timer = setTimeout(() => child.kill(), timeoutMs);
    const [text, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    clearTimeout(timer);
    if (code !== 0) return {action: 'keep_waiting', reason: `supervisor exit ${code}`};
    const a = JSON.parse(text.slice(text.indexOf('{'))) as SuperviseAction;
    return ACTIONS.has(a.action) ? a : {action: 'keep_waiting', reason: `unknown action ${String(a.action)}`};
  } catch (e) {
    return {action: 'keep_waiting', reason: `supervisor error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)};
  }
}

export const superviseJev = (input: Record<string, unknown>) =>
  superviseWith([JEV, 'supervise', '--timeout', '60'], existsSync(HERMES_ENV) ? readEnvFile(HERMES_ENV) : {}, input);

/** Run each check in `cwd`; failing ones come back as `name: <output tail>` (redacted). */
export async function preflightChecks(cmds: VerifyCommand[], cwd: string): Promise<string[]> {
  const failing: string[] = [];
  for (const v of cmds) {
    const child = Bun.spawn(v.cmd, {cwd, env: childEnv(process.env), stdin: 'ignore', stdout: 'pipe', stderr: 'pipe'});
    const timer = setTimeout(() => child.kill(), v.timeoutMs ?? 600_000);
    const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    clearTimeout(timer);
    if (code !== 0) failing.push(`${v.name}: ${redact((err + out).trim().slice(-300)) || `exit ${code}`}`);
  }
  return failing;
}
