import {WebClient} from '@slack/web-api';

/**
 * The Slack surface this project needs, behind an interface so the listener and
 * the reply builders are testable without a workspace.
 */

export interface SlackMessage {
  ts: string;
  text: string | undefined;
  blocks: unknown;
  botId: string | undefined;
  userId: string | undefined;
  /** Present on a reply; equal to `ts` on the thread parent. */
  threadTs: string | undefined;
  subtype: string | undefined;
}

export interface SlackApi {
  /** Bot user id, used to ignore our own replies. */
  self(): Promise<{botUserId: string | undefined; teamId: string | undefined}>;
  history(input: {channel: string; oldestTs: string | undefined; limit: number}): Promise<SlackMessage[]>;
  postThreadReply(input: {channel: string; threadTs: string; text: string; blocks?: unknown}): Promise<{ts: string | undefined}>;
  permalink(input: {channel: string; ts: string}): Promise<string | undefined>;
}

function toMessage(raw: Record<string, unknown>): SlackMessage {
  return {
    ts: String(raw.ts ?? ''),
    text: typeof raw.text === 'string' ? raw.text : undefined,
    blocks: raw.blocks,
    botId: typeof raw.bot_id === 'string' ? raw.bot_id : undefined,
    userId: typeof raw.user === 'string' ? raw.user : undefined,
    threadTs: typeof raw.thread_ts === 'string' ? raw.thread_ts : undefined,
    subtype: typeof raw.subtype === 'string' ? raw.subtype : undefined
  };
}

export function createSlackApi(botToken: string): SlackApi {
  const web = new WebClient(botToken);
  return {
    async self() {
      const res = await web.auth.test();
      return {
        botUserId: typeof res.user_id === 'string' ? res.user_id : undefined,
        teamId: typeof res.team_id === 'string' ? res.team_id : undefined
      };
    },
    async history({channel, oldestTs, limit}) {
      const res = await web.conversations.history({
        channel,
        limit,
        ...(oldestTs ? {oldest: oldestTs} : {}),
        inclusive: false
      });
      const messages = Array.isArray(res.messages) ? res.messages : [];
      // Slack returns newest first; the backfill wants to replay in order.
      return messages.map(m => toMessage(m as Record<string, unknown>)).reverse();
    },
    async postThreadReply({channel, threadTs, text, blocks}) {
      const res = await web.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text,
        ...(blocks ? {blocks: blocks as never} : {}),
        unfurl_links: false,
        unfurl_media: false
      });
      return {ts: typeof res.ts === 'string' ? res.ts : undefined};
    },
    async permalink({channel, ts}) {
      try {
        const res = await web.chat.getPermalink({channel, message_ts: ts});
        return typeof res.permalink === 'string' ? res.permalink : undefined;
      } catch {
        // A missing permalink is cosmetic; never fail a job over it.
        return undefined;
      }
    }
  };
}
