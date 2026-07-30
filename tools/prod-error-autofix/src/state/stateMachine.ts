import type {ErrorKind} from '../fingerprint';

/**
 * What to do when an alert arrives for a fingerprint we may already know.
 *
 * The hard case is a repeat alert: a fix that is merged but not deployed still
 * fires, so "the error came back" is not evidence the fix was wrong. Only the
 * ordering merged_at < deployed_at < alert_ts proves the fix shipped and the
 * error survived it.
 *
 * Pure on purpose — every branch below is reachable in a unit test without a
 * database, a git remote, or gcloud.
 */

export type AlertStatus =
  | 'new'
  | 'analyzing'
  | 'mr_open'
  | 'awaiting_deploy'
  | 'fix_failed'
  | 'inconclusive'
  | 'infra'
  | 'needs_human'
  | 'blocked'
  | 'unknown_app'
  | 'deferred';

export type DecisionReason =
  | 'first_seen'
  | 'infra_no_autofix'
  | 'job_in_flight'
  | 'mr_open_unmerged'
  | 'awaiting_deploy'
  | 'alert_predates_deploy'
  | 'fix_shipped_still_failing'
  | 'attempts_exhausted'
  | 'inconclusive_retry'
  | 'inconclusive_cooldown'
  | 'needs_human'
  | 'unknown_app'
  | 'retry_after_block'
  | 'retry_after_defer'
  | 'merge_state_unknown';

export interface AlertRecord {
  fingerprint: string;
  status: AlertStatus;
  attempts: number;
  lastReplyMs: number | undefined;
  lastRunMs: number | undefined;
  mrUrl: string | undefined;
  fixSha: string | undefined;
}

/** Filled in by the git/gcloud probes; only consulted once an MR exists. */
export interface DeployProbe {
  merged: boolean;
  mergedAtMs: number | undefined;
  deployedAtMs: number | undefined;
}

export interface DecideInput {
  existing: AlertRecord | undefined;
  kind: ErrorKind;
  alertTsMs: number;
  nowMs: number;
  probe: DeployProbe | undefined;
  maxFixAttempts: number;
  replyCooldownMs: number;
  /** How long an inconclusive fingerprint waits before a second look. */
  inconclusiveRetryMs: number;
}

export interface Decision {
  /** Run the analyze/fix pipeline. Costs model tokens. */
  run: boolean;
  /** Allowed to push and open an MR, if the rate gate also agrees. */
  allowMr: boolean;
  /** Post to the alert's thread. Repeat-alert replies are cooldown-limited. */
  reply: boolean;
  attempt: number;
  nextStatus: AlertStatus;
  reason: DecisionReason;
}

export const INCONCLUSIVE_RETRY_MS = 24 * 60 * 60 * 1000;

function cooledDown(lastReplyMs: number | undefined, nowMs: number, cooldownMs: number): boolean {
  if (lastReplyMs === undefined) return true;
  return nowMs - lastReplyMs >= cooldownMs;
}

/** Statuses where a repeat alert only ever increments a counter. */
function quiet(
  status: AlertStatus,
  reason: DecisionReason,
  input: DecideInput,
  opts: {reply: boolean} = {reply: true}
): Decision {
  return {
    run: false,
    allowMr: false,
    reply: opts.reply && cooledDown(input.existing?.lastReplyMs, input.nowMs, input.replyCooldownMs),
    attempt: input.existing?.attempts ?? 0,
    nextStatus: status,
    reason
  };
}

/**
 * Shared by mr_open and awaiting_deploy: has the fix actually reached prod, and
 * did the error outlive it?
 */
function afterMr(input: DecideInput): Decision {
  const {probe, existing, alertTsMs} = input;
  const attempts = existing?.attempts ?? 0;

  // No probe result means we could not reach git or gcloud. Never read that as
  // "the fix failed" — that would burn a second pipeline run on a guess.
  if (!probe) return quiet('mr_open', 'merge_state_unknown', input);
  if (!probe.merged) return quiet('mr_open', 'mr_open_unmerged', input);

  const {mergedAtMs, deployedAtMs} = probe;
  if (mergedAtMs === undefined || deployedAtMs === undefined || deployedAtMs <= mergedAtMs) {
    return quiet('awaiting_deploy', 'awaiting_deploy', input);
  }
  // The alert fired before the new revision went live, so it says nothing about
  // the fix. Common: the sender's 10-minute dedupe window straddles the deploy.
  if (alertTsMs <= deployedAtMs) return quiet('awaiting_deploy', 'alert_predates_deploy', input);

  if (attempts >= input.maxFixAttempts) {
    return {...quiet('needs_human', 'attempts_exhausted', input), reply: true};
  }
  return {
    run: true,
    allowMr: true,
    reply: true,
    attempt: attempts + 1,
    nextStatus: 'analyzing',
    reason: 'fix_shipped_still_failing'
  };
}

export function decide(input: DecideInput): Decision {
  const {existing, kind, nowMs} = input;

  if (!existing) {
    // Infra errors get analysed and reported, never auto-fixed: memory tiers and
    // instance ceilings are cost decisions, so the MR is Tuan's call.
    if (kind === 'infra') {
      return {run: true, allowMr: false, reply: true, attempt: 1, nextStatus: 'infra', reason: 'infra_no_autofix'};
    }
    return {run: true, allowMr: true, reply: true, attempt: 1, nextStatus: 'analyzing', reason: 'first_seen'};
  }

  switch (existing.status) {
    case 'analyzing':
      // A job for this fingerprint is already running. Two pipelines on one
      // worktree would fight over the branch.
      return quiet('analyzing', 'job_in_flight', input, {reply: false});

    case 'mr_open':
    case 'awaiting_deploy':
    case 'fix_failed':
      return afterMr(input);

    case 'infra':
      return quiet('infra', 'infra_no_autofix', input);

    case 'needs_human':
      return quiet('needs_human', 'needs_human', input, {reply: false});

    case 'unknown_app':
      return quiet('unknown_app', 'unknown_app', input);

    case 'inconclusive': {
      const last = existing.lastRunMs ?? 0;
      if (nowMs - last < input.inconclusiveRetryMs) {
        return quiet('inconclusive', 'inconclusive_cooldown', input);
      }
      // A day later there is more log to work with, so one more look is cheap
      // relative to leaving a real prod bug unexplained.
      return {
        run: true,
        allowMr: kind !== 'infra',
        reply: true,
        attempt: existing.attempts + 1,
        nextStatus: 'analyzing',
        reason: 'inconclusive_retry'
      };
    }

    case 'blocked':
      // Blocked means a precondition failed (gcloud auth) before any model ran,
      // so retrying on the next alert is nearly free.
      return {
        run: true,
        allowMr: kind !== 'infra',
        reply: cooledDown(existing.lastReplyMs, nowMs, input.replyCooldownMs),
        attempt: Math.max(existing.attempts, 1),
        nextStatus: 'analyzing',
        reason: 'retry_after_block'
      };

    case 'deferred':
      // Previously rate-capped. The analysis already posted; try for the MR again.
      return {
        run: true,
        allowMr: kind !== 'infra',
        reply: true,
        attempt: Math.max(existing.attempts, 1),
        nextStatus: 'analyzing',
        reason: 'retry_after_defer'
      };

    case 'new':
      return {
        run: true,
        allowMr: kind !== 'infra',
        reply: true,
        attempt: Math.max(existing.attempts, 1),
        nextStatus: kind === 'infra' ? 'infra' : 'analyzing',
        reason: 'first_seen'
      };
  }
}
