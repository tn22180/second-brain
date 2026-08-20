import {Database} from 'bun:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import type {ErrorKind} from '../fingerprint';
import type {AlertRecord, AlertStatus} from './stateMachine';
import type {AuditFinding, FindingKind, FindingStatus} from '../audit/ledger';

/**
 * Everything durable lives here: which fingerprints we have seen, what happened
 * to each, the MR rate ledger, jest baselines, and the Slack read cursor.
 *
 * Kept deliberately dumb — no decisions, just rows. `stateMachine.decide` owns
 * the policy, `rateGate` owns the caps.
 */

export interface AlertRow extends AlertRecord {
  appName: string;
  repo: string;
  service: string | undefined;
  kind: ErrorKind;
  firstSeenMs: number;
  lastSeenMs: number;
  recurrenceCount: number;
  /** Thread of the *first* alert. Replies go to the message being handled now. */
  firstThreadTs: string | undefined;
  branch: string | undefined;
  mergedAtMs: number | undefined;
  note: string | undefined;
  /**
   * First line of the alert message, verbatim. `fingerprint` is a hash and cannot be
   * inverted, so without this the verify sweep has no way to build a log filter for
   * the error it is supposed to be counting.
   */
  signature: string | undefined;
  verifiedAtMs: number | undefined;
  verdict: string | undefined;
}

interface RawAlert {
  fingerprint: string;
  app_name: string;
  repo: string;
  service: string | null;
  kind: string;
  status: string;
  first_seen_ms: number;
  last_seen_ms: number;
  recurrence_count: number;
  first_thread_ts: string | null;
  attempts: number;
  branch: string | null;
  fix_sha: string | null;
  mr_url: string | null;
  merged_at_ms: number | null;
  last_reply_ms: number | null;
  last_run_ms: number | null;
  note: string | null;
  signature: string | null;
  verified_at_ms: number | null;
  verdict: string | null;
}

const opt = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

function toRow(r: RawAlert): AlertRow {
  return {
    fingerprint: r.fingerprint,
    appName: r.app_name,
    repo: r.repo,
    service: opt(r.service),
    kind: r.kind as ErrorKind,
    status: r.status as AlertStatus,
    firstSeenMs: r.first_seen_ms,
    lastSeenMs: r.last_seen_ms,
    recurrenceCount: r.recurrence_count,
    firstThreadTs: opt(r.first_thread_ts),
    attempts: r.attempts,
    branch: opt(r.branch),
    fixSha: opt(r.fix_sha),
    mrUrl: opt(r.mr_url),
    mergedAtMs: opt(r.merged_at_ms),
    lastReplyMs: opt(r.last_reply_ms),
    lastRunMs: opt(r.last_run_ms),
    note: opt(r.note),
    signature: opt(r.signature),
    verifiedAtMs: opt(r.verified_at_ms),
    verdict: opt(r.verdict)
  };
}

export interface SeenAlertInput {
  fingerprint: string;
  appName: string;
  repo: string;
  service: string | undefined;
  kind: ErrorKind;
  alertTsMs: number;
  threadTs: string | undefined;
  /** First line of the raw message; what `verify` counts on. */
  signature?: string | undefined;
}

export interface AlertPatch {
  status?: AlertStatus;
  attempts?: number;
  branch?: string;
  fixSha?: string;
  mrUrl?: string;
  mergedAtMs?: number;
  note?: string;
  signature?: string;
  verifiedAtMs?: number;
  verdict?: string;
}

export interface AuditFindingRow extends AuditFinding {
  status: FindingStatus;
  firstSeenMs: number;
  lastSeenMs: number;
  mrUrl: string | undefined;
}

interface RawAuditFinding {
  fp: string;
  app: string;
  kind: string;
  file: string;
  line: number;
  rule: string;
  title: string;
  severity: string;
  verdict: string | null;
  first_seen_ms: number;
  last_seen_ms: number;
  status: string;
  mr_url: string | null;
}

