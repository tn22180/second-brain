// scripts/set-status.mjs — chuyển status Jira (default → "Waiting to test"). Draft-first.
// Exit: 0 ok/dry-run · 1 lỗi API · 2 không có transition phù hợp (non-fatal).
import { jiraEnv, jiraFetch, pickTransition, errorBody } from '../../../scripts/lib/jira.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SKILL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const args = process.argv.slice(2);
  const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
  const confirm = args.includes('--confirm');
  const key = get('--key');
  const target = (get('--to') || 'Waiting to test').trim();

  if (!key) { console.error('USAGE: --key FAL-xxx [--to "Waiting to test"] [--confirm]'); process.exit(1); }

  const env = jiraEnv(SKILL_ROOT);

  const t = await jiraFetch(`/rest/api/2/issue/${key}/transitions`, { env });
  if (!(t.status >= 200 && t.status < 300)) { console.error(`JIRA_TRANSITIONS_ERROR ${t.status}: ${errorBody(t.json, t.text)}`); process.exit(1); }
  const transitions = t.json.transitions || [];

  const match = pickTransition(transitions, target);

  if (!match) {
    const avail = transitions.map((x) => `${x.name}→${x.to?.name}`).join(', ') || '(rỗng)';
    console.error(`NO_TRANSITION_TO "${target}" cho ${key}. Có thể task đã ở status này. Khả dụng: ${avail}`);
    process.exit(2);
  }

  if (!confirm) {
    console.log(`[DRY-RUN] ${key} → "${match.to?.name}" (transition "${match.name}" id=${match.id})`);
    process.exit(0);
  }

  const p = await jiraFetch(`/rest/api/2/issue/${key}/transitions`, { method: 'POST', body: { transition: { id: match.id } }, env });
  if (!(p.status >= 200 && p.status < 300)) { console.error(`JIRA_TRANSITION_ERROR ${p.status}: ${errorBody(p.json, p.text)}`); process.exit(1); }
  console.log(`MOVED ${key} → "${match.to?.name}"`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
