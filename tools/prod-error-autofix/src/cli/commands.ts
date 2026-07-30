import {existsSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {buildSlice} from '../brain/slice';
import {parseCandidates} from '../agent/learn';
import type {Config} from '../config';
import {fingerprintOf} from '../fingerprint';
import {parseAlert} from '../parseAlert';
import {appNames, listApps, resolveApp} from '../registry';
import type {IncomingMessage} from '../slack/listener';
import type {Store} from '../state/store';
import {DAY_MS, HOUR_MS} from '../state/rateGate';

/**
 * The read-only and offline half of the CLI: everything that answers a question or
 * inspects state without starting a daemon or spending a model call.
 *
 * `dry-run` in particular is what makes this project debuggable without waiting for a
 * production error to happen.
 */

export interface StatusReport {
  transport: string;
  active: number;
  mrLastHour: number;
  mrPerRepoToday: {repo: string; count: number}[];
  caps: Config['caps'];
  recent: {
    fingerprint: string;
    app: string;
    service: string | undefined;
    status: string;
    recurrences: number;
    attempts: number;
    mrUrl: string | undefined;
    lastSeenIso: string;
  }[];
  needsHuman: number;
  blocked: number;
}

export function statusReport(cfg: Config, store: Store, nowMs: number): StatusReport {
  return {
    transport: cfg.transport,
    active: store.activeCount(),
    mrLastHour: store.countMrEvents(nowMs - HOUR_MS),
    mrPerRepoToday: listApps(cfg)
      .map(a => ({repo: a.repo, count: store.countMrEvents(nowMs - DAY_MS, a.repo)}))
      .filter(r => r.count > 0),
    caps: cfg.caps,
    recent: store.recentAlerts(10).map(r => ({
      fingerprint: r.fingerprint,
      app: r.appName,
      service: r.service,
      status: r.status,
      recurrences: r.recurrenceCount,
      attempts: r.attempts,
      mrUrl: r.mrUrl,
      lastSeenIso: new Date(r.lastSeenMs).toISOString()
    })),
    needsHuman: store.alertsByStatus('needs_human').length,
    blocked: store.alertsByStatus('blocked').length
  };
}

export function formatStatus(report: StatusReport): string {
  const lines: string[] = [
    `transport ${report.transport} · ${report.active}/${report.caps.maxConcurrentJobs} job đang chạy`,
    `MR: ${report.mrLastHour}/${report.caps.mrPerHour} trong 1h` +
      (report.mrPerRepoToday.length
        ? ` · 24h theo repo: ${report.mrPerRepoToday.map(r => `${r.repo} ${r.count}/${report.caps.mrPerRepoPerDay}`).join(', ')}`
        : ''),
    report.needsHuman || report.blocked
      ? `cần người xem: ${report.needsHuman} · blocked: ${report.blocked}`
      : 'không có gì đang chờ người xem'
  ];
  if (!report.recent.length) {
    lines.push('', 'chưa có alert nào.');
    return lines.join('\n');
  }
  lines.push('', 'gần nhất:');
  for (const r of report.recent) {
    lines.push(
      `  ${r.fingerprint.padEnd(9)} ${r.app.padEnd(8)} ${(r.service ?? '?').slice(0, 24).padEnd(24)} ` +
        `${r.status.padEnd(16)} ×${String(r.recurrences).padEnd(3)} ${r.mrUrl ?? ''}`
    );
  }
  return lines.join('\n');
}

export interface DryRunReport {
  parsed: boolean;
  reason: string | undefined;
  appName: string | undefined;
  inRegistry: boolean;
  repo: string | undefined;
  prodProject: string | undefined;
  defaultBranch: string | undefined;
  service: string | undefined;
  kind: string | undefined;
  source: string | undefined;
  fingerprint: string | undefined;
  known: boolean;
  knownStatus: string | undefined;
  brainTokens: number | undefined;
  brainBudget: number;
  brainSections: string[];
  brainSkipped: {path: string; reason: string}[];
  brainText: string | undefined;
}

/** No model call, no network: what the pipeline *would* load and how big it is. */
export function dryRun(cfg: Config, store: Store, message: {text?: string; blocks?: unknown}): DryRunReport {
  const parsed = parseAlert(message);
  if (!parsed.ok) {
    return {
      parsed: false,
      reason: parsed.reason,
      appName: undefined,
      inRegistry: false,
      repo: undefined,
      prodProject: undefined,
      defaultBranch: undefined,
      service: undefined,
      kind: undefined,
      source: undefined,
      fingerprint: undefined,
      known: false,
      knownStatus: undefined,
      brainTokens: undefined,
      brainBudget: cfg.brainSliceTokenBudget,
      brainSections: [],
      brainSkipped: [],
      brainText: undefined
    };
  }
  const alert = parsed.alert;
  const app = resolveApp(alert.appName, cfg);
  const fingerprint = fingerprintOf({
    appName: alert.appName,
    service: alert.service ?? 'unknown',
    kind: alert.kind,
    message: alert.message
  });
  const existing = store.getAlert(fingerprint);
  const slice = buildSlice({
    brainRoot: cfg.paths.brainRoot,
    appName: alert.appName,
    fingerprint,
    service: alert.service,
    message: alert.message,
    tokenBudget: cfg.brainSliceTokenBudget
  });

  return {
    parsed: true,
    reason: undefined,
    appName: alert.appName,
    inRegistry: app !== undefined,
    repo: app?.repo,
    prodProject: app?.prodProject,
    defaultBranch: app?.defaultBranch,
    service: alert.service,
    kind: alert.kind,
    source: alert.source,
    fingerprint,
    known: existing !== undefined,
    knownStatus: existing?.status,
    brainTokens: slice.tokens,
    brainBudget: slice.budget,
    brainSections: slice.sections.map(s => s.name),
    brainSkipped: slice.skipped,
    brainText: slice.text
  };
}

export function formatDryRun(report: DryRunReport, opts: {showPrompt: boolean}): string {
  if (!report.parsed) return `không phải alert: ${report.reason}`;
  const lines = [
    `app        ${report.appName}${report.inRegistry ? '' : `  ← KHÔNG có trong registry (${appNames().join(', ')})`}`,
    `repo       ${report.repo ?? '—'}  ·  prod ${report.prodProject ?? '—'}  ·  base ${report.defaultBranch ?? '—'}`,
    `service    ${report.service ?? '—'}  ·  kind ${report.kind}  ·  parse ${report.source}`,
    `fingerprint ${report.fingerprint}${report.known ? `  ← đã biết, status ${report.knownStatus}` : '  ← mới'}`,
    `brain      ${report.brainTokens}/${report.brainBudget} tok  ·  ${report.brainSections.join(', ')}`,
    `bỏ ngoài   ${report.brainSkipped.length} file`
  ];
  if (report.kind === 'infra') lines.push('lưu ý      infra class → phân tích và báo, KHÔNG mở MR');
  if (opts.showPrompt && report.brainText) {
    lines.push('', '--- brain slice ---', report.brainText);
  }
  return lines.join('\n');
}

/** `--json` shaped like a Slack event, or a raw text alert; both are accepted. */
export function loadAlertFile(path: string): {text?: string; blocks?: unknown} {
  const raw = readFileSync(path, 'utf8');
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const event = (parsed.event ?? parsed) as Record<string, unknown>;
    return {text: typeof event.text === 'string' ? event.text : undefined, blocks: event.blocks};
  }
  return {text: trimmed};
}

