import {beforeEach, describe, expect, test} from 'bun:test';
import type {Analysis} from '../src/agent/analysisSchema';
import {buildConfig, type Config} from '../src/config';
import {admit, createListener, createPollTransport, type IncomingMessage, type Transport} from '../src/slack/listener';
import type {SlackApi, SlackMessage} from '../src/slack/client';
import {postReply} from '../src/slack/post';
import {
  replyBlocked,
  replyCapped,
  replyGateFailed,
  replyInconclusive,
  replyInfra,
  replyMrOpened,
  replyRepeat,
  replyUnknownApp
} from '../src/slack/reply';
import {Store} from '../src/state/store';
import type {SmokeOutcome} from '../src/verify/smoke';

const CHANNEL = 'C0PROD';
const cfg: Config = buildConfig({
  SLACK_BOT_TOKEN: 'xoxb-1',
  SLACK_ERROR_CHANNEL_ID: CHANNEL,
  AUTOFIX_STATE_DB: ':memory:'
});

function msg(over: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    channel: CHANNEL,
    ts: '1753800000.000100',
    text: '🔴 [BLOG] boom',
    blocks: undefined,
    botId: 'B_ALERT',
    userId: 'U_ALERT',
    threadTs: undefined,
    subtype: undefined,
    eventId: undefined,
    ...over
  };
}

describe('admit', () => {
  const ctx = {channel: CHANNEL, isOwnReply: () => false, alertBotId: undefined};

  test('an alert from the bot in the right channel is admitted', () => {
    expect(admit(msg(), ctx)).toEqual({process: true});
  });

  test('a ts we posted is never re-ingested', () => {
    // Without this the daemon replies to its own replies, forever.
    const ownCtx = {...ctx, isOwnReply: (ts: string) => ts === '1753800000.000100'};
    expect(admit(msg(), ownCtx)).toEqual({process: false, reason: 'own_reply'});
  });

  test('an alert from our own Slack app is still an alert', () => {
    // Verified against the real workspace: the alerting app and this daemon are the
    // SAME app — alerts carry user U0ANC8JQ3AL, which is this bot's own user id. A
    // `userId === self` guard rejected all 20 alerts in the channel.
    const sameApp = msg({userId: 'U0ANC8JQ3AL', botId: 'B0AMEHHL9PX'});
    expect(admit(sameApp, {channel: CHANNEL, isOwnReply: () => false, alertBotId: 'B0AMEHHL9PX'})).toEqual({
      process: true
    });
  });

  test('a thread reply is not a new alert', () => {
    expect(admit(msg({threadTs: '1753700000.000001'}), ctx)).toEqual({process: false, reason: 'thread_reply'});
  });

  test('the thread parent itself is admitted', () => {
    const parent = msg({threadTs: '1753800000.000100'});
    expect(admit(parent, ctx)).toEqual({process: true});
  });

  test('a human message is ignored', () => {
    expect(admit(msg({botId: undefined, subtype: undefined}), ctx)).toEqual({process: false, reason: 'not_a_bot'});
  });

  test('another channel is ignored', () => {
    expect(admit(msg({channel: 'C_OTHER'}), ctx)).toEqual({process: false, reason: 'other_channel'});
  });

  test('edits and deletions are ignored', () => {
    expect(admit(msg({subtype: 'message_changed'}), ctx).process).toBe(false);
    expect(admit(msg({subtype: 'message_deleted'}), ctx).process).toBe(false);
  });

  test('a known alert bot id narrows it further', () => {
    const narrowed = {...ctx, alertBotId: 'B_ALERT'};
    expect(admit(msg(), narrowed)).toEqual({process: true});
    expect(admit(msg({botId: 'B_SOMETHING_ELSE'}), narrowed)).toEqual({process: false, reason: 'other_bot'});
  });

  test('a bot_message subtype with no bot_id still counts', () => {
    expect(admit(msg({botId: undefined, subtype: 'bot_message'}), ctx)).toEqual({process: true});
  });
});

