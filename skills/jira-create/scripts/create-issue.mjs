import { loadEnv, buildIssuePayload, assertProjectFAL, jiraFetch, DEFAULT_LINK_TYPE, fetchMyself, ensureAssignee, isDesignSummary, normalizeBatchInput } from './lib/jira.mjs';
import { loadTeamRoster, defaultDesignAssignee } from './lib/team.mjs';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
  });
}

const confirm = process.argv.includes('--confirm');
const raw = await readStdin();
let parsed;
try { parsed = JSON.parse(raw); }
catch { console.error('INVALID_JSON — payload gửi vào không phải JSON hợp lệ'); process.exit(1); }

// Batch: 1 object đơn, mảng, hoặc {issues:[...], ...common} → luôn quy về mảng issue (xem normalizeBatchInput).
let items;
try { items = normalizeBatchInput(parsed); }
catch (e) { console.error(String(e.message || e)); process.exit(1); }

// Người tạo lấy 1 LẦN, cache dùng chung cho cả batch (tránh N lần GET /myself). Lazy: chỉ gọi khi có
// issue thật sự cần fallback về người tạo (issue [DESIGN] resolve được designer thì không cần network).
let cachedMyself;
async function getMyself() {
  if (cachedMyself === undefined) cachedMyself = await fetchMyself(loadEnv());
  return cachedMyself;
}

// Dựng payload + gán assignee mặc định cho 1 issue. Tách hàm để chạy đồng nhất cho mọi phần tử batch.
async function prepareOne(input) {
  const payload = buildIssuePayload(input);
  // _forceProjectKey: CHỈ dùng trong test để ép project khác nhằm kiểm guard — không dùng ở luồng thật.
  if (input._forceProjectKey) payload.fields.project = { key: input._forceProjectKey };
  assertProjectFAL(payload.fields);

  // Assignee bắt buộc — không nêu → mặc định người tạo (GET /myself, cache). Ngoại lệ: naming Solar tag
  // `[DESIGN]` + roster có ĐÚNG 1 designer → giao designer đó (không cần network). Cả 2 nhánh bị user
  // override (nêu assignee/assignees → payload đã có customfield_10700).
  const hasAssignee = Array.isArray(payload.fields.customfield_10700) && payload.fields.customfield_10700.length > 0;
  if (!hasAssignee) {
    let defaultUser = null;
    if (isDesignSummary(payload.fields.summary)) {
      try { defaultUser = defaultDesignAssignee(loadTeamRoster()); }
      catch { /* roster lỗi → fallback người tạo bên dưới */ }
    }
    if (!defaultUser) defaultUser = await getMyself();
    ensureAssignee(payload.fields, defaultUser);
  }
  return payload;
}

// Tạo issue thật + link (nếu có). Trả kết quả để tổng hợp cuối batch.
async function createOne(input, payload, env) {
  const { status, json } = await jiraFetch('/rest/api/2/issue', { method: 'POST', body: payload, env });
  if (!(status >= 200 && status < 300)) {
    return { ok: false, error: `ERROR ${status} ${JSON.stringify(json)}` };
  }
  const key = json.key;
  const result = { ok: true, key };
  // Link Issues — OPTIONAL, bước riêng SAU khi tạo issue. issuelinks read-only lúc create (Jira Server
  // REST v2 từ chối 400 nếu nhét vào payload create), nên POST riêng qua /issueLink sau khi issue tồn tại.
  if (input.linkToKey) {
    const linkType = input.linkType || DEFAULT_LINK_TYPE;
    const linkBody = { type: { name: linkType }, inwardIssue: { key }, outwardIssue: { key: input.linkToKey } };
    const linkRes = await jiraFetch('/rest/api/2/issueLink', { method: 'POST', body: linkBody, env });
    if (linkRes.status >= 200 && linkRes.status < 300) {
      result.linked = { to: input.linkToKey, type: linkType };
    } else {
      result.linkWarn = `${linkRes.status} ${JSON.stringify(linkRes.json)}`;
    }
  }
  return result;
}

const batch = items.length > 1;

// Chuẩn bị payload cho mọi issue trước (assignee mặc định hiện ở dry-run để user duyệt).
const prepared = [];
for (let i = 0; i < items.length; i++) {
  try { prepared.push({ input: items[i], payload: await prepareOne(items[i]) }); }
  catch (e) { console.error(`ITEM ${i + 1} lỗi dựng payload: ${String(e.message || e)}`); process.exit(1); }
}

if (!confirm) {
  console.log(batch
    ? `DRY-RUN — ${prepared.length} issue sẽ POST (thêm --confirm để tạo thật):`
    : 'DRY-RUN — payload sẽ POST (thêm --confirm để tạo thật):');
  prepared.forEach(({ input, payload }, i) => {
    if (batch) console.log(`\n--- issue ${i + 1}/${prepared.length} ---`);
    console.log(JSON.stringify(payload, null, 2));
    if (input.linkToKey) console.log(`(sẽ link tới ${input.linkToKey}${input.linkType ? ` [${input.linkType}]` : ` [${DEFAULT_LINK_TYPE}]`} sau khi tạo)`);
  });
  process.exit(0);
}

const env = loadEnv();
const results = [];
for (const { input, payload } of prepared) {
  results.push({ input, ...(await createOne(input, payload, env)) });
}

let failed = 0;
for (const r of results) {
  if (r.ok) {
    console.log(`CREATED ${r.key}`);
    if (r.linked) console.log(`LINKED ${r.key} -[${r.linked.type}]-> ${r.linked.to}`);
    if (r.linkWarn) console.error(`WARN link fail ${r.linkWarn}`);
  } else {
    failed++;
    console.error(r.error);
  }
}
if (batch) {
  console.log(`\nBATCH: ${results.length - failed}/${results.length} tạo thành công${failed ? `, ${failed} lỗi` : ''}`);
}
if (failed) process.exit(1);
