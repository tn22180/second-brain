import { buildIssuePayload, assertProjectFAL, DEFAULT_LINK_TYPE, fetchMyself, ensureAssignee, isDesignSummary, normalizeBatchInput, resolveActiveSprint, moveIssuesToSprint } from './lib/jira.mjs';
import { jiraFetch, jiraEnv } from '../../../scripts/lib/jira.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadTeamRoster, defaultDesignAssignee } from './lib/team.mjs';

const SKILL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const loadEnv = () => jiraEnv(SKILL_ROOT);

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
    // linkDirection: issue MỚI mặc định là inwardIssue (hành vi cũ, giữ nguyên). "outward" đảo lại —
    // cần cho ca Bug (nhánh B) BLOCKS task gốc: link type "Blocks" có outward "blocks" / inward "is
    // blocked by", nên issue mới phải là outwardIssue để mang đúng nghĩa "blocks", không phải "is
    // blocked by" (ngược hoàn toàn ý muốn).
    const linkBody = input.linkDirection === 'outward'
      ? { type: { name: linkType }, outwardIssue: { key }, inwardIssue: { key: input.linkToKey } }
      : { type: { name: linkType }, inwardIssue: { key }, outwardIssue: { key: input.linkToKey } };
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

// Sprint là tuỳ chọn MỨC LÔ (cả batch cùng đích): lấy từ item đầu tiên có nêu.
// `sprintId` (số cụ thể) THẮNG `addToActiveSprint` (để script tự resolve sprint đang chạy).
// Không nêu gì → giữ backlog (mặc định).
const sprintSrc = items.find((it) => it && (it.sprintId || it.addToActiveSprint)) || {};
const sprintOpt = sprintSrc.sprintId
  ? { mode: 'explicit', sprintId: sprintSrc.sprintId }
  : sprintSrc.addToActiveSprint
    ? { mode: 'active' }
    : null;

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
    if (input.linkToKey) {
      const linkType = input.linkType || DEFAULT_LINK_TYPE;
      console.log(input.linkDirection === 'outward'
        ? `(sẽ link: issue mới ${linkType} ${input.linkToKey} [outward] sau khi tạo)`
        : `(sẽ link tới ${input.linkToKey} [${linkType}] sau khi tạo)`);
    }
  });
  if (sprintOpt) {
    console.log(sprintOpt.mode === 'explicit'
      ? `\n(sẽ đưa ${batch ? 'cả lô' : 'issue'} vào sprint ${sprintOpt.sprintId} sau khi tạo)`
      : `\n(sẽ đưa ${batch ? 'cả lô' : 'issue'} vào SPRINT HIỆN TẠI — resolve lúc tạo — sau khi tạo; không có/nhiều sprint active → in WARN, issue vẫn ở backlog)`);
  } else {
    console.log('\n(không đưa vào sprint — issue nằm ở backlog)');
  }
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

// Đưa vào sprint — OPTIONAL, bước riêng SAU khi tạo (giống Linked Issues). Chỉ move issue
// đã tạo THÀNH CÔNG. Lỗi resolve/move KHÔNG rollback issue (issue vẫn tồn tại ở backlog),
// chỉ in WARN để user tự kéo tay.
if (sprintOpt) {
  const createdKeys = results.filter((r) => r.ok).map((r) => r.key);
  if (createdKeys.length === 0) {
    console.error('WARN sprint: không có issue nào tạo thành công để đưa vào sprint');
  } else {
    try {
      let sprintId = sprintOpt.sprintId;
      let sprintLabel = String(sprintId);
      if (sprintOpt.mode === 'active') {
        const sp = await resolveActiveSprint(env);
        sprintId = sp.id;
        sprintLabel = `${sp.id} "${sp.name}"`;
      }
      const mv = await moveIssuesToSprint(env, sprintId, createdKeys);
      if (mv.ok) console.log(`SPRINT: đưa ${mv.moved} issue vào sprint ${sprintLabel} (${createdKeys.join(', ')})`);
      else console.error(`WARN sprint move fail ${mv.error} — issue vẫn ở backlog, kéo tay vào sprint ${sprintLabel}`);
    } catch (e) {
      console.error(`WARN sprint ${String(e.message || e)} — issue đã tạo, giữ ở backlog`);
    }
  }
}

if (failed) process.exit(1);