describe('listener', () => {
  let store: Store;
  let handled: string[];
  let posted: {threadTs: string; text: string}[];

  function fakeSlack(history: SlackMessage[] = []): SlackApi {
    return {
      async self() {
        return {botUserId: 'U_SELF', teamId: 'T1'};
      },
      async history() {
        return history;
      },
      async postThreadReply({threadTs, text}) {
        posted.push({threadTs, text});
        return {ts: '1.1'};
      },
      async permalink() {
        return 'https://slack/p1';
      }
    };
  }

  const noopTransport: Transport = {name: 'poll', async start() {}, async stop() {}};

  function historyMessage(ts: string): SlackMessage {
    return {ts, text: '🔴 [BLOG] boom', blocks: undefined, botId: 'B_ALERT', userId: 'U_ALERT', threadTs: undefined, subtype: undefined};
  }

  beforeEach(() => {
    store = new Store(':memory:');
    handled = [];
    posted = [];
  });

  function listener(slack: SlackApi, transport: Transport = noopTransport) {
    return createListener({
      cfg,
      store,
      slack,
      transport,
      onAlert: async m => {
        handled.push(m.ts);
      },
      now: () => 1_753_800_000_000
    });
  }

  test('the gap since the cursor is replayed on start', async () => {
    store.setCursor(CHANNEL, '1753700000.000001', 1);
    const res = await listener(fakeSlack([historyMessage('1753800000.000100'), historyMessage('1753800001.000200')])).start();
    expect(res.backfilled).toBe(2);
    expect(handled).toEqual(['1753800000.000100', '1753800001.000200']);
    // The cursor now sits at the newest replayed message.
    expect(store.getCursor(CHANNEL)).toBe('1753800001.000200');
  });

  test('a message already seen is not handled twice', async () => {
    const slack = fakeSlack([historyMessage('1753800000.000100')]);
    const l = listener(slack);
    await l.start();
    expect(handled).toHaveLength(1);
    await l.handle({...historyMessage('1753800000.000100'), channel: CHANNEL, eventId: undefined});
    expect(handled).toHaveLength(1);
  });

  test('a socket redelivery with the same event id is dropped', async () => {
    const l = listener(fakeSlack());
    await l.start();
    const event = {...historyMessage('1753800000.000100'), channel: CHANNEL, eventId: 'Ev123'};
    expect(await l.handle(event)).toBe(true);
    expect(await l.handle(event)).toBe(false);
  });

  test('refusing to start without auth.test, rather than risking a self-reply loop', async () => {
    const broken: SlackApi = {
      ...fakeSlack(),
      async self() {
        throw new Error('invalid_auth');
      }
    };
    await expect(listener(broken).start()).rejects.toThrow(/auth\.test failed/);
  });

  test('a failed backfill does not stop the listener going live', async () => {
    const flaky: SlackApi = {
      ...fakeSlack(),
      async history() {
        throw new Error('ratelimited');
      }
    };
    const res = await listener(flaky).start();
    expect(res.backfilled).toBe(0);
  });

  test('one alert whose pipeline throws does not drop the rest of the backfill', async () => {
    const logs: string[] = [];
    const l = createListener({
      cfg,
      store,
      slack: fakeSlack([historyMessage('1753800000.000100'), historyMessage('1753800001.000200')]),
      transport: noopTransport,
      onAlert: async m => {
        handled.push(m.ts);
        if (m.ts === '1753800000.000100') throw new Error('pipeline blew up');
      },
      now: () => 1,
      log: line => logs.push(line)
    });
    await l.start();
    // Both were attempted, and the cursor moved past both — a message that fails
    // twice would fail forever, and the incident row already records why.
    expect(handled).toEqual(['1753800000.000100', '1753800001.000200']);
    expect(store.getCursor(CHANNEL)).toBe('1753800001.000200');
    expect(logs.join(' ')).toContain('pipeline blew up');
  });

  test('skips are counted by reason', async () => {
    const l = listener(fakeSlack());
    await l.start();
    await l.handle({...historyMessage('2.1'), channel: CHANNEL, eventId: undefined, threadTs: '1.0'});
    await l.handle({...historyMessage('2.2'), channel: 'C_OTHER', eventId: undefined});
    const res = await l.start();
    expect(res.skipped.thread_reply).toBe(1);
    expect(res.skipped.other_channel).toBe(1);
  });

  test('a reply we posted is recorded, and never read back as an alert', async () => {
    const slack = fakeSlack();
    const l = listener(slack);
    await l.start();
    const {ts} = await postReply({slack, store, now: () => 1}, {channel: CHANNEL, threadTs: '1.0', text: 'hi'});
    expect(store.isOwnReply(CHANNEL, ts!)).toBe(true);
    // Even arriving as a top-level message with no thread_ts, it is skipped.
    const asTopLevel = {...historyMessage(ts!), channel: CHANNEL, eventId: undefined};
    expect(await l.handle(asTopLevel)).toBe(false);
  });

  test('the poll transport reads from the cursor and stops when told', async () => {
    let calls = 0;
    const slack: SlackApi = {
      ...fakeSlack(),
      async history({oldestTs}) {
        calls++;
        return oldestTs === undefined && calls === 1 ? [historyMessage('1753800000.000100')] : [];
      }
    };
    const transport = createPollTransport({cfg, store, slack, sleep: async () => {}});
    const seen: string[] = [];
    await transport.start(async m => {
      seen.push(m.ts);
      if (seen.length >= 1) await transport.stop();
    });
    await new Promise(r => setTimeout(r, 20));
    expect(seen).toContain('1753800000.000100');
  });
});

