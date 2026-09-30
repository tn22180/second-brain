import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import type {Verdict} from './verify';

// Tuan's personal DM via the Hermes (work) bot @tony_scream_bot — never a group (2026-09-30).
const DEFAULT_ENV_FILE = join(homedir(), '.hermes', '.env');
const DEFAULT_CHAT_ID = '1178722633';

export function formatVerdict(v: Verdict, goal: string): string {
  const head = `${v.pass ? '✅' : '❌'} ${v.contractId} — ${goal}`;
  const lines = v.checks.map(c => `${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
  return [head, ...lines, `files: ${v.changed.length} · run ${v.runId}`].join('\n');
}

function readVar(envFile: string, name: string): string | undefined {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0 && line.slice(0, eq).trim() === name) return line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

/** Best effort: false instead of a throw, and the token never appears in anything returned or logged. */
export async function notifyTelegram(
  text: string,
  opts: {envFile?: string; chatId?: string; fetchImpl?: typeof fetch} = {}
): Promise<boolean> {
  try {
    const token = readVar(opts.envFile ?? DEFAULT_ENV_FILE, 'TELEGRAM_BOT_TOKEN');
    if (!token) return false;
    const res = await (opts.fetchImpl ?? fetch)(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({chat_id: opts.chatId ?? DEFAULT_CHAT_ID, text}),
      signal: AbortSignal.timeout(15_000)
    });
    return res.ok;
  } catch {
    return false;
  }
}
