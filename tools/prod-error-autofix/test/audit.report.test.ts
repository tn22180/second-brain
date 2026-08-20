import {describe, expect, test} from 'bun:test';
import {findingFp} from '../src/audit/findingFp';
import type {AuditFinding, LedgerDiff} from '../src/audit/ledger';
import {renderReport, type AppReportInput, type ReportInput} from '../src/audit/report';
import {runSupervisor} from '../src/audit/supervisor';
import type {ClaudeResult, ClaudeRunner} from '../src/agent/claudeCli';

function finding(over: Partial<AuditFinding> & {app: string; file: string; rule: string; title: string}): AuditFinding {
  return {
    fp: findingFp({app: over.app, file: over.file, rule: over.rule, title: over.title}),
    kind: 'hygiene',
    line: 1,
    severity: 'low',
    ...over
  };
}

function ledger(over: Partial<LedgerDiff> = {}): LedgerDiff {
  return {fresh: [], carried: 0, resolved: 0, suppressed: 0, ...over};
}

function app(over: Partial<AppReportInput> & {appName: string}): AppReportInput {
  return {
    ledger: ledger(),
    openFindings: [],
    hasSecuritySkill: true,
    laneFailures: [],
    ...over
  };
}

const QUIET_APPS: AppReportInput[] = [
  app({appName: 'BLOG'}),
  app({appName: 'AEO'}),
  app({appName: 'IMG-OPT'})
];

const BASE: ReportInput = {
  date: '2026-08-19',
  apps: QUIET_APPS,
  digest: false,
  costUsd: undefined
};

function ok(text: string, costUsd = 0.01): ClaudeResult {
  return {
    ok: true,
    text,
    costUsd,
    numTurns: 1,
    sessionId: 'sess',
    permissionDenials: [],
    failure: undefined,
    detail: undefined
  };
}

