import {existsSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join, resolve} from 'node:path';
import type {TelegramConfig} from './notify/telegram';

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
  /**
   * The security gate blocks merge requests, so a weak reviewer here costs more than
   * it saves: a missed finding ships, and a hallucinated one parks a good fix.
   */
  security: string;
}

export interface Timeouts {
  analyzeRoundMs: number;
  fixMs: number;
  learnMs: number;
  securityMs: number;
  jestMs: number;
  gcloudMs: number;
  /** A job still `analyzing` past this is treated as dead and its slot is freed. */
  staleJobMs: number;
}

export interface AuditModels {
  security: string;
  triage: string;
  supervisor: string;
}

export interface AuditTimeouts {
  securityMs: number;
  triageMs: number;
  supervisorMs: number;
  eslintMs: number;
  /** Per-app ceiling. */
  jobMs: number;
  /** Whole-run ceiling — what actually bounds a 06:00 sweep of all five apps. */
  runMs: number;
}

/**
 * Absent means the lane does not run. The two reasons — switched off, or no token —
 * collapse here on purpose: `runAuditJob` has no use for the difference, and carrying
 * both an `enabled` flag and an optional config down to it invents an "enabled but no
 * token" branch that would have to be handled at every call site.
 */
export interface AuditJiraSettings {
  baseUrl: string;
  token: string;
  /** Jira usernames. Empty leaves the ticket unassigned. */
  assignees: string[];
}

