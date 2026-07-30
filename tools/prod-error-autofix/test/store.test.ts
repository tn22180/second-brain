import {beforeEach, describe, expect, test} from 'bun:test';
import {Store, type SeenAlertInput} from '../src/state/store';

const NOW = 1_753_800_000_000;
const HOUR = 3_600_000;

let store: Store;

function alert(over: Partial<SeenAlertInput> = {}): SeenAlertInput {
  return {
    fingerprint: 'fp1',
    appName: 'BLOG',
    repo: 'blogs',
    service: 'api',
    kind: 'app',
    alertTsMs: NOW,
    threadTs: '1753800000.000100',
    ...over
  };
}

beforeEach(() => {
  store = new Store(':memory:');
});

describe('alerts', () => {
  test('a new fingerprint has no previous row', () => {
    const {previous, current} = store.seenAlert(alert());
    expect(previous).toBeUndefined();
    expect(current).toMatchObject({
      fingerprint: 'fp1',
      appName: 'BLOG',
      repo: 'blogs',
      service: 'api',
      status: 'new',
      recurrenceCount: 1,
      attempts: 0,
      firstThreadTs: '1753800000.000100'
    });
  });

  test('a repeat increments the counter and returns the state before it', () => {
    store.seenAlert(alert());
    store.patchAlert('fp1', {status: 'mr_open', mrUrl: 'https://gitlab.com/x/-/merge_requests/2'});
    const {previous, current} = store.seenAlert(alert({alertTsMs: NOW + HOUR, threadTs: 'later.0002'}));
    expect(previous?.status).toBe('mr_open');
    expect(current.recurrenceCount).toBe(2);
    expect(current.lastSeenMs).toBe(NOW + HOUR);
    // The first thread is the anchor; the pipeline replies to the message in hand.
    expect(current.firstThreadTs).toBe('1753800000.000100');
  });

  test('optional columns come back as undefined, not null', () => {
    const {current} = store.seenAlert(alert({service: undefined, threadTs: undefined}));
    expect(current.service).toBeUndefined();
    expect(current.firstThreadTs).toBeUndefined();
    expect(current.mrUrl).toBeUndefined();
    expect(current.lastRunMs).toBeUndefined();
  });

  test('patch touches only the fields given', () => {
    store.seenAlert(alert());
    store.patchAlert('fp1', {status: 'analyzing', attempts: 1});
    store.patchAlert('fp1', {branch: 'fix/prod-blog-fp1'});
    const row = store.getAlert('fp1')!;
    expect(row).toMatchObject({status: 'analyzing', attempts: 1, branch: 'fix/prod-blog-fp1'});
  });

  test('an empty patch is a no-op rather than invalid SQL', () => {
    store.seenAlert(alert());
    expect(store.patchAlert('fp1', {})?.status).toBe('new');
  });

  test('run and reply stamps are separate', () => {
    store.seenAlert(alert());
    store.markRun('fp1', NOW + 1000);
    store.markReplied('fp1', NOW + 2000);
    expect(store.getAlert('fp1')).toMatchObject({lastRunMs: NOW + 1000, lastReplyMs: NOW + 2000});
  });

  test('activeCount only counts analyzing', () => {
    store.seenAlert(alert({fingerprint: 'a'}));
    store.seenAlert(alert({fingerprint: 'b'}));
    store.seenAlert(alert({fingerprint: 'c'}));
    store.patchAlert('a', {status: 'analyzing'});
    store.patchAlert('b', {status: 'mr_open'});
    expect(store.activeCount()).toBe(1);
    expect(store.alertsByStatus('mr_open').map(r => r.fingerprint)).toEqual(['b']);
  });

  test('recentAlerts is newest first', () => {
    store.seenAlert(alert({fingerprint: 'old', alertTsMs: NOW - HOUR}));
    store.seenAlert(alert({fingerprint: 'new', alertTsMs: NOW}));
    expect(store.recentAlerts(5).map(r => r.fingerprint)).toEqual(['new', 'old']);
  });

  test('survives a reopen of the same file', () => {
    const path = `/tmp/autofix-test-${NOW}-${Math.round(performance.now())}.db`;
    const first = new Store(path);
    first.seenAlert(alert());
    first.close();
    const second = new Store(path);
    expect(second.getAlert('fp1')?.appName).toBe('BLOG');
    second.close();
  });
});

describe('MR rate ledger', () => {
  test('counts by window and by repo', () => {
    store.recordMrEvent('blogs', NOW - 30 * 60_000);
    store.recordMrEvent('blogs', NOW - 2 * HOUR);
    store.recordMrEvent('seo', NOW - 10 * 60_000);
    expect(store.countMrEvents(NOW - HOUR)).toBe(2);
    expect(store.countMrEvents(NOW - HOUR, 'blogs')).toBe(1);
    expect(store.countMrEvents(NOW - 24 * HOUR, 'blogs')).toBe(2);
    expect(store.countMrEvents(NOW - 24 * HOUR, 'joy')).toBe(0);
  });
});

describe('jest baselines', () => {
  test('cached per repo and base sha', () => {
    store.putBaseline('blogs', 'aad0e1df7', ['a.test.js::one', 'b.test.js::two'], NOW);
    expect(store.getBaseline('blogs', 'aad0e1df7')).toEqual(['a.test.js::one', 'b.test.js::two']);
    expect(store.getBaseline('blogs', 'other')).toBeUndefined();
    expect(store.getBaseline('seo', 'aad0e1df7')).toBeUndefined();
  });

  test('re-running the baseline overwrites it', () => {
    store.putBaseline('blogs', 'sha', ['one'], NOW);
    store.putBaseline('blogs', 'sha', [], NOW + 1000);
    expect(store.getBaseline('blogs', 'sha')).toEqual([]);
  });
});

describe('slack cursor and event dedupe', () => {
  test('cursor never rewinds', () => {
    store.setCursor('C1', '1753800000.000100', NOW);
    store.setCursor('C1', '1753700000.000100', NOW + 1000);
    expect(store.getCursor('C1')).toBe('1753800000.000100');
    store.setCursor('C1', '1753900000.000100', NOW + 2000);
    expect(store.getCursor('C1')).toBe('1753900000.000100');
  });

  test('cursor is per channel', () => {
    store.setCursor('C1', '1.1', NOW);
    expect(store.getCursor('C2')).toBeUndefined();
  });

  test('an event id is new exactly once', () => {
    expect(store.markEventSeen('Ev1', NOW)).toBe(true);
    expect(store.markEventSeen('Ev1', NOW + 1)).toBe(false);
    expect(store.markEventSeen('Ev2', NOW)).toBe(true);
  });

  test('pruning drops old ids and lets them be seen again', () => {
    store.markEventSeen('Ev1', NOW - 48 * HOUR);
    store.markEventSeen('Ev2', NOW);
    expect(store.pruneSeenEvents(NOW - 24 * HOUR)).toBe(1);
    expect(store.markEventSeen('Ev1', NOW)).toBe(true);
    expect(store.markEventSeen('Ev2', NOW)).toBe(false);
  });
});
