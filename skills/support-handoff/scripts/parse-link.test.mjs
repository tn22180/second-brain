import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const run = (arg) => JSON.parse(execFileSync('node', [path.join(DIR, 'parse-link.mjs'), arg], { encoding: 'utf8' }));

test('slack permalink', () => {
  assert.equal(run('https://avada.slack.com/archives/C0ABC/p1699999999123456').type, 'slack');
});
test('jira browse url', () => {
  assert.deepEqual(run('https://space.avada.net/browse/FAL-42'), { type: 'jira', key: 'FAL-42' });
});
test('jira key trần', () => {
  assert.deepEqual(run('FAL-42'), { type: 'jira', key: 'FAL-42' });
});
test('link lạ → unknown', () => {
  assert.equal(run('https://example.com/x').type, 'unknown');
});
