import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {Config} from '../config';
import {probeFixDeploy} from '../gcloud/deploy';
import {countMatching} from '../gcloud/logs';
import {spawnRunner, type Runner} from '../gcloud/run';
import {probeMerge} from '../git/mergeProbe';
import {resolveApp} from '../registry';
import type {AlertRow, Store} from '../state/store';
import {
  describeVerdict,
  judge,
  probeToken,
  readiness,
  signatureFilter,
  statusFor,
  windows,
  type Verdict
} from './recurrence';

/**
 * Walks every fingerprint with a pushed fix and asks prod whether the error is
 * actually gone. See `recurrence.ts` for why silence alone is not an answer.
 *
 * Read-only by default. `apply` is what writes a status, and even then it writes
 * only two: `fix_verified` and `fix_failed`. Everything else — not deployed, too
 * soon, improved-but-not-gone — is recorded as a verdict and left for a human,
 * because each of those would otherwise cost an Opus re-analysis to answer a
 * question the sweep already knows it cannot settle.
 *
 * Says nothing on Slack. A sweep is a measurement; the thread belongs to the
 * pipeline, and posting from a timer would mean regression notices arriving on a
 * thread nobody is reading.
 */

/** gcloud region every app in the registry deploys to. Same constant the pipeline uses. */
const REGION = 'us-central1';

/** Ceiling on one log read. A count at the cap is reported as a floor, not a total. */
const COUNT_CAP = 1000;

export interface SweepRow {
  fingerprint: string;
  appName: string;
  service: string | undefined;
  mrUrl: string | undefined;
  verdict: Verdict;
  /** Occurrences since the deploy. Undefined when no log read happened. */
  after: number | undefined;
  /** Occurrences in the equal-length window before the merge. */
  before: number | undefined;
  beforeTruncated: boolean;
  spanHours: number | undefined;
  token: string | undefined;
  /** Non-empty when the verdict came from a failure rather than a count. */
  detail: string | undefined;
  /** Status actually written. Undefined when nothing was written. */
  wrote: string | undefined;
}

export interface SweepReport {
  checked: number;
  applied: boolean;
  rows: SweepRow[];
}

export interface SweepDeps {
  cfg: Config;
  store: Store;
  now: () => number;
  runner?: Runner;
  log?: (line: string) => void;
}

export interface SweepOptions {
  /** Write `fix_verified` / `fix_failed`. Off by default; the CLI opts in. */
  apply: boolean;
  /** Restrict the sweep to one fingerprint. */
  only?: string | undefined;
}

/**
 * The alert message for rows written before the `signature` column existed.
 *
 * `brain/incidents/<fp>.md` carries the raw first line in its `message:` header —
 * the same field `incidentToMessage` replays from — so the 116 rows already on disk
 * are verifiable without waiting for each error to fire again.
 */
export function signatureFromBrain(brainRoot: string, fingerprint: string): string | undefined {
  const path = join(brainRoot, 'incidents', `${fingerprint}.md`);
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, 'utf8');
  return /^message:\s*(.+)$/im.exec(text)?.[1]?.trim() || undefined;
}

