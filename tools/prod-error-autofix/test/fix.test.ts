import {describe, expect, test} from 'bun:test';
import type {Analysis} from '../src/agent/analysisSchema';
import type {ClaudeInvocation, ClaudeResult} from '../src/agent/claudeCli';
import {buildFixPrompt, defaultMrTitle, fix, parseFixReply, type FixInput} from '../src/agent/fix';
import type {RunResult, Runner} from '../src/gcloud/run';
import {changedFiles, forbiddenTouches, isTestFile} from '../src/git/worktreeStatus';
import type {ParsedAlert} from '../src/parseAlert';

const analysis: Analysis = {
  rootCause: 'getPreview passes an undefined id into a string method',
  mechanism: 'App Proxy requests arrive with no id, so id.includes throws',
  citations: [{file: 'packages/functions/src/controllers/appProxyController.js', line: 99, why: 'reads id'}],
  evidence: [{logQuery: 'severity>=ERROR', matched: 44, sample: undefined}],
  confidence: 'high',
  reproPlan: 'call getPreview with no id and assert a 400',
  fixSketch: 'answer 400 before touching Shopify',
  isInfra: false
};

const alert: ParsedAlert = {
  appName: 'BLOG',
  service: 'api',
  serviceName: 'api',
  isJob: false,
  severity: 'ERROR',
  kind: 'app',
  message: "[getPreview] Cannot read properties of undefined (reading 'includes')",
  totalCount: 44,
  suppressed: 0,
  firstSeenMinutesAgo: 2,
  windowMinutes: 10,
  logsUrl: undefined,
  projectId: 'avada-blog-app',
  source: 'blocks'
};

function input(over: Partial<FixInput> = {}): FixInput {
  return {
    analysis,
    alert,
    repoPath: '/wt',
    brainSlice: 'BRAIN',
    model: 'claude-sonnet-5',
    timeoutMs: 1000,
    attempt: 1,
    previousAttempt: undefined,
    ...over
  };
}

/** Answers git calls from a map keyed by the subcommand. */
function gitRunner(status: string, diff = 'diff text', stat = ' 1 file changed'): Runner {
  return async args => {
    const res = (stdout: string): RunResult => ({code: 0, stdout, stderr: '', timedOut: false});
    if (args.includes('status')) return res(status);
    if (args.includes('--stat')) return res(stat);
    if (args.includes('diff')) return res(diff);
    return res('');
  };
}

function claudeReturning(text: string, ok = true): (inv: ClaudeInvocation) => Promise<ClaudeResult> {
  return async () => ({
    ok,
    text,
    costUsd: 0.05,
    numTurns: 8,
    sessionId: 's',
    permissionDenials: [],
    failure: ok ? undefined : 'timeout',
    detail: ok ? undefined : 'killed'
  });
}

const goodReply = JSON.stringify({
  summary: 'Answer 400 when id is missing.',
  mrTitle: 'fix(prod): [BLOG] 400 on app proxy preview without an id',
  risks: 'check the crawler path still 200s with an id'
});

describe('isTestFile', () => {
  test('recognises the layouts these repos use', () => {
    expect(isTestFile('packages/functions/src/controllers/__tests__/x.test.js')).toBe(true);
    expect(isTestFile('packages/functions/src/x.test.js')).toBe(true);
    expect(isTestFile('packages/assets/src/x.spec.tsx')).toBe(true);
    expect(isTestFile('packages/functions/src/controllers/x.js')).toBe(false);
  });
});

describe('forbiddenTouches', () => {
  test('dependency manifests are blocked — CI installs immutably', () => {
    expect(forbiddenTouches(['package.json'])).toEqual(['package.json']);
    expect(forbiddenTouches(['yarn.lock'])).toEqual(['yarn.lock']);
    expect(forbiddenTouches(['packages/functions/package.json'])).toHaveLength(1);
  });

  test('deploy and project config are blocked', () => {
    expect(forbiddenTouches(['.gitlab-ci.yml', 'firebase.json', '.firebaserc', '.env.production'])).toHaveLength(4);
  });

  test('ordinary source and tests are allowed', () => {
    expect(
      forbiddenTouches(['packages/functions/src/controllers/x.js', 'packages/functions/src/__tests__/x.test.js'])
    ).toEqual([]);
  });
});

describe('changedFiles', () => {
  test('parses porcelain, including untracked and renames', async () => {
    const status = [
      ' M packages/functions/src/controllers/appProxyController.js',
      '?? packages/functions/src/controllers/__tests__/appProxy.test.js',
      'R  old/path.js -> new/path.js'
    ].join('\n');
    const files = await changedFiles('/wt', gitRunner(status));
    expect(files.map(f => f.path)).toEqual([
      'packages/functions/src/controllers/appProxyController.js',
      'packages/functions/src/controllers/__tests__/appProxy.test.js',
      'new/path.js'
    ]);
    expect(files[1]!.added).toBe(true);
  });

  test('a failed git call yields no files rather than throwing', async () => {
    const failing: Runner = async () => ({code: 128, stdout: '', stderr: 'not a repo', timedOut: false});
    expect(await changedFiles('/wt', failing)).toEqual([]);
  });
});

