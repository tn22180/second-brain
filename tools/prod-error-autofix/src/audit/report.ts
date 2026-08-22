import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import type {AuditFinding, LedgerDiff} from './ledger';
import {redactSecret} from './securitySchema';

/**
 * Pure renderer for the one Telegram message a run sends. `code renders, the
 * agent only orders and compresses` — this is the render half, and the fallback
 * `runSupervisor` (supervisor.ts) reaches for when the agent isn't available. It
 * must never depend on a `claude -p` call succeeding: a timeout at 06:00 must
 * still produce a message.
 */

export type LaneName = 'security' | 'hygiene' | 'triage' | 'jira';

export interface LaneFailure {
  lane: LaneName;
  detail: string;
}

export interface AppReportInput {
  appName: string;
  ledger: LedgerDiff;
  /**
   * Every currently-open finding for this app. Only rendered in full on a digest
   * day — on an ordinary day the ledger's `fresh` list plus counts is enough, and
   * repeating the whole backlog every morning is exactly what mutes the channel.
   */
  openFindings: AuditFinding[];
  /** False means this app's security sweep ran without its own `.claude/skills` — `blogs`, today. */
  hasSecuritySkill: boolean;
  laneFailures: LaneFailure[];
  /** Today's ticket for this app, when the security lane opened one. */
  jiraTicketUrl?: string;
}

export interface ReportInput {
  date: string;
  apps: AppReportInput[];
  digest: boolean;
  costUsd: number | undefined;
  /**
   * Where to write the unabridged report when the Telegram cap (see
   * `TELEGRAM_MESSAGE_LIMIT` below) forces `renderReport` to leave findings out
   * of the message. Optional, and deliberately not defaulted to a cache dir
   * here: `report.ts` stays a pure function of its input, so the caller picks
   * the path (e.g. under its own cache root) and hands it in. When absent, a
   * capped run still states the count it dropped — it just can't point at a
   * saved copy.
   */
  fullReportPath?: string;
}

// Telegram's `sendMessage` hard limit. Measured 2026-08-20: an empty ledger on
// the first-ever run made every finding "new" — 856 of them for one app,
// 851 `no-unused-vars` — and `renderReport` produced 121998 bytes. Because
// `sendTelegram` returns its failure instead of throwing (a deliberate choice —
// an outage must not fail the run), an over-limit message was rejected by the
// API and the run still reported success. Silent, and only fixable here.
const TELEGRAM_MESSAGE_LIMIT = 4096;

const SEVERITY_RANK: Record<string, number> = {high: 3, medium: 2, low: 1};
const SEVERITY_EMOJI = ['⚪', '⚪', '🟡', '🔴']; // indexed by rank 0..3

function worstEmoji(findings: AuditFinding[]): string {
  const rank = findings.reduce((max, f) => Math.max(max, SEVERITY_RANK[f.severity] ?? 0), 0);
  return SEVERITY_EMOJI[rank]!;
}

// Lower is more important. Security outranks hygiene outright — a `high`
// security finding must survive the cap even sitting behind 800 low-severity
// `no-unused-vars` hits, which is exactly the 856-finding shape this was
// measured against: 851 hygiene findings hid 15 real security ones.
function findingScore(f: AuditFinding): number {
  const kindScore = f.kind === 'security' ? 0 : 1;
  const severityScore = 3 - (SEVERITY_RANK[f.severity] ?? 0);
  return kindScore * 10 + severityScore;
}

// Redacted again here even though `securitySchema.redactSecret` already ran when
// the finding was built — this is the last point before the text leaves the
// process, and a caller upstream can always forget the first pass.
function findingLines(f: AuditFinding): string[] {
  return [`  ${redactSecret(f.file)}:${f.line}`, `  ${redactSecret(f.title)}`];
}

// `included` undefined means "show every shown finding" — the uncapped path,
// used both for a report that already fits and for the full copy written to
// disk. The header count always reflects `shown.length`, capped or not: a
// finding that got cut from the detail lines must never make the app look
// like it had fewer findings than it did.
function appSection(app: AppReportInput, digest: boolean, included: Set<string> | undefined): {lines: string[]; quiet: boolean} {
  const shown = digest ? app.openFindings : app.ledger.fresh;
  // A ticket with no fresh finding behind it happens exactly once per app: the run
  // where a backlog that predates the Jira lane finally gets ticketed. Staying quiet
  // there would hide the only message naming that ticket.
  if (shown.length === 0 && !app.jiraTicketUrl) return {lines: [], quiet: true};
  const label = digest ? 'tồn' : 'mới';
  const lines = [`${worstEmoji(shown)} ${app.appName} · ${shown.length} ${label}`];
  if (app.jiraTicketUrl) lines.push(`  🎫 ${app.jiraTicketUrl}`);
  const pool = included ? shown.filter(f => included.has(f.fp)) : shown;
  // Security before hygiene, high before low — what a human needs to see
  // first at 06:00, not scan order. Applied whether or not the cap is active,
  // so the on-disk full copy reads the same way as the Telegram message.
  const toRender = [...pool].sort((a, b) => findingScore(a) - findingScore(b));
  for (const f of toRender) lines.push(...findingLines(f));
  return {lines, quiet: false};
}

