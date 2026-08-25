import {describe, expect, test} from 'bun:test';
import {buildConfig} from '../src/config';
import {listApps, type App} from '../src/registry';
import {Store} from '../src/state/store';
import {findingFp} from '../src/audit/findingFp';
import {auditJobWorktreeDir, runAuditJob, type AppAuditResult, type AuditJobDeps, type AuditJobSettings} from '../src/audit/job';
import {renderReport, type ReportInput} from '../src/audit/report';
import {runAudit, type AuditRunConfig, type AuditRunDeps} from '../src/audit/run';
import type {MrLaneResult} from '../src/audit/mr';
import type {JiraLaneInput} from '../src/audit/jiraLane';

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
    jira: undefined,
    ...over
  };
}

const NONE_MR: MrLaneResult = {
  kind: 'cleanup',
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
    runJiraLane: async () => {
      throw new Error('runJiraLane should not be called in this test');
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
    expect(result.mr.cleanup).toBeUndefined();
  });

  test('mrEnabled true runs the cleanup lane and only the cleanup lane', async () => {
    const kinds: string[] = [];
    const deps = jobDeps({
      cfg: settings({mrEnabled: true}),
      runMrLane: async input => {
        kinds.push(input.kind);
        return {...NONE_MR, kind: input.kind};
      }
    });
    const result = await runAuditJob(APP, deps);
    // Security findings never reach an agent that writes a fix — they go to Jira.
    expect(kinds).toEqual(['cleanup']);
    expect(result.mr.cleanup).toBeDefined();
  });

  test('no cfg.jira means the Jira lane is never called at all', async () => {
    let called = 0;
    const deps = jobDeps({
      cfg: settings({jira: undefined}),
      runJiraLane: async () => {
        called++;
        return {ticketKey: undefined, ticketUrl: undefined, ticketedFps: [], commented: [], failures: []};
      }
    });
    const result = await runAuditJob(APP, deps);
    // Not "called and ignored": this lane writes into the team's shared Jira, so off
    // has to mean no request was ever built.
    expect(called).toBe(0);
    expect(result.jira).toBeUndefined();
    expect(result.report.jiraTicketUrl).toBeUndefined();
  });

  test('cfg.jira stamps the ticket onto every fingerprint it covered', async () => {
    const store = new Store(':memory:');
    let seen: JiraLaneInput | undefined;
    const deps = jobDeps({
      cfg: settings({jira: {baseUrl: 'https://space.avada.net', token: 'not-a-real-token', assignees: ['tuannv']}}),
      store,
      securityLane: async () => ({
        ok: true,
        dropped: 0,
        hasSecuritySkill: true,
        costUsd: 0.1,
        findings: [
          {
            file: 'packages/functions/src/handlers/api.js',
            line: 64,
            severity: 'high' as const,
            category: 'authn' as const,
            title: 'session gate mounted after the swagger gate',
            why: 'anything accepted there opens every /api/* route',
            fix: 'mount the session gate first'
          }
        ]
      }),
      runJiraLane: async input => {
        seen = input;
        return {
          ticketKey: 'FAL-900',
          ticketUrl: 'https://space.avada.net/browse/FAL-900',
          ticketedFps: input.fresh.map(f => f.fp),
          commented: [],
          failures: []
        };
      }
    });

    const result = await runAuditJob(APP, deps);
    expect(seen!.fresh).toHaveLength(1);
    expect(seen!.assignees).toEqual(['tuannv']);
    expect(result.report.jiraTicketUrl).toBe('https://space.avada.net/browse/FAL-900');

    const row = store.openAuditFindings('SEO').find(r => r.kind === 'security')!;
    expect(row.jiraKey).toBe('FAL-900');
  });

  test('a Jira failure is reported as a lane failure, not swallowed', async () => {
    const deps = jobDeps({
      cfg: settings({jira: {baseUrl: 'https://space.avada.net', token: 'not-a-real-token', assignees: []}}),
      runJiraLane: async () => ({
        ticketKey: undefined,
        ticketUrl: undefined,
        ticketedFps: [],
        commented: [],
        failures: ['create: HTTP 400']
      })
    });
    const result = await runAuditJob(APP, deps);
    expect(result.report.laneFailures).toContainEqual({lane: 'jira', detail: 'create: HTTP 400'});
  });

  test('the triage lane is handed the app deadline, and what it skipped is reported', async () => {
    let seenDeadline: number | undefined = -1;
    const deps = jobDeps({
      cfg: settings({appDeadlineMs: 1_755_000_600_000}),
      runEslintLane: async () => ({
        ok: true,
        filesScanned: 1,
        findings: [{file: 'packages/functions/src/a.js', line: 5, rule: 'no-unused-vars', message: "'X' unused"}]
      }),
      triageLane: async input => {
        seenDeadline = input.deadlineMs;
        return {
          ok: true,
          verdicts: input.findings.map(f => ({fp: f.fp, verdict: 'unsure' as const, reason: 'triage stopped at the app deadline'})),
          deletable: [],
          costUsd: 0.05,
          totalBatches: 3,
          batchFailures: [],
          stoppedAtDeadline: {atBatch: 1, untriaged: 4711}
        };
      }
    });

    const result = await runAuditJob(APP, deps);
    expect(seenDeadline).toBe(1_755_000_600_000);
    // Without this line the report reads exactly like a clean triage.
    const failure = result.report.laneFailures.find(f => f.lane === 'triage');
    expect(failure?.detail).toContain('4711 finding(s) never triaged');
  });

  test('a finding the ledger already ruled on never goes back to the agent', async () => {
    const store = new Store(':memory:');
    const FINDINGS = [
      {file: 'packages/functions/src/a.js', line: 5, rule: 'no-unused-vars', message: "'A' unused"},
      {file: 'packages/functions/src/b.js', line: 6, rule: 'no-unused-vars', message: "'B' unused"},
      {file: 'packages/functions/src/c.js', line: 7, rule: 'no-unused-vars', message: "'C' unused"}
    ];
    const fpOf = (f: {file: string; rule: string; message: string}) =>
      findingFp({app: 'SEO', file: f.file, rule: f.rule, title: f.message});

    // a: ruled `keep` yesterday. b: ruled `delete` yesterday. c: never seen.
    store.upsertAuditFinding(
      {fp: fpOf(FINDINGS[0]!), app: 'SEO', kind: 'hygiene', file: FINDINGS[0]!.file, line: 5, rule: 'no-unused-vars', title: FINDINGS[0]!.message, severity: 'low', verdict: 'keep'},
      NOW - 86_400_000
    );
    store.upsertAuditFinding(
      {fp: fpOf(FINDINGS[1]!), app: 'SEO', kind: 'hygiene', file: FINDINGS[1]!.file, line: 6, rule: 'no-unused-vars', title: FINDINGS[1]!.message, severity: 'low', verdict: 'delete'},
      NOW - 86_400_000
    );

    let sentToAgent: string[] = [];
    const deps = jobDeps({
      store,
      runEslintLane: async () => ({ok: true, filesScanned: 3, findings: FINDINGS}),
      triageLane: async input => {
        sentToAgent = input.findings.map(f => f.file);
        return {
          ok: true,
          verdicts: input.findings.map(f => ({fp: f.fp, verdict: 'keep' as const, reason: 'fresh look'})),
          deletable: [],
          costUsd: 0.05,
          totalBatches: 1,
          batchFailures: []
        };
      }
    });

    const result = await runAuditJob(APP, deps);

    // `delete` is the only verdict that turns into a push, and findingFp ignores the
    // line, so the code around it can change while the fingerprint does not.
    expect(sentToAgent.sort()).toEqual(['packages/functions/src/b.js', 'packages/functions/src/c.js']);
    // Every finding still ends up with a verdict — nothing is silently dropped.
    expect(result.report.ledger.fresh.length + result.report.ledger.carried).toBe(3);
  });

  test('every finding already ruled on means the agent is not called at all', async () => {
    const store = new Store(':memory:');
    const f = {file: 'packages/functions/src/a.js', line: 5, rule: 'no-unused-vars', message: "'A' unused"};
    const fp = findingFp({app: 'SEO', file: f.file, rule: f.rule, title: f.message});
    store.upsertAuditFinding(
      {fp, app: 'SEO', kind: 'hygiene', file: f.file, line: 5, rule: 'no-unused-vars', title: f.message, severity: 'low', verdict: 'keep'},
      NOW - 86_400_000
    );

    let called = 0;
    const deps = jobDeps({
      store,
      runEslintLane: async () => ({ok: true, filesScanned: 1, findings: [f]}),
      triageLane: async () => {
        called++;
        throw new Error('the agent must not be called when nothing needs triaging');
      }
    });

    await runAuditJob(APP, deps);
    expect(called).toBe(0);
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
    appTimeoutMs: 5 * 60_000,
    telegram: {botToken: 't', chatId: 'c', threadId: undefined},
    supervisor: {model: 'claude-sonnet-5', timeoutMs: 2000},
    fullReportPath: '/cache/audit-2026-08-19.md',
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
    runJiraLane: async () => {
      throw new Error('runJiraLane should not be called unless cfg.jira is set');
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
    mr: {cleanup: undefined},
    jira: undefined,
    report: {
      appName,
      ledger: {fresh: [], carried: 0, resolved: 0, suppressed: 0, resolvedRows: []},
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

  test('each app gets its own deadline, and the last one cannot outlive the run', async () => {
    // The run cap alone is only read BETWEEN apps: on 2026-08-23 SEO stayed inside one
    // job() call for ~48 hours while the cap sat there unread.
    const deadlines: (number | undefined)[] = [];
    let clock = NOW;
    await runAudit(runConfig({runTimeoutMs: 12 * 60_000, appTimeoutMs: 5 * 60_000}), {
      ...runDeps(),
      now: () => clock,
      job: async (app, cfg) => {
        deadlines.push(cfg.appDeadlineMs);
        clock += 5 * 60_000; // every app burns its whole share
        return okResult(app.appName);
      }
    });

    // App 1 and 2 get the full 5 minutes. App 3 starts 10 minutes in with 2 left,
    // so it is capped by the run, not by its own share.
    expect(deadlines[0]).toBe(NOW + 5 * 60_000);
    expect(deadlines[1]).toBe(NOW + 10 * 60_000);
    expect(deadlines[2]).toBe(NOW + 12 * 60_000);
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
