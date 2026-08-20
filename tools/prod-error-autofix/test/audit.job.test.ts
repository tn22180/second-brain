import {describe, expect, test} from 'bun:test';
import {buildConfig} from '../src/config';
import {listApps, type App} from '../src/registry';
import {Store} from '../src/state/store';
import {auditJobWorktreeDir, runAuditJob, type AppAuditResult, type AuditJobDeps, type AuditJobSettings} from '../src/audit/job';
import {renderReport, type ReportInput} from '../src/audit/report';
import {runAudit, type AuditRunConfig, type AuditRunDeps} from '../src/audit/run';
import type {MrLaneResult} from '../src/audit/mr';

/**
 * Nothing here spawns a real `claude`, runs real eslint, creates a real worktree,
 * reads a repo under `projects/Falcon/`, or opens the real state.db — every side
 * effect (down to the lane level, not just `Runner`/`ClaudeRunner`) is injected,
 * per the plan's TDD method for this task.
 */

const NOW = 1_755_000_000_000;

const REGISTRY_CFG = buildConfig({SLACK_BOT_TOKEN: 'xoxb-1', SLACK_ERROR_CHANNEL_ID: 'C0PROD', AUTOFIX_STATE_DB: ':memory:'});
const APPS: App[] = listApps(REGISTRY_CFG);
const APP: App = APPS.find(a => a.appName === 'SEO')!;

function settings(over: Partial<AuditJobSettings> = {}): AuditJobSettings {
  return {
    worktreeRoot: '/cache/wt',
    dateStr: '2026-08-19',
    mrEnabled: false,
    digest: false,
    nowMs: NOW,
    gitTimeoutMs: 1000,
    security: {model: 'claude-opus-5', timeoutMs: 2000},
    triage: {model: 'claude-sonnet-5', timeoutMs: 2000},
    eslintTimeoutMs: 2000,
    mr: {model: 'claude-sonnet-5', agentTimeoutMs: 2000, jestTimeoutMs: 2000},
    ...over
  };
}

const NONE_MR: MrLaneResult = {
  kind: 'security',
  branch: 'audit/security-seo-20260819',
  worktreeDir: '/cache/wt/seo-security-20260819',
  pushed: false,
  mrUrl: undefined,
  refusal: 'nothing_to_fix',
  detail: 'no findings',
  files: [],
  costUsd: undefined
};

function jobDeps(over: Partial<AuditJobDeps> = {}): AuditJobDeps {
  return {
    cfg: settings(),
    createWorktree: async input => ({ok: true, value: {dir: input.dir, branch: input.branch, baseSha: 'base1234'}}),
    linkNodeModules: async () => ({linked: [], missing: []}),
    removeWorktree: async () => ({ok: true, detail: undefined}),
    runEslintLane: async () => ({ok: true, findings: [], filesScanned: 0}),
    securityLane: async () => ({ok: true, findings: [], dropped: 0, hasSecuritySkill: true, costUsd: 0.1}),
    triageLane: async () => ({ok: true, verdicts: [], deletable: [], costUsd: 0.05}),
    runMrLane: async () => {
      throw new Error('runMrLane should not be called in this test');
    },
    store: new Store(':memory:'),
    ...over
  };
}

