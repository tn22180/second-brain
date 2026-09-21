// scripts/set-status.mjs — chuyển status task Jira (mặc định → "Reviewing")
// Dùng sau khi post comment. Draft-first: không có --confirm chỉ in dry-run.
// Exit codes: 0 ok/dry-run · 1 lỗi API · 2 không có transition phù hợp (coi như non-fatal: có thể task đã ở status đó / workflow không cho)
import { JIRA_BASE, getJiraToken } from './lib/config.mjs';

const args = process.argv.slice(2);
const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const confirm = args.includes('--confirm');
const key = get('--key');
const target = (get('--to') || 'Reviewing').trim();

if (!key) { console.error('USAGE: --key FAL-xxx [--to "Reviewing"] [--confirm]'); process.exit(1); }

const headers = { Authorization: `Bearer ${getJiraToken()}`, 'Content-Type': 'application/json' };
const norm = (s) => (s || '').trim().toLowerCase();

// 1. Lấy transitions khả dụng từ status hiện tại
const tRes = await fetch(`${JIRA_BASE}/rest/api/2/issue/${key}/transitions`, { headers });
if (!tRes.ok) { console.error(`JIRA_TRANSITIONS_ERROR ${tRes.status}: ${await tRes.text()}`); process.exit(1); }
const { transitions = [] } = await tRes.json();

// Ưu tiên match theo status đích (to.name), fallback theo tên transition
const match = transitions.find((t) => norm(t.to?.name) === norm(target))
           || transitions.find((t) => norm(t.name) === norm(target));

if (!match) {
  const avail = transitions.map((t) => `${t.name}→${t.to?.name}`).join(', ') || '(rỗng)';
  console.error(`NO_TRANSITION_TO "${target}" cho ${key}. Có thể task đã ở status này. Khả dụng: ${avail}`);
  process.exit(2);
}

if (!confirm) {
  console.log(`[DRY-RUN] ${key} → "${match.to?.name}" (transition "${match.name}" id=${match.id})`);
  process.exit(0);
}

const pRes = await fetch(`${JIRA_BASE}/rest/api/2/issue/${key}/transitions`, {
  method: 'POST', headers, body: JSON.stringify({ transition: { id: match.id } }),
});
if (!pRes.ok) { console.error(`JIRA_TRANSITION_ERROR ${pRes.status}: ${await pRes.text()}`); process.exit(1); }
console.log(`MOVED ${key} → "${match.to?.name}"`);
