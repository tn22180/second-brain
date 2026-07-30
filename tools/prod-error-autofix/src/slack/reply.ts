import type {Analysis} from '../agent/analysisSchema';
import type {SmokeOutcome} from '../verify/smoke';
import {describeSmoke} from '../verify/smoke';
import type {DecisionReason} from '../state/stateMachine';

/**
 * What gets written back into the alert's thread.
 *
 * Rules the whole file follows:
 *  - every outcome replies with something; a silent job is indistinguishable from a
 *    daemon that died
 *  - a cap or a failed gate says which one, by name, with the number
 *  - nothing claims an MR exists unless there is a URL
 *
 * Written in Vietnamese because Tuan reads these; error strings, paths, filters and
 * numbers stay verbatim.
 */

export interface ReplyBase {
  fingerprint: string;
  appName: string;
  attempt: number;
}

function footer(input: ReplyBase): string {
  return `\`${input.fingerprint}\` · ${input.appName}${input.attempt > 1 ? ` · attempt ${input.attempt}` : ''}`;
}

function citations(analysis: Analysis): string {
  return analysis.citations.map(c => `• \`${c.file}:${c.line}\` — ${c.why}`).join('\n');
}

function evidence(analysis: Analysis): string {
  return analysis.evidence.map(e => `• ${e.matched} log khớp: \`${e.logQuery}\``).join('\n');
}

/** MR opened — the only reply that carries a URL. */
export function replyMrOpened(input: ReplyBase & {analysis: Analysis; smoke: SmokeOutcome; mrUrl: string; costUsd: number; rounds: number}): string {
  return [
    `✅ *MR đã mở:* ${input.mrUrl}`,
    '',
    `*Root cause.* ${input.analysis.rootCause}`,
    `*Cơ chế.* ${input.analysis.mechanism}`,
    '',
    citations(input.analysis),
    evidence(input.analysis),
    '',
    `*Test.* ${describeSmoke(input.smoke)}`,
    input.smoke.fixedFailures.length
      ? `Fix này còn làm pass ${input.smoke.fixedFailures.length} test đang fail sẵn trên base.`
      : '',
    '',
    `_${footer(input)} · ${input.rounds} vòng phân tích · $${input.costUsd.toFixed(2)} · chưa ai review_`
  ]
    .filter(l => l !== '')
    .join('\n');
}

/** Analysis passed but the MR was held back by a cap. */
export function replyCapped(input: ReplyBase & {analysis: Analysis; cap: string; detail: string}): string {
  return [
    `⏸️ *Đã phân tích xong, hoãn mở MR* — chạm cap \`${input.cap}\` (${input.detail}).`,
    'Alert lần sau của cùng fingerprint sẽ thử mở lại.',
    '',
    `*Root cause.* ${input.analysis.rootCause}`,
    citations(input.analysis),
    '',
    `_${footer(input)}_`
  ].join('\n');
}

/** Ran the loop, could not stand anything up. */
export function replyInconclusive(input: ReplyBase & {analysis: Analysis | undefined; rounds: number; costUsd: number; detail: string}): string {
  const head = [`❓ *Chưa chốt được root cause* sau ${input.rounds} vòng. Không mở MR.`, ''];
  const body = input.analysis
    ? [
        `Giả thuyết tốt nhất (\`confidence: ${input.analysis.confidence}\`, **chưa** qua gate):`,
        input.analysis.rootCause,
        citations(input.analysis),
        ''
      ]
    : ['Không có giả thuyết nào hợp schema.', ''];
  return [...head, ...body, `_${footer(input)} · $${input.costUsd.toFixed(2)} · ${input.detail}_`].join('\n');
}

/** Infra class: measured and reported, never auto-fixed. */
export function replyInfra(input: ReplyBase & {analysis: Analysis | undefined; detail: string | undefined}): string {
  return [
    '⚠️ *Lỗi hạ tầng — không auto-fix.* Tier/capacity là quyết định tiền, để mày chốt.',
    '',
    input.analysis ? `*Đo được.* ${input.analysis.rootCause}` : '',
    input.analysis ? `*Đề xuất.* ${input.analysis.fixSketch}` : '',
    input.analysis ? evidence(input.analysis) : '',
    input.detail ?? '',
    '',
    `_${footer(input)}_`
  ]
    .filter(l => l !== '')
    .join('\n');
}

/**
 * The branch is on the remote but no MR exists — the push option did not take.
 *
 * The work is not lost and must not read as lost: the reply leads with a one-click
 * create link and carries the MR body verbatim for pasting. This is the same manual
 * step the `jobs/bugprod.md` triage ended on when there was no token.
 */
