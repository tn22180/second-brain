import {describe, expect, test} from 'bun:test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Contract} from '../src/contract';
import {openLedger} from '../src/ledger';
import type {Verdict} from '../src/verify';

const c: Contract = {id: 'T-1', source: 'jira-fix', goal: 'g', repoPath: '/x', allow: ['a'], verify: [{name: 'n', cmd: ['true']}]};
const v = (runId: string, pass: boolean, at = 1000): Verdict => ({
  contractId: 'T-1', runId, at, pass, diffSha: 'ab', changed: ['a'], checks: [{name: 'scope', ok: pass}], costUsd: 0.5
});
const db = () => openLedger(join(mkdtempSync(join(tmpdir(), 'ledger-')), 'l.db'));

describe('ledger', () => {
  test('false-done = claimed done but verifier failed', () => {
    const l = db();
    l.recordVerdict(v('r1', true), c, true);
    l.recordVerdict(v('r2', false), c, true);
    l.recordVerdict(v('r3', false), c, false);
    expect(l.stats(0)).toMatchObject({runs: 3, claimedDone: 2, falseDone: 1, falseDoneRate: 0.5, passed: 1});
  });
  test('rate is null with no claimed runs', () => {
    expect(db().stats(0).falseDoneRate).toBeNull();
  });
  test('decision on unknown run returns false', () => {
    expect(db().recordDecision('nope', 'approved')).toBe(false);
  });
  test('decisions counted, window respected', () => {
    const l = db();
    l.recordVerdict(v('old', true, 10), c, true);
    l.recordVerdict(v('new', true, 5000), c, true);
    expect(l.recordDecision('new', 'approved', 5001)).toBe(true);
    expect(l.stats(1000)).toMatchObject({runs: 1, approved: 1, rejected: 0});
  });
  test('re-recording the same runId is refused', () => {
    const l = db();
    l.recordVerdict(v('r1', true), c, true);
    expect(() => l.recordVerdict(v('r1', false), c, true)).toThrow();
  });
});
