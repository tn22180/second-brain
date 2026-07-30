import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {analyze, buildAnalyzePrompt, type AnalyzeInput} from '../src/agent/analyze';
import {extractJson, parseAnalysis, validateAnalysis, type Analysis} from '../src/agent/analysisSchema';
import {buildArgs, parseEnvelope, type ClaudeInvocation, type ClaudeResult} from '../src/agent/claudeCli';
import {libToSrc, verifyCitation, verifyEvidence} from '../src/agent/verify';
import type {LogBundle} from '../src/gcloud/logs';
import type {RunResult, Runner} from '../src/gcloud/run';
import type {ParsedAlert} from '../src/parseAlert';

const repo = join('/tmp', `autofix-analyze-${process.pid}`);
const SRC = 'packages/functions/src/controllers/appProxyController.js';

beforeEach(() => {
  mkdirSync(join(repo, 'packages/functions/src/controllers'), {recursive: true});
  writeFileSync(join(repo, SRC), ['// 1', 'const {id} = ctx.query;', '', 'export default {};', ''].join('\n'));
});
afterEach(() => {
  rmSync(repo, {recursive: true, force: true});
});

const goodAnalysis: Analysis = {
  rootCause: 'getPreview passes an undefined id straight into a string method',
  mechanism: 'App Proxy calls arrive without id → id.includes throws',
  citations: [{file: SRC, line: 2, why: 'reads id off the query without checking it'}],
  evidence: [{logQuery: 'severity>=ERROR', matched: 44, sample: 'Cannot read properties of undefined'}],
  confidence: 'high',
  reproPlan: 'call getPreview with no id and assert 400',
  fixSketch: 'answer 400 before touching Shopify',
  isInfra: false
};

describe('extractJson', () => {
  test('finds a bare object', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  test('finds it inside a fence with prose around it', () => {
    const text = 'Here is my answer:\n```json\n{"a":1}\n```\nHope that helps.';
    expect(extractJson(text)).toBe('{"a":1}');
  });

  test('takes the last object, so a restated schema does not win', () => {
    const text = 'The shape is {"rootCause":"string"} and my answer is {"rootCause":"real"}';
    expect(extractJson(text)).toBe('{"rootCause":"real"}');
  });

  test('handles nested braces', () => {
    expect(extractJson('{"a":{"b":[{"c":1}]}}')).toBe('{"a":{"b":[{"c":1}]}}');
  });

  test('returns undefined when there is no object', () => {
    expect(extractJson('I could not determine the cause.')).toBeUndefined();
    expect(extractJson('[1,2,3]')).toBeUndefined();
  });
});

describe('validateAnalysis', () => {
  test('accepts a complete analysis', () => {
    const res = validateAnalysis(goodAnalysis);
    expect(res.ok).toBe(true);
  });

  test('every missing field is reported at once, not one per round', () => {
    const res = validateAnalysis({});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.length).toBeGreaterThan(5);
    expect(res.errors.join(' ')).toContain('rootCause');
    expect(res.errors.join(' ')).toContain('citations');
  });

  test('an empty citations array is rejected — name the code', () => {
    const res = validateAnalysis({...goodAnalysis, citations: []});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.join(' ')).toContain('name the code you are accusing');
  });

  test('an empty evidence array is rejected — a cause with no log is a guess', () => {
    const res = validateAnalysis({...goodAnalysis, evidence: []});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.join(' ')).toContain('guess');
  });

  test('a non-integer or zero line is rejected', () => {
    for (const line of [0, -1, 1.5, 'ten']) {
      const res = validateAnalysis({...goodAnalysis, citations: [{file: 'a.js', line, why: 'x'}]});
      expect(res.ok).toBe(false);
    }
  });

  test('confidence is constrained', () => {
    expect(validateAnalysis({...goodAnalysis, confidence: 'very high'}).ok).toBe(false);
    expect(validateAnalysis({...goodAnalysis, confidence: 'low'}).ok).toBe(true);
  });

  test('isInfra must be a real boolean, not a string', () => {
    expect(validateAnalysis({...goodAnalysis, isInfra: 'false'}).ok).toBe(false);
  });

  test('parseAnalysis goes from raw reply text to a value', () => {
    const res = parseAnalysis('```json\n' + JSON.stringify(goodAnalysis) + '\n```');
    expect(res.ok).toBe(true);
  });
});

