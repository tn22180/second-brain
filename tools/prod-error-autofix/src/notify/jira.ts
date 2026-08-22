/**
 * Ticket the security lane's findings into Jira FAL.
 *
 * The security lane deliberately opens no MR — a fix at an auth boundary can pass every
 * test and still leak, so a human reads it. A ticket is what carries the finding to that
 * human. Like `telegram.ts`, nothing here may break a run: Jira being down must degrade
 * the audit to "reported in Telegram only", never fail it, so every error is returned
 * rather than thrown.
 *
 * Field ids come from the `jira-create` skill's probe of the live instance (2026-07-10),
 * not from memory. That skill's own script is deliberately NOT reused: it prints for a
 * human to read and lives under `~/.claude`, which is not something a daemon may depend on.
 */

import {redactSecret} from '../audit/securitySchema';

export interface JiraConfig {
  baseUrl: string;
  token: string;
}

/** Jira Server, REST v2. */
const PROJECT_KEY = 'FAL';
const FIELD_FALCON_APP = 'customfield_11203';
const FIELD_ASSIGNEES = 'customfield_10700';

export const ISSUE_TYPE_BUG = '10310';
export const ISSUE_TYPE_TASK = '10001';

/**
 * Registry app name -> Falcon App option. The option list is fixed on the Jira side
 * (SEO/Blog/APC/AEO/Feed/Ads/Pixels/Speed/Canva) and Jira 400s on a value outside it.
 *
 * The names do not line up one-to-one, which is why this map exists rather than a
 * `toUpperCase()`: the registry's `IMG-OPT` is the `Speed` board (Tuan, 2026-08-22 — image
 * optimization is a speed feature and the team tracks it there), and `BLOG` is spelled `Blog`.
 * An app with no option here is filed without the field, landing on the Falcon Master board;
 * guessing a neighbouring app's board would be worse than no board.
 */
const FALCON_APP: Record<string, string> = {
  SEO: 'SEO',
  BLOG: 'Blog',
  APC: 'APC',
  AEO: 'AEO',
  'IMG-OPT': 'Speed'
};

export function falconAppFor(appName: string): string | undefined {
  return FALCON_APP[appName.toUpperCase()];
}

export interface IssueInput {
  issuetypeId: string;
  summary: string;
  description: string;
  /** Registry app name (`SEO`, `IMG-OPT`, …), not the Jira option. */
  appName: string;
  priorityName: 'Highest' | 'High' | 'Medium' | 'Low';
  /** Jira usernames. Empty means Jira's own default, which is nobody. */
  assignees: string[];
}

export interface JiraPayload {
  fields: Record<string, unknown>;
}

export class NotFalError extends Error {}

/**
 * Build-time guard, deliberately before any network call: a mistake here would file team
 * tickets into someone else's project, and a rejected build is recoverable where a POST
 * is not.
 */
export function assertProjectFal(payload: JiraPayload): void {
  const project = payload.fields.project as {key?: string} | undefined;
  if (project?.key !== PROJECT_KEY) {
    throw new NotFalError(`PROJECT_NOT_FAL: ${String(project?.key)}`);
  }
}

export function buildIssuePayload(input: IssueInput): JiraPayload {
  if (!input.summary.trim()) throw new Error('MISSING_SUMMARY');
  if (!input.issuetypeId) throw new Error('MISSING_ISSUETYPE');

  const fields: Record<string, unknown> = {
    project: {key: PROJECT_KEY},
    issuetype: {id: input.issuetypeId},
    // Redacted again here rather than trusting the caller, the same way report.ts redacts
    // at render: a finding's own text is where a leaked token would be quoted.
    summary: redactSecret(input.summary),
    description: redactSecret(input.description),
    priority: {name: input.priorityName}
  };

  const app = falconAppFor(input.appName);
  if (app) fields[FIELD_FALCON_APP] = {value: app};
  if (input.assignees.length) {
    fields[FIELD_ASSIGNEES] = input.assignees.map(name => ({name}));
  }

  const payload = {fields};
  assertProjectFal(payload);
  return payload;
}

export type Fetcher = (url: string, init: RequestInit) => Promise<{ok: boolean; status: number; text(): Promise<string>}>;

export interface CreateResult {
  ok: boolean;
  key: string | undefined;
  detail: string | undefined;
}

async function post(
  cfg: JiraConfig,
  path: string,
  body: unknown,
  fetchImpl: Fetcher
): Promise<{ok: boolean; status: number; text: string}> {
  const res = await fetchImpl(`${cfg.baseUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      // Bearer, not Basic: this instance is Jira Server with a personal access token.
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  return {ok: res.ok, status: res.status, text: await res.text()};
}

export async function createIssue(
  cfg: JiraConfig,
  input: IssueInput,
  fetchImpl: Fetcher = fetch as unknown as Fetcher
): Promise<CreateResult> {
  let payload: JiraPayload;
  try {
    payload = buildIssuePayload(input);
  } catch (err) {
    return {ok: false, key: undefined, detail: `payload: ${(err as Error).message}`};
  }

  try {
    const res = await post(cfg, '/rest/api/2/issue', payload, fetchImpl);
    if (!res.ok) {
      // The body carries Jira's `errors` map, which is the only thing that says which
      // field was rejected. Truncated because a 500 can return an HTML page.
      return {ok: false, key: undefined, detail: `HTTP ${res.status}: ${res.text.slice(0, 300)}`};
    }
    const key = (JSON.parse(res.text) as {key?: string}).key;
    if (!key) return {ok: false, key: undefined, detail: 'response carried no issue key'};
    return {ok: true, key, detail: undefined};
  } catch (err) {
    return {ok: false, key: undefined, detail: (err as Error).message};
  }
}

export async function addComment(
  cfg: JiraConfig,
  issueKey: string,
  body: string,
  fetchImpl: Fetcher = fetch as unknown as Fetcher
): Promise<{ok: boolean; detail: string | undefined}> {
  try {
    const res = await post(
      cfg,
      `/rest/api/2/issue/${encodeURIComponent(issueKey)}/comment`,
      {body: redactSecret(body)},
      fetchImpl
    );
    if (!res.ok) return {ok: false, detail: `HTTP ${res.status}: ${res.text.slice(0, 300)}`};
    return {ok: true, detail: undefined};
  } catch (err) {
    return {ok: false, detail: (err as Error).message};
  }
}

export function issueUrl(cfg: JiraConfig, key: string): string {
  return `${cfg.baseUrl.replace(/\/$/, '')}/browse/${key}`;
}