function toAuditFindingRow(r: RawAuditFinding): AuditFindingRow {
  return {
    fp: r.fp,
    app: r.app,
    kind: r.kind as FindingKind,
    file: r.file,
    line: r.line,
    rule: r.rule,
    title: r.title,
    severity: r.severity,
    verdict: opt(r.verdict),
    status: r.status as FindingStatus,
    firstSeenMs: r.first_seen_ms,
    lastSeenMs: r.last_seen_ms,
    mrUrl: opt(r.mr_url)
  };
}

export class Store {
  private readonly db: Database;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), {recursive: true});
    this.db = new Database(path, {create: true});
    this.db.run('PRAGMA journal_mode = WAL');
    this.db.run('PRAGMA foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS alerts (
        fingerprint      TEXT PRIMARY KEY,
        app_name         TEXT NOT NULL,
        repo             TEXT NOT NULL,
        service          TEXT,
        kind             TEXT NOT NULL,
        status           TEXT NOT NULL,
        first_seen_ms    INTEGER NOT NULL,
        last_seen_ms     INTEGER NOT NULL,
        recurrence_count INTEGER NOT NULL DEFAULT 1,
        first_thread_ts  TEXT,
        attempts         INTEGER NOT NULL DEFAULT 0,
        branch           TEXT,
        fix_sha          TEXT,
        mr_url           TEXT,
        merged_at_ms     INTEGER,
        last_reply_ms    INTEGER,
        last_run_ms      INTEGER,
        note             TEXT,
        signature        TEXT,
        verified_at_ms   INTEGER,
        verdict          TEXT
      )`);
    // The live DB predates the verify sweep and holds 116 rows worth keeping, so the
    // three columns are added in place rather than by recreating the table.
    this.addColumns('alerts', {
      signature: 'TEXT',
      verified_at_ms: 'INTEGER',
      verdict: 'TEXT'
    });
    this.db.run('CREATE INDEX IF NOT EXISTS alerts_status ON alerts(status)');
    this.db.run('CREATE INDEX IF NOT EXISTS alerts_last_seen ON alerts(last_seen_ms DESC)');
    this.db.run(`
      CREATE TABLE IF NOT EXISTS mr_events (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        repo  TEXT NOT NULL,
        at_ms INTEGER NOT NULL
      )`);
    this.db.run('CREATE INDEX IF NOT EXISTS mr_events_at ON mr_events(at_ms)');
    this.db.run(`
      CREATE TABLE IF NOT EXISTS baselines (
        repo       TEXT NOT NULL,
        base_sha   TEXT NOT NULL,
        failures   TEXT NOT NULL,
        created_ms INTEGER NOT NULL,
        PRIMARY KEY (repo, base_sha)
      )`);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cursor (
        channel    TEXT PRIMARY KEY,
        last_ts    TEXT NOT NULL,
        updated_ms INTEGER NOT NULL
      )`);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS seen_events (
        event_id TEXT PRIMARY KEY,
        at_ms    INTEGER NOT NULL
      )`);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS audit_findings (
        fp            TEXT PRIMARY KEY,
        app           TEXT NOT NULL,
        kind          TEXT NOT NULL,
        file          TEXT NOT NULL,
        line          INTEGER NOT NULL,
        rule          TEXT,
        title         TEXT NOT NULL,
        severity      TEXT NOT NULL,
        verdict       TEXT,
        first_seen_ms INTEGER NOT NULL,
        last_seen_ms  INTEGER NOT NULL,
        status        TEXT NOT NULL,
        mr_url        TEXT
      )`);
    this.db.run('CREATE INDEX IF NOT EXISTS audit_findings_app ON audit_findings(app, status)');
    this.db.run('CREATE INDEX IF NOT EXISTS audit_findings_seen ON audit_findings(last_seen_ms DESC)');
  }

  /** `ADD COLUMN` is the only in-place schema change sqlite allows, and it is not idempotent. */
  private addColumns(table: string, columns: Record<string, string>): void {
    const existing = new Set(
      (this.db.query(`PRAGMA table_info(${table})`).all() as {name: string}[]).map(c => c.name)
    );
    for (const [name, type] of Object.entries(columns)) {
      if (!existing.has(name)) this.db.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    }
  }

  close(): void {
    this.db.close();
  }

  // ---- alerts ----------------------------------------------------------------

  getAlert(fingerprint: string): AlertRow | undefined {
    const raw = this.db.query('SELECT * FROM alerts WHERE fingerprint = ?').get(fingerprint) as
      | RawAlert
      | null;
    return raw ? toRow(raw) : undefined;
  }

  /**
   * Records that an alert arrived. Returns the row as it stood *before* this
   * occurrence (undefined when the fingerprint is new) so the caller can hand it
   * straight to `decide` — the counters are already updated on disk either way.
   */
  seenAlert(input: SeenAlertInput): {previous: AlertRow | undefined; current: AlertRow} {
    const previous = this.getAlert(input.fingerprint);
    if (!previous) {
      this.db
        .query(
          `INSERT INTO alerts
             (fingerprint, app_name, repo, service, kind, status,
              first_seen_ms, last_seen_ms, recurrence_count, first_thread_ts, attempts, signature)
           VALUES (?, ?, ?, ?, ?, 'new', ?, ?, 1, ?, 0, ?)`
        )
        .run(
          input.fingerprint,
          input.appName,
          input.repo,
          input.service ?? null,
          input.kind,
          input.alertTsMs,
          input.alertTsMs,
          input.threadTs ?? null,
          input.signature ?? null
        );
    } else {
      // COALESCE, not overwrite: the fingerprint is derived from the normalized
      // message, so every occurrence carries the same signature modulo ids — keeping
      // the first one means the filter does not drift between sweeps.
      this.db
        .query(
          `UPDATE alerts
              SET last_seen_ms = ?, recurrence_count = recurrence_count + 1,
                  first_thread_ts = COALESCE(first_thread_ts, ?),
                  signature = COALESCE(signature, ?)
            WHERE fingerprint = ?`
        )
        .run(input.alertTsMs, input.threadTs ?? null, input.signature ?? null, input.fingerprint);
    }
    return {previous, current: this.getAlert(input.fingerprint)!};
  }

  patchAlert(fingerprint: string, patch: AlertPatch): AlertRow | undefined {
    const columns: Record<keyof AlertPatch, string> = {
      status: 'status',
      attempts: 'attempts',
      branch: 'branch',
      fixSha: 'fix_sha',
      mrUrl: 'mr_url',
      mergedAtMs: 'merged_at_ms',
      note: 'note',
      signature: 'signature',
      verifiedAtMs: 'verified_at_ms',
      verdict: 'verdict'
    };
    const sets: string[] = [];
    const values: (string | number)[] = [];
    for (const [key, column] of Object.entries(columns) as [keyof AlertPatch, string][]) {
      const value = patch[key];
      if (value !== undefined) {
        sets.push(`${column} = ?`);
        values.push(value);
      }
    }
    if (!sets.length) return this.getAlert(fingerprint);
    this.db.query(`UPDATE alerts SET ${sets.join(', ')} WHERE fingerprint = ?`).run(...values, fingerprint);
    return this.getAlert(fingerprint);
  }

  markRun(fingerprint: string, nowMs: number): void {
    this.db.query('UPDATE alerts SET last_run_ms = ? WHERE fingerprint = ?').run(nowMs, fingerprint);
  }

  markReplied(fingerprint: string, nowMs: number): void {
    this.db.query('UPDATE alerts SET last_reply_ms = ? WHERE fingerprint = ?').run(nowMs, fingerprint);
  }

  /** Concurrency check for the queue: how many pipelines are mid-flight. */
  activeCount(): number {
    const row = this.db.query("SELECT COUNT(*) AS n FROM alerts WHERE status = 'analyzing'").get() as {
      n: number;
    };
    return row.n;
  }

  /** Fingerprints of jobs still running — the worktrees a sweep must not touch. */
  activeFingerprints(): string[] {
    const rows = this.db
      .query("SELECT fingerprint FROM alerts WHERE status = 'analyzing'")
      .all() as {fingerprint: string}[];
    return rows.map(r => r.fingerprint);
  }

  /**
   * Frees jobs whose process died without ever writing a terminal status.
   *
   * Without this a single hung job holds a concurrency slot forever: on 2026-07-30
   * `te44sp` sat in `analyzing` for 11.8 hours and every alert after it — 59 of them —
   * came back `deferred · concurrency`. The daemon looked alive and was doing nothing.
   *
   * A reclaimed job is parked at `inconclusive`, not retried on the spot: it already
   * spent model budget once, and whatever hung it may hang it again. The next
   * occurrence of the same fingerprint decides that, under the usual cooldown.
   */
  reclaimStale(cutoffMs: number, nowMs: number): string[] {
    const rows = this.db
      .query(
        "SELECT fingerprint FROM alerts WHERE status = 'analyzing' AND COALESCE(last_run_ms, first_seen_ms) < ?"
      )
      .all(cutoffMs) as {fingerprint: string}[];
    for (const {fingerprint} of rows) {
      this.patchAlert(fingerprint, {
        status: 'inconclusive',
        note: `stale_reclaimed: no terminal status by ${new Date(nowMs).toISOString()}`
      });
    }
    return rows.map(r => r.fingerprint);
  }

  recentAlerts(limit = 10): AlertRow[] {
    const rows = this.db
      .query('SELECT * FROM alerts ORDER BY last_seen_ms DESC LIMIT ?')
      .all(limit) as RawAlert[];
    return rows.map(toRow);
  }

  alertsByStatus(status: AlertStatus): AlertRow[] {
    const rows = this.db.query('SELECT * FROM alerts WHERE status = ?').all(status) as RawAlert[];
    return rows.map(toRow);
  }

  /**
   * Rows the verify sweep has something to say about: a fix was pushed and the
   * outcome is still open.
   *
   * `fix_verified` is deliberately excluded — it is terminal, and re-reading logs for
   * a closed incident on every sweep would spend gcloud quota to re-answer a settled
   * question. A regression after that point arrives as a new alert, which
   * `stateMachine.decide` routes back through the merge/deploy ordering check.
   */
  alertsPendingVerify(): AlertRow[] {
    const rows = this.db
      .query(
        `SELECT * FROM alerts
          WHERE status IN ('mr_open', 'awaiting_deploy', 'fix_failed')
            AND fix_sha IS NOT NULL
          ORDER BY last_seen_ms DESC`
      )
      .all() as RawAlert[];
    return rows.map(toRow);
  }

  // ---- MR rate ledger --------------------------------------------------------

  recordMrEvent(repo: string, nowMs: number): void {
    this.db.query('INSERT INTO mr_events (repo, at_ms) VALUES (?, ?)').run(repo, nowMs);
  }

  countMrEvents(sinceMs: number, repo?: string): number {
    const row = repo
      ? (this.db
          .query('SELECT COUNT(*) AS n FROM mr_events WHERE at_ms >= ? AND repo = ?')
          .get(sinceMs, repo) as {n: number})
      : (this.db.query('SELECT COUNT(*) AS n FROM mr_events WHERE at_ms >= ?').get(sinceMs) as {
          n: number;
        });
    return row.n;
  }

  // ---- jest baselines --------------------------------------------------------

  /** Failing `suite::test` keys on a given base commit, so a pre-existing failure is not read as a regression. */
  getBaseline(repo: string, baseSha: string): string[] | undefined {
    const row = this.db
      .query('SELECT failures FROM baselines WHERE repo = ? AND base_sha = ?')
      .get(repo, baseSha) as {failures: string} | null;
    return row ? (JSON.parse(row.failures) as string[]) : undefined;
  }

  putBaseline(repo: string, baseSha: string, failures: string[], nowMs: number): void {
    this.db
      .query(
        `INSERT INTO baselines (repo, base_sha, failures, created_ms) VALUES (?, ?, ?, ?)
         ON CONFLICT(repo, base_sha) DO UPDATE SET failures = excluded.failures, created_ms = excluded.created_ms`
      )
      .run(repo, baseSha, JSON.stringify(failures), nowMs);
  }

  // ---- Slack cursor and event dedupe ----------------------------------------

  getCursor(channel: string): string | undefined {
    const row = this.db.query('SELECT last_ts FROM cursor WHERE channel = ?').get(channel) as
      | {last_ts: string}
      | null;
    return row?.last_ts;
  }

  /** Monotonic: an out-of-order event must not rewind the backfill window. */
  setCursor(channel: string, lastTs: string, nowMs: number): void {
    const current = this.getCursor(channel);
    if (current !== undefined && Number(current) >= Number(lastTs)) return;
    this.db
      .query(
        `INSERT INTO cursor (channel, last_ts, updated_ms) VALUES (?, ?, ?)
         ON CONFLICT(channel) DO UPDATE SET last_ts = excluded.last_ts, updated_ms = excluded.updated_ms`
      )
      .run(channel, lastTs, nowMs);
  }

  /**
   * Remembers a reply this daemon posted.
   *
   * Needed because the alerting app and this daemon are the **same** Slack app —
   * verified 2026-07-30: alerts in the channel carry `user: U0ANC8JQ3AL`, which is
   * this bot's own user id. So "is it from us" cannot be answered by comparing user
   * ids; the ts of what we wrote is the only reliable signal.
   */
  markOwnReply(channel: string, ts: string, nowMs: number): void {
    this.markEventSeen(`reply:${channel}:${ts}`, nowMs);
  }

  isOwnReply(channel: string, ts: string): boolean {
    const row = this.db.query('SELECT 1 AS hit FROM seen_events WHERE event_id = ?').get(`reply:${channel}:${ts}`) as
      | {hit: number}
      | null;
    return row !== null;
  }

  /** True the first time an event id is seen. Socket Mode redelivers on missed acks. */
  markEventSeen(eventId: string, nowMs: number): boolean {
    const changes = this.db
      .query('INSERT OR IGNORE INTO seen_events (event_id, at_ms) VALUES (?, ?)')
      .run(eventId, nowMs);
    return changes.changes > 0;
  }

  pruneSeenEvents(beforeMs: number): number {
    return this.db.query('DELETE FROM seen_events WHERE at_ms < ?').run(beforeMs).changes;
  }

  // ---- audit findings ---------------------------------------------------------

  getAuditFinding(fp: string): AuditFindingRow | undefined {
    const raw = this.db.query('SELECT * FROM audit_findings WHERE fp = ?').get(fp) as RawAuditFinding | null;
    return raw ? toAuditFindingRow(raw) : undefined;
  }

  /**
   * `status` only ever becomes 'open' here — on first sight, or on a row coming
   * back from 'resolved'. A row a human marked 'accepted' / 'false_positive'
   * keeps that status through every later sighting; only `setAuditFindingStatus`
   * can move it, which `classify` never calls with either of those values.
   */
  upsertAuditFinding(finding: AuditFinding, nowMs: number): void {
    this.db
      .query(
        `INSERT INTO audit_findings
           (fp, app, kind, file, line, rule, title, severity, verdict, first_seen_ms, last_seen_ms, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
         ON CONFLICT(fp) DO UPDATE SET
           app = excluded.app,
           kind = excluded.kind,
           file = excluded.file,
           line = excluded.line,
           rule = excluded.rule,
           title = excluded.title,
           severity = excluded.severity,
           verdict = excluded.verdict,
           last_seen_ms = excluded.last_seen_ms,
           status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END`
      )
      .run(
        finding.fp,
        finding.app,
        finding.kind,
        finding.file,
        finding.line,
        finding.rule,
        finding.title,
        finding.severity,
        finding.verdict ?? null,
        nowMs,
        nowMs
      );
  }

  /** What `classify` diffs the next sweep against: still open, not yet accounted for. */
  openAuditFindings(app: string): AuditFindingRow[] {
    const rows = this.db
      .query("SELECT * FROM audit_findings WHERE app = ? AND status = 'open'")
      .all(app) as RawAuditFinding[];
    return rows.map(toAuditFindingRow);
  }

  setAuditFindingStatus(fp: string, status: FindingStatus): void {
    this.db.query('UPDATE audit_findings SET status = ? WHERE fp = ?').run(status, fp);
  }

  setAuditFindingMr(fp: string, url: string): void {
    this.db.query('UPDATE audit_findings SET mr_url = ? WHERE fp = ?').run(url, fp);
  }
}
