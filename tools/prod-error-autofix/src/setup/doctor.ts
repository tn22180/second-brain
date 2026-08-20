import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {resolveClaudeBin} from '../agent/claudeCli';
import type {Config} from '../config';
import {spawnRunner, type Runner} from '../gcloud/run';
import {listApps, type App} from '../registry';
import type {SlackApi} from '../slack/client';

/**
 * Everything that has to be true before the daemon can work, checked one at a time
 * and reported as a list.
 *
 * This is the part that makes the tool installable somewhere else. The daemon depends
 * on five things outside its own code — `claude`, `gcloud`, `git` over SSH, a Slack
 * app, and a checkout of every app repo — and when any of them is wrong the symptom
 * is the same: alerts come back `blocked` or `inconclusive` hours later, in a log
 * nobody is reading. Every failure below is one that has actually happened here.
 */

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface Check {
  /** Grouping for the printed report. */
  group: string;
  name: string;
  status: CheckStatus;
  detail: string;
  /** What to do about it. Empty when there is nothing to do. */
  fix: string;
}

export interface DoctorReport {
  checks: Check[];
  /** True when nothing is `fail`. `warn` never blocks — it degrades one app, not the daemon. */
  ok: boolean;
}

const ok = (group: string, name: string, detail: string): Check => ({group, name, status: 'ok', detail, fix: ''});
const warn = (group: string, name: string, detail: string, fix = ''): Check => ({group, name, status: 'warn', detail, fix});
const fail = (group: string, name: string, detail: string, fix = ''): Check => ({group, name, status: 'fail', detail, fix});

export interface DoctorDeps {
  cfg: Config;
  runner?: Runner;
  slack?: SlackApi;
  env?: Record<string, string | undefined>;
  /** Skips the per-app gcloud and git probes, which are the slow half. */
  quick?: boolean;
}

async function checkTooling(runner: Runner, cfg: Config, env: Record<string, string | undefined>): Promise<Check[]> {
  const out: Check[] = [];
  const G = 'tooling';

  out.push(
    typeof Bun !== 'undefined'
      ? ok(G, 'bun', `v${Bun.version}`)
      : fail(G, 'bun', 'not running under bun', 'https://bun.sh — the CLI and bun:sqlite both need it')
  );

  const claudeBin = resolveClaudeBin(env);
  const claude = await runner([claudeBin, '--version'], 20_000);
  out.push(
    claude.code === 0
      ? ok(G, 'claude', `${claudeBin} · ${claude.stdout.trim().slice(0, 60)}`)
      : fail(G, 'claude', `${claudeBin} did not answer --version`, 'install the Claude Code CLI, or set AUTOFIX_CLAUDE_BIN')
  );

  const git = await runner(['git', '--version'], 20_000);
  out.push(git.code === 0 ? ok(G, 'git', git.stdout.trim()) : fail(G, 'git', 'not on PATH'));

  const npx = await runner(['npx', '--version'], 30_000);
  out.push(
    npx.code === 0
      ? ok(G, 'npx', npx.stdout.trim())
      : fail(G, 'npx', 'not on PATH', 'the smoke gate runs `npx jest --ci` in each repo')
  );

  // Plain `gcloud version`, not `--format=value(...)`: the SDK's own key has spaces in it
  // and the projection parser rejects them, so a formatted read fails on a healthy
  // install — which is how this check first reported "gcloud not on PATH" on a machine
  // where `gcloud auth list` in the very next check worked.
  const gcloud = await runner(['gcloud', 'version'], 60_000);
  out.push(
    gcloud.code === 0
      ? ok(G, 'gcloud', gcloud.stdout.trim().split('\n')[0] ?? '')
      : fail(G, 'gcloud', (gcloud.stderr || 'not on PATH').trim().slice(0, 120), 'ANALYZE cannot read prod logs without it')
  );
  return out;
}

/**
 * The daemon's gcloud identity comes from the launchd job, not from the shell that
 * runs `doctor`. Reading only `process.env` reports "unset" on a machine where the
 * installed plist pins it correctly, which is a warning about nothing.
 */
