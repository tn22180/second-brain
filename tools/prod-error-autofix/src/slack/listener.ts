import type {Config} from '../config';
import type {Store} from '../state/store';
import type {SlackApi, SlackMessage} from './client';

/**
 * Turns Slack traffic into alert events, exactly once each.
 *
 * Socket Mode when an app-level token exists, polling `conversations.history`
 * otherwise — the bot token alone covers polling, and the backfill path needs the
 * same API regardless, so the fallback is nearly free.
 *
 * Whichever transport is used, the cursor in SQLite is the source of truth for
 * "what has been seen". On start the gap since the cursor is replayed, which is what
 * makes a dropped socket survivable.
 */

export interface IncomingMessage extends SlackMessage {
  channel: string;
  /** Socket Mode envelope id, when there is one. */
  eventId: string | undefined;
}

export interface SkipReason {
  process: false;
  reason:
    | 'other_channel'
    | 'own_reply'
    | 'thread_reply'
    | 'not_a_bot'
    | 'other_bot'
    | 'no_ts'
    | 'already_seen'
    | 'message_changed';
}

export type Admission = {process: true} | SkipReason;

export interface AdmissionContext {
  channel: string;
  /** True for a ts this daemon posted. See the note below. */
  isOwnReply: (ts: string) => boolean;
  /** Optional narrowing to the alerting bot, when its id is known. */
  alertBotId: string | undefined;
}

/**
 * Decides whether a message is a fresh alert.
 *
 * The exclusion that matters is our own replies — this daemon writes into the same
 * channel it reads. But it cannot be done by comparing user ids: verified against the
 * real workspace on 2026-07-30, the alerts are posted by the *same* Slack app whose
 * token this daemon uses (`user: U0ANC8JQ3AL`, `bot_id: B0AMEHHL9PX`). A
 * `userId === self` check rejected all 20 alerts in the channel.
 *
 * So two signals are used instead, neither of which depends on a separate identity:
 * every reply we write is threaded (`thread_ts !== ts`), and every ts we post is
 * recorded. Parsing is the third net — a reply has no alert header.
 */
export function admit(message: IncomingMessage, ctx: AdmissionContext): Admission {
  if (message.channel !== ctx.channel) return {process: false, reason: 'other_channel'};
  if (!message.ts) return {process: false, reason: 'no_ts'};
  if (message.subtype === 'message_changed' || message.subtype === 'message_deleted') {
    return {process: false, reason: 'message_changed'};
  }
  if (ctx.isOwnReply(message.ts)) return {process: false, reason: 'own_reply'};
  if (message.threadTs && message.threadTs !== message.ts) return {process: false, reason: 'thread_reply'};
  if (!message.botId && message.subtype !== 'bot_message') return {process: false, reason: 'not_a_bot'};
  if (ctx.alertBotId && message.botId && message.botId !== ctx.alertBotId) {
    return {process: false, reason: 'other_bot'};
  }
  return {process: true};
}

export interface Transport {
  name: 'socket' | 'poll';
  /** The handler returns whether the message was an alert it processed. */
  start(onMessage: (m: IncomingMessage) => Promise<unknown>): Promise<void>;
  stop(): Promise<void>;
}

export type AlertHandler = (message: IncomingMessage) => Promise<void>;

export interface ListenerDeps {
  cfg: Config;
  store: Store;
  slack: SlackApi;
  transport: Transport;
  onAlert: AlertHandler;
  now?: () => number;
  log?: (line: string) => void;
}

export interface Listener {
  /** Replays the gap since the cursor, then starts the transport. */
  start(): Promise<{backfilled: number; skipped: Record<string, number>}>;
  stop(): Promise<void>;
  /** Exposed for the CLI so a single message can be replayed by hand. */
  handle(message: IncomingMessage): Promise<boolean>;
}

const BACKFILL_LIMIT = 200;