async function verifyOne(deps: SweepDeps, row: AlertRow, opts: SweepOptions): Promise<SweepRow> {
  const {cfg, store} = deps;
  const runner = deps.runner ?? spawnRunner;
  const nowMs = deps.now();
  const base: SweepRow = {
    fingerprint: row.fingerprint,
    appName: row.appName,
    service: row.service,
    mrUrl: row.mrUrl,
    verdict: 'probe_failed',
    after: undefined,
    before: undefined,
    beforeTruncated: false,
    spanHours: undefined,
    token: undefined,
    detail: undefined,
    wrote: undefined
  };

  const app = resolveApp(row.appName, cfg);
  if (!app) return {...base, detail: `app ${row.appName} không có trong registry`};
  if (!row.fixSha) return {...base, verdict: 'not_merged', detail: 'không có fix sha'};

  const merge = await probeMerge(
    {
      repoPath: app.repoPath,
      baseBranch: app.defaultBranch,
      fixSha: row.fixSha,
      fixBranch: row.branch,
      timeoutMs: cfg.timeouts.gcloudMs
    },
    runner
  );
  if (!merge.ok) return {...base, verdict: 'probe_failed', detail: merge.detail};

  // The service on the row may carry the `job:` prefix the alert lib adds.
  const isJob = (row.service ?? '').startsWith('job:');
  const serviceName = isJob ? row.service!.slice(4) : (row.service ?? 'api');

  let deployedAtMs: number | undefined;
  if (merge.value.merged) {
    // Anchored on the merge, not on "latest revision" — see `probeFixDeploy`.
    const deploy = await probeFixDeploy(
      {
        projectId: app.prodProject,
        serviceName,
        isJob,
        region: REGION,
        mergedAtMs: merge.value.mergedAtMs ?? 0,
        timeoutMs: cfg.timeouts.gcloudMs
      },
      runner
    );
    if (!deploy.ok) return {...base, verdict: 'probe_failed', detail: `${deploy.failure}: ${deploy.detail}`};
    deployedAtMs = deploy.value.deployedAtMs;
  }

  const ready = readiness({
    merged: merge.value.merged,
    mergedAtMs: merge.value.mergedAtMs,
    deployedAtMs,
    nowMs
  });
  if (!ready.ready) return {...base, verdict: ready.verdict};

  const signature = row.signature ?? signatureFromBrain(cfg.paths.brainRoot, row.fingerprint);
  // Worth persisting even on a verdict-less pass: recovering it cost a file read, and
  // the incident file can be rewritten or pruned later.
  if (signature && !row.signature && opts.apply) store.patchAlert(row.fingerprint, {signature});

  const token = signature ? probeToken(signature) : undefined;
  if (!token) {
    return {...base, verdict: 'no_signature', detail: signature ? `message: ${signature}` : 'không có message đã lưu'};
  }

  const win = windows({mergedAtMs: ready.mergedAtMs, deployedAtMs: ready.deployedAtMs, nowMs});
  const clause = signatureFilter(token);
  const spanHours = Math.round(win.spanMs / 3_600_000);

  const after = await countMatching(
    {
      projectId: app.prodProject,
      service: row.service,
      signatureClause: clause,
      fromIso: win.after.fromIso,
      toIso: win.after.toIso,
      cap: COUNT_CAP,
      timeoutMs: cfg.timeouts.gcloudMs
    },
    runner
  );
  if (!after.ok) return {...base, verdict: 'count_failed', token, spanHours, detail: `${after.failure}: ${after.detail}`};

  const before = await countMatching(
    {
      projectId: app.prodProject,
      service: row.service,
      signatureClause: clause,
      fromIso: win.before.fromIso,
      toIso: win.before.toIso,
      cap: COUNT_CAP,
      timeoutMs: cfg.timeouts.gcloudMs
    },
    runner
  );
  if (!before.ok) {
    return {...base, verdict: 'count_failed', token, spanHours, after: after.value.count, detail: `${before.failure}: ${before.detail}`};
  }

  const verdict = judge({
    after: after.value.count,
    before: before.value.count,
    beforeTruncated: before.value.truncated
  });

  let wrote: string | undefined;
  if (opts.apply) {
    const status = statusFor(verdict);
    store.patchAlert(row.fingerprint, {
      ...(status ? {status} : {}),
      verdict,
      verifiedAtMs: nowMs,
      note: `verify ${verdict}: sau deploy ${after.value.count}${after.value.truncated ? '+' : ''}, ` +
        `trước merge ${before.value.count}${before.value.truncated ? '+' : ''} trong ${spanHours}h · token "${token}"`
    });
    wrote = status;
  }

  return {
    ...base,
    verdict,
    after: after.value.count,
    before: before.value.count,
    beforeTruncated: before.value.truncated,
    spanHours,
    token,
    wrote
  };
}

export async function sweepVerify(deps: SweepDeps, opts: SweepOptions): Promise<SweepReport> {
  const log = deps.log ?? (() => {});
  const all = deps.store.alertsPendingVerify();
  const rows = opts.only ? all.filter(r => r.fingerprint === opts.only) : all;
  const out: SweepRow[] = [];
  // Serial on purpose: gcloud reads are the cost here, and a fan-out over 58 rows
  // would open 58 concurrent gcloud processes on a laptop that is also running the
  // daemon's pipeline.
  for (const row of rows) {
    const result = await verifyOne(deps, row, opts);
    log(
      `verify ${result.fingerprint} ${result.appName}/${result.service ?? '?'} → ${result.verdict}` +
        (result.after !== undefined ? ` (sau ${result.after} / trước ${result.before} trong ${result.spanHours}h)` : '')
    );
    out.push(result);
  }
  return {checked: rows.length, applied: opts.apply, rows: out};
}

const ORDER: Verdict[] = [
  'regressed',
  'improved',
  'verified',
  'unproven',
  'no_signature',
  'too_soon',
  'not_deployed',
  'not_merged',
  'count_failed',
  'probe_failed'
];

export function formatSweep(report: SweepReport): string {
  if (!report.checked) return 'không có fingerprint nào đã push fix để kiểm.';
  const byVerdict = new Map<Verdict, SweepRow[]>();
  for (const r of report.rows) byVerdict.set(r.verdict, [...(byVerdict.get(r.verdict) ?? []), r]);

  const lines: string[] = [
    `kiểm ${report.checked} fingerprint · ${report.applied ? 'CÓ ghi status' : 'chỉ đọc, không ghi'}`,
    ''
  ];
  for (const verdict of ORDER) {
    const group = byVerdict.get(verdict);
    if (!group?.length) continue;
    lines.push(`${verdict} (${group.length}) — ${describeVerdict(verdict)}`);
    for (const r of group) {
      const counts =
        r.after !== undefined
          ? `sau ${r.after}${r.beforeTruncated ? '' : ''} / trước ${r.before}${r.beforeTruncated ? '+' : ''} trong ${r.spanHours}h`
          : (r.detail ?? '');
      lines.push(
        `  ${r.fingerprint.padEnd(9)} ${r.appName.padEnd(8)} ${(r.service ?? '?').slice(0, 22).padEnd(22)} ` +
          `${counts}${r.wrote ? ` → ${r.wrote}` : ''}`
      );
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
