// scripts/roster.mjs — đọc roster chung của team, map người → Slack UID, lọc theo role/board.
// NGUỒN: nhan-su/roster.json (nguồn sự thật duy nhất cho Slack UID, commit trong repo).
// Khoá chính là jiraUsername — KHÔNG tra theo name, team có tên trùng (tranggt/trangdt, dungta/dungtt).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(__dirname, '..', '..', '..', 'nhan-su', 'roster.json');

export function loadRoster(file = DEFAULT_FILE) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch { throw new Error(`MISSING_ROSTER: không đọc được ${file} (nguồn chung nhan-su/roster.json).`); }
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error('ROSTER_INVALID: JSON hỏng — kiểm tra dấu phẩy/ngoặc trong nhan-su/roster.json.'); }
  const list = data?.members;
  if (!Array.isArray(list)) throw new Error('ROSTER_INVALID: cần object có mảng "members" gồm {jiraUsername,name,role,board,slackUid}.');
  list.forEach((r, i) => {
    // Chỉ 3 field này bắt buộc CÓ GIÁ TRỊ. `slackUid` được phép rỗng (chưa lấy được UID →
    // tag bằng tên thường) và `board` được phép null (Designer/CS dùng chung cả Falcon),
    // nên hai field đó chỉ kiểm sự tồn tại của key, không kiểm truthy.
    for (const f of ['jiraUsername', 'name', 'role']) {
      if (!r || !r[f]) throw new Error(`ROSTER_INVALID: dòng ${i} thiếu field "${f}".`);
    }
    for (const f of ['slackUid', 'board']) {
      if (!(f in r)) throw new Error(`ROSTER_INVALID: dòng ${i} (${r.jiraUsername}) thiếu key "${f}".`);
    }
  });
  return list;
}

export function filterRoster(list, { role, board } = {}) {
  return list.filter((x) => (!role || x.role === role) && (!board || x.board === board));
}

export function byJiraUsername(list, username) {
  return list.find((x) => x.jiraUsername === username) || null;
}

/** Mọi email của 1 người: địa chỉ hiện hành + địa chỉ cũ còn dùng (@avada.email). */
export function emailsOf(member) {
  return [member?.email, ...(member?.emailAliases || [])].filter(Boolean).map((e) => e.toLowerCase());
}

/** Tra theo email, khớp cả alias — người cũ đăng ký Slack bằng @avada.email. */
export function byEmail(list, email) {
  const needle = String(email || '').toLowerCase();
  return list.find((x) => emailsOf(x).includes(needle)) || null;
}

/** Cú pháp tag Slack: có UID → mention thật; rỗng → tên thường (Slack không tag được). */
export function mention(member) {
  return member?.slackUid ? `<@${member.slackUid}>` : (member?.name ?? '');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
    const all = loadRoster();
    const user = get('--user');
    const rows = user
      ? [byJiraUsername(all, user)].filter(Boolean)
      : filterRoster(all, { role: get('--role'), board: get('--board') });
    if (!rows.length) { console.log('(roster rỗng theo filter)'); process.exit(0); }
    for (const r of rows) console.log(`${r.board ?? '-'}\t${r.role}\t${r.jiraUsername}\t${r.name}\t${mention(r)}`);
    const missing = rows.filter((r) => !r.slackUid).map((r) => r.jiraUsername);
    if (missing.length) console.log(`\n⚠️  Chưa có slackUid: ${missing.join(', ')} — điền vào nhan-su/roster.json để tag được.`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
