import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import type {ClaudeInvocation, ClaudeResult} from '../src/agent/claudeCli';
import {buildConfig, type Config} from '../src/config';
import type {RunResult, Runner} from '../src/gcloud/run';
import {runPipeline} from '../src/pipeline';
import type {SlackApi} from '../src/slack/client';
import type {IncomingMessage} from '../src/slack/listener';
import {Store} from '../src/state/store';

/**
 * End to end with the two agent stages stubbed and every shell call scripted. What is
 * exercised for real: parsing, the registry, the state machine, the caps, the gates,
 * the ordering of the stages, the replies, and what LEARN writes.
 */

const ROOT = join('/tmp', `autofix-pipeline-${process.pid}`);
const NOW = 1_753_800_000_000;
const TS = '1753800000.000100';

let store: Store;
let cfg: Config;
let posted: string[];
let claudeCalls: {model: string; prompt: string}[];
let ranArgs: string[][];

function makeCfg(over: Record<string, string> = {}): Config {
  return buildConfig({
    SLACK_BOT_TOKEN: 'xoxb-1',
    SLACK_ERROR_CHANNEL_ID: 'C0PROD',
    AUTOFIX_STATE_DB: ':memory:',
    AUTOFIX_CACHE_ROOT: join(ROOT, 'cache'),
    AUTOFIX_BRAIN_ROOT: join(ROOT, 'brain'),
    AUTOFIX_REPOS_ROOT: join(ROOT, 'repos'),
    ...over
  });
}

function seedBrain(root: string) {
  mkdirSync(join(root, 'apps'), {recursive: true});
  writeFileSync(join(root, 'CORE.md'), 'core rules');
  writeFileSync(join(root, 'patterns.md'), 'patterns');
  writeFileSync(join(root, 'index.md'), '# Incident index\n\n<!-- LEARN appends below this line -->\n');
  writeFileSync(join(root, 'apps', 'BLOG.md'), '# BLOG\nLogger severity: yes');
  writeFileSync(join(root, 'apps', 'SEO.md'), '# SEO\nLogger severity: no');
}

/** A block payload shaped like the real alert. */
function alertMessage(over: {app?: string; service?: string; kind?: 'app' | 'infra'; message?: string} = {}): IncomingMessage {
  const app = over.app ?? 'BLOG';
  const service = over.service ?? 'api';
  const kind = over.kind ?? 'app';
  const message = over.message ?? "[getPreview] Cannot read properties of undefined (reading 'includes')";
  return {
    channel: 'C0PROD',
    ts: TS,
    text: `${kind === 'infra' ? ':warning:' : ':red_circle:'} [${app}] ${message.slice(0, 140)}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${kind === 'infra' ? '⚠️' : '🔴'} *[${app}] ${service}*  ·  \`ERROR\`  ·  _${
            kind === 'infra' ? 'infra self-heal' : 'app error'
          }_`
        }
      },
      {type: 'section', text: {type: 'mrkdwn', text: '```' + message + '```'}},
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*×44* total  ·  first seen 2m ago  ·  window 10m  ·  <https://console.cloud.google.com/logs/query;query=x?project=avada-blog-app|Logs Explorer>`
          }
        ]
      }
    ],
    botId: 'B_ALERT',
    userId: 'U_SELF',
    threadTs: undefined,
    subtype: undefined,
    eventId: undefined
  };
}

const ANALYSIS = {
  rootCause: 'getPreview passes an undefined id into a string method',
  mechanism: 'App Proxy requests carry no id',
  citations: [{file: 'packages/functions/src/x.js', line: 1, why: 'reads id'}],
  evidence: [{logQuery: 'severity>=ERROR', matched: 44}],
  confidence: 'high',
  reproPlan: 'call without id',
  fixSketch: 'answer 400',
  isInfra: false
};

const FIX_REPLY = JSON.stringify({summary: 'Answer 400.', mrTitle: 'fix(prod): [BLOG] 400 on missing id', risks: 'none'});

const PUSH_OK = `remote: View merge request for fix/prod-blog-x:\nremote:   https://gitlab.com/avada/blogs/-/merge_requests/1487\nTo gitlab.com:avada/blogs.git`;

