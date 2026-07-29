// Sync point team SEOOn từ Jira FAL → Firestore project `falcon-manager`.
//
//   node sync.mjs             → dry-run, in bảng điểm, không ghi
//   node sync.mjs --confirm   → ghi thật vào jiraTasks + jiraMembers
//   node sync.mjs --json      → in JSON payload thay vì bảng
//
// Ghi vào collection RIÊNG `jiraTasks` / `jiraMembers`. KHÔNG đụng `members` / `ledger` /
// `records` — đó là hệ chấm điểm cũ nguồn Notion (5.6k + 4.5k doc), đã ngừng sync từ 2026-07-06.
//
// Quy tắc tính point (Tuấn chốt 2026-07-29):
//   1. Chỉ tính issue ở cột Waiting To Test → Done. Bỏ To Do, Doing, Archived.
//   2. Dung TT (tester) tính bằng Tester Point, không phải Dev Point.
//   3. Tuấn (techlead): 100% dev point nếu là dev duy nhất (không kể tester),
//      20% nếu trong task còn dev khác.
import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, jiraFetch } from '/Users/nguyentuan/.claude/skills/jira-create/scripts/lib/jira.mjs';
import { token, PROJECT } from './gauth.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const confirm = process.argv.includes('--confirm');
const asJson = process.argv.includes('--json');

const COUNTED_STATUS = ['Waiting To Test', 'Test Staging', 'Waiting For Review', 'Reviewing',
  'Review Done', 'Waiting To Live', 'Testing Production', 'QA/ QC', 'Done'];
const TESTERS = ['dungtt', 'trangdt', 'tranggt'];
const MEMBERS = {
  truongnn: { name: 'Nguyễn Ngọc Trường', role: 'DEV', basis: 'dev' },
  ducnm01:  { name: 'Nguyễn Minh Đức',    role: 'DEV', basis: 'dev' },
  minhpt:   { name: 'Phạm Tuấn Minh',     role: 'DEV', basis: 'dev' },
  tunglv:   { name: 'Lê Văn Tùng',        role: 'DEV', basis: 'dev' },
  dungtt:   { name: 'Trịnh Thị Dung',     role: 'QC',  basis: 'tester' },
  tuannv:   { name: 'Nguyễn Văn Tuân',    role: 'TL',  basis: 'techlead' },
};

const env = loadEnv();
const jira = async (path) => {
  for (let i = 1; ; i++) {
    try { return await jiraFetch(path, { env }); }
    catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 1500 * i)); }
  }
};

// ---- 1. kéo Jira ------------------------------------------------------------
const FIELDS = 'key,summary,status,issuetype,customfield_11204,customfield_11202,' +
  'customfield_11203,customfield_10101,customfield_10700,created,resolutiondate';
const jql = `project = FAL AND cf[10700] in (${Object.keys(MEMBERS).join(', ')})`;
let start = 0, issues = [];
while (true) {
  const r = await jira(`/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=${FIELDS}&maxResults=100&startAt=${start}`);
  issues.push(...r.json.issues);
  start += r.json.issues.length;
  if (start >= r.json.total || !r.json.issues.length) break;
}
const syncedAt = new Date().toISOString();

// ---- 2. lấy notionUserId từ `members` để join được sang hệ cũ ----------------
const accessToken = await token();
const H = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
const BASE = `https://firestore.googleapis.com/v1/${DOCS}`;
const notionId = {};
{
  let pageToken = '';
  do {
    const r = await fetch(`${BASE}/members?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`, { headers: H });
    const j = await r.json();
    for (const d of j.documents || []) {
      const u = d.fields?.member?.stringValue;
      if (u) notionId[u] = d.name.split('/').pop();
    }
    pageToken = j.nextPageToken || '';
  } while (pageToken);
}

// ---- 3. dựng doc ------------------------------------------------------------
const num = (f) => (f ? Number(f.value) : null);
const sprintIds = (raw) => [...new Set((String(raw || '').match(/id=(\d+)/g) || []).map((s) => Number(s.slice(3))))];

const counted = issues.filter((i) => COUNTED_STATUS.includes(i.fields.status.name));
const agg = Object.fromEntries(Object.keys(MEMBERS).map((u) => [u, { point: 0, done: 0, solo: 0, shared: 0, n: 0 }]));
const taskDocs = [];

