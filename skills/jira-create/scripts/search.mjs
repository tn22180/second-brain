import { loadEnv, jiraFetch } from './lib/jira.mjs';

// Dùng: node scripts/search.mjs "<JQL>" ["<maxResults>"] ["<fields, phẩy-ngăn>"]
const jql = process.argv[2];
if (!jql) { console.error('MISSING_JQL — cần truyền JQL làm tham số'); process.exit(1); }
const maxResults = process.argv[3] || '50';
const fields = process.argv[4] || 'key,summary'; // giữ nguyên mặc định cũ — lùi tương thích

const env = loadEnv();
const { status, json } = await jiraFetch(
  `/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=${encodeURIComponent(fields)}&maxResults=${encodeURIComponent(maxResults)}`,
  { env }
);
if (status !== 200) { console.error(`ERROR ${status} ${JSON.stringify(json)}`); process.exit(1); }
const issues = json.issues || [];
console.log(`FOUND ${issues.length}`);
for (const i of issues) {
  const extra = fields.split(',').filter(f => f !== 'key' && f !== 'summary')
    .map(f => `${f}=${JSON.stringify(i.fields[f] ?? null)}`).join(' ');
  console.log(`${i.key}\t${i.fields.summary}${extra ? '\t' + extra : ''}`);
}
