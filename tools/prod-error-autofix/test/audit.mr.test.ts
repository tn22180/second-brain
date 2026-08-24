import {describe, expect, test} from 'bun:test';
import {FIX_TOOLS, type ClaudeInvocation, type ClaudeResult} from '../src/agent/claudeCli';
import {
  AUDIT_FORBIDDEN_PATTERNS,
  auditMrTitle,
  buildAuditMrBody,
  eligibleCleanup,
  runBothMrLanes,
  runMrLane,
  type MrLaneDeps,
  type MrLaneInput
} from '../src/audit/mr';
import type {RunResult, Runner} from '../src/gcloud/run';
import {openMr} from '../src/git/openMr';
import type {TriageFinding, TriageVerdict} from '../src/audit/triage';

/**
 * Nothing in this file is allowed to reach git, a worktree, or a repo under
 * `projects/Falcon/`. Every side effect is injected, and the push path is checked
 * by asserting on the argv the fake runner was handed — never by running it.
 */

const ok = (over: Partial<RunResult> = {}): RunResult => ({code: 0, stdout: '', stderr: '', timedOut: false, ...over});

const PUSH_CREATED = `remote: View merge request for audit/cleanup-seo-20260819:
remote:   https://git.avada.net/avada/seo/-/merge_requests/2210
To https://git.avada.net/avada/seo.git
 * [new branch]      HEAD -> audit/cleanup-seo-20260819`;

/** A path no cleanup finding names — the stand-in for anything out of scope. */
const OTHER_FILE = 'packages/functions/src/handlers/x.js';
const LINT_FILE = 'packages/functions/src/const/default.js';

const LINT: TriageFinding[] = [
  {fp: 'aaa', file: LINT_FILE, line: 5, rule: 'no-unused-vars', message: "'CONTENT_TYPES' is defined but never used."},
  {fp: 'bbb', file: 'packages/assets/src/keep.js', line: 9, rule: 'no-unused-vars', message: "'B' is defined but never used."},
  {fp: 'ccc', file: 'packages/assets/src/undef.js', line: 3, rule: 'no-undef', message: "'admin' is not defined."}
];

const VERDICTS: TriageVerdict[] = [
  {fp: 'aaa', verdict: 'delete', reason: 'no reference anywhere'},
  {fp: 'bbb', verdict: 'keep', reason: 'reached by a dynamic require'},
  // A `delete` on a no-undef finding: the repair there is an import, never a
  // deletion, so the lane must refuse it whatever the agent voted.
  {fp: 'ccc', verdict: 'delete', reason: 'the agent voted delete on a missing import'}
];

function input(over: Partial<MrLaneInput> = {}): MrLaneInput {
  return {
    appName: 'SEO',
    repo: 'seo',
    repoPath: '/repos/seo',
    baseBranch: 'master',
    worktreeRoot: '/cache/wt',
    dateStr: '20260819',
    model: 'claude-sonnet-5',
    brainSlice: undefined,
    testCmd: ['npx', 'jest', '--ci'],
    lint: LINT,
    verdicts: VERDICTS,
    nowMs: 1_755_000_000_000,
    timeouts: {git: 1000, agent: 2000, jest: 3000},
    ...over
  };
}

interface Harness {
  deps: MrLaneDeps;
  argv: () => string[][];
  pushArgs: () => string[];
  invocations: () => ClaudeInvocation[];
  created: () => string[];
  removed: () => string[];
  recorded: () => string[];
  /** `worktree` / `baseline` / `agent` / `jest`, in the order the lane asked for them. */
  events: () => string[];
  baselineRuns: () => number;
  cached: () => Array<[string, string[]]>;
}

