import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildConfig, type Config} from '../src/config';
import type {RunResult, Runner} from '../src/gcloud/run';
import {Store} from '../src/state/store';
import {signatureFromBrain, sweepVerify} from '../src/verify/sweep';
import {MIN_AFTER_MS} from '../src/verify/recurrence';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-08-04T00:00:00.000Z');
const MERGED = NOW - 72 * HOUR;
const DEPLOYED = NOW - 48 * HOUR;

let ROOT: string;
let store: Store;
let cfg: Config;
let ran: string[][];

function makeCfg(): Config {
  return buildConfig({
    SLACK_BOT_TOKEN: 'xoxb-1',
    SLACK_ERROR_CHANNEL_ID: 'C0PROD',
    AUTOFIX_STATE_DB: ':memory:',
    AUTOFIX_CACHE_ROOT: join(ROOT, 'cache'),
    AUTOFIX_BRAIN_ROOT: join(ROOT, 'brain'),
    AUTOFIX_REPOS_ROOT: join(ROOT, 'repos')
  });
}

interface ScriptOptions {
  merged?: boolean;
  mergedAtMs?: number;
  /** undefined models a Cloud Run job or an unreadable deploy. */
  deployedAtMs?: number | undefined;
  /** Full revision history, oldest first. Takes precedence over `deployedAtMs`. */
  revisions?: number[];
  /** Counts returned for the after-window then the before-window, in call order. */
  counts?: number[];
  countFails?: boolean;
  fetchFails?: boolean;
}

function script(opts: ScriptOptions = {}): Runner {
  const counts = [...(opts.counts ?? [0, 10])];
  return async args => {
    ran.push(args);
    const joined = args.join(' ');
    const ok = (stdout = '', code = 0, stderr = ''): RunResult => ({code, stdout, stderr, timedOut: false});

    if (joined.includes('logging read')) {
      if (opts.countFails) return ok('', 1, 'ERROR: (gcloud.logging.read) PERMISSION_DENIED');
      const n = counts.shift() ?? 0;
      return ok(Array.from({length: n}, (_, i) => `insert-${i}`).join('\n'));
    }
    if (joined.includes('functions describe')) {
      return opts.deployedAtMs === undefined
        ? ok('', 1, 'ERROR: NOT_FOUND')
        : ok(new Date(opts.deployedAtMs).toISOString());
    }
    if (joined.includes('revisions list')) {
      if (opts.revisions) return ok(opts.revisions.map(ms => new Date(ms).toISOString()).join('\n'));
      return opts.deployedAtMs === undefined ? ok('') : ok(new Date(opts.deployedAtMs).toISOString());
    }
    if (joined.includes('run jobs describe')) return ok('4');
    if (joined.includes('git') && joined.includes(' fetch ')) {
      return opts.fetchFails ? ok('', 1, 'fatal: could not read from remote repository') : ok();
    }
    if (joined.includes('cat-file')) return ok();
    if (joined.includes('merge-base --is-ancestor')) return ok('', opts.merged === false ? 1 : 0);
    if (joined.includes('ls-remote')) return ok('');
    if (joined.includes('rev-list')) return ok('landedsha1\n');
    if (joined.includes('show -s')) return ok(new Date(opts.mergedAtMs ?? MERGED).toISOString());
    return ok();
  };
}

function seedRow(over: {fingerprint?: string; signature?: string | null; service?: string; status?: string} = {}) {
  const fp = over.fingerprint ?? 'aaa111';
  store.seenAlert({
    fingerprint: fp,
    appName: 'BLOG',
    repo: 'blogs',
    service: over.service ?? 'api',
    kind: 'app',
    alertTsMs: MERGED - HOUR,
    threadTs: '1.1',
    signature: over.signature === null ? undefined : (over.signature ?? 'HTTP 500 POST /proxy/save404')
  });
  store.patchAlert(fp, {
    status: (over.status ?? 'mr_open') as 'mr_open',
    fixSha: 'fixsha5678',
    branch: `fix/prod-blog-${fp}`,
    mrUrl: 'https://gitlab.com/avada/blogs/-/merge_requests/999'
  });
  return fp;
}

function deps(runner: Runner) {
  return {cfg, store, now: () => NOW, runner, log: () => {}};
}

beforeEach(() => {
  ROOT = mkdtempSync(join(tmpdir(), 'sweep-'));
  mkdirSync(join(ROOT, 'repos', 'blogs'), {recursive: true});
  mkdirSync(join(ROOT, 'brain', 'incidents'), {recursive: true});
  cfg = makeCfg();
  store = new Store(cfg.paths.stateDb);
  ran = [];
});

afterEach(() => {
  store.close();
  rmSync(ROOT, {recursive: true, force: true});
});

