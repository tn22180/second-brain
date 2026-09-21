// scripts/parse-link.mjs — phân loại link dev dán: Slack permalink | Jira | unknown.
import { parsePermalink } from './lib/slack.mjs';

const raw = (process.argv[2] || '').trim();
if (!raw) { console.error('USAGE: parse-link.mjs <slack-permalink | jira-url | FAL-xxx>'); process.exit(1); }

// parsePermalink NÉM khi host không phải *.slack.com (channel ID từ link sẽ được dùng để
// đọc/post — link ngoài phải chặn, không được lặng lẽ rơi xuống 'unknown').
let slack = null;
if (raw.includes('slack.com/archives/')) {
  try { slack = parsePermalink(raw); }
  catch (e) { console.error(e.message); process.exit(1); }
}
const keyM = raw.match(/^([A-Z]{2,}-\d+)$/);
const jiraUrlM = raw.match(/\/browse\/([A-Z]{2,}-\d+)/);

let out;
if (slack) out = { type: 'slack', ...slack };
else if (keyM) out = { type: 'jira', key: keyM[1] };
else if (jiraUrlM) out = { type: 'jira', key: jiraUrlM[1] };
else out = { type: 'unknown', raw };

console.log(JSON.stringify(out));