describe('reply text', () => {
  const analysis: Analysis = {
    rootCause: 'getPreview nhận id undefined rồi gọi .includes',
    mechanism: 'App Proxy gọi không kèm id',
    citations: [{file: 'packages/functions/src/controllers/appProxyController.js', line: 99, why: 'đọc id'}],
    evidence: [{logQuery: 'severity>=ERROR', matched: 44, sample: undefined}],
    confidence: 'high',
    reproPlan: 'gọi không id, assert 400',
    fixSketch: 'trả 400 trước khi gọi Shopify',
    isInfra: false
  };
  const base = {fingerprint: '1a2b', appName: 'BLOG', attempt: 1};
  const smoke: SmokeOutcome = {
    ok: true,
    failure: undefined,
    detail: undefined,
    newFailures: [],
    fixedFailures: [],
    baselineCount: 3,
    after: {ok: true, totalTests: 164, totalSuites: 23, failures: [], runtimeErrorSuites: 0},
    reproduce: {ran: true, ok: true, suiteLevelOnly: false, detail: undefined}
  };

  test('only the MR reply carries a URL', () => {
    const withMr = replyMrOpened({...base, analysis, smoke, mrUrl: 'https://gitlab.com/a/b/-/merge_requests/9', costUsd: 1.23, rounds: 2});
    expect(withMr).toContain('merge_requests/9');
    expect(withMr).toContain('$1.23');
    expect(withMr).toContain('chưa ai review');

    for (const text of [
      replyInconclusive({...base, analysis, rounds: 5, costUsd: 0.4, detail: 'hết vòng'}),
      replyCapped({...base, analysis, cap: 'mr_per_hour', detail: '5/5 MR trong 1 giờ qua'}),
      replyInfra({...base, analysis, detail: undefined}),
      replyBlocked({...base, what: 'gcloud chưa auth', detail: 'gcloud auth login'})
    ]) {
      expect(text).not.toContain('merge_requests/');
    }
  });

  test('a cap reply names the cap and the number', () => {
    const text = replyCapped({...base, analysis, cap: 'mr_per_repo_per_day', detail: '3/3 MR cho blogs trong 24h'});
    expect(text).toContain('mr_per_repo_per_day');
    expect(text).toContain('3/3');
    expect(text).toContain('thử mở lại');
  });

  test('inconclusive marks the hypothesis as not having passed the gate', () => {
    const text = replyInconclusive({...base, analysis: {...analysis, confidence: 'medium'}, rounds: 5, costUsd: 0.4, detail: 'd'});
    expect(text).toContain('Chưa chốt được root cause');
    expect(text).toContain('chưa** qua gate');
  });

  test('inconclusive with nothing valid still replies', () => {
    const text = replyInconclusive({...base, analysis: undefined, rounds: 5, costUsd: 0.1, detail: 'd'});
    expect(text).toContain('Không có giả thuyết nào hợp schema');
  });

  test('infra says explicitly that it will not auto-fix', () => {
    expect(replyInfra({...base, analysis, detail: undefined})).toContain('không auto-fix');
  });

  test('a blocked gate lists the new failures and where the worktree is', () => {
    const failed: SmokeOutcome = {...smoke, ok: false, failure: 'new_failures', newFailures: ['a.test.js::t']};
    const text = replyGateFailed({
      ...base,
      analysis,
      gate: 'new_failures',
      detail: '1 test fail thêm',
      smoke: failed,
      worktreeKept: '/home/u/.cache/prod-autofix/wt/blogs-1a2b'
    });
    expect(text).toContain('a.test.js::t');
    expect(text).toContain('wt/blogs-1a2b');
    expect(text).toContain('không mở MR');
  });

  test('every repeat reason produces a distinct, non-empty line', () => {
    const reasons = [
      'mr_open_unmerged',
      'awaiting_deploy',
      'alert_predates_deploy',
      'merge_state_unknown',
      'attempts_exhausted',
      'needs_human',
      'infra_no_autofix',
      'unknown_app',
      'job_in_flight',
      'inconclusive_cooldown'
    ] as const;
    const seen = new Set<string>();
    for (const reason of reasons) {
      const text = replyRepeat({
        ...base,
        reason,
        mrUrl: 'https://gitlab.com/a/b/-/merge_requests/9',
        recurrenceCount: 7,
        mrAgeMinutes: 42,
        detail: undefined
      });
      const first = text.split('\n')[0]!;
      expect(first.length).toBeGreaterThan(10);
      seen.add(first);
      expect(text).toContain('đã bắn 7 lần');
    }
    expect(seen.size).toBe(reasons.length);
  });

  test('an unknown merge state never reads as a failed fix', () => {
    const text = replyRepeat({
      ...base,
      reason: 'merge_state_unknown',
      mrUrl: undefined,
      recurrenceCount: 2,
      mrAgeMinutes: undefined,
      detail: undefined
    });
    expect(text).toContain('Không kết luận fix sai');
    expect(text).toContain('chưa có MR');
  });

  test('an unknown app lists what is covered instead of guessing', () => {
    const text = replyUnknownApp({appName: 'JOY', known: ['SEO', 'BLOG'], fingerprint: 'f'});
    expect(text).toContain('JOY');
    expect(text).toContain('không đoán repo');
    expect(text).toContain('SEO, BLOG');
  });
});