describe('alertsPendingVerify', () => {
  test('picks up only rows with a pushed fix', () => {
    seedRow({fingerprint: 'withfix'});
    store.seenAlert({
      fingerprint: 'nofix',
      appName: 'BLOG',
      repo: 'blogs',
      service: 'api',
      kind: 'app',
      alertTsMs: NOW,
      threadTs: '1.2',
      signature: 'boom'
    });
    store.patchAlert('nofix', {status: 'mr_open'});
    expect(store.alertsPendingVerify().map(r => r.fingerprint)).toEqual(['withfix']);
  });

  test('leaves a verified row alone — it is terminal', () => {
    const fp = seedRow();
    store.patchAlert(fp, {status: 'fix_verified'});
    expect(store.alertsPendingVerify()).toHaveLength(0);
  });
});

describe('sweepVerify', () => {
  test('zero after a real baseline verifies the fix and writes the status', async () => {
    const fp = seedRow();
    const report = await sweepVerify(deps(script({deployedAtMs: DEPLOYED, counts: [0, 441]})), {apply: true});
    expect(report.rows[0]!.verdict).toBe('verified');
    expect(report.rows[0]!.after).toBe(0);
    expect(report.rows[0]!.before).toBe(441);
    expect(store.getAlert(fp)!.status).toBe('fix_verified');
    expect(store.getAlert(fp)!.verdict).toBe('verified');
    expect(store.getAlert(fp)!.verifiedAtMs).toBe(NOW);
  });

  test('still firing after the deploy sets fix_failed, which routes the next alert to a re-run', async () => {
    const fp = seedRow();
    const report = await sweepVerify(deps(script({deployedAtMs: DEPLOYED, counts: [380, 441]})), {apply: true});
    expect(report.rows[0]!.verdict).toBe('regressed');
    expect(store.getAlert(fp)!.status).toBe('fix_failed');
  });

  test('a 99% cut leaves the status alone', async () => {
    const fp = seedRow();
    const report = await sweepVerify(deps(script({deployedAtMs: DEPLOYED, counts: [3, 441]})), {apply: true});
    expect(report.rows[0]!.verdict).toBe('improved');
    // Filing this as failed would spend an Opus re-analysis on a fix that mostly worked.
    expect(store.getAlert(fp)!.status).toBe('mr_open');
    expect(store.getAlert(fp)!.verdict).toBe('improved');
  });

  test('silence with no baseline is unproven, not verified', async () => {
    const fp = seedRow();
    const report = await sweepVerify(deps(script({deployedAtMs: DEPLOYED, counts: [0, 1]})), {apply: true});
    expect(report.rows[0]!.verdict).toBe('unproven');
    expect(store.getAlert(fp)!.status).toBe('mr_open');
  });

  test('without --apply nothing is written', async () => {
    const fp = seedRow();
    const report = await sweepVerify(deps(script({deployedAtMs: DEPLOYED, counts: [0, 441]})), {apply: false});
    expect(report.rows[0]!.verdict).toBe('verified');
    expect(store.getAlert(fp)!.status).toBe('mr_open');
    expect(store.getAlert(fp)!.verdict).toBeUndefined();
  });

  test('an unmerged MR is never judged and costs no log read', async () => {
    const fp = seedRow();
    const report = await sweepVerify(deps(script({merged: false})), {apply: true});
    expect(report.rows[0]!.verdict).toBe('not_merged');
    expect(ran.some(a => a.join(' ').includes('logging read'))).toBe(false);
    expect(store.getAlert(fp)!.status).toBe('mr_open');
  });

  test('merged but not deployed stops before the count', async () => {
    const fp = seedRow();
    const report = await sweepVerify(deps(script({deployedAtMs: undefined})), {apply: true});
    expect(report.rows[0]!.verdict).toBe('not_deployed');
    expect(ran.some(a => a.join(' ').includes('logging read'))).toBe(false);
    expect(store.getAlert(fp)!.status).toBe('mr_open');
  });

  test('a Cloud Run job stays not_deployed — its generation is not a deploy time', async () => {
    const fp = seedRow({fingerprint: 'jobrow', service: 'job:dailysync'});
    const report = await sweepVerify(deps(script({deployedAtMs: DEPLOYED, counts: [0, 441]})), {
      apply: true,
      only: fp
    });
    expect(report.rows[0]!.verdict).toBe('not_deployed');
    expect(ran.some(a => a.join(' ').includes('run jobs describe'))).toBe(true);
  });

  test('a deploy inside the settling window reports too_soon', async () => {
    seedRow();
    const report = await sweepVerify(
      deps(script({deployedAtMs: NOW - (MIN_AFTER_MS - HOUR), counts: [0, 441]})),
      {apply: true}
    );
    expect(report.rows[0]!.verdict).toBe('too_soon');
  });

  test('an unreachable git remote is probe_failed, never a verdict about the fix', async () => {
    const fp = seedRow();
    const report = await sweepVerify(deps(script({fetchFails: true})), {apply: true});
    expect(report.rows[0]!.verdict).toBe('probe_failed');
    expect(store.getAlert(fp)!.status).toBe('mr_open');
  });

  test('a failed log read never reads as zero occurrences', async () => {
    // The failure mode this guards: a permission error returning an empty stdout,
    // being counted as 0, and closing the incident as fixed.
    const fp = seedRow();
    const report = await sweepVerify(deps(script({deployedAtMs: DEPLOYED, countFails: true})), {apply: true});
    expect(report.rows[0]!.verdict).toBe('count_failed');
    expect(store.getAlert(fp)!.status).toBe('mr_open');
  });

  test('a message with no stable literal is reported, not guessed at', async () => {
    const fp = seedRow({signature: '7f3a1b2c-1111-2222-3333-444455556666'});
    const report = await sweepVerify(deps(script({deployedAtMs: DEPLOYED, counts: [0, 441]})), {apply: true});
    expect(report.rows[0]!.verdict).toBe('no_signature');
    expect(store.getAlert(fp)!.status).toBe('mr_open');
  });

  test('the two reads cover the after-window and the pre-merge window', async () => {
    seedRow();
    await sweepVerify(deps(script({deployedAtMs: DEPLOYED, counts: [0, 441]})), {apply: true});
    const reads = ran.filter(a => a.join(' ').includes('logging read')).map(a => a[3]!);
    expect(reads).toHaveLength(2);
    expect(reads[0]).toContain(`timestamp>="${new Date(DEPLOYED).toISOString()}"`);
    expect(reads[1]).toContain(`timestamp<="${new Date(MERGED).toISOString()}"`);
    // Both must count the same thing, or the comparison is meaningless.
    expect(reads[0]).toContain('textPayload:"POST /proxy/save404"');
    expect(reads[1]).toContain('textPayload:"POST /proxy/save404"');
  });

  test('a later unrelated redeploy does not shorten the after-window', async () => {
    // The live miss on 2026-08-04: proxygen2 had 1000+ before and 0 after, and an
    // unrelated revision at 02:27 that day left it reporting `too_soon`.
    seedRow();
    const fixRevision = MERGED + HOUR;
    const report = await sweepVerify(
      deps(script({revisions: [MERGED - 5 * HOUR, fixRevision, NOW - HOUR], counts: [0, 441]})),
      {apply: true}
    );
    expect(report.rows[0]!.verdict).toBe('verified');
    const reads = ran.filter(a => a.join(' ').includes('logging read')).map(a => a[3]!);
    expect(reads[0]).toContain(`timestamp>="${new Date(fixRevision).toISOString()}"`);
  });

  test('no revision since the merge means the fix is not out', async () => {
    seedRow();
    const report = await sweepVerify(deps(script({revisions: [MERGED - 5 * HOUR, MERGED - HOUR]})), {
      apply: true
    });
    expect(report.rows[0]!.verdict).toBe('not_deployed');
  });

  test('--fp narrows the sweep to one fingerprint', async () => {
    seedRow({fingerprint: 'aaa111'});
    seedRow({fingerprint: 'bbb222'});
    const report = await sweepVerify(deps(script({deployedAtMs: DEPLOYED, counts: [0, 441]})), {
      apply: false,
      only: 'bbb222'
    });
    expect(report.checked).toBe(1);
    expect(report.rows[0]!.fingerprint).toBe('bbb222');
  });
});

