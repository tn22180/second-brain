import {describe, expect, test} from 'bun:test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Contract} from '../src/contract';
import {openLedger} from '../src/ledger';
import type {Verdict} from '../src/verify';

const c: Contract = {id: 'T-1', source: 'jira-fix', goal: 'g', repoPath: '/x', baseSha: 'a'.repeat(40), allow: ['a'], verify: [{name: 'n', cmd: ['true']}]};
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
  test('passed() needs a passing row with the same sha', () => {
    const l = db();
    l.recordVerdict(v('ok', true), c, true);
    l.recordVerdict(v('bad', false), c, true);
    expect(l.passed('ok', 'ab')).toBe(true);
    expect(l.passed('ok', 'cd')).toBe(false);
    expect(l.passed('bad', 'ab')).toBe(false);
    expect(l.passed('missing', 'ab')).toBe(false);
  });
  test('re-recording the same runId is refused', () => {
    const l = db();
    l.recordVerdict(v('r1', true), c, true);
    expect(() => l.recordVerdict(v('r1', false), c, true)).toThrow();
  });

  test('false-done is also counted per task, not only per verify run', () => {
    const l = db();
    const cA = {...c, id: 'A'};
    const cB = {...c, id: 'B'};
    // Task A: agent claimed done twice, wrong twice, then right. Task B: right first time.
    l.recordVerdict({...v('a1', false), contractId: 'A'}, cA, true);
    l.recordVerdict({...v('a2', false), contractId: 'A'}, cA, true);
    l.recordVerdict({...v('a3', true), contractId: 'A'}, cA, true);
    l.recordVerdict({...v('b1', true), contractId: 'B'}, cB, true);
    expect(l.stats(0)).toMatchObject({falseDone: 2, falseDoneRate: 0.5, tasks: 2, tasksFalseDone: 1, taskFalseDoneRate: 0.5});
  });
  test('who ran it is stored, so self-improve can compare agents and models', () => {
    const l = db();
    l.recordVerdict(v('m1', false), {...c, meta: {agent: 'general-purpose', model: 'sonnet', round: 2}}, true);
    l.recordVerdict(v('m2', true), c, true);
    expect(l.run('m1')).toMatchObject({agent: 'general-purpose', model: 'sonnet', round: 2});
    expect(l.run('m2')).toMatchObject({agent: null, model: null, round: null});
  });
  test('an old ledger without meta columns is migrated in place', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'l.db');
    const {Database} = require('bun:sqlite');
    const old = new Database(path, {create: true});
    old.run(`CREATE TABLE runs (run_id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, source TEXT NOT NULL, goal TEXT NOT NULL,
      at_ms INTEGER NOT NULL, claimed_done INTEGER NOT NULL, pass INTEGER NOT NULL, diff_sha TEXT NOT NULL,
      changed_json TEXT NOT NULL, checks_json TEXT NOT NULL, cost_usd REAL NOT NULL, decision TEXT, decided_ms INTEGER)`);
    old.close();
    const l = openLedger(path);
    l.recordVerdict(v('x', true), {...c, meta: {model: 'opus'}}, true);
    expect(l.run('x')).toMatchObject({model: 'opus'});
  });
});
