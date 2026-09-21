import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePermalink } from './slack.mjs';

test('parsePermalink: link message gốc', () => {
  const r = parsePermalink('https://avada.slack.com/archives/C0ABC123/p1699999999123456');
  assert.deepEqual(r, { channel: 'C0ABC123', ts: '1699999999.123456', threadTs: '1699999999.123456' });
});

test('parsePermalink: link reply trong thread dùng thread_ts', () => {
  const r = parsePermalink('https://avada.slack.com/archives/C0ABC123/p1700000000222222?thread_ts=1699999999.123456&cid=C0ABC123');
  assert.equal(r.channel, 'C0ABC123');
  assert.equal(r.ts, '1700000000.222222');
  assert.equal(r.threadTs, '1699999999.123456');
});

// Đổi hành vi có chủ ý (gộp lib chung): trước đây trả null — sai link thì lặng lẽ đi tiếp.
// Nay NÉM, vì channel ID lấy từ link sẽ được dùng để đọc và post.
test('parsePermalink: không phải link Slack → ném BAD_PERMALINK', () => {
  assert.throws(() => parsePermalink('https://space.avada.net/browse/FAL-12'), /BAD_PERMALINK/);
});

test('parsePermalink: host ngoài giả dạng path Slack → ném BAD_PERMALINK', () => {
  assert.throws(() => parsePermalink('https://evil.com/archives/C0ABC123/p1699999999123456'), /BAD_PERMALINK/);
  assert.throws(() => parsePermalink('https://avada.slack.com.evil.com/archives/C0ABC123/p1699999999123456'), /BAD_PERMALINK/);
});