export interface BudgetRow {
  app: string;
  tokens: number;
  budget: number;
  over: boolean;
}

export function brainBudget(cfg: Config): BudgetRow[] {
  return appNames().map(app => {
    const slice = buildSlice({
      brainRoot: cfg.paths.brainRoot,
      appName: app,
      fingerprint: 'none',
      service: undefined,
      message: undefined,
      tokenBudget: cfg.brainSliceTokenBudget
    });
    return {app, tokens: slice.tokens, budget: slice.budget, over: slice.overBudget};
  });
}

export function formatBudget(rows: BudgetRow[]): string {
  const body = rows
    .map(r => `  ${r.app.padEnd(9)} ${String(r.tokens).padStart(5)}/${r.budget}  ${r.over ? 'OVER' : 'ok'}`)
    .join('\n');
  const worst = rows.reduce((a, b) => (b.tokens > a.tokens ? b : a), rows[0]!);
  return `${body}\n\nlớn nhất: ${worst.app} ${worst.tokens}/${worst.budget}`;
}

export interface PromoteResult {
  ok: boolean;
  detail: string;
}

/**
 * Moves a candidate into the app's brain file. Refuses one that has been seen once,
 * unless forced — a single job's inference is not a fact about an app.
 */
export function promoteCandidate(cfg: Config, index: number, force: boolean): PromoteResult {
  const path = join(cfg.paths.brainRoot, 'candidates.md');
  if (!existsSync(path)) return {ok: false, detail: 'chưa có candidates.md'};
  const text = readFileSync(path, 'utf8');
  const candidates = parseCandidates(text);
  const candidate = candidates[index - 1];
  if (!candidate) return {ok: false, detail: `không có candidate #${index} (có ${candidates.length})`};
  if (candidate.seen < 2 && !force) {
    return {
      ok: false,
      detail: `candidate #${index} mới thấy ${candidate.seen} lần; cần 2 fingerprint khác nhau hoặc --force`
    };
  }
  const appPath = join(cfg.paths.brainRoot, 'apps', `${candidate.app}.md`);
  if (!existsSync(appPath)) return {ok: false, detail: `không có brain file cho app ${candidate.app}`};

  const line = `- ${candidate.claim} _(promoted from candidate, seen ${candidate.seen}×: ${candidate.fingerprints.join(', ')})_`;
  const appText = readFileSync(appPath, 'utf8');
  const marker = '## Incident history';
  const next = appText.includes(marker)
    ? appText.replace(marker, `## Learned\n\n${line}\n\n${marker}`)
    : `${appText.trimEnd()}\n\n## Learned\n\n${line}\n`;
  writeFileSync(appPath, next, 'utf8');

  const remaining = candidates.filter((_, i) => i !== index - 1);
  const head = text.split('<!-- LEARN appends below this line -->')[0] ?? '';
  writeFileSync(
    path,
    `${head}<!-- LEARN appends below this line -->\n${remaining
      .map((c, i) => `- ${i + 1} · ${c.app} · seen ${c.seen} · [${c.fingerprints.join(', ')}] · ${c.claim}`)
      .join('\n')}\n`,
    'utf8'
  );
  return {ok: true, detail: `đã đưa vào ${candidate.app}.md: ${candidate.claim}`};
}