describe('fix outcome is read from git, not from the agent', () => {
  const status = [
    ' M packages/functions/src/controllers/appProxyController.js',
    '?? packages/functions/src/controllers/__tests__/appProxy.test.js'
  ].join('\n');

  test('source plus test is a pass', async () => {
    const out = await fix(input(), {claude: claudeReturning(goodReply), runner: gitRunner(status)});
    expect(out.ok).toBe(true);
    expect(out.sourceFiles).toHaveLength(1);
    expect(out.testFiles).toHaveLength(1);
    expect(out.mrTitle).toContain('400 on app proxy');
    expect(out.risks).toContain('crawler');
    expect(out.costUsd).toBeCloseTo(0.05);
  });

  test('an agent that claims success but changed nothing fails', async () => {
    const out = await fix(input(), {
      claude: claudeReturning('I fixed it! ' + goodReply),
      runner: gitRunner('')
    });
    expect(out.ok).toBe(false);
    expect(out.failure).toBe('no_changes');
  });

  test('no test means no MR — nothing would prove the bug is gone', async () => {
    const out = await fix(input(), {
      claude: claudeReturning(goodReply),
      runner: gitRunner(' M packages/functions/src/controllers/appProxyController.js')
    });
    expect(out.ok).toBe(false);
    expect(out.failure).toBe('no_test_added');
  });

  test('a test with no source change does not fix a production error', async () => {
    const out = await fix(input(), {
      claude: claudeReturning(goodReply),
      runner: gitRunner('?? packages/functions/src/__tests__/x.test.js')
    });
    expect(out.ok).toBe(false);
    expect(out.failure).toBe('only_tests_changed');
  });

  test('touching a lockfile blocks the MR and names the file', async () => {
    const out = await fix(input(), {
      claude: claudeReturning(goodReply),
      runner: gitRunner([' M packages/functions/src/x.js', ' M yarn.lock', '?? a.test.js'].join('\n'))
    });
    expect(out.ok).toBe(false);
    expect(out.failure).toBe('touched_forbidden');
    expect(out.detail).toContain('yarn.lock');
  });

  test('an agent failure keeps the cost and reports the reason', async () => {
    const out = await fix(input(), {claude: claudeReturning('', false), runner: gitRunner(status)});
    expect(out.ok).toBe(false);
    expect(out.failure).toBe('agent_failed');
    expect(out.detail).toContain('timeout');
  });

  test('a malformed reply is cosmetic — the diff still counts', async () => {
    const out = await fix(input(), {
      claude: claudeReturning('I changed the controller and added a test.'),
      runner: gitRunner(status)
    });
    expect(out.ok).toBe(true);
    expect(out.summary).toContain('added a test');
    expect(out.mrTitle).toBe(defaultMrTitle(analysis, alert));
  });
});

describe('parseFixReply', () => {
  test('takes the fields it needs and truncates a long title', () => {
    const r = parseFixReply(JSON.stringify({summary: 's', mrTitle: 'x'.repeat(300), risks: 'r'}), 'fallback');
    expect(r.mrTitle.length).toBe(120);
    expect(r.risks).toBe('r');
  });

  test('an empty title falls back rather than producing an empty MR title', () => {
    expect(parseFixReply(JSON.stringify({summary: 's', mrTitle: '   '}), 'fallback').mrTitle).toBe('fallback');
  });
});

describe('defaultMrTitle', () => {
  test('names the app and stays short', () => {
    const title = defaultMrTitle({...analysis, rootCause: 'a'.repeat(200)}, alert);
    expect(title.startsWith('fix(prod): [BLOG] ')).toBe(true);
    expect(title.length).toBeLessThan(110);
  });
});

describe('buildFixPrompt', () => {
  test('carries the confirmed cause and never the log bundle', () => {
    const prompt = buildFixPrompt(input());
    expect(prompt).toContain('already confirmed');
    expect(prompt).toContain(analysis.rootCause);
    expect(prompt).toContain('appProxyController.js:99');
    expect(prompt).toContain('Smallest diff');
    expect(prompt).toContain('failing before your change, passing after');
  });

  test('names every forbidden file explicitly', () => {
    const prompt = buildFixPrompt(input());
    for (const f of ['package.json', 'lockfile', '.gitlab-ci.yml', 'firebase.json', '.firebaserc']) {
      expect(prompt).toContain(f);
    }
  });

  test('a refuted earlier attempt is stated as such', () => {
    const prompt = buildFixPrompt(
      input({previousAttempt: {rootCause: 'blamed the cache', diff: '--- a\n+++ b'}})
    );
    expect(prompt).toContain('shipped and did not work');
    expect(prompt).toContain('blamed the cache');
  });
});
