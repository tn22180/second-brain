import {describe, expect, it} from 'bun:test';
import {capRemaining, isNewThread, messageText, permalink, resolveApp, worktreeName} from '../src/watch';

describe('resolveApp', () => {
  it('reads the CS post App: line', () => {
    expect(resolveApp('App: SEO Suite\nApp plan: pro_22', null)).toBe('seo');
    expect(resolveApp('App: SEO On AEO\nShop URL: x', null)).toBe('llm-ai-search-seo');
    expect(resolveApp('App: SEO On AI Product Copy', null)).toBe('ai-product-copy');
    expect(resolveApp('App: Avada Speed Optimization', null)).toBe('avada-image-optimizer');
  });
  it('the most specific alias wins over "seo"', () => {
    expect(resolveApp('App: SEO On Blog', null)).toBe('blogs');
  });
  it('falls back to the channel default, else null', () => {
    expect(resolveApp('khách báo lỗi bài viết', 'blogs')).toBe('blogs');
    expect(resolveApp('hello', null)).toBeNull();
  });
});

describe('isNewThread', () => {
  const own = new Set(['UBOT', 'BBOT']);
  it('keeps CS bot posts and human top-level posts', () => {
    expect(isNewThread({ts: '1.1', bot_id: 'BCS', subtype: 'bot_message'}, own)).toBe(true);
    expect(isNewThread({ts: '1.1', user: 'UCS'}, own)).toBe(true);
  });
  it('drops replies, joins and our own posts', () => {
    expect(isNewThread({ts: '1.2', thread_ts: '1.1', user: 'UCS'}, own)).toBe(false);
    expect(isNewThread({ts: '1.1', subtype: 'channel_join', user: 'UCS'}, own)).toBe(false);
    expect(isNewThread({ts: '1.1', user: 'UBOT'}, own)).toBe(false);
    expect(isNewThread({ts: '1.1', bot_id: 'BBOT', subtype: 'bot_message'}, own)).toBe(false);
  });
});

describe('helpers', () => {
  it('messageText includes attachment text', () => {
    expect(messageText({ts: '1', text: 'a', attachments: [{text: 'App: SEO Suite'}]})).toContain('App: SEO Suite');
  });
  it('permalink and worktree name', () => {
    expect(permalink('avadaio', 'G01', '1791210973.238389')).toBe('https://avadaio.slack.com/archives/G01/p1791210973238389');
    expect(worktreeName('seo', '1791210973.238389')).toBe('slack-seo-1791210973238');
  });
  it('rolling cap', () => {
    const now = new Date('2026-10-06T10:00:00Z');
    const recent = ['2026-10-06T09:30:00Z', '2026-10-06T08:00:00Z'];
    expect(capRemaining(recent, now, 5, 3_600_000)).toBe(4);
    expect(capRemaining(Array(5).fill('2026-10-06T09:59:00Z'), now, 5, 3_600_000)).toBe(0);
  });
});