function fakeSlack(): SlackApi {
  return {
    async self() {
      return {botUserId: 'U_SELF', teamId: 'T1'};
    },
    async history() {
      return [];
    },
    async postThreadReply({text}) {
      posted.push(text);
      return {ts: `${Number(TS) + posted.length}`};
    },
    async permalink() {
      return 'https://slack/p1';
    }
  };
}

function fakeClaude(over: {analysis?: unknown; fixReply?: string} = {}) {
  return async (inv: ClaudeInvocation): Promise<ClaudeResult> => {
    claudeCalls.push({model: inv.model, prompt: inv.prompt});
    const isFix = inv.prompt.startsWith('# Fix this');
    return {
      ok: true,
      text: isFix ? (over.fixReply ?? FIX_REPLY) : JSON.stringify(over.analysis ?? ANALYSIS),
      costUsd: 0.1,
      numTurns: 4,
      sessionId: 's',
      permissionDenials: [],
      failure: undefined,
      detail: undefined
    };
  };
}

interface ScriptOptions {
  gcloudAuthFails?: boolean;
  jestBaselineFailures?: string[];
  jestAfterFailures?: string[];
  reproFails?: boolean;
  pushOutput?: string;
  pushCode?: number;
  status?: string;
  worktreeFails?: boolean;
}

function jestJson(repoPath: string, failures: string[], total = 100): string {
  return JSON.stringify({
    success: failures.length === 0,
    numTotalTests: total,
    numTotalTestSuites: 5,
    numRuntimeErrorTestSuites: 0,
    testResults: failures.length
      ? failures.map(f => {
          const [file, name] = f.split('::');
          return {
            name: join(repoPath, file!),
            status: 'failed',
            message: '',
            assertionResults: [{fullName: name, title: name, status: 'failed', failureMessages: ['x'], ancestorTitles: []}]
          };
        })
      : [{name: join(repoPath, 'ok.test.js'), status: 'passed', message: '', assertionResults: []}]
  });
}

/** Routes every spawn by argv, so ordering assertions are possible. */
function script(opts: ScriptOptions = {}): Runner {
  let jestRun = 0;
  return async (args, _timeout, runOpts) => {
    ranArgs.push(args);
    const joined = args.join(' ');
    const ok = (stdout = '', code = 0, stderr = ''): RunResult => ({code, stdout, stderr, timedOut: false});

    if (args[0] === 'gcloud' && joined.includes('logging read')) {
      if (opts.gcloudAuthFails) return ok('', 1, 'ERROR: Please run: gcloud auth login');
      return ok('[{"timestamp":"2026-07-30T09:00:00Z","severity":"ERROR","jsonPayload":{"message":"boom"}}]');
    }
    if (args[0] === 'gcloud') return ok('2026-07-30T08:00:00Z');
    if (joined.includes('worktree add')) {
      if (opts.worktreeFails) return ok('', 1, 'fatal: worktree add failed');
      // `git worktree add -B <branch> <dir> <sha>` — materialise the dir and the one
      // file the stubbed analysis cites, so citation verification is exercised for
      // real rather than stubbed out.
      const dir = args[7]!;
      mkdirSync(join(dir, 'packages', 'functions', 'src'), {recursive: true});
      writeFileSync(join(dir, 'packages', 'functions', 'src', 'x.js'), 'const {id} = ctx.query;\n');
      return ok();
    }
    if (joined.includes('rev-parse origin/')) return ok('basesha1234\n');
    if (joined.includes('rev-parse HEAD')) return ok('fixsha5678\n');
    if (joined.includes('status --porcelain')) {
      return ok(opts.status ?? ' M packages/functions/src/x.js\n?? packages/functions/src/__tests__/x.test.js\n');
    }
    if (joined.includes('diff --cached')) return ok('packages/functions/src/x.js\n');
    if (joined.includes('--stat')) return ok(' 2 files changed');
    if (joined.includes(' push ')) return ok('', opts.pushCode ?? 0, opts.pushOutput ?? PUSH_OK);
    if (args[0] === 'git') return ok();
    if (args[0] === 'npx' && args[1] === 'jest') {
      jestRun++;
      const repoPath = runOpts?.cwd ?? '';
      const isRepro = joined.includes('--runTestsByPath');
      if (isRepro) {
        return opts.reproFails
          ? ok(jestJson(repoPath, []), 0)
          : ok(jestJson(repoPath, ['packages/functions/src/__tests__/x.test.js::reproduces']), 1);
      }
      // First non-repro run is the baseline, second is the after-fix run.
      const failures = jestRun === 1 ? (opts.jestBaselineFailures ?? []) : (opts.jestAfterFailures ?? opts.jestBaselineFailures ?? []);
      return ok(jestJson(repoPath, failures), failures.length ? 1 : 0);
    }
    return ok();
  };
}

