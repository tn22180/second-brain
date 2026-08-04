import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {delimiter, join} from 'node:path';
import {buildConfig, type Config} from '../src/config';
import type {RunResult, Runner} from '../src/gcloud/run';
import {appNames} from '../src/registry';
import {doctor, formatDoctor, requiredEnvKeys, type CheckStatus} from '../src/setup/doctor';
import {initInstall} from '../src/setup/init';
import {daemonPath, renderPlist, resolvePlistInput, xmlEscape} from '../src/setup/plist';

let ROOT: string;

beforeEach(() => {
  ROOT = mkdtempSync(join(tmpdir(), 'autofix-setup-'));
  mkdirSync(join(ROOT, 'project'), {recursive: true});
});

afterEach(() => {
  rmSync(ROOT, {recursive: true, force: true});
});

describe('renderPlist', () => {
  const base = {
    label: 'com.avada.prod-error-autofix',
    bunBin: '/Users/x/.bun/bin/bun',
    entrypoint: '/srv/autofix/bin/autofix.ts',
    workingDirectory: '/srv/autofix',
    home: '/Users/x',
    path: '/a:/b',
    logDir: '/Users/x/.cache/prod-autofix',
    serviceAccount: undefined
  };

  test('the daemon is started with `daemon`, not with a bare entrypoint', () => {
    const p = renderPlist(base);
    expect(p).toContain('<string>/srv/autofix/bin/autofix.ts</string>');
    expect(p).toContain('<string>daemon</string>');
  });

  test('logs go beside the state, under the cache root', () => {
    const p = renderPlist(base);
    expect(p).toContain('<string>/Users/x/.cache/prod-autofix/daemon.log</string>');
    expect(p).toContain('<string>/Users/x/.cache/prod-autofix/daemon.err.log</string>');
  });

  test('KeepAlive and a throttle, so a bad config does not become an API flood', () => {
    const p = renderPlist(base);
    expect(p).toContain('<key>KeepAlive</key>');
    expect(p).toContain('<integer>60</integer>');
  });

  test('the service account is omitted entirely when there is none', () => {
    expect(renderPlist(base)).not.toContain('CLOUDSDK_CORE_ACCOUNT');
  });

  test('the service account is pinned per-job when given', () => {
    const p = renderPlist({...base, serviceAccount: 'bot@proj.iam.gserviceaccount.com'});
    expect(p).toContain('<key>CLOUDSDK_CORE_ACCOUNT</key>');
    expect(p).toContain('<string>bot@proj.iam.gserviceaccount.com</string>');
  });

  test('a path with an ampersand does not produce broken XML', () => {
    // A home directory with `&` in it would otherwise make launchd reject the file.
    const p = renderPlist({...base, home: '/Users/a&b'});
    expect(p).toContain('<string>/Users/a&amp;b</string>');
  });

  test('xmlEscape does not double-escape', () => {
    expect(xmlEscape('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });
});

describe('daemonPath', () => {
  test('the binaries the daemon cannot start without come first', () => {
    const p = daemonPath({toolPaths: ['/opt/bun/bin/bun', '/usr/bin/git'], home: '/Users/x'});
    expect(p.split(delimiter)[0]).toBe('/opt/bun/bin');
  });

  test('no duplicates, and the launchd fallbacks are always present', () => {
    const dirs = daemonPath({toolPaths: ['/usr/bin/git', '/usr/bin/npx'], home: '/Users/x'}).split(delimiter);
    expect(dirs.length).toBe(new Set(dirs).size);
    // launchd starts with a minimal environment; git and gcloud live in these.
    expect(dirs).toContain('/opt/homebrew/bin');
    expect(dirs).toContain('/usr/local/bin');
    expect(dirs).toContain('/Users/x/.bun/bin');
  });

  test('carries only tool directories, never the caller shell PATH', () => {
    // Generating from process.env.PATH baked Claude Code plugin cache dirs — pinned to
    // versions that will be gone in a month — into a plist meant to run untouched.
    const dirs = daemonPath({toolPaths: ['/opt/bun/bin/bun'], home: '/Users/x'}).split(delimiter);
    expect(dirs.some(d => d.includes('plugins/cache'))).toBe(false);
    expect(dirs.some(d => d.includes('cryptexd'))).toBe(false);
  });

  test('survives having resolved nothing', () => {
    expect(daemonPath({toolPaths: [], home: '/Users/x'})).toContain('/usr/bin');
  });
});

describe('resolvePlistInput', () => {
  test('entrypoint and working directory are derived from the project root', () => {
    const r = resolvePlistInput({
      projectRoot: '/srv/autofix',
      cacheRoot: '/var/cache/autofix',
      label: 'com.x.y',
      serviceAccount: undefined,
      env: {HOME: '/Users/x', PATH: '/usr/bin'},
      bunBin: '/opt/bun/bin/bun',
      toolPaths: ['/nowhere/claude']
    });
    expect(r.entrypoint).toBe('/srv/autofix/bin/autofix.ts');
    expect(r.workingDirectory).toBe('/srv/autofix');
    expect(r.logDir).toBe('/var/cache/autofix');
    expect(r.path.split(delimiter)[0]).toBe('/opt/bun/bin');
  });
});

describe('initInstall', () => {
  function run(over: Partial<Parameters<typeof initInstall>[0]> = {}) {
    mkdirSync(join(ROOT, 'project'), {recursive: true});
    return initInstall({
      projectRoot: join(ROOT, 'project'),
      cacheRoot: join(ROOT, 'cache'),
      brainRoot: join(ROOT, 'brain'),
      label: 'com.test.autofix',
      serviceAccount: undefined,
      env: {HOME: ROOT, PATH: '/usr/bin'},
      forcePlist: false,
      ...over
    });
  }

  test('creates the cache tree the daemon writes into', () => {
    run();
    for (const d of ['', 'wt', 'jobs']) expect(existsSync(join(ROOT, 'cache', d))).toBe(true);
  });

  test('seeds a brain file per registered app, plus the index', () => {
    run();
    for (const app of appNames()) {
      expect(existsSync(join(ROOT, 'brain', 'apps', `${app}.md`))).toBe(true);
    }
    expect(readFileSync(join(ROOT, 'brain', 'index.md'), 'utf8')).toContain('LEARN appends below this line');
  });

  test('a seeded app file claims nothing — LEARN has to earn its lines', () => {
    run();
    const text = readFileSync(join(ROOT, 'brain', 'apps', `${appNames()[0]}.md`), 'utf8');
    expect(text).toContain('nothing learned yet');
  });

  test('writes .env from the example at 600, and says to fill it in', () => {
    writeFileSync(join(ROOT, 'project', '.env.example'), '# ---- REQUIRED ----\nSLACK_BOT_TOKEN=xoxb-\n');
    const r = run();
    const envPath = join(ROOT, 'project', '.env');
    expect(existsSync(envPath)).toBe(true);
    expect(statSync(envPath).mode & 0o777).toBe(0o600);
    expect(r.next.join('\n')).toContain('SLACK_BOT_TOKEN');
  });

  test('never overwrites a filled-in .env', () => {
    writeFileSync(join(ROOT, 'project', '.env.example'), 'SLACK_BOT_TOKEN=xoxb-\n');
    writeFileSync(join(ROOT, 'project', '.env'), 'SLACK_BOT_TOKEN=xoxb-real-token\n');
    const r = run();
    expect(readFileSync(join(ROOT, 'project', '.env'), 'utf8')).toContain('real-token');
    expect(r.steps.find(s => s.path.endsWith('/.env'))!.action).toBe('kept');
  });

  test('never overwrites a brain file LEARN has been writing to', () => {
    mkdirSync(join(ROOT, 'brain', 'apps'), {recursive: true});
    const path = join(ROOT, 'brain', 'apps', `${appNames()[0]}.md`);
    writeFileSync(path, '# real knowledge\n- something learned the hard way\n');
    run();
    expect(readFileSync(path, 'utf8')).toContain('the hard way');
  });

  test('is idempotent — a second run creates nothing', () => {
    writeFileSync(join(ROOT, 'project', '.env.example'), 'SLACK_BOT_TOKEN=xoxb-\n');
    run();
    const second = run();
    expect(second.steps.filter(s => s.action === 'created')).toEqual([]);
  });

  test('a missing CORE.md is reported as a broken checkout, not generated', () => {
    // CORE.md is the agent's instructions, not per-install state; inventing one would
    // hand every job a different set of rules from the ones the tests were written for.
    const r = run();
    const core = r.steps.find(s => s.path.endsWith('CORE.md'))!;
    expect(core.action).toBe('skipped');
    expect(r.next.join('\n')).toContain('CORE.md');
  });

  test('the plist is written under launchd/ and names the label', () => {
    const r = run();
    expect(r.plistPath).toBe(join(ROOT, 'project', 'launchd', 'com.test.autofix.plist'));
    expect(readFileSync(r.plistPath, 'utf8')).toContain('<string>com.test.autofix</string>');
  });

  test('--force-plist is the only way to regenerate it', () => {
    const first = run();
    writeFileSync(first.plistPath, 'hand-edited');
    run();
    expect(readFileSync(first.plistPath, 'utf8')).toBe('hand-edited');
    run({forcePlist: true});
    expect(readFileSync(first.plistPath, 'utf8')).toContain('<plist version="1.0">');
  });

  test('without a service account it says why that matters', () => {
    expect(run().next.join('\n')).toContain('service account');
  });

  test('with one, it does not nag', () => {
    const r = run({serviceAccount: 'bot@p.iam.gserviceaccount.com'});
    expect(r.next.join('\n')).not.toContain('cân nhắc tạo service account');
  });
});

describe('requiredEnvKeys', () => {
  test('reads the keys out of the REQUIRED section only', () => {
    const example = [
      '# ---- REQUIRED ----',
      'SLACK_BOT_TOKEN=xoxb-',
      'SLACK_ERROR_CHANNEL_ID=C',
      '# ---- Caps ----',
      '# AUTOFIX_MR_PER_HOUR=5'
    ].join('\n');
    expect(requiredEnvKeys(example)).toEqual(['SLACK_BOT_TOKEN', 'SLACK_ERROR_CHANNEL_ID']);
  });

  test('the shipped .env.example really does mark both Slack keys required', () => {
    const path = join(import.meta.dir, '..', '.env.example');
    expect(requiredEnvKeys(readFileSync(path, 'utf8'))).toEqual(['SLACK_BOT_TOKEN', 'SLACK_ERROR_CHANNEL_ID']);
  });
});

describe('doctor', () => {
  function cfgFor(): Config {
    mkdirSync(join(ROOT, 'repos'), {recursive: true});
    mkdirSync(join(ROOT, 'brain'), {recursive: true});
    for (const f of ['CORE.md', 'patterns.md', 'index.md']) writeFileSync(join(ROOT, 'brain', f), 'x');
    return buildConfig({
      SLACK_BOT_TOKEN: 'xoxb-1',
      SLACK_ERROR_CHANNEL_ID: 'C0',
      AUTOFIX_STATE_DB: ':memory:',
      AUTOFIX_CACHE_ROOT: join(ROOT, 'cache'),
      AUTOFIX_BRAIN_ROOT: join(ROOT, 'brain'),
      AUTOFIX_REPOS_ROOT: join(ROOT, 'repos')
    });
  }

  const allGood: Runner = async args => {
    const ok = (stdout = ''): RunResult => ({code: 0, stdout, stderr: '', timedOut: false});
    const joined = args.join(' ');
    if (joined.includes('auth list')) return ok('bot@p.iam.gserviceaccount.com\n');
    if (joined.includes('ls-remote')) return ok('abc123\trefs/heads/master\n');
    return ok('1.0');
  };

  const status = (report: {checks: {name: string; status: CheckStatus}[]}, name: string) =>
    report.checks.find(c => c.name === name)?.status;

  test('a healthy machine passes', async () => {
    const report = await doctor({
      cfg: cfgFor(),
      runner: allGood,
      quick: true,
      env: {HOME: ROOT, CLOUDSDK_CORE_ACCOUNT: 'bot@p.iam.gserviceaccount.com'}
    });
    expect(status(report, 'active account')).toBe('ok');
    expect(status(report, 'daemon identity')).toBe('ok');
    expect(status(report, 'repos root')).toBe('ok');
    expect(status(report, 'brain')).toBe('ok');
  });

  test('a missing claude CLI blocks — no stage can run without it', async () => {
    const noClaude: Runner = async (args, t, o) =>
      args[0]?.endsWith('claude') ? {code: 127, stdout: '', stderr: 'not found', timedOut: false} : allGood(args, t, o);
    const report = await doctor({cfg: cfgFor(), runner: noClaude, quick: true, env: {HOME: ROOT}});
    expect(status(report, 'claude')).toBe('fail');
    expect(report.ok).toBe(false);
  });

  test('no active gcloud credential blocks', async () => {
    const noAuth: Runner = async (args, t, o) =>
      args.join(' ').includes('auth list') ? {code: 0, stdout: '', stderr: '', timedOut: false} : allGood(args, t, o);
    const report = await doctor({cfg: cfgFor(), runner: noAuth, quick: true, env: {HOME: ROOT}});
    expect(status(report, 'active account')).toBe('fail');
  });

  test('a user credential with no service account warns but does not block', async () => {
    const userOnly: Runner = async (args, t, o) =>
      args.join(' ').includes('auth list')
        ? {code: 0, stdout: 'me@gmail.com\n', stderr: '', timedOut: false}
        : allGood(args, t, o);
    const report = await doctor({cfg: cfgFor(), runner: userOnly, quick: true, env: {HOME: ROOT}});
    expect(status(report, 'daemon identity')).toBe('warn');
    expect(report.ok).toBe(true);
  });

  test('CLOUDSDK_CORE_ACCOUNT pointing at a credential that is not active blocks', async () => {
    // The silent version of this is every gcloud call failing at 3am.
    const report = await doctor({
      cfg: cfgFor(),
      runner: allGood,
      quick: true,
      env: {HOME: ROOT, CLOUDSDK_CORE_ACCOUNT: 'someone-else@p.iam.gserviceaccount.com'}
    });
    expect(status(report, 'daemon identity')).toBe('fail');
  });

  test('the gcloud probe is a plain `gcloud version`', async () => {
    // With `--format=value(Google Cloud SDK)` the projection parser rejects the spaces
    // in the key and gcloud exits non-zero, so this check reported "not on PATH" on a
    // machine where the very next check authenticated fine.
    const seen: string[] = [];
    const spy: Runner = async (args, t, o) => {
      seen.push(args.join(' '));
      return allGood(args, t, o);
    };
    await doctor({cfg: cfgFor(), runner: spy, quick: true, env: {HOME: ROOT}});
    expect(seen).toContain('gcloud version');
    expect(seen.some(c => c.includes('Google Cloud SDK'))).toBe(false);
  });

  test('the daemon identity is read from the installed plist, not just the shell', async () => {
    // `doctor` runs in a terminal; the daemon gets its identity from launchd. Reading
    // only process.env warns about an unset variable on a correctly-configured machine.
    const agents = join(ROOT, 'Library', 'LaunchAgents');
    mkdirSync(agents, {recursive: true});
    writeFileSync(
      join(agents, 'com.x.prod-error-autofix.plist'),
      '<key>CLOUDSDK_CORE_ACCOUNT</key>\n<string>bot@p.iam.gserviceaccount.com</string>'
    );
    const report = await doctor({cfg: cfgFor(), runner: allGood, quick: true, env: {HOME: ROOT}});
    const identity = report.checks.find(c => c.name === 'daemon identity')!;
    expect(identity.status).toBe('ok');
    expect(identity.detail).toContain('plist');
  });

  test('a missing repos root blocks', async () => {
    const cfg = buildConfig({
      SLACK_BOT_TOKEN: 'x',
      SLACK_ERROR_CHANNEL_ID: 'C',
      AUTOFIX_STATE_DB: ':memory:',
      AUTOFIX_CACHE_ROOT: join(ROOT, 'cache'),
      AUTOFIX_BRAIN_ROOT: join(ROOT, 'brain'),
      AUTOFIX_REPOS_ROOT: join(ROOT, 'nope')
    });
    mkdirSync(join(ROOT, 'brain'), {recursive: true});
    for (const f of ['CORE.md', 'patterns.md', 'index.md']) writeFileSync(join(ROOT, 'brain', f), 'x');
    const report = await doctor({cfg, runner: allGood, quick: true, env: {HOME: ROOT}});
    expect(status(report, 'repos root')).toBe('fail');
  });

  test('an app repo that is not checked out warns — the other apps still work', async () => {
    const report = await doctor({cfg: cfgFor(), runner: allGood, quick: true, env: {HOME: ROOT}});
    const checkouts = report.checks.filter(c => c.name === 'checkout');
    expect(checkouts).toHaveLength(appNames().length);
    expect(checkouts.every(c => c.status === 'warn')).toBe(true);
    expect(report.ok).toBe(true);
  });

  test('a checked-out app with no alert wiring warns and says what to do', async () => {
    const cfg = cfgFor();
    const repo = join(ROOT, 'repos', 'blogs');
    mkdirSync(repo, {recursive: true});
    const report = await doctor({cfg, runner: allGood, quick: true, env: {HOME: ROOT}});
    const wiring = report.checks.find(c => c.group === 'app BLOG' && c.name === 'alert wiring')!;
    expect(wiring.status).toBe('warn');
    expect(wiring.fix).toContain('avada-prod-error-alert');
  });

  test('an unreachable origin warns with the git error, not a guess', async () => {
    const cfg = cfgFor();
    mkdirSync(join(ROOT, 'repos', 'blogs'), {recursive: true});
    const noSsh: Runner = async (args, t, o) =>
      args.join(' ').includes('ls-remote')
        ? {code: 128, stdout: '', stderr: 'Permission denied (publickey).', timedOut: false}
        : allGood(args, t, o);
    const report = await doctor({cfg, runner: noSsh, quick: false, env: {HOME: ROOT}});
    const remote = report.checks.find(c => c.group === 'app BLOG' && c.name.startsWith('origin/'))!;
    expect(remote.status).toBe('warn');
    expect(remote.detail).toContain('Permission denied');
  });

  test('a Slack token the API rejects blocks', async () => {
    const report = await doctor({
      cfg: cfgFor(),
      runner: allGood,
      quick: true,
      env: {HOME: ROOT},
      slack: {
        async self() {
          throw new Error('invalid_auth');
        },
        async history() {
          return [];
        },
        async postThreadReply() {
          return {ts: undefined};
        },
        async permalink() {
          return undefined;
        }
      }
    });
    expect(status(report, 'token')).toBe('fail');
    expect(report.ok).toBe(false);
  });

  test('a channel the bot cannot read blocks — it would look like a silent daemon', async () => {
    const report = await doctor({
      cfg: cfgFor(),
      runner: allGood,
      quick: true,
      env: {HOME: ROOT},
      slack: {
        async self() {
          return {botUserId: 'U1', teamId: 'T1'};
        },
        async history() {
          throw new Error('not_in_channel');
        },
        async postThreadReply() {
          return {ts: undefined};
        },
        async permalink() {
          return undefined;
        }
      }
    });
    expect(status(report, 'channel')).toBe('fail');
    expect(report.checks.find(c => c.name === 'channel')!.fix).toContain('invite the bot');
  });

  test('--quick skips the network probes', async () => {
    const cfg = cfgFor();
    mkdirSync(join(ROOT, 'repos', 'blogs'), {recursive: true});
    const seen: string[] = [];
    const spy: Runner = async (args, t, o) => {
      seen.push(args.join(' '));
      return allGood(args, t, o);
    };
    await doctor({cfg, runner: spy, quick: true, env: {HOME: ROOT}});
    expect(seen.some(c => c.includes('ls-remote'))).toBe(false);
    expect(seen.some(c => c.includes('logging read'))).toBe(false);
  });

  test('the report tells you whether you can start, not just what it found', async () => {
    const report = await doctor({cfg: cfgFor(), runner: allGood, quick: true, env: {HOME: ROOT}});
    expect(formatDoctor(report)).toContain('chạy được');
  });
});