function harness(
  over: {
    diff?: string;
    untracked?: string;
    agent?: (inv: ClaudeInvocation) => ClaudeResult;
    jestOk?: boolean;
    jestSummary?: boolean;
    /** Exact failing keys the post-fix run reports. Beats `jestOk`. */
    jestFailures?: string[];
    /** Failing keys the base branch already had. */
    baseFailures?: string[];
    /** The base branch's jest never produced a summary. */
    baselineFails?: boolean;
    baseSha?: string;
    worktreeFails?: boolean;
    capped?: boolean;
    pushCode?: number;
    pushOutput?: string;
  } = {}
): Harness {
  const argv: string[][] = [];
  const invocations: ClaudeInvocation[] = [];
  const created: string[] = [];
  const removed: string[] = [];
  const recorded: string[] = [];
  const events: string[] = [];
  const baselines = new Map<string, string[]>();
  let baselineRuns = 0;
  let pushArgs: string[] = [];

  const runner: Runner = async args => {
    argv.push(args);
    const joined = args.join(' ');
    if (joined.includes('diff --name-only')) return ok({stdout: over.diff ?? `${LINT_FILE}\n`});
    if (joined.includes('ls-files --others')) return ok({stdout: over.untracked ?? ''});
    if (joined.includes('diff --cached')) return ok({stdout: `${LINT_FILE}\n`});
    if (joined.includes('rev-parse HEAD')) return ok({stdout: 'cafe1234\n'});
    if (joined.includes(' push ')) {
      pushArgs = args;
      return ok({code: over.pushCode ?? 0, stderr: over.pushOutput ?? PUSH_CREATED});
    }
    return ok();
  };

  const deps: MrLaneDeps = {
    runner,
    claude: async inv => {
      events.push('agent');
      invocations.push(inv);
      return (
        over.agent?.(inv) ?? {
          ok: true,
          text: '{"summary": "added the shopId filter"}',
          costUsd: 0.4,
          numTurns: 3,
          sessionId: 's',
          permissionDenials: [],
          failure: undefined,
          detail: undefined
        }
      );
    },
    createWorktree: async wt => {
      if (over.worktreeFails) return {ok: false, detail: 'origin/master does not resolve'};
      events.push('worktree');
      created.push(wt.dir);
      return {ok: true, value: {dir: wt.dir, branch: wt.branch, baseSha: over.baseSha ?? 'base1234'}};
    },
    linkNodeModules: async () => ({linked: ['node_modules'], missing: []}),
    commitWip: async () => ({ok: true, sha: undefined, detail: undefined}),
    removeWorktree: async ({dir}) => {
      removed.push(dir);
      return {ok: true, detail: undefined};
    },
    runJest: async () => {
      events.push('jest');
      if (over.jestSummary === false) {
        return {summary: undefined, timedOut: false, detail: 'could not read jest --json output (exit 1)'};
      }
      const failures =
        over.jestFailures ?? (over.jestOk === false ? ['a.test.js::x', 'b.test.js::y', 'c.test.js::z'] : []);
      return {
        summary: {
          ok: failures.length === 0,
          totalTests: 164,
          totalSuites: 12,
          failures,
          runtimeErrorSuites: 0
        },
        timedOut: false,
        detail: undefined
      };
    },
    measureBaseline: async () => {
      events.push('baseline');
      baselineRuns += 1;
      return over.baselineFails
        ? {ok: false, failures: [], detail: 'jest died before it printed any json'}
        : {ok: true, failures: over.baseFailures ?? [], detail: undefined};
    },
    getBaseline: (repo, baseSha) => baselines.get(`${repo}@${baseSha}`),
    putBaseline: (repo, baseSha, failures) => {
      baselines.set(`${repo}@${baseSha}`, failures);
    },
    openMr,
    checkCaps: () =>
      over.capped
        ? {allowed: false, cap: 'mr_per_repo_per_day', detail: '2/2 MR cho seo trong 24h'}
        : {allowed: true, cap: undefined, detail: undefined},
    recordMr: repo => {
      recorded.push(repo);
    }
  };

  return {
    deps,
    argv: () => argv,
    pushArgs: () => pushArgs,
    invocations: () => invocations,
    created: () => created,
    removed: () => removed,
    recorded: () => recorded,
    events: () => events,
    baselineRuns: () => baselineRuns,
    cached: () => [...baselines.entries()]
  };
}

/** Any argv reaching the runner that would have contacted the remote. */
const sawPush = (argv: string[][]): boolean => argv.some(a => a.includes('push'));

