import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DEFAULT_BASE = 'https://space.avada.net';

// .env mặc định nằm TRONG skill (engine root = jira-create/, cạnh scripts/references) — để gói share
// tự chứa token, không phụ thuộc thư mục nơi user gọi Claude. jira.mjs ở <engine>/scripts/lib/jira.mjs
// nên engine root = ../../ so với file này. Resolve qua import.meta.url để portable dù cài personal
// (~/.claude/skills/) hay theo project, chạy từ bất kỳ cwd nào.
const SKILL_ENV = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');

// Thứ tự tìm token: process.env → .env trong skill → .env ở cwd (fallback tương thích ngược).
// Truyền envPath tường minh (dùng trong test) thì chỉ đọc đúng file đó.
export function loadEnv(envPath) {
  let token = process.env.JIRA_TOKEN || '';
  let baseUrl = process.env.JIRA_BASE_URL || '';
  const candidates = envPath ? [envPath] : [SKILL_ENV, '.env'];
  for (const p of candidates) {
    if (token) break;
    try {
      const raw = readFileSync(p, 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        if (m[1] === 'JIRA_TOKEN' && !token) token = m[2].trim();
        if (m[1] === 'JIRA_BASE_URL' && !baseUrl) baseUrl = m[2].trim();
      }
    } catch { /* file không có → thử ứng viên kế tiếp */ }
  }
  if (!token) throw new Error('MISSING_JIRA_TOKEN');
  return { baseUrl: (baseUrl || DEFAULT_BASE).replace(/\/$/, ''), token };
}

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

export async function jiraFetch(path, { method = 'GET', body, env }) {
  const res = await fetch(`${env.baseUrl}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${env.token}`,
      'Accept': 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

// Người tạo hiện tại (dùng làm assignee mặc định khi payload chưa nêu ai) — GET read-only.
export async function fetchMyself(env) {
  const { status, json } = await jiraFetch('/rest/api/2/myself', { env });
  if (status >= 200 && status < 300) return json.name;
  throw new Error('MYSELF_FAILED: ' + status);
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
