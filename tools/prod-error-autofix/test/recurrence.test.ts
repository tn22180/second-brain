import {describe, expect, test} from 'bun:test';
import {
  escapeFilterLiteral,
  judge,
  MIN_AFTER_MS,
  MIN_BASELINE,
  MAX_WINDOW_MS,
  probeToken,
  readiness,
  signatureFilter,
  statusFor,
  windows
} from '../src/verify/recurrence';

const HOUR = 3_600_000;

describe('probeToken', () => {
  test('drops the status code and keeps the route', () => {
    // 2vji03's real message. The 500 varies with the failure mode; the route does not.
    expect(probeToken('HTTP 500 POST /proxy/save404')).toBe('POST /proxy/save404');
  });

  test('keeps a message that has no variable parts whole', () => {
    expect(probeToken('Not allowed content type')).toBe('Not allowed content type');
  });

  test('keeps case — a Cloud Logging substring match is case-sensitive', () => {
    expect(probeToken('Cannot read properties of undefined')).toBe('Cannot read properties of undefined');
  });

  test('only looks at the first line, like normalize does', () => {
    const token = probeToken('Unhandled rejection in handler\n    at foo (/workspace/lib/a.js:1:1)');
    expect(token).toBe('Unhandled rejection in handler');
  });

  test('cuts at the ids and keeps the stable prefix around them', () => {
    // The numeric product id and the 20-char shop id both go; `gid://shopify/Product/`
    // stays, and should — it is the same string for every shop, so it makes the filter
    // more specific rather than less.
    const token = probeToken(
      'sync failed for gid://shopify/Product/8823410295107 shop abcdefghijklmnopqrst'
    );
    expect(token).toBe('sync failed for gid://shopify/Product/');
  });

  test('strips a uuid out of the middle', () => {
    const token = probeToken('job 7f3a1b2c-1111-2222-3333-444455556666 aborted before dispatch');
    expect(token).toBe('aborted before dispatch');
  });

  test('a message that is all identifiers yields nothing', () => {
    // Better to report `no_signature` than to count some other error and call it a
    // verdict on this one.
    expect(probeToken('7f3a1b2c-1111-2222-3333-444455556666 91827364554637281900')).toBeUndefined();
  });

  test('rejects a literal too short to be specific', () => {
    expect(probeToken('HTTP 500')).toBeUndefined();
  });
});

describe('signatureFilter', () => {
  test('carries both log shapes and an error term', () => {
    const filter = signatureFilter('POST /proxy/save404');
    expect(filter).toContain('textPayload:"POST /proxy/save404"');
    expect(filter).toContain('jsonPayload.message:"POST /proxy/save404"');
    // Without this the token also matches the endpoint's 200s and every sweep
    // reports a regression.
    expect(filter).toContain('severity>=ERROR OR logName:"stderr"');
  });

  test('escapes a quote instead of ending the filter string', () => {
    expect(escapeFilterLiteral('said "hi"')).toBe('said \\"hi\\"');
    expect(signatureFilter('a"b')).toContain('textPayload:"a\\"b"');
  });
});

describe('windows', () => {
  const merged = Date.parse('2026-08-01T00:00:00.000Z');
  const deployed = Date.parse('2026-08-01T02:00:00.000Z');

  test('before-window ends at the merge and matches the after-window length', () => {
    const now = deployed + 10 * HOUR;
    const w = windows({mergedAtMs: merged, deployedAtMs: deployed, nowMs: now});
    expect(w.spanMs).toBe(10 * HOUR);
    expect(w.after.fromIso).toBe(new Date(now - 10 * HOUR).toISOString());
    expect(w.before.toIso).toBe(new Date(merged).toISOString());
    expect(w.before.fromIso).toBe(new Date(merged - 10 * HOUR).toISOString());
  });

  test('the merge-to-deploy gap lands in neither window', () => {
    const w = windows({mergedAtMs: merged, deployedAtMs: deployed, nowMs: deployed + 4 * HOUR});
    expect(Date.parse(w.before.toIso)).toBe(merged);
    expect(Date.parse(w.after.fromIso)).toBe(deployed);
  });

  test('caps a long-open incident so the read stays bounded', () => {
    const w = windows({mergedAtMs: merged, deployedAtMs: deployed, nowMs: deployed + 60 * 24 * HOUR});
    expect(w.spanMs).toBe(MAX_WINDOW_MS);
  });
});

describe('readiness', () => {
  const now = Date.parse('2026-08-04T00:00:00.000Z');
  const merged = now - 48 * HOUR;

  test('unmerged is not a fix that failed', () => {
    expect(readiness({merged: false, mergedAtMs: undefined, deployedAtMs: undefined, nowMs: now})).toEqual({
      ready: false,
      verdict: 'not_merged'
    });
  });

  test('a Cloud Run job has no deploy timestamp, so it never gets judged', () => {
    expect(readiness({merged: true, mergedAtMs: merged, deployedAtMs: undefined, nowMs: now})).toEqual({
      ready: false,
      verdict: 'not_deployed'
    });
  });

  test('a deploy older than the merge means the fix is not out yet', () => {
    expect(readiness({merged: true, mergedAtMs: merged, deployedAtMs: merged - HOUR, nowMs: now})).toEqual({
      ready: false,
      verdict: 'not_deployed'
    });
  });

  test('a fresh deploy is too soon to prove anything', () => {
    const deployed = now - (MIN_AFTER_MS - HOUR);
    expect(readiness({merged: true, mergedAtMs: merged, deployedAtMs: deployed, nowMs: now})).toEqual({
      ready: false,
      verdict: 'too_soon'
    });
  });

  test('merged, deployed, and settled long enough', () => {
    const deployed = now - (MIN_AFTER_MS + HOUR);
    expect(readiness({merged: true, mergedAtMs: merged, deployedAtMs: deployed, nowMs: now})).toEqual({
      ready: true,
      mergedAtMs: merged,
      deployedAtMs: deployed
    });
  });
});

describe('judge', () => {
  test('silent after a real baseline is the only thing that counts as fixed', () => {
    expect(judge({after: 0, before: 441, beforeTruncated: false})).toBe('verified');
  });

  test('silence with no baseline proves nothing', () => {
    // The failure this exists to stop: a bug that fires twice a week going quiet for
    // a day and being filed as fixed.
    expect(judge({after: 0, before: MIN_BASELINE - 1, beforeTruncated: false})).toBe('unproven');
  });

  test('still firing at the old rate is a regression', () => {
    expect(judge({after: 380, before: 441, beforeTruncated: false})).toBe('regressed');
  });

  test('a 99% cut is not a regression', () => {
    // Filing this as failed would spend an Opus re-analysis to rediscover a fix that
    // already worked.
    expect(judge({after: 3, before: 441, beforeTruncated: false})).toBe('improved');
  });

  test('a residue above the improved threshold is still a regression', () => {
    expect(judge({after: 50, before: 441, beforeTruncated: false})).toBe('regressed');
  });

  test('any recurrence against a thin baseline is a regression, never improved', () => {
    expect(judge({after: 1, before: 2, beforeTruncated: false})).toBe('regressed');
  });
});

describe('statusFor', () => {
  test('only two verdicts move a row', () => {
    expect(statusFor('verified')).toBe('fix_verified');
    expect(statusFor('regressed')).toBe('fix_failed');
    for (const v of ['improved', 'unproven', 'too_soon', 'not_deployed', 'not_merged', 'no_signature', 'probe_failed', 'count_failed'] as const) {
      expect(statusFor(v)).toBeUndefined();
    }
  });
});
