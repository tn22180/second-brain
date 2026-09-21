// Verb GHI — xếp tầng T1/T2/T3 rồi mới chạy. Enforce ở ĐÂY, không phải ở reference:
// có tiền lệ ensureAssignee phải nằm trong script vì agent quên set.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
  jiraFetch, parseKeys, FIELDS, isMine, classifyTier, gate,
  pickTransition, formatTransitionHelp, assertFalKey,
} from '../../../../scripts/lib/jira.mjs';
import { fetchMyself, resolveActiveSprint, moveIssuesToSprint, DEFAULT_LINK_TYPE } from './jira.mjs';

const DUE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Tên người-đọc-được → field id thật. Agent KHÔNG tự nhớ id — đó là nguồn lỗi 400 mù. */
export function buildUpdateFields(input) {
  const fields = {};
  const names = [];
  for (const [k, v] of Object.entries(input || {})) {
    if (v === undefined || v === null || v === '') continue;
    switch (k) {
      case 'summary': fields.summary = String(v); break;
      case 'description': fields.description = String(v); break;
      case 'app': fields[FIELDS.falconApp] = { value: String(v) }; break;
      case 'priority': fields.priority = { name: String(v) }; break;
      case 'devPoint': fields[FIELDS.devPoint] = { value: String(v) }; break;
      case 'testerPoint': fields[FIELDS.testerPoint] = { value: String(v) }; break;
      case 'dueDate':
        if (!DUE_DATE_RE.test(String(v))) throw new Error('INVALID_DUE_DATE_FORMAT: cần YYYY-MM-DD');
        fields.duedate = String(v);
        break;
      case 'assignees':
        fields[FIELDS.assignees] = (Array.isArray(v) ? v : [v]).map((n) => ({ name: String(n) }));
        break;
      default:
        throw new Error(`UNKNOWN_FIELD "${k}" — field hỗ trợ: summary, description, app, priority, devPoint, testerPoint, dueDate, assignees. Field khác dùng verb raw.`);
    }
    names.push(k);
  }
  if (!names.length) throw new Error('EMPTY_UPDATE: không có field nào để sửa');
  return { fields, names };
}

/** Đọc stdin. Guard `isTTY`: chạy tay trong terminal mà QUÊN redirect/pipe stdin thì stdin vẫn mở
 * chờ input tương tác — không có guard này Promise không bao giờ resolve, verb treo vô hạn không
 * lỗi, không thoát. Terminal tương tác (`isTTY`) coi như "không có gì được truyền" → resolve rỗng
 * ngay, để lỗi rõ ràng (EMPTY_COMMENT/INVALID_JSON…) nổi lên thay vì treo im lặng. */
function readStdin() {
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
  });
}

let cachedMe;
async function me(env) {
  if (cachedMe === undefined) cachedMe = await fetchMyself(env);
  return cachedMe;
}

/** Đọc issue để biết "của mình hay của người khác" — quyền suy từ data Jira, không từ state phiên. */
async function ownership(keys, env) {
  const who = await me(env);
  const out = new Map();
  for (const key of keys) {
    const { status, json } = await jiraFetch(
      `/rest/api/2/issue/${key}?fields=summary,status,reporter,${FIELDS.assignees}`, { env }
    );
    if (status !== 200) throw new Error(`GET_FAILED ${key} ${status} ${JSON.stringify(json)}`);
    out.set(key, { mine: isMine(json.fields, who), fields: json.fields });
  }
  return out;
}

/** Xếp tầng cho CẢ LÔ = tầng NGHIÊM NHẤT trong lô. Một issue của người khác thì cả lô phải duyệt.
 * Export để test thuần (input là Map key → {mine, fields}, không cần mạng) — đây là bất biến
 * an toàn quan trọng nhất của skill, phải có test canh giữ. */
export function tierOfBatch(verb, own, updateFields) {
  const order = ['T0', 'T1', 'T2', 'T3'];
  let worst = 'T0';
  for (const { mine } of own.values()) {
    const t = classifyTier(verb, { mine, updateFields });
    if (order.indexOf(t) > order.indexOf(worst)) worst = t;
  }
  return worst;
}

/** In draft rồi dừng khi tầng chưa được phép. Trả true nếu ĐƯỢC chạy tiếp.
 * Export để test thuần — chặn mà im lặng (không in draft) là lỗi, phải có test canh giữ. */