describe('what the cleanup lane is allowed to touch', () => {
  test('only no-unused-vars findings triaged delete are eligible', () => {
    expect(eligibleCleanup(LINT, VERDICTS).map(f => f.fp)).toEqual(['aaa']);
  });

  test('a keep or an unsure verdict deletes nothing', () => {
    const verdicts: TriageVerdict[] = [
      {fp: 'aaa', verdict: 'unsure', reason: 'could not tell'},
      {fp: 'bbb', verdict: 'keep', reason: 'dynamic require'}
    ];
    expect(eligibleCleanup(LINT, verdicts)).toEqual([]);
  });

  test('a fingerprint with no verdict at all is not eligible', () => {
    expect(eligibleCleanup(LINT, [])).toEqual([]);
  });
});

describe('runMrLane gates', () => {
  test('the security lane pushes its own branch and reports the MR', async () => {
    const h = harness();
    const res = await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(res.refusal).toBeUndefined();
    expect(res.pushed).toBe(true);
    expect(res.mrUrl).toBe('https://git.avada.net/avada/seo/-/merge_requests/2210');
    expect(res.branch).toBe('audit/cleanup-seo-20260819');
    expect(h.pushArgs().join(' ')).toContain('HEAD:refs/heads/audit/cleanup-seo-20260819');
    expect(h.pushArgs().join(' ')).toContain('merge_request.target=master');
    // The credential helper's job. Nothing here may carry a token.
    const flat = h.argv().flat().join(' ');
    expect(flat).not.toMatch(/glpat-|oauth2:|--password|token=/);
    // Counted only after the push landed, so a crash cannot lose the count.
    expect(h.recorded()).toEqual(['seo']);
  });

  test('a diff touching a file no finding named is refused before any push', async () => {
    const h = harness({diff: `${LINT_FILE}\npackages/functions/src/unrelated.js\n`});
    const res = await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(res.refusal).toBe('out_of_scope');
    expect(res.pushed).toBe(false);
    expect(res.detail).toContain('unrelated.js');
    expect(sawPush(h.argv())).toBe(false);
    expect(h.recorded()).toEqual([]);
  });

  test('a file the agent created is out of scope too — no finding can have named it', async () => {
    const h = harness({untracked: 'packages/functions/src/__tests__/new.test.js\n'});
    const res = await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(res.refusal).toBe('out_of_scope');
    expect(sawPush(h.argv())).toBe(false);
  });

  /**
   * These reach the gate rather than the scope check because a `secret` finding
   * legitimately names `.env` — that is exactly the case the list exists for.
   */
  test('forbidden files are refused outright even when a finding named them', async () => {
    const forbidden = [
      '.env',
      '.env.local',
      '.env.avada-seo',
      'packages/functions/.env.production',
      'yarn.lock',
      'bun.lock',
      'package-lock.json',
      '.gitlab-ci.yml',
      'firebase.json',
      '.firebaserc',
      'package.json',
      'packages/functions/package.json',
      '.audit.eslintrc.json'
    ];
    for (const file of forbidden) {
      const h = harness({diff: `${file}\n`});
      const res = await runMrLane(
        {
          ...input({
            lint: [{fp: 'aaa', file, line: 5, rule: 'no-unused-vars', message: "'X' is defined but never used."}],
            verdicts: [{fp: 'aaa', verdict: 'delete', reason: 'no reference anywhere'}]
          }),
          kind: 'cleanup'
        },
        h.deps
      );
      expect({file, refusal: res.refusal}).toEqual({file, refusal: 'forbidden_file'});
      expect(res.pushed).toBe(false);
      expect(sawPush(h.argv())).toBe(false);
    }
  });

  test('every forbidden pattern is anchored to a path segment, not a substring', () => {
    const innocent = ['packages/functions/src/env.js', 'src/package.jsonc', 'docs/firebase.json.md'];
    for (const p of innocent) {
      expect({p, hit: AUDIT_FORBIDDEN_PATTERNS.some(re => re.test(p))}).toEqual({p, hit: false});
    }
  });

  test('a red jest run means no push', async () => {
    const h = harness({jestOk: false});
    const res = await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(res.refusal).toBe('tests_failed');
    expect(res.pushed).toBe(false);
    expect(res.detail).toContain('a.test.js::x');
    expect(sawPush(h.argv())).toBe(false);
  });

  test('a jest that could not run at all is a failure, not a pass', async () => {
    const h = harness({jestSummary: false});
    const res = await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(res.refusal).toBe('tests_failed');
    expect(sawPush(h.argv())).toBe(false);
  });

  test('a hit MR cap refuses and nothing is pushed', async () => {
    const h = harness({capped: true});
    const res = await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(res.refusal).toBe('capped');
    expect(res.pushed).toBe(false);
    expect(res.detail).toContain('2/2');
    expect(sawPush(h.argv())).toBe(false);
    expect(h.recorded()).toEqual([]);
  });

  test('an empty diff is its own refusal', async () => {
    const h = harness({diff: '  \n'});
    const res = await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(res.refusal).toBe('no_changes');
    expect(sawPush(h.argv())).toBe(false);
  });

  test('a worktree that could not be created stops before the agent', async () => {
    const h = harness({worktreeFails: true});
    const res = await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(res.refusal).toBe('worktree_failed');
    expect(h.invocations()).toHaveLength(0);
    expect(sawPush(h.argv())).toBe(false);
  });

  test('an agent failure is named and pushes nothing', async () => {
    const h = harness({
      agent: () => ({
        ok: false,
        text: '',
        costUsd: 0.1,
        numTurns: 1,
        sessionId: undefined,
        permissionDenials: [],
        failure: 'timeout',
        detail: 'killed after 2000ms'
      })
    });
    const res = await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(res.refusal).toBe('agent_failed');
    expect(sawPush(h.argv())).toBe(false);
  });

  test('a failed push is reported as a failed push, never as an MR', async () => {
    const h = harness({pushCode: 1, pushOutput: 'remote: GitLab: You are not allowed to push code'});
    const res = await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(res.refusal).toBe('push_failed');
    expect(res.pushed).toBe(false);
    expect(res.mrUrl).toBeUndefined();
    // The cap counts pushes that landed. A rejected one must not spend the day's quota.
    expect(h.recorded()).toEqual([]);
  });

  test('nothing eligible means the lane never opens a worktree', async () => {
    const h = harness();
    const res = await runMrLane({...input({verdicts: []}), kind: 'cleanup'}, h.deps);

    expect(res.refusal).toBe('nothing_to_fix');
    expect(h.created()).toEqual([]);
    expect(h.invocations()).toHaveLength(0);
  });

  test('the worktree is removed whether the lane pushed or refused', async () => {
    const pushedRun = harness();
    await runMrLane({...input(), kind: 'cleanup'}, pushedRun.deps);
    expect(pushedRun.removed()).toHaveLength(1);

    const refusedRun = harness({jestOk: false});
    await runMrLane({...input(), kind: 'cleanup'}, refusedRun.deps);
    expect(refusedRun.removed()).toHaveLength(1);
  });
});

