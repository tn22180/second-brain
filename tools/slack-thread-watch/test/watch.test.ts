import {describe, expect, it} from 'bun:test';
import {isNewThread, messageText, parseProdAlert, permalink, resolveApp, worktreeName} from '../src/watch';

describe('resolveApp', () => {
  it('reads the CS post App: line', () => {
    expect(resolveApp('App: SEO Suite\nApp plan: pro_22', null)).toBe('seo');
    expect(resolveApp('App: SEO On AEO\nShop URL: x', null)).toBe('llm-ai-search-seo');
    expect(resolveApp('App: SEO On AI Product Copy', null)).toBe('ai-product-copy');
    expect(resolveApp('App: Avada Speed Optimization', null)).toBe('avada-image-optimizer');
    expect(resolveApp('App: Avada Product Feed\nShop URL: x', null)).toBe('product-feed');
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
});

describe('parseProdAlert', () => {
  const post = (head: string, body: string) => ({
    ts: '1',
    blocks: [{type: 'section', text: {text: head}}, {type: 'section', text: {text: body}}],
  });
  it('maps the tag to a repo and flags infra', () => {
    const a = parseProdAlert(post(':red_circle: *[BLOG] api*  ·  `ERROR`  ·  _app error_', '```[fetchHtmlContent] null```'));
    expect(a).toMatchObject({app: 'blogs', infra: false});
    const i = parseProdAlert(post(':warning: *[SEO] handlehooksubscribergen2*  ·  `ERROR`  ·  _infra self-heal_', '```Memory limit```'));
    expect(i).toMatchObject({app: 'seo', infra: true});
  });
  it('repeats with different ids collapse to one fingerprint', () => {
    const h = ':red_circle: *[BLOG] api*  ·  `ERROR`  ·  _app error_';
    const a = parseProdAlert(post(h, '```[getShopifyArticleById] MSei5vNXF3VnxCgRox4a <gid://shopify/Article/123|x>```'));
    const b = parseProdAlert(post(h, '```[getShopifyArticleById] NpoetcYEb3KPw0msyMDH <gid://shopify/Article/456|y>```'));
    expect(a!.fingerprint).toBe(b!.fingerprint);
  });
  it('null for a post that is not an alert', () => {
    expect(parseProdAlert({ts: '1', text: 'hello'})).toBeNull();
  });
});
