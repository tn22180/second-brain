import {describe, expect, test} from 'bun:test';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {findingFp} from '../src/audit/findingFp';
import type {AuditFinding, LedgerDiff} from '../src/audit/ledger';
import {renderReport, type AppReportInput, type ReportInput} from '../src/audit/report';
import {runSupervisor} from '../src/audit/supervisor';
import type {ClaudeResult, ClaudeRunner} from '../src/agent/claudeCli';

const TELEGRAM_LIMIT = 4096;

// Same shape eslint's `no-unused-vars` produces on a first run — an empty
// ledger means every one of these is `fresh`. Measured 2026-08-20: 856 of them
// for one app rendered to 121998 bytes against Telegram's 4096-char cap.
function hygieneFinding(app: string, i: number): AuditFinding {
  return finding({
    app,
    kind: 'hygiene',
    file: `packages/functions/src/const/file${i}.js`,
    line: i,
    rule: 'no-unused-vars',
    title: `'UNUSED_${i}' is defined but never used`,
    severity: 'low'
  });
}

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
  return {fresh: [], carried: 0, resolved: 0, suppressed: 0, resolvedRows: [], ...over};
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

  test('856 fresh findings on an empty-ledger first run still render under the Telegram limit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-report-'));
    const fullReportPath = join(dir, 'apc-full.txt');
    try {
      const findings = Array.from({length: 856}, (_, i) => hygieneFinding('APC', i));
      const apps: AppReportInput[] = [app({appName: 'APC', ledger: ledger({fresh: findings})})];
      const text = renderReport({...BASE, apps, fullReportPath});

      expect(text.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
      // The header count must still say 856 — the cap hides detail lines, it
      // must never understate how many findings actually exist.
      expect(text).toContain('856 mới');
      // No silent cap: the message must say how many findings it did not list.
      expect(text).toMatch(/\d+ phát hiện không hiện/);
      expect(text).toContain(fullReportPath);

      const onDisk = readFileSync(fullReportPath, 'utf8');
      for (const f of findings) expect(onDisk).toContain(f.title);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test('a high-severity security finding behind 800 hygiene ones survives the cap', () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-report-'));
    const fullReportPath = join(dir, 'apc-full.txt');
    try {
      const hygiene = Array.from({length: 800}, (_, i) => hygieneFinding('APC', i));
      const securityFinding = finding({
        app: 'APC',
        kind: 'security',
        file: 'packages/functions/src/webhooks/handleOrder.js',
        line: 12,
        rule: 'authn',
        title: 'HMAC check bị comment out trên webhook order',
        severity: 'high'
      });
      const findings = [...hygiene, securityFinding];
      const apps: AppReportInput[] = [app({appName: 'APC', ledger: ledger({fresh: findings})})];
      const text = renderReport({...BASE, apps, fullReportPath});

      expect(text.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
      expect(text).toContain('handleOrder.js:12');
      expect(text).toContain('HMAC check bị comment out trên webhook order');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test('a small report has no cap artefacts on a quiet day', () => {
    const text = renderReport(BASE);
    expect(text).not.toMatch(/phát hiện không hiện/);
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

describe('the Jira ticket line', () => {
  test('the ticket is named next to the app that opened it', () => {
    const out = renderReport({
      date: '2026-08-22',
      digest: false,
      costUsd: undefined,
      apps: [
        app({
          appName: 'APC',
          ledger: ledger({fresh: [finding({app: 'APC', file: 'src/a.js', rule: 'auth', title: 'no shop check'})]}),
          jiraTicketUrl: 'https://space.avada.net/browse/FAL-900'
        })
      ]
    });
    expect(out).toContain('https://space.avada.net/browse/FAL-900');
  });

  test('an app with a ticket but no fresh finding is not filed under "nothing new"', () => {
    // Happens once per app: the run where a backlog older than the Jira lane finally
    // gets a ticket. Going quiet there would hide the only message naming it.
    const out = renderReport({
      date: '2026-08-22',
      digest: false,
      costUsd: undefined,
      apps: [app({appName: 'APC', jiraTicketUrl: 'https://space.avada.net/browse/FAL-901'})]
    });
    expect(out).toContain('FAL-901');
    expect(out).not.toContain('APC: không có gì mới');
  });
});
