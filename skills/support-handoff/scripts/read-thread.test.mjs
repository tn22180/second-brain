import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanJiraKeys } from './read-thread.mjs';

test('scanJiraKeys: lấy từ browse link + key trần, dedup', () => {
  const text = 'Bug đây https://space.avada.net/browse/FAL-42 xem thêm FAL-42 và FAL-7';
  assert.deepEqual(scanJiraKeys(text), ['FAL-42', 'FAL-7']);
});

test('scanJiraKeys: bỏ chuỗi không phải key (UTF-8)', () => {
  assert.deepEqual(scanJiraKeys('encoding UTF-8 only'), []);
});

test('scanJiraKeys: rỗng', () => {
  assert.deepEqual(scanJiraKeys(''), []);
});