function deps(over: {claude?: ReturnType<typeof fakeClaude>; runner?: Runner; cfg?: Config; now?: number} = {}) {
  return {
    cfg: over.cfg ?? cfg,
    store,
    slack: fakeSlack(),
    claude: over.claude ?? fakeClaude(),
    runner: over.runner ?? script(),
    now: () => over.now ?? NOW,
    log: () => {}
  };
}

const DAY = 24 * 3_600_000;

beforeEach(() => {
  rmSync(ROOT, {recursive: true, force: true});
  mkdirSync(join(ROOT, 'repos', 'blogs'), {recursive: true});
  seedBrain(join(ROOT, 'brain'));
  cfg = makeCfg();
  store = new Store(':memory:');
  posted = [];
  claudeCalls = [];
  ranArgs = [];
});

afterEach(() => {
  rmSync(ROOT, {recursive: true, force: true});
});

describe('happy path', () => {
  test('an alert becomes an MR, a reply, and an incident record', async () => {
    const res = await runPipeline(deps(), alertMessage());

    expect(res.status).toBe('mr_open');
    expect(res.mrUrl).toBe('https://gitlab.com/avada/blogs/-/merge_requests/1487');
    expect(res.replied).toBe(true);
    expect(res.costUsd).toBeCloseTo(0.2);

    expect(posted).toHaveLength(1);
    expect(posted[0]).toContain('merge_requests/1487');
    expect(posted[0]).toContain('chưa ai review');

    const row = store.getAlert(res.fingerprint!)!;
    expect(row).toMatchObject({status: 'mr_open', mrUrl: res.mrUrl, fixSha: 'fixsha5678', repo: 'blogs'});
    expect(store.countMrEvents(NOW - 3_600_000)).toBe(1);

    // LEARN wrote the record and the one-line index entry.
    const incident = join(ROOT, 'brain', 'incidents', `${res.fingerprint}.md`);
    expect(existsSync(incident)).toBe(true);
    const text = readFileSync(incident, 'utf8');
    expect(text).toContain(`fingerprint: ${res.fingerprint}`);
    expect(text).toContain('getPreview passes an undefined id');
    expect(text).toContain('merge_requests/1487');
    expect(readFileSync(join(ROOT, 'brain', 'index.md'), 'utf8')).toContain(res.fingerprint!);
  });

  test('the two stages use different models, and only ANALYZE sees the logs', async () => {
    await runPipeline(deps(), alertMessage());
    expect(claudeCalls).toHaveLength(2);
    expect(claudeCalls[0]!.model).toBe(cfg.models.analyze);
    expect(claudeCalls[1]!.model).toBe(cfg.models.fix);
    expect(claudeCalls[0]!.prompt).toContain('Logs already pulled for you');
    expect(claudeCalls[1]!.prompt).not.toContain('Logs already pulled for you');
    expect(claudeCalls[1]!.prompt).toContain('already confirmed');
  });

  test('the baseline is measured before the fix and cached for the next job', async () => {
    await runPipeline(deps(), alertMessage());
    const order = ranArgs.map(a => a.join(' '));
    const baselineAt = order.findIndex(o => o.startsWith('npx jest'));
    const statusAt = order.findIndex(o => o.includes('status --porcelain'));
    expect(baselineAt).toBeGreaterThan(-1);
    expect(baselineAt).toBeLessThan(statusAt);
    expect(store.getBaseline('blogs', 'basesha1234')).toEqual([]);
  });

  test('the worktree is cleaned up on success', async () => {
    await runPipeline(deps(), alertMessage());
    expect(ranArgs.some(a => a.join(' ').includes('worktree remove --force'))).toBe(true);
  });
});

