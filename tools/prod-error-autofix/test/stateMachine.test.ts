import {describe, expect, test} from 'bun:test';
import {
  decide,
  INCONCLUSIVE_RETRY_MS,
  type AlertRecord,
  type AlertStatus,
  type DecideInput,
  type DeployProbe
} from '../src/state/stateMachine';

const NOW = 1_753_800_000_000;
const HOUR = 3_600_000;

function record(over: Partial<AlertRecord> = {}): AlertRecord {
  return {
    fingerprint: 'abc123',
    status: 'mr_open',
    attempts: 1,
    lastReplyMs: undefined,
    lastRunMs: undefined,
    mrUrl: 'https://gitlab.com/avada/blogs/-/merge_requests/1',
    fixSha: 'deadbeef',
    ...over
  };
}

function input(over: Partial<DecideInput> = {}): DecideInput {
  return {
    existing: undefined,
    kind: 'app',
    alertTsMs: NOW,
    nowMs: NOW,
    probe: undefined,
    maxFixAttempts: 3,
    replyCooldownMs: 24 * HOUR,
    inconclusiveRetryMs: INCONCLUSIVE_RETRY_MS,
    ...over
  };
}

describe('first sighting', () => {
  test('an app error runs the pipeline and may open an MR', () => {
    expect(decide(input())).toMatchObject({
      run: true,
      allowMr: true,
      reply: true,
      attempt: 1,
      nextStatus: 'analyzing',
      reason: 'first_seen'
    });
  });

  test('an infra error is analysed and reported but never auto-fixed', () => {
    expect(decide(input({kind: 'infra'}))).toMatchObject({
      run: true,
      allowMr: false,
      reply: true,
      nextStatus: 'infra',
      reason: 'infra_no_autofix'
    });
  });
});

describe('repeat alert while a fix is in flight', () => {
  test('a job already running is counted, not duplicated, and stays silent', () => {
    expect(decide(input({existing: record({status: 'analyzing'})}))).toMatchObject({
      run: false,
      allowMr: false,
      reply: false,
      reason: 'job_in_flight'
    });
  });

  test('MR open and unmerged: one reply, no rerun', () => {
    const probe: DeployProbe = {merged: false, mergedAtMs: undefined, deployedAtMs: undefined};
    expect(decide(input({existing: record(), probe}))).toMatchObject({
      run: false,
      reply: true,
      nextStatus: 'mr_open',
      reason: 'mr_open_unmerged'
    });
  });

  test('merged but prod has no newer revision: awaiting deploy', () => {
    const probe: DeployProbe = {merged: true, mergedAtMs: NOW - 2 * HOUR, deployedAtMs: NOW - 3 * HOUR};
    expect(decide(input({existing: record(), probe}))).toMatchObject({
      run: false,
      nextStatus: 'awaiting_deploy',
      reason: 'awaiting_deploy'
    });
  });

  test('merged with no deploy timestamp at all is awaiting deploy, not a failure', () => {
    const probe: DeployProbe = {merged: true, mergedAtMs: NOW - HOUR, deployedAtMs: undefined};
    expect(decide(input({existing: record(), probe}))).toMatchObject({reason: 'awaiting_deploy'});
  });

  test('an unreachable probe never reads as a failed fix', () => {
    expect(decide(input({existing: record(), probe: undefined}))).toMatchObject({
      run: false,
      nextStatus: 'mr_open',
      reason: 'merge_state_unknown'
    });
  });

  test('an alert that predates the deploy proves nothing about the fix', () => {
    const probe: DeployProbe = {merged: true, mergedAtMs: NOW - 3 * HOUR, deployedAtMs: NOW - HOUR};
    expect(decide(input({existing: record(), probe, alertTsMs: NOW - 2 * HOUR}))).toMatchObject({
      run: false,
      reason: 'alert_predates_deploy'
    });
  });
});

