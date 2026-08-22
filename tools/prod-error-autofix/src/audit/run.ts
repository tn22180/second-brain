import {join} from 'node:path';
import {spawnClaude} from '../agent/claudeCli';
import type {Config} from '../config';
import {spawnRunner} from '../gcloud/run';
import {openMr} from '../git/openMr';
import {commitWip, createWorktree, linkNodeModules, removeWorktree} from '../git/worktree';
import {sendTelegram, type TelegramConfig} from '../notify/telegram';
import {listApps, type App} from '../registry';
import {checkMrCaps, recordMr} from '../state/rateGate';
import type {Store} from '../state/store';
import {runJest} from '../verify/jest';
import {measureBaseline} from '../verify/smoke';
import {runEslint} from './eslint';
import {runAuditJob, type AppAuditResult, type AuditJobDeps, type AuditJobSettings} from './job';
import {runJiraLane} from './jiraLane';
import {runMrLane, type MrLaneDeps} from './mr';
import {renderReport, type ReportInput} from './report';
import {runSecurityLane} from './securityLane';
import {runSupervisor} from './supervisor';
import {runTriage} from './triage';

/**
 * All five apps, one run. Apps run sequentially — sequential, not concurrent, is
 * the whole point of a run cap that can say which ones finished. Lane concurrency
 * lives one level down, inside `runAuditJob`.
 */

export interface AuditRunConfig extends AuditJobSettings {
  apps: App[];
  /** Whole-run ceiling. Five apps at the per-app ceiling would land mid-morning;
   * this is what actually bounds a 06:00 run. */
  runTimeoutMs: number;
  /** Absent when Telegram is not configured — same degraded-mode contract as the daemon. */
  telegram: TelegramConfig | undefined;
  supervisor: {model: string; timeoutMs: number};
  /**
   * Where the unabridged report goes when the message has to be capped. Telegram
   * rejects anything past 4096 characters, and the first APC run rendered 122 KB —
   * without this the capped message names a file nobody wrote.
   */
  fullReportPath: string;
}

export interface AuditRunDeps {
  /** Overridable for a test that wants to exercise run-level orchestration without
   * a real job. Defaults to `runAuditJob` bound with everything below. */
  job?: (app: App, cfg: AuditRunConfig) => Promise<AppAuditResult>;
  createWorktree: AuditJobDeps['createWorktree'];
  linkNodeModules: AuditJobDeps['linkNodeModules'];
  removeWorktree: AuditJobDeps['removeWorktree'];
  runEslintLane: AuditJobDeps['runEslintLane'];
  securityLane: AuditJobDeps['securityLane'];
  triageLane: AuditJobDeps['triageLane'];
  runMrLane: AuditJobDeps['runMrLane'];
  runJiraLane: AuditJobDeps['runJiraLane'];
  store: Store;
  /** Lane C. Falls back to `renderReport` on a throw or a timeout — a broken
   * agent at 06:00 must not mean a morning with real findings goes unreported. */
  supervisor: (input: ReportInput) => Promise<string>;
  sendTelegram: (cfg: TelegramConfig, text: string) => Promise<{ok: boolean; detail: string | undefined}>;
  now: () => number;
}

export interface AuditRunResult {
  apps: AppAuditResult[];
  /** True when the run cap stopped the sweep before every app had a turn. */
  stoppedEarly: boolean;
  message: string;
  telegram: {ok: boolean; detail: string | undefined} | undefined;
  costUsd: number | undefined;
}

function buildJobDeps(cfg: AuditRunConfig, deps: AuditRunDeps): AuditJobDeps {
  return {
    cfg,
    createWorktree: deps.createWorktree,
    linkNodeModules: deps.linkNodeModules,
    removeWorktree: deps.removeWorktree,
    runEslintLane: deps.runEslintLane,
    securityLane: deps.securityLane,
    triageLane: deps.triageLane,
    runMrLane: deps.runMrLane,
    runJiraLane: deps.runJiraLane,
    store: deps.store
  };
}

function addCost(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a + b;
}

/** A `job` that threw outright (not the graceful `ok: false` paths `runAuditJob`
 * already returns for a failed worktree or a failed lane) still has to leave the
 * other four apps alone and still has to render into the message. */
function threwAppResult(app: App, e: unknown): AppAuditResult {
  return {
    appName: app.appName,
    ok: false,
    costUsd: undefined,
    mr: {security: undefined, cleanup: undefined},
    jira: undefined,
    report: {
      appName: app.appName,
      ledger: {fresh: [], carried: 0, resolved: 0, suppressed: 0, resolvedRows: []},
      openFindings: [],
      hasSecuritySkill: false,
      laneFailures: [{lane: 'security', detail: (e as Error)?.message ?? 'the job threw without a message'}]
    }
  };
}