describe('libToSrc', () => {
  test('maps the deployed path back to source', () => {
    expect(libToSrc('/workspace/lib/controllers/articleController.js')).toBe(
      'packages/functions/src/controllers/articleController.js'
    );
    expect(libToSrc('packages/functions/lib/services/x.js')).toBe('packages/functions/src/services/x.js');
  });

  test('a source path is not a lib path', () => {
    expect(libToSrc('packages/functions/src/controllers/x.js')).toBeUndefined();
    expect(libToSrc('packages/assets/src/library/x.js')).toBeUndefined();
  });
});

describe('verifyCitation', () => {
  test('accepts a real file on a non-blank line', () => {
    expect(verifyCitation(repo, {file: SRC, line: 2, why: 'x'}).ok).toBe(true);
  });

  test('rejects a lib path and hands back the src path', () => {
    const v = verifyCitation(repo, {file: '/workspace/lib/controllers/appProxyController.js', line: 99, why: 'x'});
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('babel output');
    expect(v.suggestion).toBe('packages/functions/src/controllers/appProxyController.js');
  });

  test('rejects a missing file', () => {
    const v = verifyCitation(repo, {file: 'packages/functions/src/nope.js', line: 1, why: 'x'});
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('file does not exist');
  });

  test('rejects a line past the end of the file', () => {
    const v = verifyCitation(repo, {file: SRC, line: 900, why: 'x'});
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('citation points at 900');
  });

  test('rejects a blank line — nothing there to accuse', () => {
    expect(verifyCitation(repo, {file: SRC, line: 3, why: 'x'}).reason).toContain('blank');
  });

  test('rejects a path that escapes the worktree', () => {
    expect(verifyCitation(repo, {file: '../../etc/passwd', line: 1, why: 'x'}).reason).toBe(
      'path escapes the worktree'
    );
  });
});

