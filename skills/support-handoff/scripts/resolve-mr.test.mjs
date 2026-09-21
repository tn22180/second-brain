import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, 'resolve-mr.mjs');

test('stdin rỗng/hỏng → {found:false, reason:no_input}, không throw', () => {
  const out = execFileSync('node', [SCRIPT], { input: '', encoding: 'utf8' });
  assert.deepEqual(JSON.parse(out.trim()), { found: false, reason: 'no_input' });
});

test('stdin có field mergeRequestRaw hợp lệ → found:true', () => {
  const input = JSON.stringify({
    mergeRequestRaw: 'https://gitlab.com/avada/falcon/-/merge_requests/123',
    description: '',
  });
  const out = execFileSync('node', [SCRIPT], { input, encoding: 'utf8' });
  const result = JSON.parse(out.trim());
  assert.equal(result.found, true);
  assert.equal(result.mrIid, '123');
  assert.equal(result.reason, 'field');
});
