#!/usr/bin/env node
// Đọc toàn bộ thread Slack từ permalink → JSON ra stdout (agent đọc để tóm tắt issue).
// Dùng: node read-thread.mjs <permalink>
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSlackToken } from '../../../scripts/lib/env.mjs';
import { parsePermalink, readThread, makeUserNameResolver } from '../../../scripts/lib/slack.mjs';

const SKILL_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const permalink = process.argv[2];
if (!permalink) {
  console.error('Dùng: node read-thread.mjs <slack-permalink>');
  process.exit(1);
}

try {
  const token = loadSlackToken(SKILL_ROOT);
  const { channel, threadTs } = parsePermalink(permalink);
  const nameOf = makeUserNameResolver({ token });
  const raw = await readThread(channel, threadTs, { token });
  const messages = [];
  for (const m of raw) messages.push({ user: m.user, name: await nameOf(m.user), ts: m.ts, text: m.text });
  console.log(JSON.stringify({ channel, threadTs, messages }, null, 2));
} catch (err) {
  console.error(String(err.message || err));
  process.exit(1);
}