export function installedDaemonAccount(home: string, readDir = readdirSync, read = readFileSync): string | undefined {
  const dir = join(home, 'Library', 'LaunchAgents');
  if (!existsSync(dir)) return undefined;
  for (const file of readDir(dir)) {
    if (!file.includes('prod-error-autofix') || !file.endsWith('.plist')) continue;
    const text = read(join(dir, file), 'utf8') as string;
    const m = /<key>CLOUDSDK_CORE_ACCOUNT<\/key>\s*<string>([^<]+)<\/string>/.exec(text);
    if (m) return m[1]!.trim();
  }
  return undefined;
}

async function checkGcloudAuth(
  runner: Runner,
  cfg: Config,
  env: Record<string, string | undefined>
): Promise<Check[]> {
  const G = 'gcloud auth';
  const res = await runner(['gcloud', 'auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'], 60_000);
  if (res.code !== 0) return [fail(G, 'active account', 'gcloud auth list failed', 'run `gcloud auth login`')];
  const accounts = res.stdout.split('\n').map(a => a.trim()).filter(Boolean);
  if (!accounts.length) return [fail(G, 'active account', 'no active credential', 'run `gcloud auth login`')];

  const out: Check[] = [ok(G, 'active account', accounts.join(', '))];
  const fromPlist = installedDaemonAccount(env.HOME || homedir());
  const pinned = env.CLOUDSDK_CORE_ACCOUNT || fromPlist;
  const source = env.CLOUDSDK_CORE_ACCOUNT ? 'env' : 'plist';
  const serviceAccounts = accounts.filter(a => a.endsWith('.gserviceaccount.com'));

  if (pinned) {
    out.push(
      accounts.includes(pinned)
        ? ok(G, 'daemon identity', `${pinned} (${source})`)
        : fail(
            G,
            'daemon identity',
            `${pinned} is pinned in the ${source} but is not an active credential`,
            'gcloud auth activate-service-account --key-file=…'
          )
    );
  } else if (serviceAccounts.length) {
    out.push(
      warn(
        G,
        'daemon identity',
        `service account available (${serviceAccounts[0]}) but CLOUDSDK_CORE_ACCOUNT is unset`,
        'set it in the launchd plist — a user credential expires on the org session policy and the daemon cannot answer a reauth prompt'
      )
    );
  } else {
    out.push(
      warn(
        G,
        'daemon identity',
        'only user credentials are active',
        'a user credential expires roughly daily; four alerts came back `blocked · gcloud auth` in one half-hour on 2026-07-31. Create a service account with logging.read + cloudfunctions.viewer + run.viewer.'
      )
    );
  }
  return out;
}

function checkPaths(cfg: Config): Check[] {
  const G = 'paths';
  const out: Check[] = [];

  const repos = cfg.paths.reposRoot;
  out.push(
    existsSync(repos) && statSync(repos).isDirectory()
      ? ok(G, 'repos root', repos)
      : fail(G, 'repos root', `${repos} does not exist`, 'set AUTOFIX_REPOS_ROOT to the directory holding the app checkouts')
  );

  for (const [name, dir] of [
    ['cache root', cfg.paths.cacheRoot],
    ['worktree root', cfg.paths.worktreeRoot],
    ['jobs root', cfg.paths.jobsRoot]
  ] as const) {
    try {
      mkdirSync(dir, {recursive: true});
      const probe = join(dir, '.autofix-write-probe');
      writeFileSync(probe, 'x');
      rmSync(probe);
      out.push(ok(G, name, dir));
    } catch (e) {
      out.push(fail(G, name, `${dir} is not writable: ${(e as Error).message}`));
    }
  }

  const brain = cfg.paths.brainRoot;
  const missing = ['CORE.md', 'patterns.md', 'index.md'].filter(f => !existsSync(join(brain, f)));
  out.push(
    missing.length
      ? fail(G, 'brain', `${brain} is missing ${missing.join(', ')}`, 'run `autofix init` to seed the skeleton')
      : ok(G, 'brain', brain)
  );
  return out;
}