export function listCandidates(cfg: Config): string {
  const path = join(cfg.paths.brainRoot, 'candidates.md');
  if (!existsSync(path)) return 'chưa có candidates.md';
  const candidates = parseCandidates(readFileSync(path, 'utf8'));
  if (!candidates.length) return 'chưa có candidate nào.';
  return candidates
    .map((c, i) => `  ${i + 1}. [${c.app}] seen ${c.seen}× ${c.seen >= 2 ? '(promote được)' : ''} — ${c.claim}`)
    .join('\n');
}

/** Rebuilds a Slack-shaped message from a stored incident, for `replay`. */
export function incidentToMessage(cfg: Config, fingerprint: string, channel: string): IncomingMessage | undefined {
  const path = join(cfg.paths.brainRoot, 'incidents', `${fingerprint}.md`);
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, 'utf8');
  const field = (name: string) => new RegExp(`^${name}:\\s*(.+)$`, 'im').exec(text)?.[1]?.trim();
  const app = field('app');
  const service = field('service');
  const message = field('message');
  if (!app || !message) return undefined;
  const kindInfra = /infra class/.test(text);
  return {
    channel,
    ts: String(Date.now() / 1000),
    text: `${kindInfra ? '⚠️' : '🔴'} [${app}] ${message}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${kindInfra ? '⚠️' : '🔴'} *[${app}] ${service ?? 'unknown'}*  ·  \`ERROR\`  ·  _${
            kindInfra ? 'infra self-heal' : 'app error'
          }_`
        }
      },
      {type: 'section', text: {type: 'mrkdwn', text: '```' + message + '```'}}
    ],
    botId: 'REPLAY',
    userId: undefined,
    threadTs: undefined,
    subtype: undefined,
    eventId: undefined
  };
}

export function listIncidents(cfg: Config): string {
  const dir = join(cfg.paths.brainRoot, 'incidents');
  if (!existsSync(dir)) return 'chưa có incident nào.';
  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  if (!files.length) return 'chưa có incident nào.';
  return files.map(f => `  ${f.replace(/\.md$/, '')}`).join('\n');
}