/**
 * The gate is "did this diff break anything", not "is the repo green". `blogs`
 * master carries three module-resolution suite failures (src/verify/jest.ts:57-58),
 * so a green bar would refuse that repo's MR every morning forever and the report
 * could not tell that apart from a fix that broke the tests.
 */
describe('the jest gate compares against the base branch', () => {
  const BLOGS_MASTER = [
    'packages/functions/test/a.test.js::<suite did not run>',
    'packages/functions/test/b.test.js::<suite did not run>',
    'packages/functions/test/c.test.js::<suite did not run>'
  ];

  test('failures the base branch already had do not refuse the push', async () => {
    const h = harness({baseFailures: BLOGS_MASTER, jestFailures: BLOGS_MASTER});
    const res = await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(res.refusal).toBeUndefined();
    expect(res.pushed).toBe(true);
    expect(res.mrUrl).toBe('https://git.avada.net/avada/seo/-/merge_requests/2210');
  });

  test('a baseline failure the fix happened to clear is not a refusal either', async () => {
    const h = harness({baseFailures: BLOGS_MASTER, jestFailures: BLOGS_MASTER.slice(1)});
    const res = await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(res.refusal).toBeUndefined();
    expect(res.pushed).toBe(true);
  });

  test('a failure the base did not have refuses, and no push argv is ever built', async () => {
    const h = harness({
      baseFailures: BLOGS_MASTER,
      jestFailures: [...BLOGS_MASTER, 'packages/functions/test/x.test.js::adds the shopId filter']
    });
    const res = await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(res.refusal).toBe('tests_failed');
    expect(res.pushed).toBe(false);
    expect(res.detail).toContain('x.test.js::adds the shopId filter');
    // The three the base already had must not be named as if the fix caused them.
    expect(res.detail).not.toContain('a.test.js');
    expect(sawPush(h.argv())).toBe(false);
    expect(h.recorded()).toEqual([]);
  });

  test('a baseline that could not be measured refuses — unmeasured is not "nothing failing"', async () => {
    const h = harness({baselineFails: true, jestFailures: []});
    const res = await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(res.refusal).toBe('no_baseline');
    expect(res.pushed).toBe(false);
    expect(res.detail).toContain('jest died before it printed any json');
    expect(sawPush(h.argv())).toBe(false);
    // Nothing unmeasurable is ever written to the cache; the next run measures again.
    expect(h.cached()).toEqual([]);
  });

  test('an unmeasurable baseline stops before the fix agent is paid for', async () => {
    const h = harness({baselineFails: true});
    await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(h.invocations()).toHaveLength(0);
  });

  test('the baseline is measured on the clean worktree, before the agent edits anything', async () => {
    const h = harness({baseFailures: BLOGS_MASTER, jestFailures: BLOGS_MASTER});
    await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    // A baseline taken after the edits measures the fix, not the base.
    expect(h.events()).toEqual(['worktree', 'baseline', 'agent', 'jest']);
  });

  test('the baseline is cached by (repo, base sha) — a second run does not re-measure it', async () => {
    // Was "the second lane does not re-run it" until the security lane was removed
    // (2026-08-22). One lane still runs once a day per repo, and measuring a base
    // branch is a full jest run, so the cache still has to hold across calls.
    const h = harness({diff: `${LINT_FILE}\n`, baseFailures: BLOGS_MASTER});
    await runMrLane({...input(), kind: 'cleanup'}, h.deps);
    await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(h.created()).toHaveLength(2);
    expect(h.baselineRuns()).toBe(1);
    expect(h.cached()).toEqual([['seo@base1234', BLOGS_MASTER]]);
  });

  test('a different base sha is a different baseline', async () => {
    const first = harness({baseSha: 'aaaa1111', baseFailures: BLOGS_MASTER});
    await runMrLane({...input(), kind: 'cleanup'}, first.deps);
    expect(first.cached()).toEqual([['seo@aaaa1111', BLOGS_MASTER]]);

    const second = harness({baseSha: 'bbbb2222', baseFailures: []});
    await runMrLane({...input(), kind: 'cleanup'}, second.deps);
    expect(second.cached()).toEqual([['seo@bbbb2222', []]]);
  });

  test('the MR body still reports what jest did, plus what the base was already failing', async () => {
    const h = harness({baseFailures: BLOGS_MASTER, jestFailures: BLOGS_MASTER});
    await runMrLane({...input(), kind: 'cleanup'}, h.deps);
    // `openMr` puts the description in the commit body — a push option cannot hold
    // a line break.
    const commit = h.argv().find(a => a.includes('commit'))?.join(' ') ?? '';

    expect(commit).toContain('164 tests');
    expect(commit).toContain('baseline 3 failing');
  });
});

