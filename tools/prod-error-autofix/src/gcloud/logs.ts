import {err, spawnRunner, type GcloudResult, type Runner} from './run';

/**
 * Pulls the evidence the ANALYZE stage is allowed to reason from.
 *
 * Three separate reads, because the jobs/bugprod.md triage showed one read is
 * never enough:
 *
 *  - `errors`   severity>=ERROR. What the Slack sink sees.
 *  - `stderr`   the same service with no severity filter. Over that 24h window
 *               1592/1592 application error lines carried no `severity` at all,
 *               so a severity-filtered read missed every one of them. The
 *               structured logger has since shipped, but a read that depends on
 *               it being deployed everywhere would silently return nothing.
 *  - `requests` httpRequest.status>=500. This is where the endpoint and the
 *               latency live; the app-error lines do not carry either.
 *
 * Each read is capped. The raw JSON is written to the job dir as evidence; what
 * the model sees is the compacted form below.
 */

export interface LogEntry {
  timestamp: string | undefined;
  severity: string | undefined;
  tag: string | undefined;
  message: string | undefined;
  stack: string | undefined;
  status: number | undefined;
  method: string | undefined;
  url: string | undefined;
  latencySeconds: number | undefined;
  insertId: string | undefined;
}

export interface LogQuery {
  name: 'errors' | 'stderr' | 'requests';
  filter: string;
  matched: number;
  /** True when `matched` hit the cap, so the real count is higher. */
  truncated: boolean;
  entries: LogEntry[];
}

export interface LogBundle {
  projectId: string;
  service: string | undefined;
  fromIso: string;
  toIso: string;
  queries: LogQuery[];
  /** Raw gcloud JSON per query, for the evidence file. Not sent to the model. */
  raw: Record<string, unknown[]>;
}

const MAX_MESSAGE = 600;
const MAX_STACK = 1200;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length ? v : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/s$/, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function compact(raw: unknown): LogEntry {
  const e = (raw ?? {}) as Record<string, unknown>;
  const json = (e.jsonPayload ?? {}) as Record<string, unknown>;
  const error = (json.error ?? {}) as Record<string, unknown>;
  const http = (e.httpRequest ?? {}) as Record<string, unknown>;
  const message = str(json.message) ?? str(e.textPayload) ?? str(error.message);
  return {
    timestamp: str(e.timestamp),
    severity: str(e.severity),
    tag: str(json.tag),
    message: message?.slice(0, MAX_MESSAGE),
    stack: str(error.stack)?.slice(0, MAX_STACK),
    status: num(http.status),
    method: str(http.requestMethod),
    url: str(http.requestUrl),
    latencySeconds: num(http.latency),
    insertId: str(e.insertId)
  };
}

/**
 * gen1 reports the service under `function_name`, gen2 under `service_name`, and
 * Cloud Run jobs under `job_name`. Matching all three keeps one code path for
 * every app in the registry.
 */
