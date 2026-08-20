import type {AuditFinding, LedgerDiff} from './ledger';
import {redactSecret} from './securitySchema';

/**
 * Pure renderer for the one Telegram message a run sends. `code renders, the
 * agent only orders and compresses` — this is the render half, and the fallback
 * `runSupervisor` (supervisor.ts) reaches for when the agent isn't available. It
 * must never depend on a `claude -p` call succeeding: a timeout at 06:00 must
 * still produce a message.
 */

export type LaneName = 'security' | 'hygiene' | 'triage';

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
}

export interface ReportInput {
  date: string;
  apps: AppReportInput[];
  digest: boolean;
  costUsd: number | undefined;
}

const SEVERITY_RANK: Record<string, number> = {high: 3, medium: 2, low: 1};
const SEVERITY_EMOJI = ['⚪', '⚪', '🟡', '🔴']; // indexed by rank 0..3

function worstEmoji(findings: AuditFinding[]): string {
  const rank = findings.reduce((max, f) => Math.max(max, SEVERITY_RANK[f.severity] ?? 0), 0);
  return SEVERITY_EMOJI[rank]!;
}

// Redacted again here even though `securitySchema.redactSecret` already ran when
// the finding was built — this is the last point before the text leaves the
// process, and a caller upstream can always forget the first pass.
function findingLines(f: AuditFinding): string[] {
  return [`  ${redactSecret(f.file)}:${f.line}`, `  ${redactSecret(f.title)}`];
}

function appSection(app: AppReportInput, digest: boolean): {lines: string[]; quiet: boolean} {
  const shown = digest ? app.openFindings : app.ledger.fresh;
  if (shown.length === 0) return {lines: [], quiet: true};
  const label = digest ? 'tồn' : 'mới';
  const lines = [`${worstEmoji(shown)} ${app.appName} · ${shown.length} ${label}`];
  for (const f of shown) lines.push(...findingLines(f));
  return {lines, quiet: false};
}

export function renderReport(input: ReportInput): string {
  const lines: string[] = [`🔎 Audit ${input.date} · ${input.apps.length} app`, ''];

  const quietApps: string[] = [];
  for (const app of input.apps) {
    const section = appSection(app, input.digest);
    if (section.quiet) {
      quietApps.push(app.appName);
      continue;
    }
    lines.push(...section.lines, '');
  }

  if (quietApps.length) lines.push(`${quietApps.join(', ')}: không có gì mới`, '');

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