describe('verifyEvidence', () => {
  const runner = (res: Partial<RunResult>): Runner => async () => ({
    code: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    ...res
  });

  test('a query that still matches passes', async () => {
    const v = await verifyEvidence(
      {projectId: 'p', timeoutMs: 1000},
      {logQuery: 'severity>=ERROR', matched: 44, sample: undefined},
      runner({stdout: '[{"x":1}]'})
    );
    expect(v.ok).toBe(true);
  });

  test('a query that matches nothing is rejected as unreproducible', async () => {
    const v = await verifyEvidence(
      {projectId: 'p', timeoutMs: 1000},
      {logQuery: 'severity>=ERROR', matched: 44, sample: undefined},
      runner({stdout: '[]'})
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('not reproducible');
  });

  test('a query that will not run is rejected with the error', async () => {
    const v = await verifyEvidence(
      {projectId: 'p', timeoutMs: 1000},
      {logQuery: 'nonsense(', matched: 1, sample: undefined},
      runner({code: 1, stderr: 'INVALID_ARGUMENT: unparseable filter'})
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('INVALID_ARGUMENT');
  });
});

describe('claude CLI plumbing', () => {
  test('variadic flags go last so they cannot swallow other arguments', () => {
    const inv: ClaudeInvocation = {
      prompt: 'p',
      model: 'm',
      appendSystemPrompt: 'brain',
      cwd: '/repo',
      allowedTools: ['Read', 'Grep'],
      addDirs: ['/a'],
      permissionMode: 'default',
      timeoutMs: 1000
    };
    const args = buildArgs(inv, 'claude');
    expect(args.indexOf('--allowedTools')).toBeGreaterThan(args.indexOf('--model'));
    expect(args.indexOf('--allowedTools')).toBeGreaterThan(args.indexOf('--add-dir'));
    expect(args[args.length - 1]).toBe('Grep');
    // No --max-turns: this CLI build does not have it, the caller bounds rounds.
    expect(args).not.toContain('--max-turns');
  });

  test('the envelope shape is the one the installed CLI emits', () => {
    const res = parseEnvelope(
      JSON.stringify({is_error: false, result: 'OK', total_cost_usd: 0.023, num_turns: 1, session_id: 's'})
    );
    expect(res).toMatchObject({ok: true, text: 'OK', costUsd: 0.023, numTurns: 1, sessionId: 's'});
  });

  test('is_error is a failure even with exit code 0', () => {
    const res = parseEnvelope(JSON.stringify({is_error: true, result: '', subtype: 'error_max_turns'}));
    expect(res.ok).toBe(false);
    expect(res.failure).toBe('agent_error');
  });

  test('non-envelope output is reported as unparseable', () => {
    expect(parseEnvelope('command not found').failure).toBe('unparseable');
  });
});

describe('the analyze loop', () => {
  const alert: ParsedAlert = {
    appName: 'BLOG',
    service: 'api',
    serviceName: 'api',
    isJob: false,
    severity: 'ERROR',
    kind: 'app',
    message: "Cannot read properties of undefined (reading 'includes')",
    totalCount: 44,
    suppressed: 0,
    firstSeenMinutesAgo: 3,
    windowMinutes: 10,
    logsUrl: undefined,
    projectId: 'avada-blog-app',
    source: 'blocks'
  };

  const logs: LogBundle = {
    projectId: 'avada-blog-app',
    service: 'api',
    fromIso: 'A',
    toIso: 'B',
    queries: [
      {name: 'errors', filter: 'f1', matched: 1, truncated: false, entries: [{timestamp: 't', severity: 'ERROR', tag: '[getPreview]', message: 'boom', stack: 'at x', status: undefined, method: undefined, url: undefined, latencySeconds: undefined, insertId: 'i'}]},
      {name: 'stderr', filter: 'f2', matched: 0, truncated: false, entries: []},
      {name: 'requests', filter: 'f3', matched: 1, truncated: false, entries: []}
    ],
    raw: {}
  };

  function input(over: Partial<AnalyzeInput> = {}): AnalyzeInput {
    return {
      alert,
      fingerprint: 'fp1',
      repoPath: repo,
      projectId: 'avada-blog-app',
      brainSlice: 'BRAIN',
      logs,
      logsPath: '/jobs/fp1/logs.json',
      model: 'claude-opus-5',
      maxRounds: 5,
      timeoutMs: 1000,
      gcloudTimeoutMs: 1000,
      previousAttempt: undefined,
      ...over
    };
  }

  const okRunner: Runner = async () => ({code: 0, stdout: '[{"x":1}]', stderr: '', timedOut: false});

  function claudeReturning(texts: string[]): {claude: (inv: ClaudeInvocation) => Promise<ClaudeResult>; prompts: string[]} {
    const prompts: string[] = [];
    let i = 0;
    return {
      prompts,
      claude: async inv => {
        prompts.push(inv.prompt);
        return {
          ok: true,
          text: texts[i++] ?? '{}',
          costUsd: 0.01,
          numTurns: 3,
          sessionId: 's',
          permissionDenials: [],
          failure: undefined,
          detail: undefined
        };
      }
    };
  }

  test('a good first answer ends the loop in one round', async () => {
    const {claude} = claudeReturning([JSON.stringify(goodAnalysis)]);
    const out = await analyze(input(), {claude, runner: okRunner});
    expect(out.ok).toBe(true);
    expect(out.rounds.length).toBe(1);
    expect(out.totalCostUsd).toBeCloseTo(0.01);
    expect(out.analysis?.rootCause).toContain('undefined id');
  });

  test('a schema error is fed back by name and the loop continues', async () => {
    const {claude, prompts} = claudeReturning(['not json at all', JSON.stringify(goodAnalysis)]);
    const out = await analyze(input(), {claude, runner: okRunner});
    expect(out.ok).toBe(true);
    expect(out.rounds.length).toBe(2);
    expect(prompts[1]).toContain('was rejected');
    expect(prompts[1]).toContain('no JSON object found');
  });

  test('a lib citation is rejected and the src path is handed back', async () => {
    const bad = {...goodAnalysis, citations: [{file: '/workspace/lib/controllers/appProxyController.js', line: 844, why: 'x'}]};
    const {claude, prompts} = claudeReturning([JSON.stringify(bad), JSON.stringify(goodAnalysis)]);
    const out = await analyze(input(), {claude, runner: okRunner});
    expect(out.ok).toBe(true);
    expect(prompts[1]).toContain('packages/functions/src/controllers/appProxyController.js');
    expect(prompts[1]).toContain('not by that line number');
  });

  test('unreproducible evidence is rejected', async () => {
    const emptyRunner: Runner = async () => ({code: 0, stdout: '[]', stderr: '', timedOut: false});
    const {claude, prompts} = claudeReturning([JSON.stringify(goodAnalysis), JSON.stringify(goodAnalysis)]);
    const out = await analyze(input(), {claude, runner: emptyRunner});
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('inconclusive');
    expect(prompts[1]).toContain('not reproducible');
  });

  test('low confidence never passes the gate', async () => {
    const {claude} = claudeReturning(Array(5).fill(JSON.stringify({...goodAnalysis, confidence: 'low'})));
    const out = await analyze(input(), {claude, runner: okRunner});
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('inconclusive');
    expect(out.rounds.length).toBe(5);
    // The best attempt is still returned so the thread reply has something in it.
    expect(out.analysis?.rootCause).toBeDefined();
  });

  test('the round budget is honoured exactly', async () => {
    const {claude} = claudeReturning(Array(10).fill('garbage'));
    const out = await analyze(input({maxRounds: 3}), {claude, runner: okRunner});
    expect(out.rounds.length).toBe(3);
    expect(out.analysis).toBeUndefined();
  });

  test('a timeout stops the loop instead of burning the remaining rounds', async () => {
    let calls = 0;
    const claude = async (): Promise<ClaudeResult> => {
      calls++;
      return {
        ok: false,
        text: '',
        costUsd: undefined,
        numTurns: undefined,
        sessionId: undefined,
        permissionDenials: [],
        failure: 'timeout',
        detail: 'killed after 1000ms'
      };
    };
    const out = await analyze(input(), {claude, runner: okRunner});
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('agent_failed');
    expect(calls).toBe(1);
  });

  test('evidence is not required when no log bundle loaded', async () => {
    let ran = 0;
    const counting: Runner = async () => {
      ran++;
      return {code: 0, stdout: '[]', stderr: '', timedOut: false};
    };
    const {claude, prompts} = claudeReturning([JSON.stringify(goodAnalysis)]);
    const out = await analyze(input({logs: undefined, logsPath: undefined}), {claude, runner: counting});
    expect(out.ok).toBe(true);
    expect(ran).toBe(0);
    expect(prompts[0]).toContain('No log bundle was available');
  });
});

describe('buildAnalyzePrompt', () => {
  const alert: ParsedAlert = {
    appName: 'SEO',
    service: 'job:avada-seo-optimize-image-job',
    serviceName: 'avada-seo-optimize-image-job',
    isJob: true,
    severity: 'ERROR',
    kind: 'infra',
    message: 'Memory limit of 1024 MiB exceeded',
    totalCount: 10,
    suppressed: 4,
    firstSeenMinutesAgo: 1,
    windowMinutes: 10,
    logsUrl: undefined,
    projectId: 'avada-seo',
    source: 'blocks'
  };
  const base: AnalyzeInput = {
    alert,
    fingerprint: 'fp',
    repoPath: '/repo',
    projectId: 'avada-seo',
    brainSlice: 'BRAIN',
    logs: undefined,
    logsPath: undefined,
    model: 'm',
    maxRounds: 5,
    timeoutMs: 1,
    gcloudTimeoutMs: 1,
    previousAttempt: undefined
  };

  test('an infra alert says so in the prompt', () => {
    expect(buildAnalyzePrompt(base, 1, [])).toContain('infra class, report only, no code fix');
  });

  test('a degraded parse is flagged so the agent does not trust missing fields', () => {
    const prompt = buildAnalyzePrompt({...base, alert: {...alert, source: 'short'}}, 1, []);
    expect(prompt).toContain('may be missing or re-derived');
  });

  test('a refuted previous fix is stated as refuted', () => {
    const prompt = buildAnalyzePrompt(
      {...base, previousAttempt: {mrUrl: 'https://gitlab/x/1', rootCause: 'was the cache', diff: '--- a\n+++ b'}},
      1,
      []
    );
    expect(prompt).toContain('reached prod and the error still fired');
    expect(prompt).toContain('**refuted**');
    expect(prompt).toContain('was the cache');
  });

  test('round one carries no rejection section', () => {
    expect(buildAnalyzePrompt(base, 1, [])).not.toContain('was rejected');
  });
});