async function checkSlack(cfg: Config, slack: SlackApi | undefined): Promise<Check[]> {
  const G = 'slack';
  if (!slack) return [warn(G, 'api', 'skipped')];
  const out: Check[] = [];
  try {
    const self = await slack.self();
    out.push(
      self.botUserId
        ? ok(G, 'token', `bot ${self.botUserId} · team ${self.teamId ?? '?'}`)
        : fail(G, 'token', 'auth.test returned no bot user id', 'the token must be a bot token (xoxb-)')
    );
  } catch (e) {
    return [fail(G, 'token', (e as Error).message, 'check SLACK_BOT_TOKEN')];
  }
  try {
    const history = await slack.history({channel: cfg.errorChannelId, oldestTs: undefined, limit: 1});
    out.push(
      ok(
        G,
        'channel',
        `${cfg.errorChannelId} readable${history.length ? '' : ' (no messages yet)'}`
      )
    );
  } catch (e) {
    out.push(
      fail(
        G,
        'channel',
        `${cfg.errorChannelId}: ${(e as Error).message}`,
        'invite the bot to the channel and grant channels:history (groups:history if private)'
      )
    );
  }
  return out;
}

/**
 * Per app: the checkout, the remote, the alert wiring, and read access to the prod
 * project. Each is a `warn` — one app being unusable is not a reason to refuse to
 * start for the other four.
 */
async function checkApp(app: App, runner: Runner, cfg: Config, quick: boolean): Promise<Check[]> {
  const G = `app ${app.appName}`;
  const out: Check[] = [];

  if (!existsSync(app.repoPath)) {
    return [warn(G, 'checkout', `${app.repoPath} missing`, `git clone the ${app.repo} repo into the repos root`)];
  }

  const head = await runner(['git', '-C', app.repoPath, 'rev-parse', '--git-dir'], 20_000);
  if (head.code !== 0) {
    return [warn(G, 'checkout', `${app.repoPath} is not a git repo`)];
  }
  out.push(ok(G, 'checkout', app.repoPath));

  const handler = join(app.repoPath, app.alertHandler);
  out.push(
    existsSync(handler)
      ? ok(G, 'alert wiring', app.alertHandler)
      : warn(
          G,
          'alert wiring',
          `${app.alertHandler} not found`,
          'this app does not publish prod-error alerts yet — add the `avada-prod-error-alert` handler and the log sink, or drop it from src/registry.ts'
        )
  );

  if (quick) return out;

  // `ls-remote` is the cheapest proof that the SSH key works. `probeMerge` fetches on
  // every repeat alert, and a daemon that cannot fetch reports `merge_state_unknown`
  // forever without ever saying why.
  const remote = await runner(
    ['git', '-C', app.repoPath, 'ls-remote', '--heads', 'origin', app.defaultBranch],
    60_000
  );
  out.push(
    remote.code === 0 && remote.stdout.trim()
      ? ok(G, `origin/${app.defaultBranch}`, 'reachable')
      : warn(
          G,
          `origin/${app.defaultBranch}`,
          (remote.stderr || remote.stdout).trim().slice(0, 120) || 'branch not found on origin',
          'the daemon pushes and fetches over SSH; check the key and the branch name'
        )
  );

  const logs = await runner(
    [
      'gcloud',
      'logging',
      'read',
      'severity>=ERROR',
      `--project=${app.prodProject}`,
      '--limit=1',
      '--format=value(insertId)'
    ],
    cfg.timeouts.gcloudMs
  );
  out.push(
    logs.code === 0
      ? ok(G, `logs ${app.prodProject}`, 'readable')
      : warn(
          G,
          `logs ${app.prodProject}`,
          (logs.stderr || logs.stdout).trim().slice(0, 120),
          'grant roles/logging.viewer on this project to the daemon identity'
        )
  );
  return out;
}

export async function doctor(deps: DoctorDeps): Promise<DoctorReport> {
  const {cfg} = deps;
  const runner = deps.runner ?? spawnRunner;
  const env = deps.env ?? process.env;
  const quick = deps.quick ?? false;

  const checks: Check[] = [
    ...(await checkTooling(runner, cfg, env)),
    ...(await checkGcloudAuth(runner, cfg, env)),
    ...checkPaths(cfg),
    ...(await checkSlack(cfg, deps.slack))
  ];

  for (const app of listApps(cfg)) {
    checks.push(...(await checkApp(app, runner, cfg, quick)));
  }

  return {checks, ok: !checks.some(c => c.status === 'fail')};
}

const MARK: Record<CheckStatus, string> = {ok: '✓', warn: '!', fail: '✗'};