export function serviceClause(service: string | undefined): string {
  if (!service) return '';
  const bare = service.startsWith('job:') ? service.slice(4) : service;
  const escaped = bare.replace(/"/g, '\\"');
  return (
    `(resource.labels.service_name="${escaped}" OR ` +
    `resource.labels.function_name="${escaped}" OR ` +
    `resource.labels.job_name="${escaped}")`
  );
}

export function buildFilters(input: {
  service: string | undefined;
  fromIso: string;
  toIso: string;
}): Record<LogQuery['name'], string> {
  const window = `timestamp>="${input.fromIso}" AND timestamp<="${input.toIso}"`;
  const svc = serviceClause(input.service);
  const scoped = svc ? `${svc} AND ${window}` : window;
  return {
    errors: `${scoped} AND severity>=ERROR`,
    // No severity term: the whole point is to catch the lines that carry none.
    stderr: `${scoped} AND logName:"stderr"`,
    requests: `${scoped} AND httpRequest.status>=500`
  };
}

export interface FetchLogsInput {
  projectId: string;
  service: string | undefined;
  alertTsMs: number;
  windowMs: number;
  limit: number;
  timeoutMs: number;
}

export async function fetchLogs(
  input: FetchLogsInput,
  runner: Runner = spawnRunner
): Promise<GcloudResult<LogBundle>> {
  const fromIso = new Date(input.alertTsMs - input.windowMs).toISOString();
  const toIso = new Date(input.alertTsMs + input.windowMs).toISOString();
  const filters = buildFilters({service: input.service, fromIso, toIso});

  const queries: LogQuery[] = [];
  const raw: Record<string, unknown[]> = {};

  for (const name of ['errors', 'stderr', 'requests'] as const) {
    const filter = filters[name];
    const result = await runner(
      [
        'gcloud',
        'logging',
        'read',
        filter,
        `--project=${input.projectId}`,
        `--limit=${input.limit}`,
        '--format=json',
        '--order=desc'
      ],
      input.timeoutMs
    );
    if (result.code !== 0) {
      const failure = err(result);
      // Auth and permission are fatal for the whole bundle — the other reads
      // would fail identically, and a partial bundle would look like evidence.
      if (failure.failure === 'auth' || failure.failure === 'permission') return failure;
      queries.push({name, filter, matched: 0, truncated: false, entries: []});
      raw[name] = [];
      continue;
    }
    let parsed: unknown[];
    try {
      parsed = JSON.parse(result.stdout || '[]') as unknown[];
    } catch {
      parsed = [];
    }
    raw[name] = parsed;
    queries.push({
      name,
      filter,
      matched: parsed.length,
      truncated: parsed.length >= input.limit,
      entries: parsed.map(compact)
    });
  }

  return {
    ok: true,
    value: {projectId: input.projectId, service: input.service, fromIso, toIso, queries, raw}
  };
}

export interface CountInput {
  projectId: string;
  service: string | undefined;
  /** Already-built clause from `verify/recurrence.signatureFilter`. */
  signatureClause: string;
  fromIso: string;
  toIso: string;
  /** Read stops here; the caller is told the count is a floor. */
  cap: number;
  timeoutMs: number;
}

export interface CountResult {
  count: number;
  /** True when the read hit `cap`, so the real number is at least `count`. */
  truncated: boolean;
  filter: string;
}

/**
 * How many times one error signature appears in a window.
 *
 * `value(insertId)` rather than `json`: the verify sweep wants a number, and every
 * entry parsed is JSON this caller throws away. On a service like `proxygen2`,
 * where a single window held 441 matches, that is the difference between a few KB
 * and several MB per read.
 */
export async function countMatching(
  input: CountInput,
  runner: Runner = spawnRunner
): Promise<GcloudResult<CountResult>> {
  const svc = serviceClause(input.service);
  const filter =
    `${svc ? `${svc} AND ` : ''}timestamp>="${input.fromIso}" AND timestamp<="${input.toIso}" ` +
    `AND ${input.signatureClause}`;
  const res = await runner(
    [
      'gcloud',
      'logging',
      'read',
      filter,
      `--project=${input.projectId}`,
      `--limit=${input.cap}`,
      '--format=value(insertId)',
      '--order=desc'
    ],
    input.timeoutMs
  );
  // Unlike `fetchLogs`, a failed read here is never softened to zero: a zero count
  // is the whole basis for calling a fix verified, and an auth error that reads as
  // "no more errors" would close the incident on the strength of a broken command.
  if (res.code !== 0) return err(res);
  const count = res.stdout.split('\n').filter(line => line.trim().length > 0).length;
  return {ok: true, value: {count, truncated: count >= input.cap, filter}};
}

/** One-line-per-query summary for the reply and the job log. */
export function summarize(bundle: LogBundle): string {
  return bundle.queries
    .map(q => `${q.name}=${q.matched}${q.truncated ? '+' : ''}`)
    .join(' · ');
}
