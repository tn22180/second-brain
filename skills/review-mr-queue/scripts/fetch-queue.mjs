// scripts/fetch-queue.mjs
import { JIRA_BASE, getJiraToken, getFieldId } from './lib/config.mjs';

const STATUS_NAME = 'Waiting For Review';
const mrField = getFieldId('mergeRequest');
// Team Speed gán việc qua field "Assignees" (cf 10700, multi-user), KHÔNG dùng assignee chuẩn
// (task đẩy sang review thường để assignee trống). Nên bắt cả 2: assignee chuẩn HOẶC có mặt trong Assignees.
const assigneesField = getFieldId('assignees'); // customfield_10700
const cfNum = assigneesField.replace('customfield_', '');
const jql = `status = "${STATUS_NAME}" AND (assignee = currentUser() OR cf[${cfNum}] = currentUser()) ORDER BY updated DESC`;

const url = new URL(`${JIRA_BASE}/rest/api/2/search`);
url.searchParams.set('jql', jql);
url.searchParams.set('maxResults', '50');
url.searchParams.set('fields', `summary,status,description,${mrField}`);

const res = await fetch(url, { headers: { Authorization: `Bearer ${getJiraToken()}` } });
if (!res.ok) { console.error(`JIRA_ERROR ${res.status}: ${await res.text()}`); process.exit(1); }
const data = await res.json();

const out = (data.issues || []).map(i => ({
  key: i.key,
  summary: i.fields.summary,
  status: i.fields.status?.name,
  mergeRequestRaw: i.fields[mrField] ?? null,
  description: i.fields.description ?? '',
}));
if (data.total > out.length) {
  console.error(`⚠️ Có ${data.total} task nhưng chỉ lấy ${out.length}; tăng maxResults.`);
}
console.log(JSON.stringify(out, null, 2));
