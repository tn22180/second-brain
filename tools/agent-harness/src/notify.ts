import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import type {Verdict} from './verify';

// Tuan's personal DM via the Hermes (work) bot @tony_scream_bot — never a group (2026-09-30).
const DEFAULT_ENV_FILE = join(homedir(), '.hermes', '.env');
const DEFAULT_CHAT_ID = '1178722633';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Telegram HTML. First line is the bold run title — the contract id minus its `-t1`/`-g2` task
 * suffix — so every task of one tony-wf run groups under the same header in the DM.
 */
export function formatVerdict(v: Verdict, _goal: string): string {
  const m = v.contractId.match(/^(.+)-([a-z]*\d+)$/);
  const [title, task] = m ? [m[1], `${m[2]} `] : [v.contractId, ''];
  const ok = v.checks.filter(c => c.ok).length;
  const body = v.pass
    ? `✅ ${task}pass · ${ok}/${v.checks.length} check · ${v.changed.length} file`
    : `❌ ${task}FAIL — ${v.checks.filter(c => !c.ok).map(c => (c.detail ? `${c.name}: ${cut(c.detail, 80)}` : c.name)).join('; ')}`;
  return `<b>${escapeHtml(title)}</b>\n${escapeHtml(cut(body, 300))}`;
}

function readVar(envFile: string, name: string): string | undefined {
  for (const raw of readFileSync(envFile, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#')) continue;
    // Files sourced by a shell are often written `export KEY=v`; the prefix must not hide the key.
    const m = line.match(/^(?:export\s+)?([^\s=]+)\s*=(.*)$/);
    if (m && m[1] === name) return m[2].trim().replace(/^["']|["']$/g, '');
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
      body: JSON.stringify({chat_id: opts.chatId ?? DEFAULT_CHAT_ID, text, parse_mode: 'HTML'}),
      signal: AbortSignal.timeout(15_000)
    });
    return res.ok;
  } catch {
    return false;
  }
}
