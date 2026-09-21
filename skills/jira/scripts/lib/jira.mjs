// HTTP/env dùng chung đã chuyển sang lõi chung (scripts/lib/jira.mjs, Task 1). File này chỉ còn
// giữ hành vi RIÊNG của skill jira: dựng payload issue, chuẩn hoá batch, và các hàm sprint/myself
// (vẫn cần jiraFetch nên import lại từ lõi chung).
import { jiraFetch } from '../../../../scripts/lib/jira.mjs';

export function assertProjectFAL(fields) {
  const p = fields?.project || {};
  if (p.key !== 'FAL' && p.id !== '10800') {
    throw new Error('PROJECT_NOT_FAL: chỉ được tạo issue trong project FAL');
  }
}

const DUE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Issue Link Type mặc định cho Linked Issues (Bug↔Task, nhánh Tester).
// Xác nhận qua GET /rest/api/2/issueLinkType (read-only, probe 2026-07-10): instance FAL có "Relates"
// (outward "relates to") — dùng đúng như Jira mặc định. Có type tuỳ chỉnh "Problem/Incident"
// (outward "causes" / inward "is caused by") nhưng ngữ nghĩa lệch hướng cho ca "bug phát hiện khi test
// task" (task không "gây ra" task theo nghĩa causal chuẩn) và code hiện chỉ hỗ trợ outwardIssue — giữ
// "Relates" cho rõ ràng, trung tính.
export const DEFAULT_LINK_TYPE = 'Relates';

// Naming Solar: tag ROLE nằm ở cặp `[]` ĐẦU của summary (`[<ROLE>][<App>] <mô tả>`). Task tag
// `[DESIGN]` mặc định giao designer chung team Falcon (roster.designer) thay vì người tạo — detect ở
// đây để enforce tầng script (create-issue.mjs), không phụ thuộc agent có nhớ set assignee hay không.
export function isDesignSummary(summary) {
  return /^\s*\[\s*DESIGN\s*\]/i.test(summary || '');
}

export function buildIssuePayload(input) {
  const {
    issuetypeId, summary, app, assignee, assignees, parentKey,
    description, priorityName, devPoint, testerPoint, dueDate,
  } = input;
  if (!issuetypeId) throw new Error('MISSING_ISSUETYPE');
  if (!summary) throw new Error('MISSING_SUMMARY');
  const fields = {
    project: { key: 'FAL' },
    issuetype: { id: String(issuetypeId) },
    summary,
  };
  if (app) fields.customfield_11203 = { value: app };
  // Assignees (cf10700, array[user]) — Tech Lead gán nhiều người; assignees (mảng) thắng nếu có,
  // không thì fallback assignee đơn (giữ nguyên hành vi PO/BA).
  if (Array.isArray(assignees) && assignees.length) {
    fields.customfield_10700 = assignees.map((name) => ({ name }));
  } else if (assignee) {
    fields.customfield_10700 = [{ name: assignee }];
  }
  if (parentKey) fields.parent = { key: parentKey };
  if (description) fields.description = description;
  if (priorityName) fields.priority = { name: priorityName };
  // Dev Point / Tester Point: field select-list Fibonacci (cùng dạng {value} với Falcon App).
  // Xác nhận qua createmeta 2026-07-10: schema.type = "option" — {value: "<số>"} đúng.
  if (devPoint !== undefined && devPoint !== null && devPoint !== '') {
    fields.customfield_11204 = { value: String(devPoint) };
  }
  if (testerPoint !== undefined && testerPoint !== null && testerPoint !== '') {
    fields.customfield_11202 = { value: String(testerPoint) };
  }
  // Due Date: field hệ thống chuẩn Jira — dùng làm "estimate" khía cạnh deadline/mốc hoàn thành.
  if (dueDate) {
    if (!DUE_DATE_RE.test(dueDate)) throw new Error('INVALID_DUE_DATE_FORMAT: cần YYYY-MM-DD');
    fields.duedate = dueDate;
  }
  assertProjectFAL(fields);
  return { fields };
}

// Chuẩn hoá input stdin thành MẢNG issue để tạo loạt (batch). 3 dạng chấp nhận:
//   1. Object đơn `{...}` → `[obj]` (tương thích ngược, 1 issue).
//   2. Mảng `[{...}, {...}]` → dùng nguyên, mỗi phần tử 1 issue độc lập.
//   3. Object batch `{ issues: [...], ...common }` → mọi key NGOÀI `issues` là field dùng chung, merge
//      vào từng issue (field riêng của issue THẮNG khi trùng). Tiện ca Tester: 1 file test nhiều bug cùng
//      `issuetypeId`/`app`/`linkToKey`, chỉ khác `summary` — khai báo chung 1 lần.
// Pure function, dễ unit test độc lập network.
export function normalizeBatchInput(input) {
  if (Array.isArray(input)) {
    if (input.length === 0) throw new Error('EMPTY_BATCH: mảng issues rỗng');
    return input;
  }
  if (input && typeof input === 'object' && Array.isArray(input.issues)) {
    if (input.issues.length === 0) throw new Error('EMPTY_BATCH: issues rỗng');
    const { issues, ...common } = input;
    return issues.map((it) => ({ ...common, ...it }));
  }
  return [input];
}

