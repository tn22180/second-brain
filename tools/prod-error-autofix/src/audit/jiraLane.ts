/**
 * The security lane's only outbound action: a ticket, never an MR.
 *
 * Decided 2026-08-22 (jobs/security/audit-jira.md). A fix at an auth boundary can pass
 * every test and still leak, so no agent writes one — the finding goes to a human. The
 * cleanup lane keeps its MR; this lane reports.
 *
 * The whole reason the build and the post are separate functions: this is where duplicate
 * tickets are born. The first APC sweep produced 858 findings, so "one ticket per finding"
 * is 858 tickets in one morning. Every decision about whether a ticket is opened at all,
 * and what folds into it, lives in a pure function with a test — not next to a fetch call.
 */

import type {AuditFindingRow} from '../state/store';
import type {AuditFinding} from './ledger';
import {
  ISSUE_TYPE_BUG,
  addComment as postComment,
  createIssue as postIssue,
  falconAppFor,
  issueUrl,
  type CreateResult,
  type IssueInput,
  type JiraConfig
} from '../notify/jira';

export interface JiraLaneInput {
  appName: string;
  /** `yyyy-mm-dd`. Appears in the summary so a day's ticket is findable by date. */
  dateStr: string;
  /** This run's fresh findings, already filtered to `kind === 'security'` by the caller. */
  fresh: AuditFinding[];
  /** Still-open security findings seen before today. Rows, because only a row knows its ticket. */
  carried: AuditFindingRow[];
  /** Security findings that flipped to resolved in this run. */
  resolved: AuditFindingRow[];
  assignees: string[];
}

export interface JiraLaneResult {
  ticketKey: string | undefined;
  ticketUrl: string | undefined;
  /** Fingerprints that must be stamped with `ticketKey`. Empty when no ticket was opened. */
  ticketedFps: string[];
  /** Issue keys that received a comment. */
  commented: string[];
  failures: string[];
}

const PRIORITY: Record<string, IssueInput['priorityName']> = {
  high: 'Highest',
  medium: 'High',
  low: 'Medium'
};

const SEVERITY_RANK: Record<string, number> = {high: 3, medium: 2, low: 1};

function worstSeverity(findings: {severity: string}[]): string {
  let worst = 'low';
  for (const f of findings) {
    if ((SEVERITY_RANK[f.severity] ?? 0) > (SEVERITY_RANK[worst] ?? 0)) worst = f.severity;
  }
  return worst;
}

function line(f: {file: string; line: number; severity: string; rule: string; title: string}): string {
  return `- [${f.severity}] ${f.file}:${f.line} — ${f.rule} — ${f.title}`;
}

/**
 * Everything that has no ticket yet: today's fresh findings, plus anything carried from a
 * run that happened before this lane existed. Without the second half, a finding first seen
 * while Jira was off would never be ticketed at all — it is not fresh on any later day.
 */
export function needsTicket(input: JiraLaneInput): (AuditFinding | AuditFindingRow)[] {
  return [...input.fresh, ...input.carried.filter(f => !f.jiraKey)];
}

export function buildTicket(input: JiraLaneInput): IssueInput | undefined {
  const items = needsTicket(input);
  if (items.length === 0) return undefined;

  const app = falconAppFor(input.appName) ?? input.appName;
  const freshFps = new Set(input.fresh.map(f => f.fp));
  const backlog = items.filter(f => !freshFps.has(f.fp));

  const body = [
    `Audit tu dong ${input.dateStr} — app ${input.appName}. Lane security khong mo MR:`,
    'fix o ranh gioi auth co the xanh het test ma van thung, nen nguoi doc.',
    '',
    `Moi (${input.fresh.length}):`,
    ...(input.fresh.length ? input.fresh.map(line) : ['- khong co']),
  ];
  if (backlog.length) {
    body.push(
      '',
      `Ton tu truoc, chua tung co ticket (${backlog.length}):`,
      ...backlog.map(line)
    );
  }
  body.push('', `Report day du: xem file audit-${input.dateStr}.md tren may chay audit.`);

  return {
    issuetypeId: ISSUE_TYPE_BUG,
    summary: `[BUG][${app}] Audit ${input.dateStr}: ${items.length} phat hien security`,
    description: body.join('\n'),
    appName: input.appName,
    priorityName: PRIORITY[worstSeverity(items)] ?? 'Medium',
    assignees: input.assignees
  };
}

/**
 * One comment per existing ticket, not one per finding: a ticket that already exists gets
 * at most one line of news a day. Carried and resolved findings that share a ticket share
 * the comment, which is why this returns a map rather than a list.
 */
export function buildComments(input: JiraLaneInput): Map<string, string> {
  const byKey = new Map<string, {carried: AuditFindingRow[]; resolved: AuditFindingRow[]}>();

  const bucket = (key: string) => {
    let b = byKey.get(key);
    if (!b) byKey.set(key, (b = {carried: [], resolved: []}));
    return b;
  };
  for (const f of input.carried) if (f.jiraKey) bucket(f.jiraKey).carried.push(f);
  for (const f of input.resolved) if (f.jiraKey) bucket(f.jiraKey).resolved.push(f);

  const out = new Map<string, string>();
  for (const [key, b] of byKey) {
    const lines = [`Audit ${input.dateStr}:`];
    if (b.resolved.length) {
      lines.push('', `Khong con phat hien (${b.resolved.length}):`, ...b.resolved.map(line));
    }
    if (b.carried.length) {
      lines.push('', `Van con (${b.carried.length}):`, ...b.carried.map(line));
    }
    out.set(key, lines.join('\n'));
  }
  return out;
}

export interface JiraLaneDeps {
  cfg: JiraConfig;
  createIssue?: (cfg: JiraConfig, input: IssueInput) => Promise<CreateResult>;
  addComment?: (cfg: JiraConfig, key: string, body: string) => Promise<{ok: boolean; detail: string | undefined}>;
}

const EMPTY: JiraLaneResult = {
  ticketKey: undefined,
  ticketUrl: undefined,
  ticketedFps: [],
  commented: [],
  failures: []
};

/**
 * Posts what `buildTicket`/`buildComments` decided. Failures accumulate instead of
 * throwing: a Jira outage degrades the run to Telegram-only, and — the part that matters —
 * `ticketedFps` stays empty on a failed create, so nothing is stamped with a ticket that
 * does not exist and tomorrow's run tries again.
 */
export async function runJiraLane(input: JiraLaneInput, deps: JiraLaneDeps): Promise<JiraLaneResult> {
  const create = deps.createIssue ?? postIssue;
  const comment = deps.addComment ?? postComment;
  const failures: string[] = [];

  let ticketKey: string | undefined;
  let ticketedFps: string[] = [];
  const ticket = buildTicket(input);
  if (ticket) {
    const res = await create(deps.cfg, ticket);
    if (res.ok && res.key) {
      ticketKey = res.key;
      ticketedFps = needsTicket(input).map(f => f.fp);
    } else {
      failures.push(`create: ${res.detail ?? 'unknown'}`);
    }
  }

  const commented: string[] = [];
  for (const [key, body] of buildComments(input)) {
    const res = await comment(deps.cfg, key, body);
    if (res.ok) commented.push(key);
    else failures.push(`comment ${key}: ${res.detail ?? 'unknown'}`);
  }

  return {
    ...EMPTY,
    ticketKey,
    ticketUrl: ticketKey ? issueUrl(deps.cfg, ticketKey) : undefined,
    ticketedFps,
    commented,
    failures
  };
}
