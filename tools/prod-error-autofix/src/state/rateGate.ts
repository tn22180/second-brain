import type {Caps} from '../config';
import type {Store} from './store';

/**
 * The storm brake. One infra incident can produce a dozen distinct fingerprints,
 * and full-auto MRs on all of them would be worse than no automation.
 *
 * Deliberately only ever blocks the *MR*: the analysis still runs and still gets
 * posted to the thread, with the cap named. Silence would read as "nothing wrong
 * here".
 */

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export type CapName = 'concurrency' | 'mr_per_hour' | 'mr_per_repo_per_day';

export interface RateVerdict {
  allowed: boolean;
  cap: CapName | undefined;
  /** Human-readable, goes straight into the Slack reply. */
  detail: string | undefined;
}

const OK: RateVerdict = {allowed: true, cap: undefined, detail: undefined};

/** Checked before starting a pipeline, not before opening an MR. */
export function checkConcurrency(store: Store, caps: Caps): RateVerdict {
  const active = store.activeCount();
  if (active < caps.maxConcurrentJobs) return OK;
  return {
    allowed: false,
    cap: 'concurrency',
    detail: `${active}/${caps.maxConcurrentJobs} job đang chạy`
  };
}

export function checkMrCaps(store: Store, caps: Caps, repo: string, nowMs: number): RateVerdict {
  const lastHour = store.countMrEvents(nowMs - HOUR_MS);
  if (lastHour >= caps.mrPerHour) {
    return {
      allowed: false,
      cap: 'mr_per_hour',
      detail: `${lastHour}/${caps.mrPerHour} MR trong 1 giờ qua`
    };
  }
  const repoToday = store.countMrEvents(nowMs - DAY_MS, repo);
  if (repoToday >= caps.mrPerRepoPerDay) {
    return {
      allowed: false,
      cap: 'mr_per_repo_per_day',
      detail: `${repoToday}/${caps.mrPerRepoPerDay} MR cho ${repo} trong 24h`
    };
  }
  return OK;
}

/** Call immediately after a push succeeds, so a crash cannot lose the count. */
export function recordMr(store: Store, repo: string, nowMs: number): void {
  store.recordMrEvent(repo, nowMs);
}
