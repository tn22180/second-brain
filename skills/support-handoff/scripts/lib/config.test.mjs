import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnvFile } from './config.mjs';

test('parseEnvFile đọc key=value, bỏ qua dòng rác', () => {
  const f = path.join(os.tmpdir(), `sh-env-${process.pid}.env`);
  fs.writeFileSync(f, 'SLACK_TOKEN=xoxp-abc\n# comment\nJIRA_TOKEN = tok123 \nrác\n');
  const env = parseEnvFile(f);
  assert.equal(env.SLACK_TOKEN, 'xoxp-abc');
  assert.equal(env.JIRA_TOKEN, 'tok123');
  fs.unlinkSync(f);
});

test('parseEnvFile file không tồn tại → {}', () => {
  assert.deepEqual(parseEnvFile('/khong/co/that.env'), {});
});

test('parseEnvFile bỏ dấu ngoặc kép/đơn bao quanh giá trị', () => {
  const f = path.join(os.tmpdir(), `sh-env-quote-${process.pid}.env`);
  fs.writeFileSync(f, 'SLACK_TOKEN="xoxp-abc"\nJIRA_TOKEN=\'tok123\'\n');
  const env = parseEnvFile(f);
  assert.equal(env.SLACK_TOKEN, 'xoxp-abc');
  assert.equal(env.JIRA_TOKEN, 'tok123');
  fs.unlinkSync(f);
});