describe('runAuditJob', () => {
  test('the worktree is removed even when a lane throws', async () => {
    const removed: string[] = [];
    const deps = jobDeps({
      securityLane: async () => {
        throw new Error('boom');
      },
      removeWorktree: async d => {
        removed.push(d.dir);
        return {ok: true, detail: undefined};
      }
    });
    const result = await runAuditJob(APP, deps);
    expect(removed).toHaveLength(1);
    expect(result.ok).toBe(true);
    expect(result.report.laneFailures.some(f => f.lane === 'security' && f.detail.includes('boom'))).toBe(true);
  });

  test('the worktree is removed even when the worktree itself was the failure', async () => {
    // Nothing was created, so nothing should be asked to be removed.
    const removed: string[] = [];
    const deps = jobDeps({
      createWorktree: async () => ({ok: false, detail: 'origin/master does not resolve'}),
      removeWorktree: async d => {
        removed.push(d.dir);
        return {ok: true, detail: undefined};
      }
    });
    const result = await runAuditJob(APP, deps);
    expect(removed).toHaveLength(0);
    expect(result.ok).toBe(false);
    expect(result.report.laneFailures.length).toBeGreaterThan(0);
  });

  test('a hygiene-lane failure does not lose the security findings', async () => {
    const deps = jobDeps({
      securityLane: async () => ({
        ok: true,
        findings: [
          {
            file: 'packages/functions/src/handlers/x.js',
            line: 10,
            severity: 'high',
            category: 'shop_scoping',
            title: 'missing shopId filter',
            why: 'cross-shop read',
            fix: 'add where(shopId)'
          }
        ],
        dropped: 0,
        hasSecuritySkill: true,
        costUsd: 0.2
      }),
      runEslintLane: async () => ({ok: false, failure: 'config', detail: 'babel-eslint missing'})
    });
    const result = await runAuditJob(APP, deps);
    expect(result.report.laneFailures.some(f => f.lane === 'hygiene')).toBe(true);
    expect(result.report.ledger.fresh.some(f => f.kind === 'security')).toBe(true);
  });

  test('a triage failure keeps the deterministic eslint findings, marked unsure', async () => {
    const deps = jobDeps({
      runEslintLane: async () => ({
        ok: true,
        findings: [{file: 'packages/functions/src/const/default.js', line: 5, rule: 'no-unused-vars', message: "'X' unused"}],
        filesScanned: 1
      }),
      triageLane: async () => ({ok: false, failure: 'invalid_answer', detail: 'prose', costUsd: undefined})
    });
    const result = await runAuditJob(APP, deps);
    expect(result.report.laneFailures.some(f => f.lane === 'triage')).toBe(true);
    const hygiene = result.report.ledger.fresh.find(f => f.kind === 'hygiene');
    expect(hygiene).toBeDefined();
    expect(hygiene!.verdict).toBe('unsure');
  });

  test('mrEnabled false never calls the MR lane', async () => {
    let called = 0;
    const deps = jobDeps({
      cfg: settings({mrEnabled: false}),
      runMrLane: async () => {
        called++;
        return NONE_MR;
      }
    });
    const result = await runAuditJob(APP, deps);
    expect(called).toBe(0);
    expect(result.mr.security).toBeUndefined();
    expect(result.mr.cleanup).toBeUndefined();
  });

  test('mrEnabled true calls the MR lane once for security and once for cleanup', async () => {
    const kinds: string[] = [];
    const deps = jobDeps({
      cfg: settings({mrEnabled: true}),
      runMrLane: async input => {
        kinds.push(input.kind);
        return {...NONE_MR, kind: input.kind};
      }
    });
    const result = await runAuditJob(APP, deps);
    expect(kinds.sort()).toEqual(['cleanup', 'security']);
    expect(result.mr.security).toBeDefined();
    expect(result.mr.cleanup).toBeDefined();
  });

  test('auditJobWorktreeDir never collides with the fix lane\'s own worktree naming', () => {
    const dir = auditJobWorktreeDir('/cache/wt', 'seo', '2026-08-19');
    expect(dir).toContain('audit-seo-20260819');
  });
});

function runConfig(over: Partial<AuditRunConfig> = {}): AuditRunConfig {
  return {
    ...settings(),
    apps: APPS,
    runTimeoutMs: 10 * 60_000,
    telegram: {botToken: 't', chatId: 'c', threadId: undefined},
    supervisor: {model: 'claude-sonnet-5', timeoutMs: 2000},
    ...over
  };
}