for (const i of counted) {
  const f = i.fields;
  const assignees = (f.customfield_10700 || []).map((x) => x.name);
  const dev = num(f.customfield_11204);
  const tester = num(f.customfield_11202);
  const countedFor = [];

  for (const u of assignees.filter((a) => MEMBERS[a])) {
    const basis = MEMBERS[u].basis;
    let credited = 0;
    if (basis === 'tester') {
      credited = tester || 0;
    } else if (basis === 'techlead') {
      const otherDevs = assignees.filter((a) => a !== u && !TESTERS.includes(a));
      credited = otherDevs.length ? (dev || 0) * 0.2 : (dev || 0);
      if (dev) { if (otherDevs.length) agg[u].shared += dev * 0.2; else agg[u].solo += dev; }
    } else {
      credited = dev || 0;
    }
    if (!credited) continue;
    agg[u].point += credited;
    agg[u].n++;
    if (f.status.name === 'Done') agg[u].done += credited;
    countedFor.push(u);
  }

  taskDocs.push({
    key: i.key,
    summary: f.summary,
    status: f.status.name,
    issueType: f.issuetype.name,
    app: f.customfield_11203?.value || null,
    sprints: sprintIds(f.customfield_10101),
    devPoint: dev,
    testerPoint: tester,
    assignees,
    countedFor,
    url: `https://space.avada.net/browse/${i.key}`,
    createdAt: f.created,
    resolvedAt: f.resolutiondate || null,
    source: 'jira',
    syncedAt,
  });
}

const r1 = (n) => Math.round(n * 10) / 10;
const memberDocs = Object.entries(MEMBERS).map(([u, m]) => ({
  member: u,
  notionUserId: notionId[u] || null,
  name: m.name,
  role: m.role,
  pointBasis: m.basis,
  point: r1(agg[u].point),
  donePoint: r1(agg[u].done),
  soloPoint: m.basis === 'techlead' ? r1(agg[u].solo) : null,
  sharedPoint: m.basis === 'techlead' ? r1(agg[u].shared) : null,
  issueCount: agg[u].n,
  countedStatuses: COUNTED_STATUS,
  source: 'jira',
  syncedAt,
}));

writeFileSync(`${HERE}/last-payload.json`, JSON.stringify({ syncedAt, memberDocs, taskDocs }, null, 1));

if (asJson) {
  console.log(JSON.stringify({ syncedAt, memberDocs }, null, 1));
} else {
  console.log(`snapshot ${syncedAt} | Jira ${issues.length} issue | tính point ${taskDocs.length}`);
  for (const m of [...memberDocs].sort((a, b) => b.point - a.point)) {
    console.log(`  ${m.member.padEnd(9)} ${m.role.padEnd(4)} ${String(m.point).padStart(6)} pt  (${m.issueCount} issue, Done ${m.donePoint})`);
  }
}
if (!confirm) { console.log('\nDRY-RUN — thêm --confirm để ghi Firestore.'); process.exit(0); }

// ---- 4. ghi Firestore -------------------------------------------------------
// Document name phải là resource path thuần; kèm host thì Firestore trả 400
// 'lacks "projects" at index 0'.
const toValue = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  return { stringValue: String(v) };
};
const toFields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue(v)]));

async function commit(writes) {
  const r = await fetch(`https://firestore.googleapis.com/v1/${DOCS.replace('/documents', '')}/documents:commit`, {
    method: 'POST', headers: H, body: JSON.stringify({ writes }),
  });
  if (!r.ok) throw new Error(`COMMIT_FAIL ${r.status} ${(await r.text()).slice(0, 300)}`);
  return (await r.json()).writeResults?.length || 0;
}

const writes = [
  ...taskDocs.map((d) => ({ update: { name: `${DOCS}/jiraTasks/${d.key}`, fields: toFields(d) } })),
  ...memberDocs.map((d) => ({ update: { name: `${DOCS}/jiraMembers/${d.member}`, fields: toFields(d) } })),
];
let written = 0;
for (let i = 0; i < writes.length; i += 200) written += await commit(writes.slice(i, i + 200));
console.log(`GHI XONG ${written} doc vào ${PROJECT}`);

// Doc cũ không còn trong tập tính point thì KHÔNG bị xoá (dùng `update`, không phải replace
// cả collection). Muốn dọn thì so `jiraTasks` với taskDocs rồi xoá tay — cố ý không tự động.
