import {existsSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join, resolve} from 'node:path';

export const PROJECT_ROOT = resolve(import.meta.dir, '..');

/**
 * Parse a dotenv file. Deliberately minimal: `KEY=value`, `#` comments, optional
 * surrounding quotes. No interpolation — a `$` in a Slack token must survive as-is.
 */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Env resolution order: real process env wins over the file, so tests and
 * `autofix dry-run` can inject values without touching the secret on disk.
 */
export function loadEnv(
  envPath = join(PROJECT_ROOT, '.env'),
  processEnv: Record<string, string | undefined> = process.env
): Record<string, string> {
  const fromFile = existsSync(envPath) ? parseDotenv(readFileSync(envPath, 'utf8')) : {};
  const merged: Record<string, string> = {...fromFile};
  for (const [k, v] of Object.entries(processEnv)) {
    if (v !== undefined && v !== '') merged[k] = v;
  }
  return merged;
}

export type Transport = 'socket' | 'poll';

export interface Caps {
  maxConcurrentJobs: number;
  mrPerHour: number;
  mrPerRepoPerDay: number;
  maxFixAttempts: number;
  replyCooldownMs: number;
}

export interface Models {
  analyze: string;
  fix: string;
  learn: string;
}

export interface Timeouts {
  analyzeRoundMs: number;
  fixMs: number;
  learnMs: number;
  jestMs: number;
  gcloudMs: number;
}

export interface Paths {
  projectRoot: string;
  brainRoot: string;
  cacheRoot: string;
  stateDb: string;
  worktreeRoot: string;
  jobsRoot: string;
  reposRoot: string;
}

export interface Config {
  slackBotToken: string;
  /** Absent until an app-level `xapp-` token exists; forces `poll` transport. */
  slackAppToken: string | undefined;
  errorChannelId: string;
  transport: Transport;
  pollIntervalMs: number;
  logWindowMs: number;
  analyzeMaxRounds: number;
  brainSliceTokenBudget: number;
  caps: Caps;
  models: Models;
  timeouts: Timeouts;
  paths: Paths;
}

export class ConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(
      `missing required config: ${missing.join(', ')} — expected in ${join(PROJECT_ROOT, '.env')} ` +
        `(chmod 600, gitignored) or the process env`
    );
    this.name = 'ConfigError';
  }
}

function num(env: Record<string, string>, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${key} must be a number, got ${JSON.stringify(raw)}`);
  return parsed;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export function buildConfig(env: Record<string, string> = loadEnv()): Config {
  const missing: string[] = [];
  const slackBotToken = env.SLACK_BOT_TOKEN;
  // Tuan's .env names the channel SLACK_ERROR_CHANNEL_ID; SLACK_CHANNEL_ID is accepted too.
  const errorChannelId = env.SLACK_ERROR_CHANNEL_ID || env.SLACK_CHANNEL_ID;
  if (!slackBotToken) missing.push('SLACK_BOT_TOKEN');
  if (!errorChannelId) missing.push('SLACK_ERROR_CHANNEL_ID');
  if (missing.length) throw new ConfigError(missing);

  const slackAppToken = env.SLACK_APP_TOKEN || undefined;
  // Socket Mode needs the app-level token. Without it, fall back to polling
  // conversations.history — the bot token alone covers that, and the backfill
  // path already depends on the same API.
  const requested = (env.AUTOFIX_TRANSPORT as Transport | undefined) ?? (slackAppToken ? 'socket' : 'poll');
  const transport: Transport = requested === 'socket' && !slackAppToken ? 'poll' : requested;

  const cacheRoot = env.AUTOFIX_CACHE_ROOT || join(homedir(), '.cache', 'prod-autofix');
  const reposRoot = env.AUTOFIX_REPOS_ROOT || resolve(PROJECT_ROOT, '..', '..', 'projects', 'Falcon');

  return {
    slackBotToken: slackBotToken!,
    slackAppToken,
    errorChannelId: errorChannelId!,
    transport,
    pollIntervalMs: num(env, 'AUTOFIX_POLL_INTERVAL_MS', MINUTE),
    logWindowMs: num(env, 'AUTOFIX_LOG_WINDOW_MS', 15 * MINUTE),
    analyzeMaxRounds: num(env, 'AUTOFIX_ANALYZE_MAX_ROUNDS', 5),
    brainSliceTokenBudget: num(env, 'AUTOFIX_BRAIN_TOKEN_BUDGET', 6000),
    caps: {
      maxConcurrentJobs: num(env, 'AUTOFIX_MAX_CONCURRENT_JOBS', 1),
      mrPerHour: num(env, 'AUTOFIX_MR_PER_HOUR', 5),
      mrPerRepoPerDay: num(env, 'AUTOFIX_MR_PER_REPO_PER_DAY', 3),
      maxFixAttempts: num(env, 'AUTOFIX_MAX_FIX_ATTEMPTS', 3),
      replyCooldownMs: num(env, 'AUTOFIX_REPLY_COOLDOWN_MS', 24 * HOUR)
    },
    models: {
      analyze: env.AUTOFIX_ANALYZE_MODEL || 'claude-opus-5',
      fix: env.AUTOFIX_FIX_MODEL || 'claude-sonnet-5',
      learn: env.AUTOFIX_LEARN_MODEL || 'claude-haiku-4-5-20251001'
    },
    timeouts: {
      analyzeRoundMs: num(env, 'AUTOFIX_ANALYZE_TIMEOUT_MS', 8 * MINUTE),
      fixMs: num(env, 'AUTOFIX_FIX_TIMEOUT_MS', 12 * MINUTE),
      learnMs: num(env, 'AUTOFIX_LEARN_TIMEOUT_MS', 3 * MINUTE),
      jestMs: num(env, 'AUTOFIX_JEST_TIMEOUT_MS', 20 * MINUTE),
      gcloudMs: num(env, 'AUTOFIX_GCLOUD_TIMEOUT_MS', 2 * MINUTE)
    },
    paths: {
      projectRoot: PROJECT_ROOT,
      brainRoot: join(PROJECT_ROOT, 'brain'),
      cacheRoot,
      stateDb: env.AUTOFIX_STATE_DB || join(cacheRoot, 'state.db'),
      worktreeRoot: join(cacheRoot, 'wt'),
      jobsRoot: join(cacheRoot, 'jobs'),
      reposRoot
    }
  };
}

/** Keep the last 4 chars only. Used anywhere a token could reach a log or a Slack reply. */
export function redact(secret: string | undefined): string {
  if (!secret) return '<unset>';
  return secret.length <= 4 ? '<redacted>' : `<redacted:${secret.slice(-4)}>`;
}
