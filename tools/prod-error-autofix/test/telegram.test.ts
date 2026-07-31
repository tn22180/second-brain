import {describe, expect, test} from 'bun:test';
import {buildConfig} from '../src/config';
import {buildMrMessage, sendTelegram, type Fetcher} from '../src/notify/telegram';

const NOTICE = {
  appName: 'BLOG',
  service: 'api',
  fingerprint: '1whczpb',
  rootCause: 'shop.recentOpenedArticles   holds\ncharacter-indexed objects instead of gid strings',
  mrUrl: 'https://gitlab.com/avada/blogs/-/merge_requests/793',
  threadUrl: 'https://avadaio.slack.com/archives/C0BEHGV1ST1/p1785471074444989',
  costUsd: 2.234,
  attempt: 1
};

const CFG = {botToken: '123456:AAsecret', chatId: '99887766', threadId: undefined};

describe('buildMrMessage', () => {
  test('carries the MR, the thread and the cost', () => {
    const text = buildMrMessage(NOTICE);
    expect(text).toContain('BLOG/api');
    expect(text).toContain('merge_requests/793');
    expect(text).toContain('p1785471074444989');
    expect(text).toContain('~$2.23 quy đổi (chạy trên gói)');
    expect(text).toContain('fp 1whczpb');
    // Nothing in this pipeline has been read by a person; the message has to say so.
    expect(text).toContain('Chưa ai review');
  });

  test('the root cause is flattened to one paragraph', () => {
    expect(buildMrMessage(NOTICE)).toContain('recentOpenedArticles holds character-indexed objects');
  });

  test('a retry says which attempt it is', () => {
    expect(buildMrMessage({...NOTICE, attempt: 2})).toContain('lần 2');
    expect(buildMrMessage(NOTICE)).not.toContain('lần 1');
  });

  test('no thread url just omits the line', () => {
    expect(buildMrMessage({...NOTICE, threadUrl: undefined})).not.toContain('Thread:');
  });
});

describe('sendTelegram', () => {
  function fetcher(over: {ok?: boolean; status?: number; body?: string; throws?: string} = {}): {
    fn: Fetcher;
    seen: () => {url: string; body: string} | undefined;
  } {
    let seen: {url: string; body: string} | undefined;
    const fn: Fetcher = async (url, init) => {
      if (over.throws) throw new Error(over.throws);
      seen = {url, body: String(init.body)};
      return {
        ok: over.ok ?? true,
        status: over.status ?? 200,
        text: async () => over.body ?? '{"ok":true}'
      };
    };
    return {fn, seen: () => seen};
  }

  test('posts to sendMessage with the chat id and no link previews', async () => {
    const {fn, seen} = fetcher();
    const res = await sendTelegram(CFG, 'hello', fn);
    expect(res.ok).toBe(true);
    expect(seen()!.url).toBe('https://api.telegram.org/bot123456:AAsecret/sendMessage');
    const body = JSON.parse(seen()!.body);
    expect(body).toMatchObject({chat_id: '99887766', text: 'hello', disable_web_page_preview: true});
    expect(body.message_thread_id).toBeUndefined();
  });

  test('a forum topic id is passed through when set', async () => {
    const {fn, seen} = fetcher();
    await sendTelegram({...CFG, threadId: '42'}, 'x', fn);
    expect(JSON.parse(seen()!.body).message_thread_id).toBe('42');
  });

  /** The token lives in the URL; an error that echoed the request would leak it. */
  test('a rejection reports the status and body but never the token', async () => {
    const {fn} = fetcher({ok: false, status: 403, body: '{"description":"bot was blocked by the user"}'});
    const res = await sendTelegram(CFG, 'x', fn);
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('403');
    expect(res.detail).toContain('blocked by the user');
    expect(res.detail).not.toContain('AAsecret');
  });

  test('an unreachable API is reported, never thrown', async () => {
    const {fn} = fetcher({throws: 'getaddrinfo ENOTFOUND api.telegram.org'});
    const res = await sendTelegram(CFG, 'x', fn);
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('unreachable');
    expect(res.detail).not.toContain('AAsecret');
  });
});

describe('telegram config', () => {
  const base = {SLACK_BOT_TOKEN: 'xoxb-1', SLACK_ERROR_CHANNEL_ID: 'C1'};

  test('both halves present enables notifying', () => {
    const cfg = buildConfig({...base, TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '5'});
    expect(cfg.telegram).toEqual({botToken: 't', chatId: '5', threadId: undefined});
  });

  test('half the config is no config, not a broken one', () => {
    expect(buildConfig({...base, TELEGRAM_BOT_TOKEN: 't'}).telegram).toBeUndefined();
    expect(buildConfig({...base, TELEGRAM_CHAT_ID: '5'}).telegram).toBeUndefined();
    expect(buildConfig(base).telegram).toBeUndefined();
  });
});
