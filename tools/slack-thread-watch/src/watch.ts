// Pure decision logic for slack-thread-watch: which new support threads get a Claude session,
// in which Orca repo. No I/O here — bin/watch.ts does Slack, Orca, Telegram and state.

export interface SlackMessage {
  ts: string;
  thread_ts?: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  attachments?: {text?: string; fallback?: string; pretext?: string}[];
  blocks?: unknown[];
}

export interface State {
  /** Per channel: newest top-level ts already decided (spawned, skipped, or deferred past). */
  watermark: Record<string, string>;
  /** thread ts -> what was spawned for it; the ledger that stops a second session per thread. */
  spawned: Record<string, {app: string; worktree: string; at: string}>;
  /** Threads waiting because the hourly cap was hit or the spawn failed. */
  pending: {channel: string; ts: string; attempts: number}[];
  /** Spawn times (ISO) inside the rolling cap window. */
  recentSpawns: string[];
}

export const emptyState = (): State => ({watermark: {}, spawned: {}, pending: [], recentSpawns: []});

// Longest/most specific first: "seo on ai product copy" must win over "seo". Mirrors the
// aliases falcon-fix-bot learned from real CS posts (tools/lib/parse.js), incl. the
// "Avada Speed Optimization" name image-optimizer tickets arrive under.
const APP_ALIASES: [string, string][] = [
  ['seo on ai product copy', 'ai-product-copy'],
  ['ai product copy', 'ai-product-copy'],
  ['seo on aeo', 'llm-ai-search-seo'],
  ['aeo optimizer', 'llm-ai-search-seo'],
  ['avada image optimizer', 'avada-image-optimizer'],
  ['image optimizer', 'avada-image-optimizer'],
  ['avada speed optimization', 'avada-image-optimizer'],
  ['seo suite', 'seo'],
  ['seo on blog', 'blogs'],
  ['avada blog', 'blogs'],
  ['aeo', 'llm-ai-search-seo'],
  ['blog', 'blogs'],
];

/** Orca repo name for a thread, from the "App: ..." line CS posts, else the channel's own app. */
export function resolveApp(text: string, channelDefault: string | null): string | null {
  const t = text.toLowerCase();
  const appLine = t.match(/app:\s*([^\n]+)/)?.[1] ?? '';
  for (const [alias, repo] of APP_ALIASES) {
    if (appLine.includes(alias)) return repo;
  }
  for (const [alias, repo] of APP_ALIASES) {
    if (alias.length > 4 && t.includes(alias)) return repo;
  }
  return channelDefault;
}

/** CS posts arrive as bot messages (CS Team Bot), so bots are NOT skipped — only our own posts. */
export function isNewThread(m: SlackMessage, ownIds: Set<string>): boolean {
  if (m.subtype && m.subtype !== 'bot_message') return false;
  if (m.thread_ts && m.thread_ts !== m.ts) return false;
  if ((m.user && ownIds.has(m.user)) || (m.bot_id && ownIds.has(m.bot_id))) return false;
  return true;
}

export function messageText(m: SlackMessage): string {
  const att = (m.attachments ?? []).map(a => [a.pretext, a.text, a.fallback].filter(Boolean).join('\n'));
  return [m.text ?? '', ...att].join('\n');
}

export function permalink(workspace: string, channel: string, ts: string): string {
  return `https://${workspace}.slack.com/archives/${channel}/p${ts.replace('.', '')}`;
}

/** Orca worktree / branch name: short, unique per thread, safe for git refs. */
export function worktreeName(app: string, ts: string): string {
  return `slack-${app}-${ts.replace('.', '').slice(0, 13)}`;
}

/** Spawns allowed right now under a rolling-window cap. */
export function capRemaining(recent: string[], now: Date, cap: number, windowMs: number): number {
  const live = recent.filter(iso => now.getTime() - Date.parse(iso) < windowMs);
  return Math.max(0, cap - live.length);
}
