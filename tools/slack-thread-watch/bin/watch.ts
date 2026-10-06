#!/usr/bin/env bun
// One pass: read new top-level threads in the support channels, open one Orca worktree with a
// Claude session per thread (`/support-handoff <permalink>`), DM Tuan. Run by launchd every 2 min.
// `--dry-run` decides and prints without spawning, DMing or saving state.
import {execFile} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {notifyTelegram} from '../../agent-harness/src/notify';
import {
  capRemaining,
  emptyState,
  isNewThread,
  messageText,
  permalink,
  resolveApp,
  worktreeName,
  type SlackMessage,
  type State,
} from '../src/watch';

const run = promisify(execFile);
const HOME = homedir();
const STATE_DIR = join(HOME, '.cache', 'slack-thread-watch');
const STATE_FILE = join(STATE_DIR, 'state.json');
// The retired falcon-fix-bot's Slack app: already a member of both channels, read+post scopes.
const SLACK_TOKEN_FILE = join(HOME, 'Projects', 'falcon-fix-bot', 'secrets', 'slack-bot.token');
const ORCA = '/Applications/Orca.app/Contents/Resources/bin/orca';
const WORKSPACE = 'avadaio';
const CHANNELS: Record<string, string | null> = {
  G01N5G8D562: null, // seo-suite-support carries every app; the CS post's "App:" line decides
  C08928RK00H: 'blogs', // blog-support
};
const CAP = 5;
const CAP_WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;

const dryRun = process.argv.includes('--dry-run');
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function loadState(): State {
  try {
    return {...emptyState(), ...JSON.parse(readFileSync(STATE_FILE, 'utf8'))};
  } catch {
    return emptyState();
  }
}

function saveState(s: State) {
  mkdirSync(STATE_DIR, {recursive: true});
  const tmp = `${STATE_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, STATE_FILE);
}

async function slack(token: string, method: string, params: Record<string, string>) {
  const res = await fetch(`https://slack.com/api/${method}?${new URLSearchParams(params)}`, {
    headers: {Authorization: `Bearer ${token}`},
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json()) as {ok: boolean; error?: string} & Record<string, any>;
  if (!j.ok) throw new Error(`${method}: ${j.error}`);
  return j;
}

async function newTopLevel(token: string, channel: string, oldest: string): Promise<SlackMessage[]> {
  const out: SlackMessage[] = [];
  let cursor = '';
  do {
    const r = await slack(token, 'conversations.history', {
      channel,
      oldest,
      limit: '200',
      ...(cursor ? {cursor} : {}),
    });
    out.push(...(r.messages as SlackMessage[]));
    cursor = r.response_metadata?.next_cursor ?? '';
  } while (cursor);
  return out.sort((a, b) => Number(a.ts) - Number(b.ts));
}

// Not `worktree create --agent claude`: Orca launches its agents with
// --dangerously-skip-permissions, and this session starts from customer-written Slack text.
// A plain `claude` keeps the default mode, so every write asks Tuan (from Orca mobile).
// The prompt is built only from a channel id and a numeric ts — nothing user-written reaches
// the shell command.
async function spawn(app: string, channel: string, ts: string): Promise<string> {
  const name = worktreeName(app, ts);
  const prompt = `/support-handoff ${permalink(WORKSPACE, channel, ts)}`;
  const {stdout} = await run(ORCA, ['worktree', 'create', '--repo', `name:${app}`, '--name', name, '--json'], {
    timeout: 120_000,
  });
  const path = JSON.parse(stdout)?.result?.worktree?.path;
  if (!path) throw new Error(`worktree create returned no path: ${stdout.slice(0, 200)}`);
  await run(ORCA, ['terminal', 'create', '--worktree', `path:${path}`, '--title', 'support-handoff', '--command', `claude "${prompt}"`, '--json'], {
    timeout: 60_000,
  });
  return name;
}

