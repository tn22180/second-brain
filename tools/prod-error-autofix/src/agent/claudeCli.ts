import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

/**
 * Runs `claude -p` headless and parses its JSON envelope.
 *
 * Envelope verified against the installed CLI on 2026-07-30: the final text is
 * `result`, with `is_error`, `num_turns`, `total_cost_usd`, `session_id` and
 * `permission_denials` alongside it.
 *
 * This CLI build has **no `--max-turns`**, so a runaway agent is bounded by the
 * wall-clock timeout here and by the round counter in the caller — not by a flag.
 */

export interface ClaudeInvocation {
  prompt: string;
  model: string;
  /** Prepended context — the brain slice. This build has no `-file` variant. */
  appendSystemPrompt: string | undefined;
  /** The worktree. Makes the repo's own CLAUDE.md and .claude/skills load. */
  cwd: string;
  allowedTools: string[];
  addDirs: string[];
  permissionMode: string | undefined;
  timeoutMs: number;
}

export type ClaudeFailure = 'timeout' | 'nonzero' | 'unparseable' | 'agent_error';

export interface ClaudeResult {
  ok: boolean;
  text: string;
  costUsd: number | undefined;
  numTurns: number | undefined;
  sessionId: string | undefined;
  permissionDenials: unknown[];
  failure: ClaudeFailure | undefined;
  detail: string | undefined;
}

export type ClaudeRunner = (inv: ClaudeInvocation) => Promise<ClaudeResult>;

/** PATH first, then the known install location — launchd gives a minimal PATH. */
export function resolveClaudeBin(env: Record<string, string | undefined> = process.env): string {
  if (env.AUTOFIX_CLAUDE_BIN) return env.AUTOFIX_CLAUDE_BIN;
  const fallback = join(homedir(), '.local', 'bin', 'claude');
  return existsSync(fallback) ? fallback : 'claude';
}

/**
 * Variadic flags go last on purpose: `--allowedTools a b c` swallows following
 * arguments, so anything after it would be read as another tool name.
 *
 * `--strict-mcp-config` with no `--mcp-config` means no MCP server at all. Nothing
 * this tool runs names an `mcp__` tool — every lane's `allowedTools` is Read/Grep/
 * Glob/Edit/Write/Bash — but without the flag each spawn still inherits the user's
 * own servers and starts them. Measured 2026-08-24: every triage batch was launching
 * `uvx workspace-mcp --tools calendar sheets drive docs gmail`, once per batch, and
 * SEO's run had 112 batches.
 */
export function buildArgs(inv: ClaudeInvocation, bin: string): string[] {
  const args = [bin, '-p', inv.prompt, '--output-format', 'json', '--model', inv.model, '--strict-mcp-config'];
  if (inv.appendSystemPrompt) args.push('--append-system-prompt', inv.appendSystemPrompt);
  if (inv.permissionMode) args.push('--permission-mode', inv.permissionMode);
  if (inv.addDirs.length) args.push('--add-dir', ...inv.addDirs);
  if (inv.allowedTools.length) args.push('--allowedTools', ...inv.allowedTools);
  return args;
}

export function parseEnvelope(stdout: string): ClaudeResult {
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      text: stdout.slice(0, 2000),
      costUsd: undefined,
      numTurns: undefined,
      sessionId: undefined,
      permissionDenials: [],
      failure: 'unparseable',
      detail: 'stdout was not the --output-format json envelope'
    };
  }
  const isError = envelope.is_error === true;
  return {
    ok: !isError,
    text: typeof envelope.result === 'string' ? envelope.result : '',
    costUsd: typeof envelope.total_cost_usd === 'number' ? envelope.total_cost_usd : undefined,
    numTurns: typeof envelope.num_turns === 'number' ? envelope.num_turns : undefined,
    sessionId: typeof envelope.session_id === 'string' ? envelope.session_id : undefined,
    permissionDenials: Array.isArray(envelope.permission_denials) ? envelope.permission_denials : [],
    failure: isError ? 'agent_error' : undefined,
    detail: isError ? String(envelope.api_error_status ?? envelope.subtype ?? 'agent reported is_error') : undefined
  };
};

/**
 * What a nonzero exit is reported as.
 *
 * A raw `(stderr || stdout).slice(0, 500)` was useless in practice: on 2026-08-23 every
 * lane failed and each detail was 500 characters of an error envelope's `usage` block —
 * `output_tokens: 0`, `cache_creation`, `service_tier` — with the one field that says
 * WHY (`result` / `api_error_status`) sitting past the cut. So when the output parses as
 * an envelope, report those fields instead of the blob.
 */
export function failureDetail(stdout: string, stderr: string): string {
  for (const stream of [stdout, stderr]) {
    const text = stream.trim();
    if (!text.startsWith('{')) continue;
    try {
      const env = JSON.parse(text) as Record<string, unknown>;
      const parts = [env.api_error_status, env.subtype, env.result, env.stop_reason]
        .filter(v => typeof v === 'string' && v)
        .map(String);
      if (parts.length) return parts.join(' · ').slice(0, 500);
    } catch {
      // Not an envelope after all — fall through to the raw text.
    }
  }
  return (stderr || stdout).trim().slice(0, 500);
}

export const spawnClaude: ClaudeRunner = async inv => {
  const bin = resolveClaudeBin();
  const args = buildArgs(inv, bin);
  const proc = Bun.spawn(args, {cwd: inv.cwd, stdout: 'pipe', stderr: 'pipe'});
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, inv.timeoutMs);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);
    if (timedOut) {
      return {
        ok: false,
        text: stdout.slice(0, 2000),
        costUsd: undefined,
        numTurns: undefined,
        sessionId: undefined,
        permissionDenials: [],
        failure: 'timeout',
        detail: `killed after ${inv.timeoutMs}ms`
      };
    }
    if (code !== 0) {
      return {
        ok: false,
        text: stdout.slice(0, 2000),
        costUsd: undefined,
        numTurns: undefined,
        sessionId: undefined,
        permissionDenials: [],
        failure: 'nonzero',
        detail: failureDetail(stdout, stderr)
      };
    }
    return parseEnvelope(stdout);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * ANALYZE is read-only. No Write, no Edit, and Bash is limited to the reads the
 * stage actually needs, so a wrong turn cannot mutate the worktree.
 */
export const ANALYZE_TOOLS = [
  'Read',
  'Grep',
  'Glob',
  'Bash(git log:*)',
  'Bash(git show:*)',
  'Bash(git diff:*)',
  'Bash(gcloud logging read:*)',
  'Bash(rg:*)',
  'Bash(cat:*)',
  'Bash(ls:*)'
];

/** FIX may edit the worktree and run the repo's tests. Still no deploy, no push. */
export const FIX_TOOLS = [
  'Read',
  'Grep',
  'Glob',
  'Edit',
  'Write',
  'Bash(npx jest:*)',
  'Bash(git diff:*)',
  'Bash(git status:*)',
  'Bash(git log:*)',
  'Bash(ls:*)',
  'Bash(cat:*)'
];
