import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {recordCandidate} from '../src/agent/learn';
import {buildConfig, type Config} from '../src/config';
import {
  brainBudget,
  dryRun,
  formatBudget,
  formatDryRun,
  formatStatus,
  incidentToMessage,
  listCandidates,
  loadAlertFile,
  promoteCandidate,
  statusReport
} from '../src/cli/commands';
import {Store} from '../src/state/store';

const ROOT = join('/tmp', `autofix-cli-${process.pid}`);
const NOW = 1_753_800_000_000;
let cfg: Config;
let store: Store;

function alertPayload(app = 'BLOG', service = 'api', kind: 'app' | 'infra' = 'app') {
  const message = "[getPreview] Cannot read properties of undefined (reading 'includes')";
  return {
    text: `${kind === 'infra' ? ':warning:' : ':red_circle:'} [${app}] ${message}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔴 *[${app}] ${service}*  ·  \`ERROR\`  ·  _${kind === 'infra' ? 'infra self-heal' : 'app error'}_`
        }
      },
      {type: 'section', text: {type: 'mrkdwn', text: '```' + message + '```'}}
    ]
  };
}

beforeEach(() => {
  rmSync(ROOT, {recursive: true, force: true});
  mkdirSync(join(ROOT, 'brain', 'apps'), {recursive: true});
  writeFileSync(join(ROOT, 'brain', 'CORE.md'), 'core');
  writeFileSync(join(ROOT, 'brain', 'patterns.md'), 'patterns');
  writeFileSync(join(ROOT, 'brain', 'index.md'), '# index\n\n<!-- LEARN appends below this line -->\n');
  for (const app of ['SEO', 'BLOG', 'APC', 'AEO', 'IMG-OPT']) {
    writeFileSync(join(ROOT, 'brain', 'apps', `${app}.md`), `# ${app}\n\n## Incident history\n\nnothing yet\n`);
  }
  cfg = buildConfig({
    SLACK_BOT_TOKEN: 'xoxb-1',
    SLACK_ERROR_CHANNEL_ID: 'C0PROD',
    AUTOFIX_STATE_DB: ':memory:',
    AUTOFIX_BRAIN_ROOT: join(ROOT, 'brain'),
    AUTOFIX_CACHE_ROOT: join(ROOT, 'cache')
  });
  store = new Store(':memory:');
});

afterEach(() => {
  rmSync(ROOT, {recursive: true, force: true});
});

describe('status', () => {
  test('an empty store reports idle, not an error', () => {
    const text = formatStatus(statusReport(cfg, store, NOW));
    expect(text).toContain('0/1 job đang chạy');
    expect(text).toContain('MR: 0/5 trong 1h');
    expect(text).toContain('chưa có alert nào');
  });

  test('caps and queue reflect the store', () => {
    store.seenAlert({fingerprint: 'a', appName: 'BLOG', repo: 'blogs', service: 'api', kind: 'app', alertTsMs: NOW, threadTs: undefined});
    store.patchAlert('a', {status: 'analyzing'});
    store.recordMrEvent('blogs', NOW - 60_000);
    store.recordMrEvent('seo', NOW - 60_000);
    const report = statusReport(cfg, store, NOW);
    expect(report.active).toBe(1);
    expect(report.mrLastHour).toBe(2);
    expect(report.mrPerRepoToday).toEqual([
      {repo: 'seo', count: 1},
      {repo: 'blogs', count: 1}
    ]);
    expect(formatStatus(report)).toContain('blogs 1/3');
  });

  test('things waiting on a human are surfaced', () => {
    store.seenAlert({fingerprint: 'h', appName: 'SEO', repo: 'seo', service: 'api', kind: 'app', alertTsMs: NOW, threadTs: undefined});
    store.patchAlert('h', {status: 'needs_human'});
    expect(formatStatus(statusReport(cfg, store, NOW))).toContain('cần người xem: 1');
  });
});