describe('signature backfill', () => {
  test('recovers the message from the incident file for a row written before the column existed', async () => {
    const fp = seedRow({signature: null});
    writeFileSync(
      join(ROOT, 'brain', 'incidents', `${fp}.md`),
      `fingerprint: ${fp}\nservice: api\nmessage: Not allowed content type\napp: BLOG\n\n# body\n`
    );
    expect(signatureFromBrain(join(ROOT, 'brain'), fp)).toBe('Not allowed content type');

    const report = await sweepVerify(deps(script({deployedAtMs: DEPLOYED, counts: [0, 441]})), {apply: true});
    expect(report.rows[0]!.verdict).toBe('verified');
    expect(report.rows[0]!.token).toBe('Not allowed content type');
    // Recovered once, then kept, so the next sweep does not re-read the file.
    expect(store.getAlert(fp)!.signature).toBe('Not allowed content type');
  });

  test('no stored message and no incident file means no verdict', async () => {
    seedRow({signature: null});
    const report = await sweepVerify(deps(script({deployedAtMs: DEPLOYED, counts: [0, 441]})), {apply: true});
    expect(report.rows[0]!.verdict).toBe('no_signature');
  });
});

describe('seenAlert signature', () => {
  test('the first occurrence wins so the filter does not drift between sweeps', () => {
    const base = {
      fingerprint: 'drift1',
      appName: 'BLOG',
      repo: 'blogs',
      service: 'api',
      kind: 'app' as const,
      threadTs: undefined
    };
    store.seenAlert({...base, alertTsMs: NOW, signature: 'HTTP 500 POST /proxy/save404'});
    store.seenAlert({...base, alertTsMs: NOW + 1000, signature: 'HTTP 502 POST /proxy/save404'});
    expect(store.getAlert('drift1')!.signature).toBe('HTTP 500 POST /proxy/save404');
  });
});
