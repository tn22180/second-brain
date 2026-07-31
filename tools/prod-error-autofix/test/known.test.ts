import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {isAlreadyFixed, knownIncident, loadKnownIncidents, parseIndexLine} from '../src/brain/known';

const ROOT = '/private/tmp/claude-501/-Users-nguyentuan-Documents-second-brain/known-test';

/** Verbatim lines out of the real brain/index.md on 2026-07-31. */
const REAL_WITH_MR =
  '- `urawwr` · 2026-07-31 · BLOG · proxy · The alert is not a defect: verifyAppProxySignature correctly rejected one tampered App Proxy request (signatur · https://gitlab.com/avada/blogs/-/merge_requests/792 · mr_open';
const REAL_NO_MR =
  '- `1th7fsw` · 2026-07-30 · BLOG · api · no verified cause · — · inconclusive';

describe('parseIndexLine', () => {
  test('reads a line that carries an MR', () => {
    const got = parseIndexLine(REAL_WITH_MR);
    expect(got).toMatchObject({
      fingerprint: 'urawwr',
      dateIso: '2026-07-31',
      appName: 'BLOG',
      service: 'proxy',
      mrUrl: 'https://gitlab.com/avada/blogs/-/merge_requests/792',
      status: 'mr_open'
    });
  });

  test('an em dash means no MR, not an MR named "—"', () => {
    expect(parseIndexLine(REAL_NO_MR)!.mrUrl).toBeUndefined();
  });

  /** Root causes routinely contain the separator; the tail is what identifies the fields. */
  test('a root cause containing the separator does not shift the other fields', () => {
    const line = '- `abc` · 2026-07-31 · SEO · api · one · two · three · https://x/-/merge_requests/9 · mr_open';
    const got = parseIndexLine(line)!;
    expect(got.rootCause).toBe('one · two · three');
    expect(got.mrUrl).toBe('https://x/-/merge_requests/9');
    expect(got.status).toBe('mr_open');
  });

  test('headings and prose are not incidents', () => {
    expect(parseIndexLine('# Incident index')).toBeUndefined();
    expect(parseIndexLine('- not a fingerprint line')).toBeUndefined();
    expect(parseIndexLine('')).toBeUndefined();
  });
});

describe('isAlreadyFixed', () => {
  test('only a recorded MR stops a fresh job', () => {
    expect(isAlreadyFixed(parseIndexLine(REAL_WITH_MR))).toBe(true);
    // An inconclusive record is exactly the case worth retrying.
    expect(isAlreadyFixed(parseIndexLine(REAL_NO_MR))).toBe(false);
    expect(isAlreadyFixed(undefined)).toBe(false);
  });
});

describe('loadKnownIncidents', () => {
  beforeEach(() => {
    mkdirSync(ROOT, {recursive: true});
    writeFileSync(join(ROOT, 'index.md'), ['# Incident index', '', REAL_WITH_MR, REAL_NO_MR].join('\n'), 'utf8');
  });
  afterEach(() => rmSync(ROOT, {recursive: true, force: true}));

  test('every incident line is indexed by fingerprint', () => {
    const known = loadKnownIncidents(ROOT);
    expect(known.size).toBe(2);
    expect(knownIncident(ROOT, 'urawwr')!.mrUrl).toContain('merge_requests/792');
    expect(knownIncident(ROOT, 'nope')).toBeUndefined();
  });

  test('a missing brain is empty, not an error', () => {
    expect(loadKnownIncidents('/no/such/brain').size).toBe(0);
  });
});
