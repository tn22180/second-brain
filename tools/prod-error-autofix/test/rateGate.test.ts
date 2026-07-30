import {beforeEach, describe, expect, test} from 'bun:test';
import {buildConfig, type Caps} from '../src/config';
import {checkConcurrency, checkMrCaps, DAY_MS, HOUR_MS, recordMr} from '../src/state/rateGate';
import {Store} from '../src/state/store';

const NOW = 1_753_800_000_000;
const caps: Caps = buildConfig({SLACK_BOT_TOKEN: 'x', SLACK_ERROR_CHANNEL_ID: 'x'}).caps;

let store: Store;

function seed(fingerprint: string, status: 'analyzing' | 'mr_open') {
  store.seenAlert({
    fingerprint,
    appName: 'BLOG',
    repo: 'blogs',
    service: 'api',
    kind: 'app',
    alertTsMs: NOW,
    threadTs: undefined
  });
  store.patchAlert(fingerprint, {status});
}

beforeEach(() => {
  store = new Store(':memory:');
});

describe('concurrency', () => {
  test('idle passes', () => {
    expect(checkConcurrency(store, caps)).toMatchObject({allowed: true, cap: undefined});
  });

  test('one running job fills the default cap and names it', () => {
    seed('a', 'analyzing');
    const v = checkConcurrency(store, caps);
    expect(v.allowed).toBe(false);
    expect(v.cap).toBe('concurrency');
    expect(v.detail).toBe('1/1 job đang chạy');
  });

  test('a finished job frees the slot', () => {
    seed('a', 'analyzing');
    store.patchAlert('a', {status: 'mr_open'});
    expect(checkConcurrency(store, caps).allowed).toBe(true);
  });
});

describe('MR caps', () => {
  test('under both caps passes', () => {
    expect(checkMrCaps(store, caps, 'blogs', NOW)).toMatchObject({allowed: true});
  });

  test('the hourly cap counts across repos', () => {
    for (const repo of ['blogs', 'seo', 'ai-product-copy', 'llm-ai-search-seo', 'avada-image-optimizer']) {
      recordMr(store, repo, NOW - 10 * 60_000);
    }
    const v = checkMrCaps(store, caps, 'blogs', NOW);
    expect(v.allowed).toBe(false);
    expect(v.cap).toBe('mr_per_hour');
    expect(v.detail).toContain('5/5');
  });

  test('MRs older than an hour stop counting', () => {
    for (let i = 0; i < 5; i++) recordMr(store, 'seo', NOW - HOUR_MS - 60_000);
    expect(checkMrCaps(store, caps, 'blogs', NOW).allowed).toBe(true);
  });

  test('the per-repo daily cap is independent of other repos', () => {
    for (let i = 0; i < 3; i++) recordMr(store, 'blogs', NOW - (i + 2) * HOUR_MS);
    const blocked = checkMrCaps(store, caps, 'blogs', NOW);
    expect(blocked).toMatchObject({allowed: false, cap: 'mr_per_repo_per_day'});
    expect(blocked.detail).toContain('blogs');
    expect(checkMrCaps(store, caps, 'seo', NOW).allowed).toBe(true);
  });

  test('the daily window rolls', () => {
    for (let i = 0; i < 3; i++) recordMr(store, 'blogs', NOW - DAY_MS - i * HOUR_MS);
    expect(checkMrCaps(store, caps, 'blogs', NOW).allowed).toBe(true);
  });

  test('the hourly cap is checked before the repo cap', () => {
    // 5 in the hour, of which 3 are for blogs — the hourly cap is the one reported.
    for (let i = 0; i < 3; i++) recordMr(store, 'blogs', NOW - 5 * 60_000);
    for (let i = 0; i < 2; i++) recordMr(store, 'seo', NOW - 5 * 60_000);
    expect(checkMrCaps(store, caps, 'blogs', NOW).cap).toBe('mr_per_hour');
  });
});

describe('what the caps do not block', () => {
  test('a cap verdict carries text for the thread reply and nothing else', () => {
    seed('a', 'analyzing');
    const v = checkConcurrency(store, caps);
    // The gate's whole contract: it reports, the caller still replies.
    expect(Object.keys(v).sort()).toEqual(['allowed', 'cap', 'detail']);
    expect(typeof v.detail).toBe('string');
  });
});