// Người tạo hiện tại (dùng làm assignee mặc định khi payload chưa nêu ai) — GET read-only.
export async function fetchMyself(env) {
  const { status, json } = await jiraFetch('/rest/api/2/myself', { env });
  if (status >= 200 && status < 300) return json.name;
  throw new Error('MYSELF_FAILED: ' + status);
}

// ── Sprint (Jira Agile / greenhopper) ────────────────────────────────────────
// Issue mới tạo mặc định rơi vào BACKLOG. Muốn đưa vào sprint đang chạy → POST riêng
// qua Agile API SAU khi issue tồn tại (giống Linked Issues). Backlog = không làm gì.

// Chọn DUY NHẤT 1 sprint active từ danh sách đã gom (pure — tách khỏi network để test).
// Falcon hiện chạy 1 sprint chung cả project (mọi board cùng 1 sprint), nên gom active
// sprint mọi board rồi dedup theo id: đúng 1 → dùng; 0 → chưa mở sprint; >1 → mơ hồ,
// buộc caller nêu sprintId tường minh (không tự đoán).
export function pickSingleActiveSprint(sprints) {
  const byId = new Map();
  for (const s of sprints || []) {
    if (s && s.id != null) byId.set(s.id, s);
  }
  const uniq = [...byId.values()];
  if (uniq.length === 0) throw new Error('NO_ACTIVE_SPRINT: không có sprint nào đang chạy — issue sẽ nằm ở backlog');
  if (uniq.length > 1) {
    const list = uniq.map((s) => `${s.id}:${s.name}`).join(', ');
    throw new Error(`MULTIPLE_ACTIVE_SPRINTS: có ${uniq.length} sprint active (${list}) — truyền sprintId tường minh`);
  }
  return uniq[0];
}

// Gom active sprint của MỌI board scrum trong project FAL (read-only). Trả mảng
// { id, name, boardId }. Board kanban không có sprint → bỏ qua (Agile API trả 400/lỗi).
export async function collectActiveSprints(env) {
  const boardsRes = await jiraFetch('/rest/agile/1.0/board?projectKeyOrId=FAL&maxResults=50', { env });
  if (!(boardsRes.status >= 200 && boardsRes.status < 300)) {
    throw new Error(`BOARDS_FAILED: ${boardsRes.status} ${JSON.stringify(boardsRes.json)}`);
  }
  const boards = (boardsRes.json.values || []).filter((b) => b.type === 'scrum');
  const out = [];
  for (const b of boards) {
    const s = await jiraFetch(`/rest/agile/1.0/board/${b.id}/sprint?state=active&maxResults=50`, { env });
    if (!(s.status >= 200 && s.status < 300)) continue; // board không hỗ trợ sprint → bỏ
    for (const sp of s.json.values || []) out.push({ id: sp.id, name: sp.name, boardId: b.id });
  }
  return out;
}

// Resolve sprint đang chạy DUY NHẤT của FAL (gom + dedup + chọn). Throw nếu 0 hoặc >1.
export async function resolveActiveSprint(env) {
  return pickSingleActiveSprint(await collectActiveSprints(env));
}

// Đưa danh sách issue key vào 1 sprint (Agile API nhận cả lô 1 call). Trả {ok, error}.
export async function moveIssuesToSprint(env, sprintId, keys) {
  if (!sprintId) throw new Error('MISSING_SPRINT_ID');
  if (!Array.isArray(keys) || keys.length === 0) return { ok: true, moved: 0 };
  const res = await jiraFetch(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
    method: 'POST', body: { issues: keys }, env,
  });
  if (res.status >= 200 && res.status < 300) return { ok: true, moved: keys.length };
  return { ok: false, error: `${res.status} ${JSON.stringify(res.json)}` };
}

// Assignee bắt buộc cho MỌI issue (yêu cầu 2+3) — nếu payload chưa có customfield_10700
// (Assignees, mảng) thì set mặc định = người tạo. Pure function, không side-effect ngoài
// fields được truyền vào, để dễ unit test độc lập với network.
export function ensureAssignee(fields, defaultUsername) {
  if (!Array.isArray(fields.customfield_10700) || fields.customfield_10700.length === 0) {
    fields.customfield_10700 = [{ name: defaultUsername }];
  }
  return fields;
}
