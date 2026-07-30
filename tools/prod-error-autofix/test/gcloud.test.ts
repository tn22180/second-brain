import {describe, expect, test} from 'bun:test';
import {probeDeploy} from '../src/gcloud/deploy';
import {buildFilters, compact, fetchLogs, serviceClause, summarize} from '../src/gcloud/logs';
import {classifyFailure, type RunResult, type Runner} from '../src/gcloud/run';

function result(over: Partial<RunResult> = {}): RunResult {
  return {code: 0, stdout: '', stderr: '', timedOut: false, ...over};
}

/** Answers each invocation from a queue, and records what was asked. */
function scriptedRunner(replies: RunResult[]): {runner: Runner; calls: string[][]} {
  const calls: string[][] = [];
  let i = 0;
  const runner: Runner = async args => {
    calls.push(args);
    return replies[i++] ?? result({code: 1, stderr: 'no more replies'});
  };
  return {runner, calls};
}

describe('classifyFailure', () => {
  test('auth is singled out so the job can be parked before any model runs', () => {
    for (const stderr of [
      'ERROR: (gcloud.logging.read) You do not currently have an active account selected. Please run: gcloud auth login',
      'Reauthentication required',
      'invalid_grant: Token has been expired or revoked',
      'code: 401, message: Request had invalid authentication credentials'
    ]) {
      expect(classifyFailure(result({code: 1, stderr}))).toBe('auth');
    }
  });

  test('permission, not found and timeout are distinct', () => {
    expect(classifyFailure(result({code: 1, stderr: 'PERMISSION_DENIED: caller lacks permission'}))).toBe(
      'permission'
    );
    expect(classifyFailure(result({code: 1, stderr: 'NOT_FOUND: service does not exist'}))).toBe('not_found');
    expect(classifyFailure(result({code: 143, timedOut: true}))).toBe('timeout');
    expect(classifyFailure(result({code: 1, stderr: 'quota exceeded'}))).toBe('other');
  });
});

describe('log filters', () => {
  test('matches gen1, gen2 and job label shapes in one clause', () => {
    const clause = serviceClause('api');
    expect(clause).toContain('resource.labels.service_name="api"');
    expect(clause).toContain('resource.labels.function_name="api"');
    expect(clause).toContain('resource.labels.job_name="api"');
  });

  test('a job service is matched by its bare name', () => {
    expect(serviceClause('job:avada-seo-optimize-image-job')).toContain(
      'resource.labels.job_name="avada-seo-optimize-image-job"'
    );
    expect(serviceClause('job:x')).not.toContain('job:x');
  });

  test('no service means no service clause, not a broken filter', () => {
    expect(serviceClause(undefined)).toBe('');
    const f = buildFilters({service: undefined, fromIso: 'A', toIso: 'B'});
    expect(f.errors).toBe('timestamp>="A" AND timestamp<="B" AND severity>=ERROR');
  });

  test('the stderr read carries no severity term at all', () => {
    // 1592/1592 app error lines in the bugprod window had no severity field, so a
    // severity-filtered read found none of them.
    const f = buildFilters({service: 'api', fromIso: 'A', toIso: 'B'});
    expect(f.stderr).not.toContain('severity');
    expect(f.stderr).toContain('logName:"stderr"');
    expect(f.requests).toContain('httpRequest.status>=500');
  });

  test('quotes in a service name cannot break out of the filter', () => {
    expect(serviceClause('a"b')).toContain('service_name="a\\"b"');
  });
});

describe('compact', () => {
  test('lifts the structured logger fields the apps now emit', () => {
    const entry = compact({
      timestamp: '2026-07-30T09:27:41Z',
      severity: 'ERROR',
      insertId: 'abc',
      jsonPayload: {
        tag: '[getShopifyArticleById]',
        message: '[getShopifyArticleById] TypeError: id.includes is not a function',
        error: {name: 'TypeError', message: 'id.includes is not a function', stack: 'TypeError: x\n    at y'}
      }
    });
    expect(entry).toMatchObject({
      severity: 'ERROR',
      tag: '[getShopifyArticleById]',
      insertId: 'abc'
    });
    expect(entry.stack).toContain('at y');
  });

  test('falls back to textPayload for the pre-logger lines', () => {
    expect(compact({textPayload: 'plain console.error line'}).message).toBe('plain console.error line');
  });

  test('keeps the request fields the app-error lines do not have', () => {
    const entry = compact({
      httpRequest: {status: 500, requestMethod: 'POST', requestUrl: 'https://x/api/a', latency: '263.5s'}
    });
    expect(entry).toMatchObject({status: 500, method: 'POST', latencySeconds: 263.5});
  });

  test('long fields are capped so a bundle cannot blow up a prompt', () => {
    const entry = compact({jsonPayload: {message: 'm'.repeat(5000), error: {stack: 's'.repeat(5000)}}});
    expect(entry.message!.length).toBe(600);
    expect(entry.stack!.length).toBe(1200);
  });

  test('missing everything yields undefined, not throws', () => {
    expect(compact(undefined).message).toBeUndefined();
    expect(compact({}).timestamp).toBeUndefined();
  });
});

