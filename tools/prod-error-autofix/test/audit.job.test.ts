import {describe, expect, test} from 'bun:test';
import {buildConfig} from '../src/config';
import {listApps, type App} from '../src/registry';
import {Store} from '../src/state/store';
import {findingFp} from '../src/audit/findingFp';
import {auditJobWorktreeDir, runAuditJob, type AppAuditResult, type AuditJobDeps, type AuditJobSettings} from '../src/audit/job';
import {renderReport, type ReportInput} from '../src/audit/report';
import {buildAuditRunConfig, runAudit, type AuditRunConfig, type AuditRunDeps} from '../src/audit/run';
import type {MrLaneResult} from '../src/audit/mr';
import type {JiraLaneInput} from '../src/audit/jiraLane';
import type {SecurityLaneInput} from '../src/audit/securityLane';
import type {Runner} from '../src/gcloud/run';

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
    security: {model: 'claude-opus-5', timeoutMs: 2000, fullEveryDays: 7},
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
    // Git answers nothing by default, so every sweep is a full one and nothing is
    // recorded — the tests above the incremental block predate it and assume that.
    runner: async () => ({code: 1, stdout: '', stderr: 'fatal: not a git repository', timedOut: false}),
    fileExists: () => true,
    ...over
  };
}

const HEAD = 'head9999';
const DAY = 86_400_000;

interface FakeGit {
  head?: string | undefined;
  ancestor?: 'yes' | 'no' | 'unknown';
  diff?: string[];
  diffFails?: boolean;
}