export function passGate(tier, opts, draftLines) {
  const g = gate(tier, opts);
  if (g.allowed) return true;
  console.log(`DRAFT [${tier}]`);
  for (const l of draftLines) console.log('  ' + l);
  console.log(`\n${g.reason}`);
  return false;
}

/** Ép chỉ 1 issue key — dùng cho verb KHÔNG hỗ trợ batch (attach, link). `parseKeys` trả về mảng
 * đầy đủ (dùng cho các verb ghi theo lô); trước đây attach/link destructure `const [key] = parseKeys(...)`
 * — bug: nhiều key phẩy-ngăn vẫn "chạy được", chỉ phần tử ĐẦU được dùng, phần còn lại bị bỏ KHÔNG báo
 * lỗi (vd `attach FAL-279,FAL-280 ./x.png` chỉ đính FAL-279, FAL-280 im lặng mất). Ném rõ thay vì lặng lẽ
 * cắt bớt. `label` mô tả chỗ gọi (vd "attach", "link (key nguồn)") để thông báo rõ ai đang kêu ca.
 * Export để test thuần — không cần mạng. */
export function singleKey(arg, label) {
  const keys = parseKeys(arg);
  if (keys.length > 1) {
    throw new Error(
      `MULTI_KEY_UNSUPPORTED: ${label} chỉ nhận 1 issue key, nhận được ${keys.length} (${keys.join(', ')}). Chạy từng issue một.`
    );
  }
  return keys[0];
}

/** Tổng kết lô dùng chung cho verb theo lô — ghi (transition/update/assign/comment/delete) và
 * đọc (transitions, xem verbs-read.mjs) — chỉ in khi lô > 1 key, và set exitCode=2 nếu có key
 * lỗi. Đừng chép lặp định dạng "BATCH: x/N" ra từng verb. Export để verbs-read.mjs dùng chung. */
export function reportBatch(count, failed) {
  if (count > 1) console.log(`\nBATCH: ${count - failed}/${count} thành công${failed ? `, ${failed} lỗi` : ''}`);
  if (failed) process.exitCode = 2;
}

// ── transition ───────────────────────────────────────────────────────────────
async function verbTransition(args, { env, opts }) {
  const keys = parseKeys(args[0]);
  const target = args[1];
  if (!target) throw new Error('MISSING_TARGET: node jira.mjs transition FAL-279 Done');

  const own = await ownership(keys, env);
  const plan = [];
  for (const key of keys) {
    const { status, json } = await jiraFetch(`/rest/api/2/issue/${key}/transitions`, { env });
    if (status !== 200) throw new Error(`TRANSITIONS_FAILED ${key} ${status}`);
    const list = json.transitions || [];
    const match = pickTransition(list, target);
    if (!match) throw new Error(`INVALID_TRANSITION ${key}: ${formatTransitionHelp(list, target)}`);
    plan.push({ key, id: match.id, to: match.to?.name ?? match.name });
  }

  const tier = tierOfBatch('transition', own);
  if (!passGate(tier, opts, plan.map((p) => `${p.key}: ${own.get(p.key).fields.status?.name} → ${p.to}`))) return;

  let failed = 0;
  for (const p of plan) {
    const { status, json } = await jiraFetch(`/rest/api/2/issue/${p.key}/transitions`, {
      method: 'POST', body: { transition: { id: p.id } }, env,
    });
    if (status >= 200 && status < 300) console.log(`MOVED ${p.key} → ${p.to}`);
    else { failed++; console.error(`FAIL ${p.key} ${status} ${JSON.stringify(json)}`); }
  }
  reportBatch(plan.length, failed);
}

// ── update ───────────────────────────────────────────────────────────────────
async function verbUpdate(args, { env, opts }) {
  const keys = parseKeys(args[0]);
  const raw = await readStdin();
  let input;
  try { input = JSON.parse(raw); }
  catch { throw new Error('INVALID_JSON: stdin không phải JSON hợp lệ'); }

  const { fields, names } = buildUpdateFields(input);
  const own = await ownership(keys, env);
  const tier = tierOfBatch('update', own, names);
  const draft = keys.map((k) => `${k} (${own.get(k).fields.summary}): đặt ${names.join(', ')}`);
  draft.push(`sau: ${JSON.stringify(fields)}`);
  if (!passGate(tier, opts, draft)) return;

  let failed = 0;
  for (const key of keys) {
    const { status, json } = await jiraFetch(`/rest/api/2/issue/${key}`, { method: 'PUT', body: { fields }, env });
    if (status >= 200 && status < 300) console.log(`UPDATED ${key} (${names.join(', ')})`);
    else { failed++; console.error(`FAIL ${key} ${status} ${JSON.stringify(json)}`); }
  }
  reportBatch(keys.length, failed);
}