async function main() {
  const token = readFileSync(SLACK_TOKEN_FILE, 'utf8').trim();
  const state = loadState();
  const auth = await slack(token, 'auth.test', {});
  const ownIds = new Set<string>([auth.user_id, auth.bot_id].filter(Boolean));
  const now = new Date();

  for (const [channel, channelDefault] of Object.entries(CHANNELS)) {
    // First sight of a channel: start from now. Joining a week of backlog is not what was asked.
    if (!state.watermark[channel]) {
      state.watermark[channel] = (now.getTime() / 1000).toFixed(6);
      log(`init watermark ${channel}`);
      continue;
    }
    const msgs = await newTopLevel(token, channel, state.watermark[channel]);
    for (const m of msgs) {
      if (Number(m.ts) > Number(state.watermark[channel])) state.watermark[channel] = m.ts;
      if (!isNewThread(m, ownIds) || state.spawned[m.ts]) continue;
      if (!state.pending.some(p => p.ts === m.ts)) state.pending.push({channel, ts: m.ts, attempts: 0});
    }
  }

  const keep: State['pending'] = [];
  for (const p of state.pending) {
    if (state.spawned[p.ts]) continue;
    const r = await slack(token, 'conversations.history', {channel: p.channel, latest: p.ts, inclusive: 'true', limit: '1'});
    const msg = (r.messages as SlackMessage[])[0];
    const text = msg ? messageText(msg) : '';
    const app = resolveApp(text, CHANNELS[p.channel] ?? null);
    const link = permalink(WORKSPACE, p.channel, p.ts);
    const summary = esc(text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 160));
    if (!app) {
      // An "App:" line naming another team's app (Product Feed, …) is not ours — skip quietly.
      // Only a post we cannot place at all is worth a DM.
      const otherTeam = /app:\s*\S/i.test(text);
      log(`skip ${p.ts}: ${otherTeam ? 'other team app' : 'no app'}`);
      if (!dryRun && !otherTeam) await notifyTelegram(`<b>slack-thread-watch</b>\n⚠️ thread mới, không nhận ra app — không mở session\n${link}\n${summary}`);
      continue;
    }
    if (capRemaining(state.recentSpawns, now, CAP, CAP_WINDOW_MS) === 0) {
      log(`cap: defer ${p.ts}`);
      keep.push(p);
      continue;
    }
    if (dryRun) {
      log(`[dry-run] would spawn ${app} ${worktreeName(app, p.ts)} for ${link}`);
      continue;
    }
    try {
      const name = await spawn(app, p.channel, p.ts);
      state.spawned[p.ts] = {app, worktree: name, at: now.toISOString()};
      state.recentSpawns.push(now.toISOString());
      log(`spawned ${name} for ${link}`);
      await notifyTelegram(`<b>slack-thread-watch</b>\n🧵 ${esc(app)} → Orca worktree <code>${esc(name)}</code>\n${link}\n${summary}`);
    } catch (e) {
      const attempts = p.attempts + 1;
      log(`spawn failed ${p.ts} (attempt ${attempts}): ${(e as Error).message.slice(0, 300)}`);
      if (attempts < MAX_ATTEMPTS) keep.push({...p, attempts});
      else await notifyTelegram(`<b>slack-thread-watch</b>\n❌ mở session thất bại ${MAX_ATTEMPTS} lần\n${link}`);
    }
  }
  state.pending = keep;
  state.recentSpawns = state.recentSpawns.filter(iso => now.getTime() - Date.parse(iso) < CAP_WINDOW_MS);

  if (!dryRun) saveState(state);
  else log('[dry-run] state not saved', JSON.stringify({watermark: state.watermark, pending: state.pending.length}));
}

if (!existsSync(ORCA)) {
  console.error(`orca CLI missing at ${ORCA}`);
  process.exit(1);
}
main().catch(e => {
  log('run failed:', (e as Error).message);
  process.exit(1);
});