export function replyPushedNoMr(input: ReplyBase & {
  analysis: Analysis;
  smoke: SmokeOutcome;
  branch: string;
  createMrUrl: string | undefined;
  mrTitle: string;
  mrBody: string;
  detail: string;
}): string {
  return [
    input.createMrUrl
      ? `📝 *Push xong, MR chưa tự tạo — bấm đây để tạo:* ${input.createMrUrl}`
      : '📝 *Push xong nhưng MR chưa tự tạo, và cũng không dựng được link tạo.*',
    `Branch đã lên remote: \`${input.branch}\`. Code không mất.`,
    `Lý do: ${input.detail}`,
    '',
    `*Root cause.* ${input.analysis.rootCause}`,
    citations(input.analysis),
    '',
    `*Test.* ${describeSmoke(input.smoke)}`,
    '',
    `*Title:* \`${input.mrTitle}\``,
    '*Body để paste:*',
    '```',
    input.mrBody.slice(0, 2500),
    '```',
    '',
    `_${footer(input)}_`
  ]
    .filter(l => l !== '')
    .join('\n');
}

/** The fix stage or the smoke gate refused. */
export function replyGateFailed(input: ReplyBase & {analysis: Analysis; gate: string; detail: string; smoke: SmokeOutcome | undefined; worktreeKept: string | undefined}): string {
  return [
    `🚫 *Có fix nhưng không mở MR* — chặn ở \`${input.gate}\`.`,
    input.detail,
    '',
    input.smoke?.newFailures.length
      ? ['*Test fail thêm so với base:*', ...input.smoke.newFailures.map(f => `• \`${f}\``)].join('\n')
      : '',
    input.worktreeKept ? `Worktree giữ lại để soi: \`${input.worktreeKept}\`` : '',
    '',
    `*Root cause đã xác định.* ${input.analysis.rootCause}`,
    citations(input.analysis),
    '',
    `_${footer(input)}_`
  ]
    .filter(l => l !== '')
    .join('\n');
}

/** A repeat alert on a fingerprint that already has an MR, or is otherwise parked. */
export function replyRepeat(input: ReplyBase & {
  reason: DecisionReason;
  mrUrl: string | undefined;
  recurrenceCount: number;
  mrAgeMinutes: number | undefined;
  detail: string | undefined;
}): string {
  const age = input.mrAgeMinutes !== undefined ? ` (mở ${input.mrAgeMinutes} phút trước)` : '';
  const mr = input.mrUrl ? `${input.mrUrl}${age}` : 'chưa có MR';
  const lines: Record<DecisionReason, string> = {
    mr_open_unmerged: `🔁 Vẫn lỗi này — MR đã có, **chưa merge**: ${mr}`,
    awaiting_deploy: `🔁 Vẫn lỗi này — đã merge nhưng **prod chưa deploy revision mới**: ${mr}`,
    alert_predates_deploy: `🔁 Alert này bắn **trước** thời điểm deploy nên chưa nói được gì về fix: ${mr}`,
    merge_state_unknown: `🔁 Vẫn lỗi này, nhưng **không kiểm được** trạng thái merge/deploy (git hoặc gcloud không với tới). Không kết luận fix sai: ${mr}`,
    attempts_exhausted: `🛑 Fix đã lên prod mà lỗi vẫn còn, **hết số lần thử**. Cần người xem: ${mr}`,
    needs_human: `🛑 Đang chờ người xem: ${mr}`,
    infra_no_autofix: '⚠️ Lỗi hạ tầng, không auto-fix.',
    unknown_app: '❔ App này không có trong registry của autofix.',
    job_in_flight: '⏳ Đang chạy job cho fingerprint này.',
    inconclusive_cooldown: '❓ Chưa chốt được root cause; chờ đủ 24h mới xem lại.',
    first_seen: '',
    inconclusive_retry: '',
    retry_after_block: '',
    retry_after_defer: '',
    fix_shipped_still_failing: ''
  };
  return [
    lines[input.reason] || `🔁 Vẫn lỗi này: ${mr}`,
    input.detail ?? '',
    '',
    `_${footer(input)} · đã bắn ${input.recurrenceCount} lần · reply tối đa 1 lần/24h_`
  ]
    .filter(l => l !== '')
    .join('\n');
}

/** A precondition failed before any model ran. */
export function replyBlocked(input: ReplyBase & {what: string; detail: string}): string {
  return [
    `⛔ *Chưa xử lý được* — ${input.what}.`,
    `\`${input.detail}\``,
    'Không gọi model để không đốt token vào job chắc chắn fail. Alert lần sau sẽ thử lại.',
    '',
    `_${footer(input)}_`
  ].join('\n');
}

export function replyUnknownApp(input: {appName: string; known: string[]; fingerprint: string}): string {
  return [
    `❔ *App \`${input.appName}\` không có trong registry* — không đoán repo.`,
    `Đang cover: ${input.known.join(', ')}.`,
    '',
    `_\`${input.fingerprint}\`_`
  ].join('\n');
}