// ── assign ───────────────────────────────────────────────────────────────────
async function verbAssign(args, { env, opts }) {
  const keys = parseKeys(args[0]);
  if (!args[1]) throw new Error('MISSING_USER: node jira.mjs assign FAL-279 lamln[,dungtt]');
  const users = args[1].split(',').map((s) => s.trim()).filter(Boolean);
  const { fields } = buildUpdateFields({ assignees: users });
  const own = await ownership(keys, env);
  const tier = tierOfBatch('assign', own);
  if (!passGate(tier, opts, keys.map((k) => `${k}: giao cho ${users.join(', ')}`))) return;

  let failed = 0;
  for (const key of keys) {
    const { status, json } = await jiraFetch(`/rest/api/2/issue/${key}`, { method: 'PUT', body: { fields }, env });
    if (status >= 200 && status < 300) console.log(`ASSIGNED ${key} → ${users.join(', ')}`);
    else { failed++; console.error(`FAIL ${key} ${status} ${JSON.stringify(json)}`); }
  }
  reportBatch(keys.length, failed);
}

// ── sprint ───────────────────────────────────────────────────────────────────
async function verbSprint(args, { env, opts }) {
  const keys = parseKeys(args[0]);
  const idFlag = args.find((a) => a.startsWith('--id='));
  const mode = idFlag ? 'explicit' : args.includes('--backlog') ? 'backlog' : args.includes('--active') ? 'active' : null;
  if (!mode) throw new Error('MISSING_MODE: cần --active | --id=<n> | --backlog');

  const own = await ownership(keys, env);
  const tier = tierOfBatch('sprint', own);
  if (!passGate(tier, opts, keys.map((k) => `${k} → ${mode === 'backlog' ? 'backlog' : mode === 'explicit' ? `sprint ${idFlag.slice(5)}` : 'sprint đang chạy'}`))) return;

  if (mode === 'backlog') {
    const { status, json } = await jiraFetch('/rest/agile/1.0/backlog/issue', { method: 'POST', body: { issues: keys }, env });
    if (status >= 200 && status < 300) console.log(`BACKLOG: đưa ${keys.length} issue về backlog`);
    else { console.error(`FAIL ${status} ${JSON.stringify(json)}`); process.exitCode = 2; }
    return;
  }
  let sprintId = idFlag ? idFlag.slice('--id='.length) : null;
  let label = String(sprintId);
  if (mode === 'active') {
    const sp = await resolveActiveSprint(env);
    sprintId = sp.id;
    label = `${sp.id} "${sp.name}"`;
  }
  const mv = await moveIssuesToSprint(env, sprintId, keys);
  if (mv.ok) console.log(`SPRINT: đưa ${mv.moved} issue vào sprint ${label}`);
  else { console.error(`FAIL sprint ${mv.error}`); process.exitCode = 2; }
}

// ── comment ──────────────────────────────────────────────────────────────────
async function verbComment(args, { env, opts }) {
  const keys = parseKeys(args[0]);
  const body = args.slice(1).join(' ') || (await readStdin()).trim();
  if (!body) throw new Error('EMPTY_COMMENT: truyền nội dung qua đối số hoặc stdin');
  const own = await ownership(keys, env);
  const tier = tierOfBatch('comment', own);
  if (!passGate(tier, opts, keys.map((k) => `${k}: comment "${body.slice(0, 120)}"`))) return;

  let failed = 0;
  for (const key of keys) {
    const { status, json } = await jiraFetch(`/rest/api/2/issue/${key}/comment`, { method: 'POST', body: { body }, env });
    if (status >= 200 && status < 300) console.log(`COMMENTED ${key}`);
    else { failed++; console.error(`FAIL ${key} ${status} ${JSON.stringify(json)}`); }
  }
  reportBatch(keys.length, failed);
}