function assemble(input: ReportInput, included: Set<string> | undefined, droppedCount: number): string {
  const lines: string[] = [`🔎 Audit ${input.date} · ${input.apps.length} app`, ''];

  const quietApps: string[] = [];
  for (const app of input.apps) {
    const section = appSection(app, input.digest, included);
    if (section.quiet) {
      quietApps.push(app.appName);
      continue;
    }
    lines.push(...section.lines, '');
  }

  if (quietApps.length) lines.push(`${quietApps.join(', ')}: không có gì mới`, '');

  // No silent cap: a message that reads as complete while quietly dropping
  // findings is the failure this replaces, not a smaller version of it.
  if (droppedCount > 0) {
    const where = input.fullReportPath
      ? `, xem đầy đủ tại ${input.fullReportPath}`
      : ' (chưa có đường dẫn lưu report đầy đủ)';
    lines.push(`Còn ${droppedCount} phát hiện không hiện ở đây${where}`, '');
  }

  const carried = input.apps.reduce((n, a) => n + a.ledger.carried, 0);
  const resolved = input.apps.reduce((n, a) => n + a.ledger.resolved, 0);
  const noSkill = input.apps.filter(a => !a.hasSecuritySkill).map(a => a.appName);
  const tallyParts = [`Tồn: ${carried}`, `Đã hết: ${resolved}`];
  if (noSkill.length) tallyParts.push(`${noSkill.join(', ')} vẫn chưa có .claude/skills`);
  lines.push(tallyParts.join(' · '));

  const failures = input.apps.flatMap(a => a.laneFailures.map(f => `${a.appName}/${f.lane} — ${redactSecret(f.detail)}`));
  lines.push(`Lane lỗi: ${failures.length ? failures.join('; ') : 'không'}`);

  // `total_cost_usd` from `claude -p` is the API-equivalent of the run, not money
  // billed — these run on a subscription. Same wording as buildMrMessage
  // (src/notify/telegram.ts) so the register matches across both reports.
  if (input.costUsd !== undefined) {
    lines.push('', `~$${input.costUsd.toFixed(2)} quy đổi (chạy trên gói)`);
  }

  return lines.join('\n').trim();
}

function writeFullReport(path: string, text: string): void {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, text, 'utf8');
}

export function renderReport(input: ReportInput): string {
  const full = assemble(input, undefined, 0);
  if (full.length <= TELEGRAM_MESSAGE_LIMIT) return full;

  // Save the unabridged report before capping anything — the operator's only
  // way to see what was cut. Written unconditionally (not only once we know
  // the final cap) so a caller that supplied a path always gets a copy that
  // matches what triggered the cap.
  if (input.fullReportPath) writeFullReport(input.fullReportPath, full);

  // Rank every findable line globally, across apps, so 851 low-severity
  // hygiene hits in one app can never crowd out a high-severity security
  // finding sitting anywhere in the run.
  const candidates: {fp: string; score: number}[] = [];
  for (const app of input.apps) {
    const shown = input.digest ? app.openFindings : app.ledger.fresh;
    for (const f of shown) candidates.push({fp: f.fp, score: findingScore(f)});
  }
  candidates.sort((a, b) => a.score - b.score);

  // Greedily keep shrinking the included set — starting from "all", which we
  // already know doesn't fit — until the assembled message is under the
  // limit. `assemble`'s length only grows monotonically with more included
  // findings, so the first count that fits, walking down from the top, is
  // the most findings this message can carry.
  for (let count = candidates.length - 1; count >= 0; count--) {
    const included = new Set(candidates.slice(0, count).map(c => c.fp));
    const dropped = candidates.length - count;
    const text = assemble(input, included, dropped);
    if (text.length <= TELEGRAM_MESSAGE_LIMIT) return text;
  }

  // Every candidate dropped and the message (headers + tally + the "dropped"
  // line itself) still doesn't fit — only plausible with an unrealistic
  // number of apps. Hard-truncate rather than send something Telegram rejects
  // outright; still strictly better than the pre-fix silent failure.
  const empty = assemble(input, new Set(), candidates.length);
  return empty.length <= TELEGRAM_MESSAGE_LIMIT ? empty : `${empty.slice(0, TELEGRAM_MESSAGE_LIMIT - 1)}…`;
}