describe('paths that must not open an MR', () => {
  test('an app outside the registry is reported, never guessed at', async () => {
    const res = await runPipeline(deps(), alertMessage({app: 'JOY'}));
    expect(res.status).toBe('unknown_app');
    expect(posted[0]).toContain('không đoán repo');
    expect(claudeCalls).toHaveLength(0);
    expect(ranArgs).toHaveLength(0);
  });

  test('an infra alert is analysed and reported, with no MR', async () => {
    const res = await runPipeline(
      deps({claude: fakeClaude({analysis: {...ANALYSIS, isInfra: true}})}),
      alertMessage({kind: 'infra', message: 'Memory limit of 1024 MiB exceeded with 1046 MiB used'})
    );
    expect(res.status).toBe('infra');
    expect(res.mrUrl).toBeUndefined();
    expect(posted[0]).toContain('không auto-fix');
    // Analysis ran; the fix stage never did.
    expect(claudeCalls).toHaveLength(1);
    expect(ranArgs.some(a => a.join(' ').includes(' push '))).toBe(false);
  });

  test('a gcloud auth failure blocks before any model call', async () => {
    const res = await runPipeline(deps({runner: script({gcloudAuthFails: true})}), alertMessage());
    expect(res.status).toBe('blocked');
    expect(claudeCalls).toHaveLength(0);
    expect(posted[0]).toContain('Không gọi model');
  });

  test('a worktree that cannot be created blocks with the git error', async () => {
    const res = await runPipeline(deps({runner: script({worktreeFails: true})}), alertMessage());
    expect(res.status).toBe('blocked');
    expect(posted[0]).toContain('worktree');
    expect(claudeCalls).toHaveLength(0);
  });

  test('an inconclusive analysis replies and opens nothing', async () => {
    const res = await runPipeline(
      deps({claude: fakeClaude({analysis: {...ANALYSIS, confidence: 'low'}})}),
      alertMessage()
    );
    expect(res.status).toBe('inconclusive');
    expect(posted[0]).toContain('Chưa chốt được root cause');
    expect(ranArgs.some(a => a.join(' ').includes(' push '))).toBe(false);
    // Still recorded, so the next alert knows this was tried.
    expect(existsSync(join(ROOT, 'brain', 'incidents', `${res.fingerprint}.md`))).toBe(true);
  });

  test('a new test failure blocks the MR and keeps the worktree', async () => {
    const res = await runPipeline(
      deps({runner: script({jestBaselineFailures: [], jestAfterFailures: ['other.test.js::was passing']})}),
      alertMessage()
    );
    expect(res.status).toBe('inconclusive');
    expect(res.detail).toContain('new_failures');
    expect(posted[0]).toContain('other.test.js::was passing');
    expect(posted[0]).toContain('Worktree giữ lại');
    expect(ranArgs.some(a => a.join(' ').includes('worktree remove'))).toBe(false);
  });

  test('a reproduce test that passes without the fix blocks the MR', async () => {
    const res = await runPipeline(deps({runner: script({reproFails: true})}), alertMessage());
    expect(res.status).toBe('inconclusive');
    expect(res.detail).toContain('reproduce_not_failing');
  });

  test('a fix with no test added blocks the MR', async () => {
    const res = await runPipeline(
      deps({runner: script({status: ' M packages/functions/src/x.js\n'})}),
      alertMessage()
    );
    expect(res.detail).toContain('no_test_added');
    expect(posted[0]).toContain('không mở MR');
  });

  test('a push that yields no MR url hands over the create link and the body', async () => {
    const res = await runPipeline(
      deps({
        runner: script({
          pushOutput: 'remote: To create a merge request for fix/prod-blog-x, visit:\nremote:   https://gitlab.com/avada/blogs/-/merge_requests/new?x=1'
        })
      }),
      alertMessage()
    );
    expect(res.detail).toContain('no_mr_url');
    // The branch is on the remote, so this is one click from done — the reply leads
    // with the link and carries the MR body for pasting.
    expect(posted[0]).toContain('bấm đây để tạo');
    expect(posted[0]).toContain('/-/merge_requests/new?x=1');
    expect(posted[0]).toContain('Code không mất');
    expect(posted[0]).toContain('Body để paste');
    expect(posted[0]).toContain('## Why');
    // And the branch is recorded so the next alert can find it.
    expect(store.getAlert(res.fingerprint!)!.branch).toMatch(/^fix\/prod-blog-/);
  });
});