// ── attach ───────────────────────────────────────────────────────────────────
async function verbAttach(args, { env, opts }) {
  const key = singleKey(args[0], 'attach');
  const files = args.slice(1).filter((a) => !a.startsWith('--'));
  if (!files.length) throw new Error('MISSING_FILE: node jira.mjs attach FAL-279 ./evidence.png');
  const own = await ownership([key], env);
  const tier = tierOfBatch('attach', own);
  if (!passGate(tier, opts, files.map((f) => `${key}: đính kèm ${basename(f)}`))) return;

  const form = new FormData();
  for (const f of files) form.append('file', new Blob([readFileSync(f)]), basename(f));
  const { status, json } = await jiraFetch(`/rest/api/2/issue/${key}/attachments`, { method: 'POST', form, env });
  if (status >= 200 && status < 300) console.log(`ATTACHED ${key}: ${(json || []).map((a) => a.filename).join(', ')}`);
  else { console.error(`FAIL ${status} ${JSON.stringify(json)}`); process.exitCode = 2; }
}

// ── link ─────────────────────────────────────────────────────────────────────
async function verbLink(args, { env, opts, meta }) {
  const from = singleKey(args[0], 'link (key nguồn)');
  const type = args[2] ? args[1] : DEFAULT_LINK_TYPE;
  const toArg = args[2] || args[1];
  if (!toArg) throw new Error('MISSING_TARGET: node jira.mjs link FAL-280 Relates FAL-279');
  const to = singleKey(toArg, 'link (key đích)');

  const valid = (meta.issueLinkTypes || []).map((t) => t.name);
  if (valid.length && !valid.includes(type)) {
    throw new Error(`UNKNOWN_LINK_TYPE "${type}" — hợp lệ: ${valid.join(' · ')}`);
  }
  const own = await ownership([from], env);
  const tier = tierOfBatch('link', own);
  if (!passGate(tier, opts, [`${from} -[${type}]-> ${to}`])) return;

  const { status, json } = await jiraFetch('/rest/api/2/issueLink', {
    method: 'POST', env,
    body: { type: { name: type }, inwardIssue: { key: from }, outwardIssue: { key: to } },
  });
  if (status >= 200 && status < 300) console.log(`LINKED ${from} -[${type}]-> ${to}`);
  else { console.error(`FAIL ${status} ${JSON.stringify(json)}`); process.exitCode = 2; }
}

// ── unlink (T3) ──────────────────────────────────────────────────────────────
// unlink là verb ghi DUY NHẤT không đi qua parseKeys/assertFalKey ở đầu vào (nhận link id, không
// nhận issue key) — guard FAL phải làm SAU khi GET ra 2 đầu link, không phải trước.

/** Dựng dòng draft dễ đọc cho unlink từ JSON `GET /rest/api/2/issueLink/<id>`. Export để test thuần
 * — không cần mạng. Chiều hiển thị khớp với `LINKED ${from} -[${type}]-> ${to}` của verbLink (verbLink
 * gửi `inwardIssue: from`, `outwardIssue: to`), để cùng một link đọc ra giống nhau dù tạo hay xoá. */
export function buildUnlinkDraft(linkId, linkJson) {
  const type = linkJson?.type?.name || '?';
  const from = linkJson?.inwardIssue?.key || '?';
  const to = linkJson?.outwardIssue?.key || '?';
  return `XOÁ link id=${linkId}: ${from} -[${type}]-> ${to} — KHÔNG HOÀN TÁC`;
}

/** Chặn xoá link dính project khác FAL — cả 2 đầu đều phải qua `assertFalKey`. Export để test thuần. */
export function assertLinkBothEndsFal(linkJson) {
  assertFalKey(linkJson?.inwardIssue?.key);
  assertFalKey(linkJson?.outwardIssue?.key);
}

async function verbUnlink(args, { env, opts }) {
  const linkId = String(args[0] || '').trim();
  if (!/^\d+$/.test(linkId)) throw new Error('MISSING_LINK_ID: lấy id qua `get FAL-279 --fields=issuelinks`');

  // GET trước để biết đang xoá link giữa issue nào với issue nào — draft mà không có thông tin thì
  // cổng T3 chỉ còn hình thức. `jiraFetch` không ném khi HTTP lỗi (xem hợp đồng ở scripts/lib/jira.mjs)
  // — TỰ kiểm `status`, lỗi/404 thì báo rõ và dừng ở đây, đừng đi tiếp tới DELETE.
  const { status, json } = await jiraFetch(`/rest/api/2/issueLink/${linkId}`, { env });
  if (status !== 200) {
    throw new Error(`LINK_NOT_FOUND: id=${linkId} không lấy được (HTTP ${status}) ${JSON.stringify(json)} — dừng, KHÔNG xoá`);
  }

  assertLinkBothEndsFal(json);
  if (!passGate('T3', opts, [buildUnlinkDraft(linkId, json)])) return;

  const { status: delStatus, json: delJson } = await jiraFetch(`/rest/api/2/issueLink/${linkId}`, { method: 'DELETE', env });
  if (delStatus >= 200 && delStatus < 300) console.log(`UNLINKED ${linkId}`);
  else { console.error(`FAIL ${delStatus} ${JSON.stringify(delJson)}`); process.exitCode = 2; }
}