describe('the fix agent the lane runs', () => {
  test('it edits inside the worktree and nowhere else', async () => {
    const h = harness();
    await runMrLane({...input(), kind: 'cleanup'}, h.deps);
    const inv = h.invocations()[0]!;

    expect(inv.cwd).toBe('/cache/wt/seo-cleanup-20260819');
    expect(inv.addDirs).toEqual([]);
    expect(inv.permissionMode).toBe('acceptEdits');
    expect(inv.allowedTools).toEqual(FIX_TOOLS);
  });

  test('the prompt forbids the files a diff would be thrown away for touching', async () => {
    const h = harness();
    await runMrLane({...input(), kind: 'cleanup'}, h.deps);
    const prompt = h.invocations()[0]!.prompt;

    expect(prompt).toContain('.env');
    expect(prompt).toContain('package.json');
    expect(prompt).toContain('.gitlab-ci.yml');
  });

  test('the cleanup prompt deletes declarations, never files or exports', async () => {
    const h = harness({diff: `${LINT_FILE}\n`});
    await runMrLane({...input(), kind: 'cleanup'}, h.deps);
    const prompt = h.invocations()[0]!.prompt;

    expect(prompt).toContain(LINT_FILE);
    expect(prompt).toContain('CONTENT_TYPES');
    expect(prompt).toMatch(/do not delete (any )?file/i);
    expect(prompt).toMatch(/export/i);
    // The findings the triage did not clear must not be in front of the agent.
    expect(prompt).not.toContain('packages/assets/src/undef.js');
    expect(prompt).not.toContain('packages/assets/src/keep.js');
  });
});