export function formatDoctor(report: DoctorReport): string {
  const lines: string[] = [];
  let group = '';
  for (const c of report.checks) {
    if (c.group !== group) {
      group = c.group;
      lines.push('', group);
    }
    lines.push(`  ${MARK[c.status]} ${c.name.padEnd(22)} ${c.detail}`);
    if (c.fix) lines.push(`      → ${c.fix}`);
  }
  const counts = report.checks.reduce<Record<CheckStatus, number>>(
    (acc, c) => ({...acc, [c.status]: acc[c.status] + 1}),
    {ok: 0, warn: 0, fail: 0}
  );
  lines.push(
    '',
    `${counts.ok} ok · ${counts.warn} cảnh báo · ${counts.fail} chặn`,
    report.ok
      ? 'chạy được. `autofix init` để sinh plist, hoặc `autofix daemon` để chạy tay.'
      : 'CHƯA chạy được — sửa hết mục ✗ trước.'
  );
  return lines.join('\n');
}

export interface RemoteCheckResult {
  /** Repo names whose origin host differs from the last recorded reading. */
  changed: string[];
}

/**
 * Flags a remote HOST change since the last check — never asserts one correct host.
 *
 * Verified 2026-08-20: `seo`, `ai-product-copy` and `llm-ai-search-seo` push to
 * `git.avada.net`; `blogs` and `avada-image-optimizer` still push to `gitlab.com`, and
 * both are legitimate today (spec "Known gaps"). A checkout still pointed at a host the
 * project migrated away from fetches a dead mirror: the audit would scan last month's
 * code and report findings already fixed, with nothing in the run looking wrong. A repo
 * with no prior reading has nothing to compare against, so it is not a change.
 */
export function checkRemotes(input: {previous: Record<string, string>; current: Record<string, string>}): RemoteCheckResult {
  const changed: string[] = [];
  for (const [repo, host] of Object.entries(input.current)) {
    const prior = input.previous[repo];
    if (prior !== undefined && prior !== host) changed.push(repo);
  }
  return {changed};
}

/**
 * A stale `origin/<base>` and a dead remote look identical from a fetch-then-inspect
 * check — both leave the branch's newest commit old. Saying "stale" would be a guess;
 * the line says it cannot tell the two apart, matching the spec's "Known gaps" note.
 */
export function describeBaseAge(input: {repo: string; ageDays: number}): string {
  return (
    `${input.repo}: origin/<base> newest commit is ${input.ageDays}d old — ` +
    'a quiet repo and a dead remote look the same from here; cannot tell which.'
  );
}

export interface PushCredentialResult {
  ok: boolean;
  detail: string;
}

/**
 * Whether a non-interactive (launchd) push can authenticate — never handles a token
 * itself. `canPush` is the caller's own probe outcome (e.g. a `git push --dry-run`
 * against a throwaway ref) and `helpers` are `credential.helper` names, not secret
 * values, so nothing here can put a credential on a command line or in a log.
 *
 * Verified 2026-08-20: all five remotes are HTTPS, and `credential.helper` resolves to
 * `osxkeychain` then `store`. `store` is what a launchd job can use without a GUI
 * session; `osxkeychain` may not answer under a daemon. When `mrEnabled` is false this
 * check does not apply and must not fail the doctor — the MR lane defaults off.
 */
export function checkPushCredential(input: {mrEnabled: boolean; helpers: string[]; canPush: boolean}): PushCredentialResult {
  if (!input.mrEnabled) return {ok: true, detail: 'AUDIT_MR_ENABLED is false — push credential not required'};
  if (input.canPush) return {ok: true, detail: `non-interactive push authenticated (helpers: ${input.helpers.join(', ') || 'none'})`};
  return {
    ok: false,
    detail:
      `non-interactive push could not authenticate (helpers: ${input.helpers.join(', ') || 'none'}) — ` +
      'osxkeychain may not answer under launchd; `store` (or an unlocked login keychain) has to be reachable without a GUI session'
  };
}

/** Keys in `.env.example` that carry no default, so an install without them cannot start. */
export function requiredEnvKeys(exampleText: string): string[] {
  const out: string[] = [];
  let inRequired = false;
  for (const raw of exampleText.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('# ----')) {
      inRequired = /REQUIRED/.test(line);
      continue;
    }
    if (!inRequired || line.startsWith('#') || !line.includes('=')) continue;
    out.push(line.slice(0, line.indexOf('=')).trim());
  }
  return out;
}

export function readExample(projectRoot: string): string {
  const path = join(projectRoot, '.env.example');
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