// ── delete (T3) ──────────────────────────────────────────────────────────────
async function verbDelete(args, { env, opts }) {
  const keys = parseKeys(args[0]);
  const own = await ownership(keys, env);
  const draft = keys.map((k) => {
    const f = own.get(k).fields;
    return `XOÁ ${k} "${f.summary}" (status ${f.status?.name}, reporter ${f.reporter?.name}) — KHÔNG HOÀN TÁC`;
  });
  // T3 kể cả issue của mình: gate() không nhận --force ở tầng này.
  if (!passGate('T3', opts, draft)) return;

  let failed = 0;
  for (const key of keys) {
    const { status, json } = await jiraFetch(`/rest/api/2/issue/${key}`, { method: 'DELETE', env });
    if (status >= 200 && status < 300) console.log(`DELETED ${key}`);
    else { failed++; console.error(`FAIL ${key} ${status} ${JSON.stringify(json)}`); }
  }
  reportBatch(keys.length, failed);
}

// ── raw (escape hatch) ───────────────────────────────────────────────────────
const RAW_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);

// raw tự do về endpoint và field (đó là lý do nó tồn tại — escape hatch), nhưng KHÔNG tự do
// về project: mọi issue key xuất hiện trong path vẫn phải là FAL. Ranh giới này cố ý — rút mọi
// chuỗi trông như issue key (KEY-123) trong path rồi soi qua luật FAL, TRƯỚC khi gọi mạng.
// Character class `[A-Za-z]` (không phải flag `i`): bắt CẢ key viết thường (vd "fal-279") —
// luật whitelist bên dưới (^FAL-\d+$) vẫn case-sensitive, nên "fal-279" bị nhận diện là key rồi
// bị từ chối vì không khớp đúng "FAL".
const ISSUE_KEY_IN_PATH_RE = /[A-Za-z][A-Za-z0-9]*-\d+/g;

export function parseRawArgs(args) {
  const method = String(args[0] || '').toUpperCase();
  if (!RAW_METHODS.has(method)) throw new Error(`BAD_METHOD "${args[0]}" — dùng GET/POST/PUT/DELETE`);
  let path = String(args[1] || '').trim();
  if (!path) throw new Error('MISSING_PATH: node jira.mjs raw GET /issue/FAL-279');
  if (!path.startsWith('/rest/')) path = `/rest/api/2${path.startsWith('/') ? '' : '/'}${path}`;

  const keysInPath = path.match(ISSUE_KEY_IN_PATH_RE) || [];
  for (const key of keysInPath) {
    if (!/^FAL-\d+$/.test(key)) {
      throw new Error(`NOT_FAL_KEY: "${key}" trong path "${path}" — skill này chỉ thao tác project FAL`);
    }
  }
  return { method, path };
}

async function verbRaw(args, { env, opts }) {
  const { method, path } = parseRawArgs(args);
  let body;
  if (method !== 'GET' && !process.stdin.isTTY) {
    const raw = (await readStdin()).trim();
    if (raw) {
      try { body = JSON.parse(raw); }
      catch { throw new Error('INVALID_JSON: stdin không phải JSON hợp lệ'); }
    }
  }
  const tier = classifyTier('raw', { method });
  if (!passGate(tier, opts, [`${method} ${path}`, body ? `body: ${JSON.stringify(body)}` : '(không body)'])) return;

  const { status, json } = await jiraFetch(path, { method, body, env });
  console.log(`HTTP ${status}`);
  if (json !== null) console.log(JSON.stringify(json, null, 2));
  if (!(status >= 200 && status < 300)) process.exitCode = 2;
}

const WRITE = {
  transition: verbTransition, update: verbUpdate, assign: verbAssign,
  sprint: verbSprint, comment: verbComment, attach: verbAttach,
  link: verbLink, unlink: verbUnlink, delete: verbDelete, raw: verbRaw,
};

export const WRITE_VERB_NAMES = Object.keys(WRITE);

export async function runWrite(verb, args, ctx) {
  return WRITE[verb](args, ctx);
}