export async function runAudit(cfg: AuditRunConfig, deps: AuditRunDeps): Promise<AuditRunResult> {
  const job = deps.job ?? ((app: App, runCfg: AuditRunConfig) => runAuditJob(app, buildJobDeps(runCfg, deps)));
  const startMs = deps.now();

  const results: AppAuditResult[] = [];
  let stoppedEarly = false;

  for (const app of cfg.apps) {
    if (deps.now() - startMs >= cfg.runTimeoutMs) {
      stoppedEarly = true;
      break;
    }
    try {
      results.push(await job(app, cfg));
    } catch (e) {
      results.push(threwAppResult(app, e));
    }
  }

  const costUsd = results.reduce<number | undefined>((sum, r) => addCost(sum, r.costUsd), undefined);
  const reportInput: ReportInput = {
    date: cfg.dateStr,
    apps: results.map(r => r.report),
    digest: cfg.digest,
    costUsd,
    fullReportPath: cfg.fullReportPath
  };

  let message: string;
  try {
    message = await deps.supervisor(reportInput);
  } catch {
    // Lane C is judgement and prose on top of a report that is already complete —
    // it is never allowed to be the only path to a message.
    message = renderReport(reportInput);
  }

  // One message per run, after every app finishes — not one per app. Sent last,
  // outside the per-app loop, so a Telegram outage cannot touch the ledger writes
  // that already happened inside each `job()` call.
  const telegram = cfg.telegram ? await deps.sendTelegram(cfg.telegram, message) : undefined;

  return {apps: results, stoppedEarly, message, telegram, costUsd};
}

/**
 * Derives the per-run settings from the app `Config`. Split from `runAudit` itself
 * so every test above can hand it a small literal instead of a whole `Config`.
 */
export function buildAuditRunConfig(cfg: Config, nowMs: number, onlyApp?: string): AuditRunConfig {
  const dateStr = new Date(nowMs).toISOString().slice(0, 10);
  const digest = new Date(nowMs).getDay() === cfg.audit.digestWeekday;
  const apps = onlyApp ? listApps(cfg).filter(a => a.appName.toUpperCase() === onlyApp.toUpperCase()) : listApps(cfg);

  return {
    apps,
    dateStr,
    digest,
    mrEnabled: cfg.audit.mrEnabled,
    jira: cfg.audit.jira,
    nowMs,
    worktreeRoot: cfg.paths.worktreeRoot,
    gitTimeoutMs: cfg.timeouts.gcloudMs,
    security: {model: cfg.audit.models.security, timeoutMs: cfg.audit.timeouts.securityMs},
    triage: {model: cfg.audit.models.triage, timeoutMs: cfg.audit.timeouts.triageMs},
    eslintTimeoutMs: cfg.audit.timeouts.eslintMs,
    // The MR lane is the same fix agent the daemon already runs — reuses its model
    // and timeouts rather than a parallel `AUDIT_MR_*` set for the same thing.
    mr: {model: cfg.models.fix, agentTimeoutMs: cfg.timeouts.fixMs, jestTimeoutMs: cfg.timeouts.jestMs},
    runTimeoutMs: cfg.audit.timeouts.runMs,
    telegram: cfg.telegram,
    supervisor: {model: cfg.audit.models.supervisor, timeoutMs: cfg.audit.timeouts.supervisorMs},
    fullReportPath: join(cfg.paths.cacheRoot, `audit-${dateStr}.md`)
  };
}

/**
 * The real wiring: `spawnRunner`/`spawnClaude` underneath every lane, and — the
 * tripwire task 8b left open — `measureBaseline` plus `store.getBaseline` /
 * `store.putBaseline` bound into the MR lane's deps, so `runMrLane` finally has a
 * production caller.
 */
export function buildAuditRunDeps(cfg: Config, store: Store): AuditRunDeps {
  const mrDeps: MrLaneDeps = {
    runner: spawnRunner,
    claude: spawnClaude,
    createWorktree,
    linkNodeModules,
    commitWip,
    removeWorktree,
    runJest,
    measureBaseline,
    getBaseline: (repo, baseSha) => store.getBaseline(repo, baseSha),
    putBaseline: (repo, baseSha, failures, nowMs) => store.putBaseline(repo, baseSha, failures, nowMs),
    openMr,
    checkCaps: (repo, nowMs) => checkMrCaps(store, cfg.caps, repo, nowMs),
    recordMr: (repo, nowMs) => recordMr(store, repo, nowMs)
  };

  return {
    createWorktree,
    linkNodeModules,
    removeWorktree,
    runEslintLane: runEslint,
    securityLane: runSecurityLane,
    triageLane: runTriage,
    runMrLane: input => runMrLane(input, mrDeps),
    runJiraLane: (input, jiraCfg) =>
      runJiraLane(input, {cfg: {baseUrl: jiraCfg.baseUrl, token: jiraCfg.token}}),
    store,
    supervisor: input =>
      runSupervisor(input, spawnClaude, {model: cfg.audit.models.supervisor, timeoutMs: cfg.audit.timeouts.supervisorMs}),
    sendTelegram: (telegramCfg, text) => sendTelegram(telegramCfg, text),
    now: () => Date.now()
  };
}