describe('fetchLogs', () => {
  const input = {
    projectId: 'avada-blog-app',
    service: 'api',
    alertTsMs: Date.parse('2026-07-30T09:00:00Z'),
    windowMs: 15 * 60_000,
    limit: 2,
    timeoutMs: 5000
  };

  test('runs three reads and centres the window on the alert', async () => {
    const {runner, calls} = scriptedRunner([
      result({stdout: '[{"severity":"ERROR"}]'}),
      result({stdout: '[]'}),
      result({stdout: '[{"httpRequest":{"status":500}}]'})
    ]);
    const res = await fetchLogs(input, runner);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(calls.length).toBe(3);
    expect(res.value.fromIso).toBe('2026-07-30T08:45:00.000Z');
    expect(res.value.toIso).toBe('2026-07-30T09:15:00.000Z');
    expect(res.value.queries.map(q => q.name)).toEqual(['errors', 'stderr', 'requests']);
    expect(summarize(res.value)).toBe('errors=1 · stderr=0 · requests=1');
  });

  test('hitting the cap is reported, not hidden', async () => {
    const {runner} = scriptedRunner([
      result({stdout: '[{},{}]'}),
      result({stdout: '[]'}),
      result({stdout: '[]'})
    ]);
    const res = await fetchLogs(input, runner);
    expect(res.ok && res.value.queries[0]!.truncated).toBe(true);
    expect(res.ok && summarize(res.value)).toContain('errors=2+');
  });

  test('auth failure aborts the whole bundle instead of returning a partial one', async () => {
    const {runner, calls} = scriptedRunner([result({code: 1, stderr: 'Please run: gcloud auth login'})]);
    const res = await fetchLogs(input, runner);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure).toBe('auth');
    expect(calls.length).toBe(1);
  });

  test('one non-fatal read failing leaves the other two usable', async () => {
    const {runner} = scriptedRunner([
      result({stdout: '[{}]'}),
      result({code: 1, stderr: 'INVALID_ARGUMENT: bad filter'}),
      result({stdout: '[{}]'})
    ]);
    const res = await fetchLogs(input, runner);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.queries.map(q => q.matched)).toEqual([1, 0, 1]);
  });

  test('unparseable output is empty, not a crash', async () => {
    const {runner} = scriptedRunner([result({stdout: 'not json'}), result({stdout: ''}), result({stdout: '[]'})]);
    const res = await fetchLogs(input, runner);
    expect(res.ok && res.value.queries[0]!.matched).toBe(0);
  });
});

describe('probeDeploy', () => {
  const base = {projectId: 'avada-blog-app', serviceName: 'api', isJob: false, region: 'us-central1', timeoutMs: 5000};

  test('reads updateTime, which covers gen1 and gen2 alike', async () => {
    const {runner, calls} = scriptedRunner([result({stdout: '2026-07-30T08:42:36.068820800Z\n'})]);
    const res = await probeDeploy(base, runner);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.source).toBe('functions.updateTime');
    expect(res.value.deployedAtMs).toBe(Date.parse('2026-07-30T08:42:36.068Z'));
    expect(calls[0]).toContain('--format=value(updateTime)');
  });

  test('a plain Cloud Run service falls back to the newest revision', async () => {
    const {runner} = scriptedRunner([
      result({code: 1, stderr: 'NOT_FOUND: function does not exist'}),
      result({stdout: '2026-07-30T08:41:35.374569Z\n'})
    ]);
    const res = await probeDeploy(base, runner);
    expect(res.ok && res.value.source).toBe('run.revision');
  });

  test('a Cloud Run job has no deploy timestamp — generation only', async () => {
    const {runner, calls} = scriptedRunner([result({stdout: '12\n'})]);
    const res = await probeDeploy({...base, isJob: true, serviceName: 'avada-seo-optimize-image-job'}, runner);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Undefined here is what parks a job fingerprint at awaiting_deploy rather
    // than letting an execution time masquerade as a deploy time.
    expect(res.value.deployedAtMs).toBeUndefined();
    expect(res.value.generation).toBe(12);
    expect(calls[0]).toContain('jobs');
  });

  test('auth failure is returned, not retried against Cloud Run', async () => {
    const {runner, calls} = scriptedRunner([result({code: 1, stderr: 'Reauthentication required'})]);
    const res = await probeDeploy(base, runner);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure).toBe('auth');
    expect(calls.length).toBe(1);
  });

  test('a garbage timestamp is undefined rather than NaN', async () => {
    const {runner} = scriptedRunner([result({stdout: 'nonsense'}), result({stdout: 'nonsense'})]);
    const res = await probeDeploy(base, runner);
    expect(res.ok && res.value.deployedAtMs).toBeUndefined();
    expect(res.ok && res.value.source).toBe('unknown');
  });
});