describe('renderReport', () => {
  test('a quiet run says so in one line rather than going silent', () => {
    const text = renderReport(BASE);
    expect(text).toContain('không có gì mới');
  });

  test('a failed lane is named in the message, not swallowed', () => {
    const apps: AppReportInput[] = [
      app({appName: 'SEO', laneFailures: [{lane: 'security', detail: 'killed after 900000ms'}]})
    ];
    const text = renderReport({...BASE, apps});
    expect(text).toContain('Lane lỗi');
    expect(text).toContain('SEO');
    expect(text).not.toContain('không có gì mới ở lane'); // sanity: not phrased as if nothing happened
  });

  test('a run with no lane failures says so explicitly', () => {
    const text = renderReport(BASE);
    expect(text).toContain('Lane lỗi: không');
  });

  test('secret values never reach the message even if upstream forgot to redact', () => {
    const token = 'shpat_<fixture>';
    const apps: AppReportInput[] = [
      app({
        appName: 'SEO',
        ledger: ledger({
          fresh: [
            finding({
              app: 'SEO',
              kind: 'security',
              file: 'packages/functions/src/handlers/x.js',
              line: 10,
              rule: 'secret',
              title: `key leaked: ${token}`,
              severity: 'high'
            })
          ]
        })
      })
    ];
    const text = renderReport({...BASE, apps});
    expect(text).not.toContain(token);
    expect(text).toContain('<redacted>');
  });

  test('the blogs gap is printed when hasSecuritySkill is false', () => {
    const apps: AppReportInput[] = [app({appName: 'BLOG', hasSecuritySkill: false})];
    const text = renderReport({...BASE, apps});
    expect(text).toContain('.claude/skills');
    expect(text).toContain('BLOG');
  });

  test('cost is labelled as an equivalence, never as money spent', () => {
    const text = renderReport({...BASE, costUsd: 4.2});
    expect(text).toContain('quy đổi (chạy trên gói)');
    expect(text).not.toMatch(/\$4\.20 mất|\$4\.20 spent/);
  });

  test('no cost line at all when costUsd is undefined', () => {
    const text = renderReport({...BASE, costUsd: undefined});
    expect(text).not.toContain('quy đổi');
  });

  test('an ordinary day lists only new findings plus a count, not the whole backlog', () => {
    const carriedFinding = finding({
      app: 'SEO',
      kind: 'hygiene',
      file: 'packages/functions/src/const/default.js',
      line: 5,
      rule: 'no-unused-vars',
      title: "'CONTENT_TYPES' is defined but never used"
    });
    const apps: AppReportInput[] = [
      app({
        appName: 'SEO',
        ledger: ledger({carried: 1}),
        openFindings: [carriedFinding]
      })
    ];
    const text = renderReport({...BASE, apps, digest: false});
    expect(text).not.toContain('CONTENT_TYPES');
    expect(text).toContain('Tồn: 1');
  });

  test('the digest day renders the full open backlog for that app', () => {
    const carriedFinding = finding({
      app: 'SEO',
      kind: 'hygiene',
      file: 'packages/functions/src/const/default.js',
      line: 5,
      rule: 'no-unused-vars',
      title: "'CONTENT_TYPES' is defined but never used"
    });
    const apps: AppReportInput[] = [
      app({
        appName: 'SEO',
        ledger: ledger({carried: 1}),
        openFindings: [carriedFinding]
      })
    ];
    const text = renderReport({...BASE, apps, digest: true});
    expect(text).toContain('CONTENT_TYPES');
    expect(text).toContain('packages/functions/src/const/default.js:5');
  });

  test('a mixed run: two apps with new findings, one lane failed, one app missing its security skill', () => {
    const seoFinding = finding({
      app: 'SEO',
      kind: 'security',
      file: 'packages/functions/src/handlers/api/getFaqs.js',
      line: 41,
      rule: 'shop_scoping',
      title: "query thiếu where('shopId') — đọc được FAQ shop khác",
      severity: 'high'
    });
    const apcFinding = finding({
      app: 'APC',
      kind: 'hygiene',
      file: 'packages/functions/src/const/default.js',
      line: 5,
      rule: 'no-unused-vars',
      title: "CONTENT_TYPES khai rồi không dùng",
      severity: 'low'
    });
    const apps: AppReportInput[] = [
      app({appName: 'SEO', ledger: ledger({fresh: [seoFinding]})}),
      app({appName: 'APC', ledger: ledger({fresh: [apcFinding]})}),
      app({appName: 'BLOG', hasSecuritySkill: false, laneFailures: [{lane: 'hygiene', detail: 'eslint exited 2'}]}),
      app({appName: 'AEO'}),
      app({appName: 'IMG-OPT'})
    ];
    const text = renderReport({date: '2026-08-19', apps, digest: false, costUsd: 1.87});
    expect(text).toContain('SEO');
    expect(text).toContain('APC');
    expect(text).toContain('BLOG');
    expect(text).toContain('.claude/skills');
    expect(text).toContain('Lane lỗi');
    expect(text).toContain('quy đổi (chạy trên gói)');
  });
});

describe('runSupervisor', () => {
  test('falls back to exactly renderReport(input) when the agent times out', async () => {
    const claude: ClaudeRunner = async () => ({
      ok: false,
      text: '',
      costUsd: undefined,
      numTurns: undefined,
      sessionId: undefined,
      permissionDenials: [],
      failure: 'timeout',
      detail: 'killed after 300000ms'
    });
    const text = await runSupervisor(BASE, claude);
    expect(text).toBe(renderReport(BASE));
  });

  test('falls back to exactly renderReport(input) when the agent throws', async () => {
    const claude: ClaudeRunner = async () => {
      throw new Error('spawn ENOENT');
    };
    const text = await runSupervisor(BASE, claude);
    expect(text).toBe(renderReport(BASE));
  });

  test('falls back to exactly renderReport(input) when the agent answers with whitespace', async () => {
    const claude: ClaudeRunner = async () => ok('   \n  ');
    const text = await runSupervisor(BASE, claude);
    expect(text).toBe(renderReport(BASE));
  });

  test('an agent that answers with real text is used as-is', async () => {
    const claude: ClaudeRunner = async () => ok('bản tóm tắt gọn hơn của cùng dữ liệu');
    const text = await runSupervisor(BASE, claude);
    expect(text).toBe('bản tóm tắt gọn hơn của cùng dữ liệu');
  });

  test('never spawns a real claude — the injected runner is always used', async () => {
    let calls = 0;
    const claude: ClaudeRunner = async () => {
      calls++;
      return ok('ok');
    };
    await runSupervisor(BASE, claude);
    expect(calls).toBe(1);
  });
});
