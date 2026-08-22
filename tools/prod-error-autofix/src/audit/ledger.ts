import type {AuditFindingRow, Store} from '../state/store';

export type FindingKind = 'security' | 'hygiene';

/**
 * `accepted` and `false_positive` are set by a human reading the report, through
 * `Store.setAuditFindingStatus` directly — never by `classify` or anything else in
 * the scan path. Suppressing a finding forever is a decision, not a scan outcome.
 */
export type FindingStatus = 'open' | 'resolved' | 'false_positive' | 'accepted';

export interface AuditFinding {
  fp: string;
  app: string;
  kind: FindingKind;
  file: string;
  line: number;
  rule: string;
  title: string;
  severity: string;
  verdict?: string;
}

export interface LedgerDiff {
  fresh: AuditFinding[];
  carried: number;
  resolved: number;
  suppressed: number;
  /**
   * The rows that flipped to `resolved` in THIS call, carried out because this is the
   * only place that knows which ones flipped today: a later
   * `SELECT … WHERE status = 'resolved'` also returns everything resolved last month,
   * which would re-comment on the same closed tickets every morning. `resolved` stays
   * a count so `report.ts` and its tests are untouched.
   */
  resolvedRows: AuditFindingRow[];
}

/**
 * Turns "what the scanners found today" into "what is new" so the daily report
 * does not repeat the same unused constants forever. A finding is `fresh` the
 * first time it is seen and any time it reappears after being `resolved`;
 * `accepted` / `false_positive` are a human's call and outrank the scan in both
 * directions — they are suppressed, not re-reported, until a human changes them.
 */
export function classify(store: Store, app: string, found: AuditFinding[], nowMs: number): LedgerDiff {
  const seen = new Set(found.map(f => f.fp));
  const fresh: AuditFinding[] = [];
  let carried = 0;
  let suppressed = 0;

  for (const f of found) {
    const prior = store.getAuditFinding(f.fp);
    if (prior?.status === 'accepted' || prior?.status === 'false_positive') {
      suppressed++;
      store.upsertAuditFinding(f, nowMs);
      continue;
    }
    if (prior && prior.status === 'open') carried++;
    else fresh.push(f);
    store.upsertAuditFinding(f, nowMs);
  }

  const resolvedRows: AuditFindingRow[] = [];
  for (const row of store.openAuditFindings(app)) {
    if (seen.has(row.fp)) continue;
    store.setAuditFindingStatus(row.fp, 'resolved');
    resolvedRows.push(row);
  }
  return {fresh, carried, resolved: resolvedRows.length, suppressed, resolvedRows};
}