describe('the fix shipped and the error survived', () => {
  const shipped: DeployProbe = {merged: true, mergedAtMs: NOW - 3 * HOUR, deployedAtMs: NOW - 2 * HOUR};

  test('merged < deployed < alert reruns with the attempt bumped', () => {
    expect(decide(input({existing: record({attempts: 1}), probe: shipped, alertTsMs: NOW - HOUR}))).toMatchObject({
      run: true,
      allowMr: true,
      attempt: 2,
      nextStatus: 'analyzing',
      reason: 'fix_shipped_still_failing'
    });
  });

  test('the ordering is strict — only the full triple triggers a rerun', () => {
    const reasons = [
      // deployed before merged
      {probe: {merged: true, mergedAtMs: NOW - HOUR, deployedAtMs: NOW - 2 * HOUR}, alertTsMs: NOW},
      // alert before deploy
      {probe: shipped, alertTsMs: NOW - 3 * HOUR},
      // not merged
      {probe: {merged: false, mergedAtMs: undefined, deployedAtMs: undefined}, alertTsMs: NOW}
    ].map(o => decide(input({existing: record(), ...o})).reason);
    expect(reasons).toEqual(['awaiting_deploy', 'alert_predates_deploy', 'mr_open_unmerged']);
  });

  test('attempts run out and it becomes a human problem', () => {
    const d = decide(input({existing: record({attempts: 3}), probe: shipped, alertTsMs: NOW - HOUR}));
    expect(d).toMatchObject({run: false, reply: true, nextStatus: 'needs_human', reason: 'attempts_exhausted'});
  });

  test('needs_human stops replying entirely', () => {
    expect(decide(input({existing: record({status: 'needs_human'})}))).toMatchObject({
      run: false,
      reply: false,
      reason: 'needs_human'
    });
  });
});

describe('reply cooldown', () => {
  test('a second alert inside the window is counted silently', () => {
    const existing = record({lastReplyMs: NOW - HOUR});
    const probe: DeployProbe = {merged: false, mergedAtMs: undefined, deployedAtMs: undefined};
    expect(decide(input({existing, probe})).reply).toBe(false);
  });

  test('past the window it speaks again', () => {
    const existing = record({lastReplyMs: NOW - 25 * HOUR});
    const probe: DeployProbe = {merged: false, mergedAtMs: undefined, deployedAtMs: undefined};
    expect(decide(input({existing, probe})).reply).toBe(true);
  });

  test('a rerun always replies, cooldown or not', () => {
    const existing = record({status: 'deferred', lastReplyMs: NOW - 60_000});
    expect(decide(input({existing})).reply).toBe(true);
  });
});

describe('inconclusive and blocked', () => {
  test('inconclusive waits a day before a second look', () => {
    const existing = record({status: 'inconclusive', lastRunMs: NOW - HOUR});
    expect(decide(input({existing}))).toMatchObject({run: false, reason: 'inconclusive_cooldown'});
  });

  test('after a day it retries once with the attempt bumped', () => {
    const existing = record({status: 'inconclusive', attempts: 1, lastRunMs: NOW - 25 * HOUR});
    expect(decide(input({existing}))).toMatchObject({
      run: true,
      attempt: 2,
      reason: 'inconclusive_retry'
    });
  });

  test('blocked retries on the next alert — nothing was spent', () => {
    const existing = record({status: 'blocked', attempts: 0});
    expect(decide(input({existing}))).toMatchObject({run: true, attempt: 1, reason: 'retry_after_block'});
  });

  test('deferred tries for the MR again', () => {
    expect(decide(input({existing: record({status: 'deferred'})}))).toMatchObject({
      run: true,
      allowMr: true,
      reason: 'retry_after_defer'
    });
  });

  test('an infra fingerprint never regains MR rights on any path', () => {
    const paths: AlertStatus[] = ['inconclusive', 'blocked', 'deferred', 'new'];
    for (const status of paths) {
      const existing = record({status, lastRunMs: NOW - 30 * HOUR});
      expect(decide(input({existing, kind: 'infra'})).allowMr).toBe(false);
    }
  });

  test('unknown_app is reported, never run', () => {
    expect(decide(input({existing: record({status: 'unknown_app'})}))).toMatchObject({
      run: false,
      reason: 'unknown_app'
    });
  });
});

describe('exhaustiveness', () => {
  test('every status produces a decision', () => {
    const statuses: AlertStatus[] = [
      'new',
      'analyzing',
      'mr_open',
      'awaiting_deploy',
      'fix_failed',
      'inconclusive',
      'infra',
      'needs_human',
      'blocked',
      'unknown_app',
      'deferred'
    ];
    for (const status of statuses) {
      const d = decide(input({existing: record({status})}));
      expect(typeof d.reason).toBe('string');
      expect(typeof d.run).toBe('boolean');
    }
  });
});