export function createListener(deps: ListenerDeps): Listener {
  const {cfg, store, slack, transport, onAlert} = deps;
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? (() => {});
  const skipped: Record<string, number> = {};
  let selfBotUserId: string | undefined;

  const bump = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };

  async function handle(message: IncomingMessage): Promise<boolean> {
    const verdict = admit(message, {
      channel: cfg.errorChannelId,
      isOwnReply: ts => store.isOwnReply(message.channel, ts),
      alertBotId: process.env.SLACK_ALERT_BOT_ID || undefined
    });
    if (!verdict.process) {
      bump(verdict.reason);
      return false;
    }

    // Socket Mode redelivers on a missed ack, and a backfill can overlap a live
    // event. The event id when present, the message ts otherwise.
    const key = message.eventId ?? `${message.channel}:${message.ts}`;
    if (!store.markEventSeen(key, now())) {
      bump('already_seen');
      return false;
    }

    try {
      await onAlert(message);
    } finally {
      // The cursor advances even if handling threw: a message that fails twice would
      // fail forever, and the incident row already records what happened.
      store.setCursor(message.channel, message.ts, now());
    }
    return true;
  }

  return {
    async start() {
      try {
        const self = await slack.self();
        selfBotUserId = self.botUserId;
        log(`slack: authenticated, bot user ${self.botUserId ?? '(unknown)'}`);
      } catch (e) {
        // Fail fast on a bad token rather than looking healthy while reading nothing.
        throw new Error(`slack auth.test failed: ${(e as Error).message}`);
      }

      const cursor = store.getCursor(cfg.errorChannelId);
      let backfilled = 0;
      try {
        const missed = await slack.history({
          channel: cfg.errorChannelId,
          oldestTs: cursor,
          limit: BACKFILL_LIMIT
        });
        for (const m of missed) {
          // Per message, not per batch: one alert whose pipeline throws must not
          // silently drop the rest of the gap.
          try {
            if (await handle({...m, channel: cfg.errorChannelId, eventId: undefined})) backfilled++;
          } catch (e) {
            log(`slack: backfill alert ${m.ts} failed — ${(e as Error).message}`);
          }
        }
        log(`slack: backfilled ${backfilled} alert(s) since ${cursor ?? 'the beginning of the channel'}`);
      } catch (e) {
        log(`slack: backfill could not be read, continuing live — ${(e as Error).message}`);
      }

      await transport.start(handle);
      log(`slack: listening via ${transport.name}`);
      return {backfilled, skipped};
    },
    async stop() {
      await transport.stop();
    },
    handle
  };
}

/**
 * Polling transport. Used whenever there is no app-level token, and it is also the
 * mechanism the backfill relies on, so it is exercised either way.
 */
export function createPollTransport(deps: {
  cfg: Config;
  store: Store;
  slack: SlackApi;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
}): Transport {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const log = deps.log ?? (() => {});
  let running = false;

  return {
    name: 'poll',
    async start(onMessage) {
      running = true;
      void (async () => {
        while (running) {
          try {
            const cursor = deps.store.getCursor(deps.cfg.errorChannelId);
            const messages = await deps.slack.history({
              channel: deps.cfg.errorChannelId,
              oldestTs: cursor,
              limit: 50
            });
            for (const m of messages) {
              try {
                await onMessage({...m, channel: deps.cfg.errorChannelId, eventId: undefined});
              } catch (e) {
                log(`slack poll: alert ${m.ts} failed — ${(e as Error).message}`);
              }
            }
          } catch (e) {
            log(`slack poll: ${(e as Error).message}`);
          }
          await sleep(deps.cfg.pollIntervalMs);
        }
      })();
    },
    async stop() {
      running = false;
    }
  };
}

/**
 * Socket Mode transport. Requires an app-level `xapp-` token with
 * `connections:write` and `message.channels` subscribed.
 */
export function createSocketTransport(deps: {
  appToken: string;
  log?: (line: string) => void;
}): Transport {
  const log = deps.log ?? (() => {});
  let client: {start(): Promise<unknown>; disconnect(): Promise<unknown>; on(e: string, h: (a: never) => void): void} | undefined;

  return {
    name: 'socket',
    async start(onMessage) {
      const {SocketModeClient} = await import('@slack/socket-mode');
      const socket = new SocketModeClient({appToken: deps.appToken});
      client = socket as unknown as typeof client;
      socket.on('message', async ({event, body, ack}: never extends never ? any : never) => {
        // Ack first: an unacked envelope is redelivered, and the store's event-id
        // dedupe is what keeps that from double-processing.
        if (typeof ack === 'function') await ack();
        if (!event || typeof event !== 'object') return;
        try {
          await onMessage({
          channel: String(event.channel ?? ''),
          ts: String(event.ts ?? ''),
          text: typeof event.text === 'string' ? event.text : undefined,
          blocks: event.blocks,
          botId: typeof event.bot_id === 'string' ? event.bot_id : undefined,
          userId: typeof event.user === 'string' ? event.user : undefined,
          threadTs: typeof event.thread_ts === 'string' ? event.thread_ts : undefined,
            subtype: typeof event.subtype === 'string' ? event.subtype : undefined,
            eventId: typeof body?.event_id === 'string' ? body.event_id : undefined
          });
        } catch (e) {
          // A thrown pipeline must not take the socket down with it.
          log(`slack socket: alert ${String(event.ts)} failed — ${(e as Error).message}`);
        }
      });
      socket.on('disconnect', () => log('slack socket: disconnected, the client will reconnect'));
      await socket.start();
    },
    async stop() {
      await client?.disconnect();
    }
  };
}
