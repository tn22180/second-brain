// Đẩy point + task từ last-payload.json (do sync.mjs sinh ra) lên Google Sheet "KPI team falcon".
//
//   node sync-sheet.mjs             → dry-run, in ra sẽ ghi gì
//   node sync-sheet.mjs --confirm   → ghi thật
//
// Sheet: 1ikkAz7DR_UgaumxPQRt_Y6G--5Ih3v-P1xucsYKCV-M
//   tab "KPI"               (gid 726508659) — điền cột Points + KPI cho block tháng mới nhất
//   tab "Dev/tester board"  (gid 966839282) — append 1 dòng / task có dev point
//
// Chỉ service account falcon-manager có quyền edit file này.
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { token } from './gauth.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SS = '1ikkAz7DR_UgaumxPQRt_Y6G--5Ih3v-P1xucsYKCV-M';
const KPI_TAB = 'KPI';
const BOARD_TAB = 'Dev/tester board';
const MONTH = 'T7 26';          // cột A của tab board
const RATE_CELL_SUFFIX = '*45000';
const confirm = process.argv.includes('--confirm');

// username Jira → tên hiển thị trong sheet
const DISPLAY = {
  truongnn: 'TruongNN', tunglv: 'TungLV', minhpt: 'MinhPT',
  ducnm01: 'DucNM', tuannv: 'TuanNV', dungtt: 'DungTT',
};
const DEVS = ['truongnn', 'tunglv', 'minhpt', 'ducnm01'];
const TESTERS = ['dungtt', 'trangdt', 'tranggt'];

// Điểm ghi vào tab KPI: {dòng: [username, point]}. Dòng lấy từ block 7/26 (header ở 48).
const KPI_ROWS = {
  51: 'tuannv', 52: 'truongnn', 53: 'tunglv', 55: 'minhpt', 58: 'ducnm01', 60: 'dungtt',
};

const payload = JSON.parse(readFileSync(`${HERE}/last-payload.json`, 'utf8'));
const pointOf = Object.fromEntries(payload.memberDocs.map((m) => [m.member, m.point]));

const t = await (async () => {
  for (let i = 1; ; i++) {
    try { return await token('https://www.googleapis.com/auth/spreadsheets'); }
    catch (e) { if (i >= 5) throw e; await new Promise((r) => setTimeout(r, 2000 * i)); }
  }
})();
const H = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
const api = async (path, opts = {}) => {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SS}${path}`, { headers: H, ...opts });
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 250)}`);
      return await r.json();
    } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 2000 * i)); }
  }
};

// ---- 1. đọc board hiện tại để dedupe -----------------------------------------
const board = (await api(`/values/${encodeURIComponent(`${BOARD_TAB}!A1:N2000`)}`)).values || [];
const existingKeys = new Set();
for (const row of board) {
  const hit = String(row[3] || '').match(/FAL-\d+/);
  if (hit) existingKeys.add(hit[0]);
}
const firstEmptyRow = board.length + 1;

// ---- 2. dựng dòng cần append -------------------------------------------------
// Task Name theo khuôn sheet: "Bug - [App] mô tả" / "Task - [App] mô tả".
// Summary Jira dạng "[BUG][SEO] ..." → bỏ tag role đầu, giữ [App] + phần còn lại.
const taskName = (d) => {
  const prefix = d.issueType === 'Bug' ? 'Bug' : 'Task';
  const body = d.summary.replace(/^\s*\[(BUG|DEV|BA|DESIGN)\]\s*/i, '');
  return `${prefix} - ${body}`;
};

const rows = [];
const skipped = [];
for (const d of payload.taskDocs) {
  if (!d.devPoint) continue;                       // "sync task của point" → phải có point
  if (existingKeys.has(d.key)) { skipped.push(d.key); continue; }
  const dev = d.assignees.find((a) => DEVS.includes(a));
  const tester = d.assignees.find((a) => TESTERS.includes(a));
  rows.push([
    MONTH,
    taskName(d),
    '',                                             // Description — để trống như dòng cũ
    d.url,
    d.devPoint,
    'Avada SEO Suite Development',
    dev ? DISPLAY[dev] : (d.assignees.includes('tuannv') ? DISPLAY.tuannv : ''),
    d.assignees.includes('tuannv') && dev ? DISPLAY.tuannv : '',
    tester ? DISPLAY[tester] : '',
  ]);
}

console.log(`board: ${board.length} dòng có data, append từ dòng ${firstEmptyRow}`);
console.log(`  FAL key đã có trên sheet: ${existingKeys.size}`);
console.log(`  bỏ qua vì trùng: ${skipped.length}${skipped.length ? ' → ' + skipped.join(', ') : ''}`);
console.log(`  sẽ append: ${rows.length} dòng, tổng ${rows.reduce((x, r) => x + r[4], 0)} point`);
console.log('\nKPI tab — block 7/26:');
for (const [row, user] of Object.entries(KPI_ROWS)) {
  console.log(`  E${row} = ${String(pointOf[user]).padStart(6)}  (${user})   F${row} = =E${row}${RATE_CELL_SUFFIX}`);
}
console.log('\n3 dòng mẫu sẽ append:');
rows.slice(0, 3).forEach((r) => console.log('  ' + r.map((c) => String(c).slice(0, 30)).join(' | ')));

if (!confirm) { console.log('\nDRY-RUN — thêm --confirm để ghi thật.'); process.exit(0); }

// ---- 3. ghi tab KPI ----------------------------------------------------------
const kpiData = [];
for (const [row, user] of Object.entries(KPI_ROWS)) {
  kpiData.push({ range: `${KPI_TAB}!E${row}`, values: [[pointOf[user]]] });
  kpiData.push({ range: `${KPI_TAB}!F${row}`, values: [[`=E${row}${RATE_CELL_SUFFIX}`]] });
}
await api('/values:batchUpdate', {
  method: 'POST',
  body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: kpiData }),
});
console.log(`KPI tab: ghi ${kpiData.length} cell`);

// ---- 4. append tab board ----------------------------------------------------
if (rows.length) {
  const res = await api(`/values/${encodeURIComponent(`${BOARD_TAB}!A${firstEmptyRow}`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({ values: rows }),
  });
  console.log(`board: append ${res.updates?.updatedRows} dòng → ${res.updates?.updatedRange}`);
}