function runDeps(over: Partial<AuditRunDeps> = {}): AuditRunDeps {
  const store = new Store(':memory:');
  return {
    createWorktree: async input => ({ok: true, value: {dir: input.dir, branch: input.branch, baseSha: 'base1234'}}),
    linkNodeModules: async () => ({linked: [], missing: []}),
    removeWorktree: async () => ({ok: true, detail: undefined}),
    // One deterministic finding per app, so the ledger has something to write
    // without any test needing to know which app the fake eslint run is for.
    runEslintLane: async () => ({
      ok: true,
      findings: [{file: 'packages/functions/src/const/default.js', line: 5, rule: 'no-unused-vars', message: "'X' unused"}],
      filesScanned: 1
    }),
    securityLane: async () => ({ok: true, findings: [], dropped: 0, hasSecuritySkill: true, costUsd: 0.1}),
    triageLane: async ({findings}) => ({
      ok: true,
      verdicts: findings.map(f => ({fp: f.fp, verdict: 'keep' as const, reason: 'kept for the test'})),
      deletable: [],
      costUsd: 0.05
    }),
    runMrLane: async () => {
      throw new Error('runMrLane should not be called unless mrEnabled is true');
    },
    store,
    supervisor: async (input: ReportInput) => renderReport(input),
    sendTelegram: async () => ({ok: true, detail: undefined}),
    now: () => NOW,
    ...over
  };
}

function okResult(appName: string): AppAuditResult {
  return {
    appName,
    ok: true,
    costUsd: 0.1,
    mr: {security: undefined, cleanup: undefined},
    report: {
      appName,
      ledger: {fresh: [], carried: 0, resolved: 0, suppressed: 0},
      openFindings: [],
      hasSecuritySkill: true,
      laneFailures: []
    }
  };
}

describe('runAudit', () => {
  test('one app failing does not stop the others', async () => {
    const r = await runAudit(runConfig(), {
      ...runDeps(),
      job: async app => {
        if (app.appName === 'SEO') throw new Error('boom');
        return okResult(app.appName);
      }
    });
    expect(r.apps.filter(a => a.ok)).toHaveLength(APPS.length - 1);
    expect(r.apps.find(a => a.appName === 'SEO')!.ok).toBe(false);
  });

  test('the run cap stops the sweep and reports what finished', async () => {
    const r = await runAudit(runConfig({runTimeoutMs: 0}), runDeps());
    expect(r.stoppedEarly).toBe(true);
    expect(r.apps).toHaveLength(0);
  });

  test('one message per run, not one per app', async () => {
    const sent: string[] = [];
    await runAudit(runConfig(), {
      ...runDeps(),
      sendTelegram: async (_c, t) => {
        sent.push(t);
        return {ok: true, detail: undefined};
      }
    });
    expect(sent).toHaveLength(1);
  });

  test('a Telegram failure still leaves the ledger written', async () => {
    const store = new Store(':memory:');
    await runAudit(runConfig(), {...runDeps(), store, sendTelegram: async () => ({ok: false, detail: 'down'})});
    expect(store.openAuditFindings('SEO').length).toBeGreaterThan(0);
  });

  test('AUDIT_MR_ENABLED off means the MR lane is never called', async () => {
    let called = 0;
    const r = await runAudit(runConfig({mrEnabled: false}), {
      ...runDeps(),
      runMrLane: async () => {
        called++;
        return NONE_MR;
      }
    });
    expect(called).toBe(0);
    expect(r.apps.length).toBeGreaterThan(0);
  });

  test('no Telegram config means no send, but the run still completes', async () => {
    let called = 0;
    const r = await runAudit(runConfig({telegram: undefined}), {
      ...runDeps(),
      sendTelegram: async () => {
        called++;
        return {ok: true, detail: undefined};
      }
    });
    expect(called).toBe(0);
    expect(r.telegram).toBeUndefined();
    expect(r.apps.length).toBe(APPS.length);
  });

  test('a supervisor throw falls back to the plain render, not a lost message', async () => {
    const r = await runAudit(runConfig(), {
      ...runDeps(),
      supervisor: async () => {
        throw new Error('agent down');
      }
    });
    expect(r.message.length).toBeGreaterThan(0);
    expect(r.message).toContain('Audit');
  });
});
