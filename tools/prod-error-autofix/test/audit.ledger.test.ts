import {describe, expect, test} from 'bun:test';
import {Database} from 'bun:sqlite';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {findingFp, normaliseTitle} from '../src/audit/findingFp';
import {classify} from '../src/audit/ledger';
import type {AuditFinding} from '../src/audit/ledger';
import {Store} from '../src/state/store';

describe('findingFp', () => {
  test('a finding keeps its fingerprint when the line moves', () => {
    const a = findingFp({app: 'SEO', file: 'src/a.js', rule: 'no-unused-vars', title: "'X' is defined but never used"});
    const b = findingFp({app: 'SEO', file: 'src/a.js', rule: 'no-unused-vars', title: "'X' is defined but never used"});
    expect(a).toBe(b);
  });

  test('digits and ids are normalised out of the title', () => {
    expect(normaliseTitle('shop 8812 failed at 2026-08-19T04:00Z')).toBe(
      normaliseTitle('shop 91 failed at 2026-07-01T09:30Z')
    );
  });

  test('a different file or rule is a different finding', () => {
    const base = {app: 'SEO', file: 'src/a.js', rule: 'no-unused-vars', title: 't'};
    expect(findingFp(base)).not.toBe(findingFp({...base, file: 'src/b.js'}));
    expect(findingFp(base)).not.toBe(findingFp({...base, rule: 'no-undef'}));
  });
});

const FINDING_FP = findingFp({app: 'SEO', file: 'src/a.js', rule: 'no-unused-vars', title: "'X' is defined but never used"});

const FINDING: AuditFinding = {
  fp: FINDING_FP,
  app: 'SEO',
  kind: 'hygiene',
  file: 'src/a.js',
  line: 5,
  rule: 'no-unused-vars',
  title: "'X' is defined but never used",
  severity: 'low'
};

describe('classify', () => {
  test('first sighting is fresh, second run is carried', () => {
    const store = new Store(':memory:');
    const f = [FINDING];
    expect(classify(store, 'SEO', f, 1000).fresh).toHaveLength(1);
    const second = classify(store, 'SEO', f, 2000);
    expect(second.fresh).toHaveLength(0);
    expect(second.carried).toBe(1);
  });

  test('a finding that stops appearing is resolved once, then not counted again', () => {
    const store = new Store(':memory:');
    classify(store, 'SEO', [FINDING], 1000);
    expect(classify(store, 'SEO', [], 2000).resolved).toBe(1);
    expect(classify(store, 'SEO', [], 3000).resolved).toBe(0);
  });

  // Set by a human, never by the pipeline. Suppressing forever is a decision, not a step.
  test('accepted findings are suppressed and never re-reported', () => {
    const store = new Store(':memory:');
    classify(store, 'SEO', [FINDING], 1000);
    store.setAuditFindingStatus(FINDING_FP, 'accepted');
    const d = classify(store, 'SEO', [FINDING], 2000);
    expect(d.fresh).toHaveLength(0);
    expect(d.carried).toBe(0);
    expect(d.suppressed).toBe(1);
  });

  test('a finding that comes back after being resolved is fresh again', () => {
    const store = new Store(':memory:');
    classify(store, 'SEO', [FINDING], 1000);
    classify(store, 'SEO', [], 2000);
    expect(classify(store, 'SEO', [FINDING], 3000).fresh).toHaveLength(1);
  });

  // classify only READS accepted/false_positive to decide suppression. Nothing in
  // this module — or anywhere in the pipeline — may set either: that is a human
  // call made through setAuditFindingStatus directly, from a report a person read.
  test('classify never writes accepted or false_positive itself', () => {
    const store = new Store(':memory:');
    classify(store, 'SEO', [FINDING], 1000);
    classify(store, 'SEO', [], 2000);
    classify(store, 'SEO', [FINDING], 3000);
    const row = store.getAuditFinding(FINDING_FP);
    expect(row?.status).not.toBe('accepted');
    expect(row?.status).not.toBe('false_positive');
  });
});

describe('jira_key on audit_findings', () => {
  test('a finding remembers its ticket across runs', () => {
    const store = new Store(':memory:');
    classify(store, 'SEO', [FINDING], 1000);
    expect(store.openAuditFindings('SEO')[0]!.jiraKey).toBeUndefined();

    store.setAuditFindingJira(FINDING_FP, 'FAL-720');
    expect(store.openAuditFindings('SEO')[0]!.jiraKey).toBe('FAL-720');

    // The point of the column: the next sweep sees the same finding as carried and can
    // comment on FAL-720 instead of opening a second ticket for it.
    const second = classify(store, 'SEO', [FINDING], 2000);
    expect(second.fresh).toHaveLength(0);
    expect(second.carried).toBe(1);
    expect(store.openAuditFindings('SEO')[0]!.jiraKey).toBe('FAL-720');
  });

  test('a database written before jira_key existed opens and reads undefined', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autofix-store-'));
    const path = join(dir, 'state.db');

    // The exact pre-jira_key shape, so this test fails if migrate() stops being additive.
    const legacy = new Database(path);
    legacy.run(`CREATE TABLE audit_findings (
      fp TEXT PRIMARY KEY, app TEXT NOT NULL, kind TEXT NOT NULL, file TEXT NOT NULL,
      line INTEGER NOT NULL, rule TEXT, title TEXT NOT NULL, severity TEXT NOT NULL,
      verdict TEXT, first_seen_ms INTEGER NOT NULL, last_seen_ms INTEGER NOT NULL,
      status TEXT NOT NULL, mr_url TEXT)`);
    legacy.run(
      `INSERT INTO audit_findings
       (fp, app, kind, file, line, rule, title, severity, first_seen_ms, last_seen_ms, status)
       VALUES ('old', 'SEO', 'hygiene', 'src/a.js', 5, 'no-unused-vars', 't', 'low', 1, 1, 'open')`
    );
    legacy.close();

    const store = new Store(path);
    const row = store.openAuditFindings('SEO')[0]!;
    expect(row.fp).toBe('old');
    expect(row.jiraKey).toBeUndefined();

    store.setAuditFindingJira('old', 'FAL-721');
    expect(store.openAuditFindings('SEO')[0]!.jiraKey).toBe('FAL-721');
    store.close();
    rmSync(dir, {recursive: true, force: true});
  });
});