/** Answers the three git calls the security-sweep planner makes; records every call. */
function fakeGit(o: FakeGit, calls: string[][] = []): Runner {
  return async args => {
    calls.push(args);
    const res = (code: number, stdout = '', stderr = '') => ({code, stdout, stderr, timedOut: false});
    if (args.includes('rev-parse')) return o.head === undefined ? res(128, '', 'fatal: bad HEAD') : res(0, `${o.head}\n`);
    if (args.includes('merge-base')) {
      const a = o.ancestor ?? 'yes';
      return a === 'yes' ? res(0) : a === 'no' ? res(1) : res(128, '', 'fatal: Not a valid commit name');
    }
    if (args.includes('diff')) return o.diffFails ? res(128, '', 'fatal: bad revision') : res(0, (o.diff ?? []).map(f => `${f}\n`).join(''));
    return res(1, '', `unexpected git call: ${args.join(' ')}`);
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

  describe('a failed lane resolves nothing of its kind', () => {
    const SEC = {
      file: 'packages/functions/src/handlers/api.js',
      line: 64,
      severity: 'high' as const,
      category: 'authn' as const,
      title: 'session gate mounted after the swagger gate',
      why: 'w',
      fix: 'f'
    };
    const LINT = {file: 'packages/functions/src/a.js', line: 5, rule: 'no-unused-vars', message: "'A' unused"};

    async function seed(store: Store): Promise<void> {
      await runAuditJob(
        APP,
        jobDeps({
          store,
          securityLane: async () => ({ok: true, findings: [SEC], dropped: 0, hasSecuritySkill: true, costUsd: 0.1}),
          runEslintLane: async () => ({ok: true, filesScanned: 1, findings: [LINT]})
        })
      );
      expect(store.openAuditFindings('SEO')).toHaveLength(2);
    }

    test('a security timeout keeps open security findings open; hygiene still resolves', async () => {
      const store = new Store(':memory:');
      await seed(store);
      const result = await runAuditJob(
        APP,
        jobDeps({
          store,
          securityLane: async () => ({ok: false, failure: 'timeout', detail: 'killed', errors: [], hasSecuritySkill: true, costUsd: undefined}),
          runEslintLane: async () => ({ok: true, filesScanned: 0, findings: []})
        })
      );
      expect(result.report.ledger.resolvedRows.map(r => r.kind)).toEqual(['hygiene']);
      expect(store.openAuditFindings('SEO').map(r => r.kind)).toEqual(['security']);
    });

    test('a thrown security lane keeps open security findings open', async () => {
      const store = new Store(':memory:');
      await seed(store);
      await runAuditJob(
        APP,
        jobDeps({
          store,
          securityLane: async () => {
            throw new Error('boom');
          },
          runEslintLane: async () => ({ok: true, filesScanned: 1, findings: [LINT]})
        })
      );
      expect(store.openAuditFindings('SEO')).toHaveLength(2);
    });

    test('a triage failure alone does not stop hygiene resolving: the eslint list is complete', async () => {
      const store = new Store(':memory:');
      await seed(store);
      const result = await runAuditJob(
        APP,
        jobDeps({
          store,
          securityLane: async () => ({ok: false, failure: 'timeout', detail: 'killed', errors: [], hasSecuritySkill: true, costUsd: undefined}),
          runEslintLane: async () => ({
            ok: true,
            filesScanned: 1,
            findings: [{file: 'packages/functions/src/b.js', line: 2, rule: 'no-undef', message: "'B' undefined"}]
          }),
          triageLane: async () => ({ok: false, failure: 'timeout', detail: 'killed', costUsd: undefined})
        })
      );
      expect(result.report.laneFailures.some(f => f.lane === 'triage')).toBe(true);
      expect(result.report.ledger.resolvedRows.map(r => r.file)).toEqual([LINT.file]);
    });

    test('a hygiene failure keeps open hygiene findings open', async () => {
      const store = new Store(':memory:');
      await seed(store);
      const result = await runAuditJob(
        APP,
        jobDeps({
          store,
          securityLane: async () => ({ok: true, findings: [], dropped: 0, hasSecuritySkill: true, costUsd: 0.1}),
          runEslintLane: async () => ({ok: false, failure: 'config', detail: 'babel-eslint missing'})
        })
      );
      expect(result.report.ledger.resolvedRows.map(r => r.kind)).toEqual(['security']);
      expect(store.openAuditFindings('SEO').map(r => r.kind)).toEqual(['hygiene']);
    });
  });

  describe('incremental security sweep', () => {
    const SEC_A = {
      file: 'packages/functions/src/handlers/a.js',
      line: 10,
      severity: 'high' as const,
      category: 'shop_scoping' as const,
      title: 'a: missing shopId filter',
      why: 'w',
      fix: 'f'
    };
    const SEC_Z = {...SEC_A, file: 'packages/functions/src/handlers/z.js', title: 'z: missing shopId filter'};

    function recordingLane(seen: SecurityLaneInput[], findings = [] as (typeof SEC_A)[]): AuditJobDeps['securityLane'] {
      return async input => {
        seen.push(input);
        return {ok: true, findings, dropped: 0, hasSecuritySkill: true, costUsd: 0.1};
      };
    }

    test('no record means a full sweep, and success records the sha and the full-sweep time', async () => {
      const store = new Store(':memory:');
      const seen: SecurityLaneInput[] = [];
      const calls: string[][] = [];
      const result = await runAuditJob(
        APP,
        jobDeps({store, runner: fakeGit({head: HEAD}, calls), securityLane: recordingLane(seen)})
      );
      expect(seen).toHaveLength(1);
      expect(seen[0]!.files).toBeUndefined();
      expect(store.getSecuritySweep('SEO')).toEqual({sha: HEAD, lastFullMs: NOW, lastFullAttemptMs: NOW, updatedMs: NOW});
      expect(result.securitySweep).toEqual({mode: 'full'});
      // Every git call runs against the audit worktree, through the injected runner.
      const dir = auditJobWorktreeDir('/cache/wt', APP.repo, '2026-08-19');
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) expect(c.slice(0, 3)).toEqual(['git', '-C', dir]);
    });

    test('a recent record sweeps every changed file but binaries, lockfiles and snapshots', async () => {
      const store = new Store(':memory:');
      store.setSecuritySweep('SEO', {sha: 'old1111', fullAtMs: NOW - 2 * DAY, nowMs: NOW - DAY});
      const seen: SecurityLaneInput[] = [];
      const calls: string[][] = [];
      // The `secret` surface covers config, CI, fixtures and docs, not just code.
      const kept = [
        'packages/functions/src/handlers/a.js',
        'packages/assets/src/pages/B.tsx',
        'extensions/theme/blocks/seo.liquid',
        'packages/functions/package.json',
        '.env',
        'packages/functions/.env.production',
        'certs/server.pem',
        '.gitlab-ci.yml',
        '.github/workflows/deploy.yml',
        'shopify.app.staging.toml',
        'firestore.rules',
        'docs/setup.md',
        'packages/functions/docs/api.json',
        'README.md',
        'packages/assets/src/styles.scss',
        'packages/assets/src/icon.svg'
      ];
      const dropped = [
        'yarn.lock',
        'package-lock.json',
        'packages/functions/package-lock.json',
        'pnpm-lock.yaml',
        'bun.lockb',
        'packages/functions/src/__tests__/__snapshots__/a.test.js.snap',
        'packages/assets/src/__snapshots__/view.json',
        'packages/assets/src/logo.png',
        'packages/assets/src/photo.JPG',
        'packages/assets/fonts/inter.woff2',
        'vendor/release.tar.gz',
        'packages/assets/files/guide.pdf'
      ];
      const result = await runAuditJob(
        APP,
        jobDeps({
          store,
          runner: fakeGit({head: HEAD, ancestor: 'yes', diff: [...kept, ...dropped]}, calls),
          securityLane: recordingLane(seen)
        })
      );
      expect(seen[0]!.files).toEqual(kept);
      expect(calls.some(c => c.includes('diff') && c.includes('--name-only') && c.includes('old1111') && c.includes('HEAD'))).toBe(true);
      // The sha moves; the full-sweep clock does not.
      expect(store.getSecuritySweep('SEO')).toEqual({sha: HEAD, lastFullMs: NOW - 2 * DAY, lastFullAttemptMs: NOW - 2 * DAY, updatedMs: NOW});
      expect(result.securitySweep).toEqual({mode: 'incremental', files: kept.length});
    });

    test('the diff lists a rename as its old and new path', async () => {
      const store = new Store(':memory:');
      store.setSecuritySweep('SEO', {sha: 'old1111', fullAtMs: NOW - DAY, nowMs: NOW - DAY});
      const calls: string[][] = [];
      await runAuditJob(
        APP,
        jobDeps({store, runner: fakeGit({head: HEAD, ancestor: 'yes', diff: ['a.js']}, calls), securityLane: recordingLane([])})
      );
      expect(calls.some(c => c.includes('diff') && c.includes('--no-renames'))).toBe(true);
    });

    test('more than 200 changed files is swept as a full day', async () => {
      const store = new Store(':memory:');
      store.setSecuritySweep('SEO', {sha: 'old1111', fullAtMs: NOW - DAY, nowMs: NOW - DAY});
      const seen: SecurityLaneInput[] = [];
      const diff = Array.from({length: 201}, (_, i) => `packages/functions/src/f${i}.js`);
      const result = await runAuditJob(
        APP,
        jobDeps({store, runner: fakeGit({head: HEAD, ancestor: 'yes', diff}), securityLane: recordingLane(seen)})
      );
      expect(seen[0]!.files).toBeUndefined();
      expect(result.securitySweep).toEqual({mode: 'full'});
      expect(store.getSecuritySweep('SEO')?.lastFullMs).toBe(NOW);
    });

    test('exactly 200 changed files is still incremental', async () => {
      const store = new Store(':memory:');
      store.setSecuritySweep('SEO', {sha: 'old1111', fullAtMs: NOW - DAY, nowMs: NOW - DAY});
      const seen: SecurityLaneInput[] = [];
      const diff = Array.from({length: 200}, (_, i) => `packages/functions/src/f${i}.js`);
      await runAuditJob(APP, jobDeps({store, runner: fakeGit({head: HEAD, ancestor: 'yes', diff}), securityLane: recordingLane(seen)}));
      expect(seen[0]!.files).toHaveLength(200);
    });

    test('a full sweep older than the configured days forces a full sweep again', async () => {
      const store = new Store(':memory:');
      store.setSecuritySweep('SEO', {sha: 'old1111', fullAtMs: NOW - 7 * DAY, nowMs: NOW - DAY});
      const seen: SecurityLaneInput[] = [];
      await runAuditJob(
        APP,
        jobDeps({
          store,
          runner: fakeGit({head: HEAD, ancestor: 'yes', diff: ['packages/functions/src/handlers/a.js']}),
          securityLane: recordingLane(seen)
        })
      );
      expect(seen[0]!.files).toBeUndefined();
      expect(store.getSecuritySweep('SEO')?.lastFullMs).toBe(NOW);
    });

    test('the full-sweep interval comes from settings', async () => {
      const store = new Store(':memory:');
      store.setSecuritySweep('SEO', {sha: 'old1111', fullAtMs: NOW - 2 * DAY, nowMs: NOW - DAY});
      const seen: SecurityLaneInput[] = [];
      await runAuditJob(
        APP,
        jobDeps({
          store,
          cfg: settings({security: {model: 'claude-opus-5', timeoutMs: 2000, fullEveryDays: 2}}),
          runner: fakeGit({head: HEAD, ancestor: 'yes', diff: ['packages/functions/src/handlers/a.js']}),
          securityLane: recordingLane(seen)
        })
      );
      expect(seen[0]!.files).toBeUndefined();
    });

    test('a record that has never had a full sweep is due for one', async () => {
      const store = new Store(':memory:');
      store.setSecuritySweep('SEO', {sha: 'old1111', fullAtMs: undefined, nowMs: NOW - DAY});
      const seen: SecurityLaneInput[] = [];
      await runAuditJob(
        APP,
        jobDeps({
          store,
          runner: fakeGit({head: HEAD, ancestor: 'yes', diff: ['packages/functions/src/handlers/a.js']}),
          securityLane: recordingLane(seen)
        })
      );
      expect(seen[0]!.files).toBeUndefined();
    });

    for (const ancestor of ['no', 'unknown'] as const) {
      test(`a recorded sha that is ${ancestor === 'no' ? 'not an ancestor' : 'unknown to git'} means a full sweep`, async () => {
        const store = new Store(':memory:');
        store.setSecuritySweep('SEO', {sha: 'old1111', fullAtMs: NOW - DAY, nowMs: NOW - DAY});
        const seen: SecurityLaneInput[] = [];
        await runAuditJob(
          APP,
          jobDeps({
            store,
            runner: fakeGit({head: HEAD, ancestor, diff: ['packages/functions/src/handlers/a.js']}),
            securityLane: recordingLane(seen)
          })
        );
        expect(seen[0]!.files).toBeUndefined();
        expect(store.getSecuritySweep('SEO')).toEqual({sha: HEAD, lastFullMs: NOW, lastFullAttemptMs: NOW, updatedMs: NOW});
      });
    }

    test('a failed diff falls back to a full sweep rather than skipping', async () => {
      const store = new Store(':memory:');
      store.setSecuritySweep('SEO', {sha: 'old1111', fullAtMs: NOW - DAY, nowMs: NOW - DAY});
      const seen: SecurityLaneInput[] = [];
      await runAuditJob(
        APP,
        jobDeps({store, runner: fakeGit({head: HEAD, ancestor: 'yes', diffFails: true}), securityLane: recordingLane(seen)})
      );
      expect(seen).toHaveLength(1);
      expect(seen[0]!.files).toBeUndefined();
    });

    test('an unreadable HEAD means a full sweep that records nothing', async () => {
      const store = new Store(':memory:');
      store.setSecuritySweep('SEO', {sha: 'old1111', fullAtMs: NOW - DAY, nowMs: NOW - DAY});
      const seen: SecurityLaneInput[] = [];
      await runAuditJob(APP, jobDeps({store, runner: fakeGit({head: undefined}), securityLane: recordingLane(seen)}));
      expect(seen[0]!.files).toBeUndefined();
      expect(store.getSecuritySweep('SEO')).toEqual({sha: 'old1111', lastFullMs: NOW - DAY, lastFullAttemptMs: NOW - DAY, updatedMs: NOW - DAY});
    });

    test('no changed source file skips the lane: no failure, no finding, nothing of its kind resolved', async () => {
      const store = new Store(':memory:');
      // An open security finding from an earlier sweep.
      await runAuditJob(
        APP,
        jobDeps({store, securityLane: async () => ({ok: true, findings: [SEC_A], dropped: 0, hasSecuritySkill: true, costUsd: 0.1})})
      );
      store.setSecuritySweep('SEO', {sha: 'old1111', fullAtMs: NOW - DAY, nowMs: NOW - DAY});

      let called = 0;
      const result = await runAuditJob(
        APP,
        jobDeps({
          store,
          runner: fakeGit({head: HEAD, ancestor: 'yes', diff: ['yarn.lock', 'packages/assets/src/logo.png']}),
          securityLane: async () => {
            called++;
            throw new Error('the lane must not run when nothing changed');
          }
        })
      );
      expect(called).toBe(0);
      expect(result.report.laneFailures).toEqual([]);
      expect(result.report.ledger.fresh).toEqual([]);
      expect(result.report.ledger.resolvedRows).toEqual([]);
      expect(store.openAuditFindings('SEO').map(r => r.file)).toEqual([SEC_A.file]);
      expect(result.securitySweep).toEqual({mode: 'skipped'});
      // Skipping is not "swept without a skill": the report must not claim it is.
      expect(result.report.hasSecuritySkill).toBe(true);
      // Nothing to sweep up to HEAD is the same as having swept up to HEAD.
      expect(store.getSecuritySweep('SEO')).toEqual({sha: HEAD, lastFullMs: NOW - DAY, lastFullAttemptMs: NOW - DAY, updatedMs: NOW});
    });

    test('a skipped lane still reports a repo with no security skill as such', async () => {
      const store = new Store(':memory:');
      store.setSecuritySweep('SEO', {sha: 'old1111', fullAtMs: NOW - DAY, nowMs: NOW - DAY});
      const result = await runAuditJob(
        APP,
        jobDeps({store, runner: fakeGit({head: HEAD, ancestor: 'yes', diff: []}), fileExists: () => false})
      );
      expect(result.report.hasSecuritySkill).toBe(false);
    });

    test('an incremental run resolves only findings in the files it swept', async () => {
      const store = new Store(':memory:');
      await runAuditJob(
        APP,
        jobDeps({store, securityLane: async () => ({ok: true, findings: [SEC_A, SEC_Z], dropped: 0, hasSecuritySkill: true, costUsd: 0.1})})
      );
      expect(store.openAuditFindings('SEO')).toHaveLength(2);
      store.setSecuritySweep('SEO', {sha: 'old1111', fullAtMs: NOW - DAY, nowMs: NOW - DAY});

      const result = await runAuditJob(
        APP,
        jobDeps({
          store,
          runner: fakeGit({head: HEAD, ancestor: 'yes', diff: [SEC_A.file]}),
          securityLane: async () => ({ok: true, findings: [], dropped: 0, hasSecuritySkill: true, costUsd: 0.1})
        })
      );
      expect(result.report.ledger.resolvedRows.map(r => r.file)).toEqual([SEC_A.file]);
      expect(store.openAuditFindings('SEO').map(r => r.file)).toEqual([SEC_Z.file]);
    });

    const TIMEOUT: AuditJobDeps['securityLane'] = async () => ({
      ok: false,
      failure: 'timeout',
      detail: 'killed',
      errors: [],
      hasSecuritySkill: true,
      costUsd: undefined
    });

    test('a failed first-ever full sweep seeds HEAD as the baseline, resolves nothing, and tomorrow goes incremental', async () => {
      const store = new Store(':memory:');
      const day1 = await runAuditJob(APP, jobDeps({store, runner: fakeGit({head: HEAD}), securityLane: TIMEOUT}));
      expect(day1.report.ledger.resolvedRows).toEqual([]);
      expect(store.getSecuritySweep('SEO')).toEqual({sha: HEAD, lastFullMs: undefined, lastFullAttemptMs: NOW, updatedMs: NOW});

      const seen: SecurityLaneInput[] = [];
      const calls: string[][] = [];
      const day2 = await runAuditJob(
        APP,
        jobDeps({
          store,
          cfg: settings({nowMs: NOW + DAY}),
          runner: fakeGit({head: 'next2222', ancestor: 'yes', diff: [SEC_A.file]}, calls),
          securityLane: recordingLane(seen)
        })
      );
      expect(seen[0]!.files).toEqual([SEC_A.file]);
      expect(day2.securitySweep).toEqual({mode: 'incremental', files: 1});
      expect(calls.some(c => c.includes('diff') && c.includes(HEAD))).toBe(true);
      expect(store.getSecuritySweep('SEO')).toEqual({sha: 'next2222', lastFullMs: undefined, lastFullAttemptMs: NOW, updatedMs: NOW + DAY});
    });

    test('a failed first-ever full sweep resolves no open security finding', async () => {
      const store = new Store(':memory:');
      await runAuditJob(
        APP,
        jobDeps({store, securityLane: async () => ({ok: true, findings: [SEC_A], dropped: 0, hasSecuritySkill: true, costUsd: 0.1})})
      );
      await runAuditJob(APP, jobDeps({store, runner: fakeGit({head: HEAD}), securityLane: TIMEOUT}));
      expect(store.openAuditFindings('SEO').map(r => r.file)).toEqual([SEC_A.file]);
    });

    test('a failed due full sweep keeps the sha, and the next days go incremental until the interval passes again', async () => {
      const store = new Store(':memory:');
      store.setSecuritySweep('SEO', {sha: 'old1111', fullAtMs: NOW - 8 * DAY, nowMs: NOW - DAY});

      const seen0: SecurityLaneInput[] = [];
      await runAuditJob(
        APP,
        jobDeps({
          store,
          runner: fakeGit({head: HEAD, ancestor: 'yes', diff: [SEC_A.file]}),
          securityLane: async input => {
            seen0.push(input);
            return TIMEOUT(input);
          }
        })
      );
      expect(seen0[0]!.files).toBeUndefined();
      expect(store.getSecuritySweep('SEO')).toEqual({sha: 'old1111', lastFullMs: NOW - 8 * DAY, lastFullAttemptMs: NOW, updatedMs: NOW});

      const seen1: SecurityLaneInput[] = [];
      await runAuditJob(
        APP,
        jobDeps({
          store,
          cfg: settings({nowMs: NOW + DAY}),
          runner: fakeGit({head: HEAD, ancestor: 'yes', diff: [SEC_A.file]}),
          securityLane: recordingLane(seen1)
        })
      );
      expect(seen1[0]!.files).toEqual([SEC_A.file]);
      expect(store.getSecuritySweep('SEO')).toEqual({sha: HEAD, lastFullMs: NOW - 8 * DAY, lastFullAttemptMs: NOW, updatedMs: NOW + DAY});

      const seen7: SecurityLaneInput[] = [];
      await runAuditJob(
        APP,
        jobDeps({
          store,
          cfg: settings({nowMs: NOW + 7 * DAY}),
          runner: fakeGit({head: 'next2222', ancestor: 'yes', diff: [SEC_A.file]}),
          securityLane: recordingLane(seen7)
        })
      );
      expect(seen7[0]!.files).toBeUndefined();
      expect(store.getSecuritySweep('SEO')?.lastFullMs).toBe(NOW + 7 * DAY);
    });

    test('a failed or thrown incremental sweep leaves the record where it was', async () => {
      for (const securityLane of [
        async () => ({ok: false as const, failure: 'timeout' as const, detail: 'killed', errors: [], hasSecuritySkill: true, costUsd: undefined}),
        async () => {
          throw new Error('boom');
        }
      ]) {
        const store = new Store(':memory:');
        store.setSecuritySweep('SEO', {sha: 'old1111', fullAtMs: NOW - DAY, nowMs: NOW - DAY});
        await runAuditJob(
          APP,
          jobDeps({store, runner: fakeGit({head: HEAD, ancestor: 'yes', diff: [SEC_A.file]}), securityLane})
        );
        expect(store.getSecuritySweep('SEO')).toEqual({sha: 'old1111', lastFullMs: NOW - DAY, lastFullAttemptMs: NOW - DAY, updatedMs: NOW - DAY});
      }
    });
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
    runner: async () => ({code: 1, stdout: '', stderr: 'fatal: not a git repository', timedOut: false}),
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

  test('the full-sweep interval reaches the job settings from config', () => {
    expect(buildAuditRunConfig(REGISTRY_CFG, NOW).security.fullEveryDays).toBe(7);
  });

  test('the runner reaches the job, so its git calls are the injected ones', async () => {
    const calls: string[][] = [];
    await runAudit(runConfig({apps: [APP]}), {...runDeps(), runner: fakeGit({head: HEAD}, calls)});
    expect(calls.some(c => c.includes('rev-parse'))).toBe(true);
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
