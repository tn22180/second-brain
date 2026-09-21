// scripts/read-thread.mjs — đọc thread Slack, gom message + moi Jira key.
import { pathToFileURL } from 'node:url';
import { readThread } from './lib/slack.mjs';

export function scanJiraKeys(text) {
  const s = String(text || '');
  // Link /browse/ là nguồn tin cậy → nhận key mọi project. Key trần dễ nhầm (vd "UTF-8")
  // nên chỉ nhận đúng prefix project FAL (project Jira duy nhất của team Falcon).
  const fromUrl = [...s.matchAll(/\/browse\/([A-Z]{2,}-\d+)/g)].map((m) => m[1]);
  const bare = s.match(/\bFAL-\d+\b/g) || [];
  return [...new Set([...fromUrl, ...bare])];
}

// Chạy trực tiếp (không phải import) → thực thi CLI.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [channel, threadTs] = process.argv.slice(2);
    if (!channel || !threadTs) { console.error('USAGE: read-thread.mjs <channel> <threadTs>'); process.exit(1); }
    const messages = await readThread(channel, threadTs);
    const jiraKeys = scanJiraKeys(messages.map((m) => m.text).join('\n'));
    console.log(JSON.stringify({ messages, jiraKeys }, null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