describe('the lanes the audit runs', () => {
  test('cleanup is the only lane — a security fix is a ticket, never an MR', async () => {
    const h = harness();
    const lanes = await runBothMrLanes(input(), h.deps);

    expect(Object.keys(lanes)).toEqual(['cleanup']);
    expect(lanes.cleanup.branch).toBe('audit/cleanup-seo-20260819');
    expect(h.created()).toEqual(['/cache/wt/seo-cleanup-20260819']);
  });

  /**
   * The lane's scope is its own findings. A code change smuggled into a diff of
   * deletions has to refuse, which is what keeps a reviewer's approval meaning one thing.
   */
  test('the cleanup lane refuses a file no deletion finding named', async () => {
    const h = harness({diff: `${LINT_FILE}\n${OTHER_FILE}\n`});
    const lanes = await runBothMrLanes(input(), h.deps);

    expect(lanes.cleanup.refusal).toBe('out_of_scope');
    expect(lanes.cleanup.detail).toContain(OTHER_FILE);
    expect(sawPush(h.argv())).toBe(false);
  });

  test('the cap is read per lane, so the cleanup lane refuses on its own', async () => {
    const h = harness({capped: true, diff: `${LINT_FILE}\n`});
    const res = await runMrLane({...input(), kind: 'cleanup'}, h.deps);

    expect(res.refusal).toBe('capped');
    expect(res.branch).toBe('audit/cleanup-seo-20260819');
    expect(sawPush(h.argv())).toBe(false);
  });
});

describe('the MR body', () => {
  test('a secret value never reaches the MR body or its title', () => {
    const leaky: TriageFinding = {
      ...LINT[0]!,
      message: "'X' unused — token shpat_<fixture> is right above it"
    };
    const body = buildAuditMrBody({
      appName: 'SEO',
      dateStr: '20260819',
      cleanup: [leaky],
      agentSummary: 'moved shpat_<fixture> out of the tree',
      jestLine: 'x'
    });
    expect(body).not.toContain('shpat_<fixture>');
    expect(body).toContain('<redacted>');
    expect(auditMrTitle('SEO', 1)).not.toContain('shpat_');
  });

  test('it says nobody has reviewed it', () => {
    const body = buildAuditMrBody({
      appName: 'SEO',
      dateStr: '20260819',
      cleanup: [LINT[0]!],
      agentSummary: 'removed one unused constant',
      jestLine: '164 tests, 0 failing'
    });
    expect(body).toContain('reviewed by a person');
  });

  test('a cleanup MR counts the declarations and names the rule', () => {
    const body = buildAuditMrBody({
      appName: 'SEO',
      dateStr: '20260819',
      cleanup: [LINT[0]!],
      agentSummary: 'removed one unused constant',
      jestLine: '164 tests, 0 failing'
    });
    expect(body).toContain(`${LINT_FILE}:5`);
    expect(body).toContain('no-unused-vars');
    expect(body).toMatch(/no file was deleted|không xoá file|declaration/i);
  });
});
