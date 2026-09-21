#!/usr/bin/env node
// Post reply vào thread Slack (đứng tên tester — user token).
// Dùng: node post-message.mjs <permalink> --text "nội dung"   (hoặc echo "nội dung" | node post-message.mjs <permalink>)
// CHỈ chạy sau khi tester đã duyệt draft.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSlackToken } from '../../../scripts/lib/env.mjs';
import { parsePermalink, postReply } from '../../../scripts/lib/slack.mjs';

const SKILL_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const [permalink, ...rest] = process.argv.slice(2);
if (!permalink) {
  console.error('Dùng: node post-message.mjs <slack-permalink> --text "nội dung"');
  process.exit(1);
}

const textFlag = rest.indexOf('--text');
let text = textFlag >= 0 ? (rest[textFlag + 1] ?? '') : '';
// Chỉ fallback stdin khi KHÔNG truyền --text — tránh treo chờ stdin khi --text '' từ caller non-TTY
if (textFlag === -1 && !text && !process.stdin.isTTY) {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  text = Buffer.concat(chunks).toString('utf8').trim();
}
if (!text) {
  console.error('Thiếu nội dung: truyền --text "..." hoặc pipe qua stdin.');
  process.exit(1);
}

try {
  const token = loadSlackToken(SKILL_ROOT);
  const { channel, threadTs } = parsePermalink(permalink);
  const res = await postReply(channel, threadTs, text, { token });
  console.log(JSON.stringify({ ok: true, channel: res.channel, ts: res.ts }));
} catch (err) {
  console.error(String(err.message || err)); // post fail → giữ draft, KHÔNG retry mù (agent báo lại tester)
  process.exit(1);
}