describe('caps', () => {
  test('the MR cap defers after the analysis, and still reports it', async () => {
    for (let i = 0; i < cfg.caps.mrPerHour; i++) store.recordMrEvent('other-repo', NOW - 60_000);
    const res = await runPipeline(deps(), alertMessage());
    expect(res.status).toBe('deferred');
    expect(posted[0]).toContain('mr_per_hour');
    expect(posted[0]).toContain('5/5');
    // The analysis was done and reported; only the MR was held back.
    expect(claudeCalls).toHaveLength(1);
    expect(ranArgs.some(a => a.join(' ').includes(' push '))).toBe(false);
  });

  test('a job already running defers without spending a model call', async () => {
    store.seenAlert({
      fingerprint: 'other',
      appName: 'BLOG',
      repo: 'blogs',
      service: 'api',
      kind: 'app',
      alertTsMs: NOW,
      threadTs: undefined
    });
    store.patchAlert('other', {status: 'analyzing'});
    const res = await runPipeline(deps(), alertMessage());
    expect(res.status).toBe('deferred');
    expect(claudeCalls).toHaveLength(0);
  });
});

describe('repeat alerts', () => {
  async function firstRun() {
    return runPipeline(deps(), alertMessage());
  }

  test('a repeat while the MR is unmerged replies once and does not rerun', async () => {
    const first = await firstRun();
    posted = [];
    claudeCalls = [];
    // merge-base exit 1 = not merged.
    const notMerged: Runner = async (args, t, o) => {
      if (args.join(' ').includes('merge-base --is-ancestor')) return {code: 1, stdout: '', stderr: '', timedOut: false};
      return script()(args, t, o);
    };
    // Past the 24h reply cooldown, or this repeat would be counted silently.
    const res = await runPipeline(deps({runner: notMerged, now: NOW + DAY + 60_000}), {
      ...alertMessage(),
      ts: '1753803600.000200'
    });
    expect(res.fingerprint).toBe(first.fingerprint);
    expect(res.status).toBe('mr_open');
    expect(claudeCalls).toHaveLength(0);
    expect(posted[0]).toContain('chưa merge');
    expect(posted[0]).toContain('đã bắn 2 lần');
  });

  test('a second reply inside the cooldown is counted silently', async () => {
    await firstRun();
    const notMerged: Runner = async (args, t, o) => {
      if (args.join(' ').includes('merge-base --is-ancestor')) return {code: 1, stdout: '', stderr: '', timedOut: false};
      return script()(args, t, o);
    };
    await runPipeline(deps({runner: notMerged}), {...alertMessage(), ts: '1753803600.000200'});
    posted = [];
    await runPipeline(deps({runner: notMerged}), {...alertMessage(), ts: '1753803700.000300'});
    expect(posted).toHaveLength(0);
    expect(store.getAlert((await firstRun()).fingerprint!)!.recurrenceCount).toBeGreaterThan(2);
  });

  test('an unreachable probe never reads as a failed fix', async () => {
    await firstRun();
    posted = [];
    claudeCalls = [];
    const offline: Runner = async (args, t, o) => {
      if (args.join(' ').includes('fetch')) return {code: 128, stdout: '', stderr: 'Could not resolve host', timedOut: false};
      return script()(args, t, o);
    };
    const res = await runPipeline(deps({runner: offline, now: NOW + DAY + 60_000}), {
      ...alertMessage(),
      ts: '1753803600.000200'
    });
    expect(res.status).toBe('mr_open');
    expect(claudeCalls).toHaveLength(0);
    expect(posted[0]).toContain('Không kết luận fix sai');
  });

  test('the same message twice yields the same fingerprint', async () => {
    const a = await firstRun();
    const notMerged: Runner = async (args, t, o) => {
      if (args.join(' ').includes('merge-base --is-ancestor')) return {code: 1, stdout: '', stderr: '', timedOut: false};
      return script()(args, t, o);
    };
    const b = await runPipeline(deps({runner: notMerged}), {...alertMessage(), ts: '1753803600.000200'});
    expect(b.fingerprint).toBe(a.fingerprint);
  });
});

describe('non-alerts', () => {
  test('chatter is ignored without touching anything', async () => {
    const res = await runPipeline(deps(), {...alertMessage(), text: 'deploy done', blocks: undefined});
    expect(res.handled).toBe(false);
    expect(res.detail).toContain('not an alert');
    expect(ranArgs).toHaveLength(0);
    expect(posted).toHaveLength(0);
  });
});