describe('dry-run', () => {
  test('resolves the app, the fingerprint and the brain slice without calling anything', () => {
    const report = dryRun(cfg, store, alertPayload());
    expect(report).toMatchObject({
      parsed: true,
      appName: 'BLOG',
      inRegistry: true,
      repo: 'blogs',
      prodProject: 'avada-blog-app',
      defaultBranch: 'master',
      service: 'api',
      kind: 'app',
      source: 'blocks',
      known: false
    });
    expect(report.brainTokens).toBeGreaterThan(0);
    expect(report.brainSections).toEqual(['CORE', 'patterns', 'app:BLOG', 'index']);
  });

  test('AEO shows main, which is the trap this command exists to catch early', () => {
    expect(dryRun(cfg, store, alertPayload('AEO')).defaultBranch).toBe('main');
  });

  test('an app out of scope is called out, with what is covered', () => {
    const report = dryRun(cfg, store, alertPayload('JOY'));
    expect(report.inRegistry).toBe(false);
    expect(formatDryRun(report, {showPrompt: false})).toContain('KHÔNG có trong registry');
  });

  test('a known fingerprint shows its status', () => {
    const first = dryRun(cfg, store, alertPayload());
    store.seenAlert({
      fingerprint: first.fingerprint!,
      appName: 'BLOG',
      repo: 'blogs',
      service: 'api',
      kind: 'app',
      alertTsMs: NOW,
      threadTs: undefined
    });
    store.patchAlert(first.fingerprint!, {status: 'mr_open'});
    const again = dryRun(cfg, store, alertPayload());
    expect(again.known).toBe(true);
    expect(formatDryRun(again, {showPrompt: false})).toContain('đã biết, status mr_open');
  });

  test('an infra alert is flagged as report-only', () => {
    const report = dryRun(cfg, store, alertPayload('SEO', 'api', 'infra'));
    expect(formatDryRun(report, {showPrompt: false})).toContain('KHÔNG mở MR');
  });

  test('--prompt shows the slice that would be sent', () => {
    const text = formatDryRun(dryRun(cfg, store, alertPayload()), {showPrompt: true});
    expect(text).toContain('--- brain slice ---');
    expect(text).toContain('core');
  });

  test('chatter is reported as not an alert', () => {
    expect(formatDryRun(dryRun(cfg, store, {text: 'deploy done'}), {showPrompt: false})).toContain('không phải alert');
  });
});

describe('loadAlertFile', () => {
  test('accepts a plain text alert', () => {
    const path = join(ROOT, 'a.txt');
    writeFileSync(path, ':red_circle: [BLOG] boom\n');
    expect(loadAlertFile(path).text).toBe(':red_circle: [BLOG] boom');
  });

  test('accepts a bare {text, blocks} object', () => {
    const path = join(ROOT, 'a.json');
    writeFileSync(path, JSON.stringify(alertPayload()));
    const loaded = loadAlertFile(path);
    expect(loaded.text).toContain('[BLOG]');
    expect(Array.isArray(loaded.blocks)).toBe(true);
  });

  test('accepts a Slack event envelope, so a copied payload works unedited', () => {
    const path = join(ROOT, 'ev.json');
    writeFileSync(path, JSON.stringify({type: 'event_callback', event: alertPayload()}));
    expect(loadAlertFile(path).text).toContain('[BLOG]');
  });
});

describe('brain budget', () => {
  test('reports every app and flags nothing when all fit', () => {
    const rows = brainBudget(cfg);
    expect(rows.map(r => r.app)).toEqual(['SEO', 'BLOG', 'APC', 'AEO', 'IMG-OPT']);
    expect(rows.every(r => !r.over)).toBe(true);
    expect(formatBudget(rows)).toContain('lớn nhất');
  });

  test('an oversized app file is flagged as over', () => {
    writeFileSync(join(ROOT, 'brain', 'apps', 'BLOG.md'), 'x'.repeat(40_000));
    const rows = brainBudget(cfg);
    expect(rows.find(r => r.app === 'BLOG')!.over).toBe(true);
    expect(formatBudget(rows)).toContain('OVER');
  });
});

