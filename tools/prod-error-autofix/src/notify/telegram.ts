/**
 * One message per MR, to the group Tuan already reports from.
 *
 * The Slack thread carries the full write-up; this is the management view — what got
 * opened, against what, and what it cost — in a place that is checked without opening
 * Slack. Nothing here is allowed to affect the pipeline: a Telegram outage must never
 * turn a successful MR into a failed job, so every failure is returned, never thrown.
 */

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  /** Forum topic id, when the chat is a group with topics. */
  threadId: string | undefined;
}

export interface MrNotice {
  appName: string;
  service: string | undefined;
  fingerprint: string;
  rootCause: string;
  mrUrl: string;
  threadUrl: string | undefined;
  costUsd: number;
  attempt: number;
}

export function buildMrMessage(input: MrNotice): string {
  const lines = [
    `🔧 MR mới · ${input.appName}/${input.service ?? '?'}` + (input.attempt > 1 ? ` · lần ${input.attempt}` : ''),
    '',
    input.rootCause.replace(/\s+/g, ' ').slice(0, 400),
    '',
    `MR: ${input.mrUrl}`
  ];
  if (input.threadUrl) lines.push(`Thread: ${input.threadUrl}`);
  // `total_cost_usd` from `claude -p` is the API-equivalent of the run, not money
  // billed: these run on a subscription, so nothing is charged per job. Presenting a
  // bare "$2.23" reads as spend and is wrong. It is still the only comparable measure
  // of how much work a job took, so it stays — labelled for what it is.
  lines.push('', `~$${input.costUsd.toFixed(2)} quy đổi (chạy trên gói) · fp ${input.fingerprint}`, 'Chưa ai review.');
  return lines.join('\n');
}

export type Fetcher = (url: string, init: RequestInit) => Promise<{ok: boolean; status: number; text(): Promise<string>}>;

export async function sendTelegram(
  cfg: TelegramConfig,
  text: string,
  fetchImpl: Fetcher = fetch as unknown as Fetcher
): Promise<{ok: boolean; detail: string | undefined}> {
  const body: Record<string, unknown> = {
    chat_id: cfg.chatId,
    text,
    disable_web_page_preview: true
  };
  if (cfg.threadId) body.message_thread_id = cfg.threadId;

  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body)
    });
    if (res.ok) return {ok: true, detail: undefined};
    // The token is in the URL, so an error string that echoed the request would leak
    // it into the daemon log. Only the status and the response body go out.
    const detail = (await res.text()).slice(0, 200);
    return {ok: false, detail: `telegram ${res.status}: ${detail}`};
  } catch (e) {
    return {ok: false, detail: `telegram unreachable: ${(e as Error).message.slice(0, 200)}`};
  }
}