export interface AuditSettings {
  /** Kill switch that does not need the plist unloaded. */
  enabled: boolean;
  /** Report-only until the signal has been watched. */
  mrEnabled: boolean;
  /**
   * The security lane files tickets instead of MRs (jobs/security/audit-jira.md). Off
   * unless `AUDIT_JIRA_ENABLED=true` AND a token exists: this is the one lane that
   * writes into the team's shared Jira, so it must never come on by accident.
   */
  jira: AuditJiraSettings | undefined;
  models: AuditModels;
  timeouts: AuditTimeouts;
  /** `Date#getDay()` value — 1 = Monday. Full digest of every open finding, so a
   * backlog nobody has been reading gets put back in front of a human once a week. */
  digestWeekday: number;
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
  /** How often the daemon re-measures whether shipped fixes actually held. 0 disables it. */
  verifyIntervalMs: number;
  analyzeMaxRounds: number;
  brainSliceTokenBudget: number;
  caps: Caps;
  /** Absent when no bot token is configured; the pipeline then simply does not notify. */
  telegram: TelegramConfig | undefined;
  models: Models;
  timeouts: Timeouts;
  paths: Paths;
  fixEnabled: boolean;
  audit: AuditSettings;
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
    // Six hours matches `MIN_AFTER_MS`: sweeping more often than a fix can become
    // measurable only re-reads logs to print `too_soon` again.
    verifyIntervalMs: num(env, 'AUTOFIX_VERIFY_INTERVAL_MS', 6 * HOUR),
    analyzeMaxRounds: num(env, 'AUTOFIX_ANALYZE_MAX_ROUNDS', 5),
    brainSliceTokenBudget: num(env, 'AUTOFIX_BRAIN_TOKEN_BUDGET', 6000),
    caps: {
      maxConcurrentJobs: num(env, 'AUTOFIX_MAX_CONCURRENT_JOBS', 2),
      mrPerHour: num(env, 'AUTOFIX_MR_PER_HOUR', 5),
      mrPerRepoPerDay: num(env, 'AUTOFIX_MR_PER_REPO_PER_DAY', 3),
      maxFixAttempts: num(env, 'AUTOFIX_MAX_FIX_ATTEMPTS', 3),
      replyCooldownMs: num(env, 'AUTOFIX_REPLY_COOLDOWN_MS', 24 * HOUR)
    },
    // Both halves are required: a token with no chat id has nowhere to post, and a
    // chat id with no token cannot authenticate. Either missing means no notifying,
    // which is a degraded mode, never a failure — the Slack thread is the record.
    telegram:
      env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID
        ? {
            botToken: env.TELEGRAM_BOT_TOKEN,
            chatId: env.TELEGRAM_CHAT_ID,
            threadId: env.TELEGRAM_THREAD_ID || undefined
          }
        : undefined,
    models: {
      analyze: env.AUTOFIX_ANALYZE_MODEL || 'claude-opus-5',
      fix: env.AUTOFIX_FIX_MODEL || 'claude-sonnet-5',
      learn: env.AUTOFIX_LEARN_MODEL || 'claude-haiku-4-5-20251001',
      security: env.AUTOFIX_SECURITY_MODEL || 'claude-opus-5'
    },
    timeouts: {
      analyzeRoundMs: num(env, 'AUTOFIX_ANALYZE_TIMEOUT_MS', 8 * MINUTE),
      fixMs: num(env, 'AUTOFIX_FIX_TIMEOUT_MS', 12 * MINUTE),
      learnMs: num(env, 'AUTOFIX_LEARN_TIMEOUT_MS', 3 * MINUTE),
      // Reads one diff plus whatever files it needs to check reachability. A timeout
      // here blocks the MR, so it is set long enough that only a hung agent hits it.
      securityMs: num(env, 'AUTOFIX_SECURITY_TIMEOUT_MS', 6 * MINUTE),
      jestMs: num(env, 'AUTOFIX_JEST_TIMEOUT_MS', 20 * MINUTE),
      gcloudMs: num(env, 'AUTOFIX_GCLOUD_TIMEOUT_MS', 2 * MINUTE),
      // Longer than any single job can legitimately take: ANALYZE at 5 rounds plus
      // FIX plus a jest baseline is bounded by 5*8 + 12 + 20 = 72 minutes. Anything
      // past 90 has lost its process, not its patience.
      staleJobMs: num(env, 'AUTOFIX_STALE_JOB_MS', 90 * MINUTE)
    },
    paths: {
      projectRoot: PROJECT_ROOT,
      // Overridable so a test can let LEARN write somewhere other than the real brain.
      brainRoot: env.AUTOFIX_BRAIN_ROOT || join(PROJECT_ROOT, 'brain'),
      cacheRoot,
      stateDb: env.AUTOFIX_STATE_DB || join(cacheRoot, 'state.db'),
      worktreeRoot: join(cacheRoot, 'wt'),
      jobsRoot: join(cacheRoot, 'jobs'),
      reposRoot
    },
    // Off since 2026-08-19. The daemon still triages and still replies in the
    // thread; it stops opening MRs, because 58 were sitting unreviewed and an MR
    // nobody reads is worse than no MR. Audit MRs are the reviewed lane now.
    fixEnabled: env.AUTOFIX_FIX_ENABLED === 'true',
    audit: {
      enabled: env.AUDIT_ENABLED !== 'false',
      mrEnabled: env.AUDIT_MR_ENABLED === 'true',
      jira:
        env.AUDIT_JIRA_ENABLED === 'true' && env.JIRA_TOKEN
          ? {
              baseUrl: env.JIRA_BASE_URL || 'https://space.avada.net',
              token: env.JIRA_TOKEN,
              assignees: (env.AUDIT_JIRA_ASSIGNEE || '')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
            }
          : undefined,
      models: {
        security: env.AUDIT_SECURITY_MODEL || 'claude-opus-5',
        triage: env.AUDIT_TRIAGE_MODEL || 'claude-sonnet-5',
        supervisor: env.AUDIT_SUPERVISOR_MODEL || 'claude-sonnet-5'
      },
      timeouts: {
        // Spec's own table starts from 15m ("whole-repo sweep, larger than the 6m
        // diff review"), sized off a flat "bigger than a diff" heuristic with no
        // per-app spread in view. Read off disk 2026-08-20, `seo`'s lint-scoped
        // tree (auditLintPaths, registry.ts) is 1092+1394+5 = 2491 files against
        // APC's 180+331+1 = 512 — 4.9x. A single-shot lane bounded only by wall
        // clock (this CLI build has no --max-turns) sized for the median repo
        // starves the biggest, highest cross-shop-risk app of the time to finish
        // every morning. 20m keeps `seo` inside the 45m AUDIT_JOB_TIMEOUT_MS
        // ceiling with room for hygiene (eslint + triage, ~16m) running alongside
        // it, without inflating the four smaller repos' budget for no reason.
        securityMs: num(env, 'AUDIT_SECURITY_TIMEOUT_MS', 20 * MINUTE),
        triageMs: num(env, 'AUDIT_TRIAGE_TIMEOUT_MS', 6 * MINUTE),
        supervisorMs: num(env, 'AUDIT_SUPERVISOR_TIMEOUT_MS', 5 * MINUTE),
        // Deterministic, not an agent call — 10m is generous even for seo's 1090
        // lint-scoped files (registry.ts).
        eslintMs: num(env, 'AUDIT_ESLINT_TIMEOUT_MS', 10 * MINUTE),
        // Ceiling per app: security(20m) dominates since it runs concurrently with
        // hygiene(eslint 10m + triage 6m = 16m), so 45m still leaves headroom for
        // worktree setup and, when AUDIT_MR_ENABLED, the MR lane's own agent+jest run.
        jobMs: num(env, 'AUDIT_JOB_TIMEOUT_MS', 45 * MINUTE),
        // Five apps at the per-app ceiling would be 3h45 and land mid-morning; this
        // is what actually bounds a 06:00 run, and a run that hits it reports the
        // apps it finished rather than running long past when anyone reads it.
        runMs: num(env, 'AUDIT_RUN_TIMEOUT_MS', 150 * MINUTE)
      },
      digestWeekday: num(env, 'AUDIT_DIGEST_WEEKDAY', 1)
    }
  };
}

/** Keep the last 4 chars only. Used anywhere a token could reach a log or a Slack reply. */
export function redact(secret: string | undefined): string {
  if (!secret) return '<unset>';
  return secret.length <= 4 ? '<redacted>' : `<redacted:${secret.slice(-4)}>`;
}