describe('candidates', () => {
  function candidate(fingerprint: string, claim = 'proxy handlers never validate query params') {
    return recordCandidate({brainRoot: join(ROOT, 'brain')}, {app: 'BLOG', claim, fingerprint});
  }

  test('one sighting is not promotable', () => {
    candidate('fp1');
    expect(listCandidates(cfg)).toContain('seen 1×');
    const res = promoteCandidate(cfg, 1, false);
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('cần 2 fingerprint');
  });

  test('the same claim from the same fingerprint does not raise the count', () => {
    candidate('fp1');
    const again = candidate('fp1');
    expect(again.seen).toBe(1);
  });

  test('a second fingerprint makes it promotable', () => {
    candidate('fp1');
    const second = candidate('fp2');
    expect(second.seen).toBe(2);
    expect(second.readyToPromote).toBe(true);
    expect(listCandidates(cfg)).toContain('promote được');
  });

  test('promoting moves it into the app file and out of candidates', () => {
    candidate('fp1');
    candidate('fp2');
    const res = promoteCandidate(cfg, 1, false);
    expect(res.ok).toBe(true);
    const appText = readFileSync(join(ROOT, 'brain', 'apps', 'BLOG.md'), 'utf8');
    expect(appText).toContain('## Learned');
    expect(appText).toContain('never validate query params');
    expect(appText).toContain('seen 2×');
    // And it must not still be pending.
    expect(listCandidates(cfg)).toContain('chưa có candidate nào');
  });

  test('--force overrides the two-sighting rule', () => {
    candidate('fp1');
    expect(promoteCandidate(cfg, 1, true).ok).toBe(true);
  });

  test('a candidate index that does not exist is refused', () => {
    candidate('fp1');
    expect(promoteCandidate(cfg, 9, true).detail).toContain('không có candidate #9');
  });

  test('separate claims stay separate', () => {
    candidate('fp1', 'claim one');
    candidate('fp2', 'claim two');
    const listing = listCandidates(cfg);
    expect(listing).toContain('claim one');
    expect(listing).toContain('claim two');
  });
});

describe('replay', () => {
  test('an incident is rebuilt into a message the pipeline can parse', () => {
    mkdirSync(join(ROOT, 'brain', 'incidents'), {recursive: true});
    writeFileSync(
      join(ROOT, 'brain', 'incidents', 'fp1.md'),
      ['fingerprint: fp1', 'service: api', 'message: boom at position 42', 'app: BLOG', ''].join('\n')
    );
    const message = incidentToMessage(cfg, 'fp1', 'C0PROD')!;
    expect(message.channel).toBe('C0PROD');
    const report = dryRun(cfg, store, {text: message.text, blocks: message.blocks});
    expect(report).toMatchObject({parsed: true, appName: 'BLOG', service: 'api', repo: 'blogs'});
  });

  test('an infra incident is rebuilt as infra', () => {
    mkdirSync(join(ROOT, 'brain', 'incidents'), {recursive: true});
    writeFileSync(
      join(ROOT, 'brain', 'incidents', 'fp2.md'),
      ['fingerprint: fp2', 'service: api', 'message: Memory limit exceeded', 'app: SEO', '', 'infra class, not auto-fixed'].join('\n')
    );
    const message = incidentToMessage(cfg, 'fp2', 'C0PROD')!;
    expect(dryRun(cfg, store, {text: message.text, blocks: message.blocks}).kind).toBe('infra');
  });

  test('a missing incident yields undefined rather than a fabricated alert', () => {
    expect(incidentToMessage(cfg, 'nope', 'C0PROD')).toBeUndefined();
  });
});
