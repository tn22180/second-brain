// Verb ĐỌC — tầng T0: chạy thẳng, không hỏi, không cần --confirm.
import { jiraFetch, parseKeys, FIELDS, formatTransitionHelp } from '../../../../scripts/lib/jira.mjs';
import { collectActiveSprints } from './jira.mjs';
import { reportBatch } from './verbs-write.mjs';

const j = (o) => console.log(JSON.stringify(o, null, 2));

async function verbGet(args, { env }) {
  const keys = parseKeys(args[0]);
  const flag = args.find((a) => a.startsWith('--fields='));
  // Có 2 nhánh cố ý khác nhau ở đây:
  //  - KHÔNG truyền --fields: giữ nguyên hình dạng cố định đẹp (summary/status/reporter/…) —
  //    đã có người dùng quen, không đổi.
  //  - CÓ truyền --fields=...: người dùng xin field cụ thể, phải in ĐÚNG cái họ xin (JSON thô
  //    từ json.fields). Bug cũ: cờ được truyền vào query API (API trả đúng field) nhưng output
  //    vẫn bị ép về hình dạng cố định nên field lạ (vd description) không bao giờ hiện ra — cờ
  //    nhìn như có tác dụng mà thực ra không, kiểu lỗi im lặng tệ nhất.
  const explicitFields = flag ? flag.slice('--fields='.length) : null;
  const fields = explicitFields
    ?? `summary,status,reporter,${FIELDS.assignees},${FIELDS.sprint},${FIELDS.falconApp},duedate`;
  const out = [];
  for (const key of keys) {
    const { status, json } = await jiraFetch(`/rest/api/2/issue/${key}?fields=${encodeURIComponent(fields)}`, { env });
    if (status !== 200) { out.push({ key, error: `${status} ${JSON.stringify(json)}` }); continue; }
    const f = json.fields || {};
    if (explicitFields) {
      out.push({ key: json.key, ...f });
      continue;
    }
    out.push({
      key: json.key,
      summary: f.summary,
      status: f.status?.name ?? null,
      reporter: f.reporter?.name ?? null,
      assignees: (f[FIELDS.assignees] || []).map((a) => a.name),
      sprint: (f[FIELDS.sprint] || []).map((s) => (typeof s === 'string' ? (s.match(/name=([^,]+)/) || [])[1] : s?.name)).filter(Boolean),
      app: f[FIELDS.falconApp]?.value ?? null,
      dueDate: f.duedate ?? null,
    });
  }
  j(out.length === 1 ? out[0] : out);
}

async function verbSearch(args, { env }) {
  const jql = args[0];
  if (!jql) throw new Error('MISSING_JQL: node jira.mjs search "<JQL>" [max]');
  const max = args[1] || '50';
  const fields = `summary,status,${FIELDS.assignees}`;
  const { status, json } = await jiraFetch(
    `/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=${encodeURIComponent(fields)}&maxResults=${encodeURIComponent(max)}`,
    { env }
  );
  if (status !== 200) throw new Error(`SEARCH_FAILED ${status} ${JSON.stringify(json)}`);
  const issues = json.issues || [];
  console.log(`FOUND ${issues.length}${json.total > issues.length ? ` / tổng ${json.total}` : ''}`);
  for (const i of issues) {
    const who = (i.fields[FIELDS.assignees] || []).map((a) => a.name).join(',') || '-';
    console.log(`${i.key}\t${i.fields.status?.name ?? '-'}\t${who}\t${i.fields.summary}`);
  }
}

async function verbSprints(_args, { env }) {
  const sprints = await collectActiveSprints(env);
  const byId = new Map();
  for (const s of sprints) if (!byId.has(s.id)) byId.set(s.id, s);
  const uniq = [...byId.values()];
  if (!uniq.length) { console.log('NO_ACTIVE_SPRINT — issue mới sẽ nằm ở backlog.'); return; }
  console.log(`ACTIVE SPRINT (${uniq.length}):`);
  for (const s of uniq) console.log(`  ${s.id}  ${s.name}`);
}

async function verbBoard(_args, ctx) {
  await verbSearch(['project = FAL AND sprint in openSprints() ORDER BY status, assignee', '200'], ctx);
}

async function verbTransitions(args, { env }) {
  // Verb ĐỌC theo lô — như verbGet: lặp qua TOÀN BỘ key parseKeys trả về, một key lỗi (404,
  // không quyền…) không được dừng cả lô. Trước đây destructure `const [key] = parseKeys(...)`
  // chỉ giữ phần tử đầu, key sau bị bỏ KHÔNG báo lỗi — cùng bug đã diệt ở attach/link (xem
  // singleKey), nhưng ở verb ĐỌC hướng sửa ngược lại: cho chạy cả lô thay vì chặn còn 1 key.
  const keys = parseKeys(args[0]);
  let failed = 0;
  for (const key of keys) {
    const { status, json } = await jiraFetch(`/rest/api/2/issue/${key}/transitions`, { env });
    if (status !== 200) {
      failed++;
      console.error(`FAIL ${key} ${status} ${JSON.stringify(json)}`);
      continue;
    }
    const list = json.transitions || [];
    console.log(`${key} — nước đi hợp lệ:`);
    for (const t of list) console.log(`  ${t.to?.name ?? t.name}\t(transition "${t.name}" id=${t.id})`);
    if (!list.length) console.log(formatTransitionHelp(list, '(bất kỳ)'));
  }
  reportBatch(keys.length, failed);
}

function verbMeta(_args, { meta }) {
  j({
    issueTypes: meta.issueTypes,
    falconApps: meta.falconApps,
    statuses: meta.statuses,
    // transitions chỉ là ảnh chụp của MỘT issue mẫu tại status lúc probe (không phải danh sách
    // toàn cục) — kèm transitionsSampledFrom để agent thấy rõ đó là mẫu, đừng coi là danh sách
    // nước đi hợp lệ cho MỌI issue/status. Muốn nước đi thật của 1 issue cụ thể → verb `transitions`.
    transitions: meta.transitions,
    transitionsSampledFrom: meta.transitionsSampledFrom,
    fields: meta.fields,
    issueLinkTypes: (meta.issueLinkTypes || []).map((t) => t.name),
  });
}

const READ = {
  get: verbGet, search: verbSearch, sprints: verbSprints,
  board: verbBoard, transitions: verbTransitions, meta: verbMeta,
};

export const READ_VERB_NAMES = Object.keys(READ);

export async function runRead(verb, args, ctx) {
  return READ[verb](args, ctx);
}
