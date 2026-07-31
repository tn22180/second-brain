import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {markMr} from '../src/cli/commands';
import {knownIncident} from '../src/brain/known';
import {buildConfig, type Config} from '../src/config';
import {Store} from '../src/state/store';

const HEADER = '# Incident index\n\n<!-- LEARN appends below this line -->\n';
const MR = 'https://gitlab.com/avada/blogs/-/merge_requests/789';

describe('markMr', () => {
  let dir: string;
  let cfg: Config;
  let store: Store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autofix-mark-'));
    mkdirSync(join(dir, 'brain', 'incidents'), {recursive: true});
    cfg = buildConfig({
      SLACK_BOT_TOKEN: 'xoxb-1',
      SLACK_ERROR_CHANNEL_ID: 'C1',
      AUTOFIX_BRAIN_ROOT: join(dir, 'brain'),
      AUTOFIX_STATE_DB: join(dir, 'state.db')
    });
    store = new Store(cfg.paths.stateDb);
  });

  afterEach(() => {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  });

  const index = (body: string) => writeFileSync(join(dir, 'brain', 'index.md'), HEADER + body, 'utf8');
  const read = () => readFileSync(join(dir, 'brain', 'index.md'), 'utf8');
  const seed = (fp: string) =>
    store.seenAlert({
      fingerprint: fp,
      appName: 'BLOG',
      repo: 'blogs',
      service: 'api',
      kind: 'app',
      threadTs: '1.1',
      alertTsMs: 1_000
    });

  test('rewrites the existing line in place, keeping app/service/cause', () => {
    index('- `1ph12wf` · 2026-07-30 · BLOG · api · ignores its own page/limit params · — · inconclusive\n');
    const res = markMr(cfg, store, {fingerprint: '1ph12wf', mrUrl: MR, dateIso: '2026-08-01T00:00:00Z'});
    expect(res.ok).toBe(true);

    const known = knownIncident(cfg.paths.brainRoot, '1ph12wf')!;
    expect(known.mrUrl).toBe(MR);
    expect(known.status).toBe('mr_open');
    expect(known.appName).toBe('BLOG');
    expect(known.rootCause).toBe('ignores its own page/limit params');
    // The original sighting date is the fact; today is when it was recorded, not seen.
    expect(known.dateIso).toBe('2026-07-30');
    // One line per fingerprint, always.
    expect(read().split('\n').filter(l => l.includes('1ph12wf'))).toHaveLength(1);
  });

  test('a fingerprint only in the state DB gets a new index line', () => {
    index('');
    seed('newfp');
    const res = markMr(cfg, store, {fingerprint: 'newfp', mrUrl: MR, dateIso: '2026-08-01T12:00:00Z'});
    expect(res.ok).toBe(true);

    const known = knownIncident(cfg.paths.brainRoot, 'newfp')!;
    expect(known.appName).toBe('BLOG');
    expect(known.service).toBe('api');
    expect(known.dateIso).toBe('2026-08-01');
    expect(known.rootCause).toBe('recorded by hand');
    expect(store.getAlert('newfp')!.mrUrl).toBe(MR);
    expect(store.getAlert('newfp')!.status).toBe('mr_open');
  });

  test('--cause overrides what the index said', () => {
    index('- `x1` · 2026-07-30 · BLOG · api · old cause · — · inconclusive\n');
    markMr(cfg, store, {fingerprint: 'x1', mrUrl: MR, cause: 'real\n cause  found', dateIso: '2026-08-01'});
    expect(knownIncident(cfg.paths.brainRoot, 'x1')!.rootCause).toBe('real cause found');
  });

  test('an unknown fingerprint is refused, not invented', () => {
    index('');
    const res = markMr(cfg, store, {fingerprint: 'nope', mrUrl: MR, dateIso: '2026-08-01'});
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('không biết fingerprint nope');
    expect(read()).not.toContain('nope');
  });

  test('a non-url is refused before anything is written', () => {
    index('- `x1` · 2026-07-30 · BLOG · api · c · — · inconclusive\n');
    const res = markMr(cfg, store, {fingerprint: 'x1', mrUrl: '!789', dateIso: '2026-08-01'});
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('không hợp lệ');
    expect(read()).toContain('· — · inconclusive');
  });

  test('the incident record stops contradicting the index', () => {
    index('- `x1` · 2026-07-30 · BLOG · api · c · — · inconclusive\n');
    const path = join(dir, 'brain', 'incidents', 'x1.md');
    writeFileSync(path, '# x1\n\n## Job\n- analyze rounds: 3\n- cost: $1.00\n\n## Verdict\n', 'utf8');
    markMr(cfg, store, {fingerprint: 'x1', mrUrl: MR, dateIso: '2026-08-01'});
    expect(readFileSync(path, 'utf8')).toContain(`- MR: ${MR}`);
  });

  test('an incident that already names an MR is corrected, not duplicated', () => {
    index('- `x1` · 2026-07-30 · BLOG · api · c · — · inconclusive\n');
    const path = join(dir, 'brain', 'incidents', 'x1.md');
    writeFileSync(path, '## Job\n- MR: https://example.com/old\n', 'utf8');
    markMr(cfg, store, {fingerprint: 'x1', mrUrl: MR, dateIso: '2026-08-01'});
    const text = readFileSync(path, 'utf8');
    expect(text).toContain(`- MR: ${MR}`);
    expect(text).not.toContain('example.com/old');
  });

  test('running it twice leaves the same single line — and spends no MR quota', () => {
    index('- `x1` · 2026-07-30 · BLOG · api · c · — · inconclusive\n');
    seed('x1');
    markMr(cfg, store, {fingerprint: 'x1', mrUrl: MR, dateIso: '2026-08-01'});
    const first = read();
    markMr(cfg, store, {fingerprint: 'x1', mrUrl: MR, dateIso: '2026-08-01'});
    expect(read()).toBe(first);
    expect(store.countMrEvents(0)).toBe(0);
  });
});
