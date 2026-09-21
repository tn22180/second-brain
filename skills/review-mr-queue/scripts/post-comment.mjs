// scripts/post-comment.mjs
import { execFileSync } from 'node:child_process';
import { JIRA_BASE, getJiraToken } from './lib/config.mjs';

const args = process.argv.slice(2);
const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const confirm = args.includes('--confirm');
const body = await new Promise(r => { let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>r(d)); });
if (!body.trim()) { console.error('EMPTY_BODY'); process.exit(1); }

const key = get('--key');
const mr = get('--mr'), repo = get('--repo');

if (key) {
  if (!confirm) { console.log(`[DRY-RUN] Jira comment → ${key}\n---\n${body}`); process.exit(0); }
  const res = await fetch(`${JIRA_BASE}/rest/api/2/issue/${key}/comment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getJiraToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) { console.error(`JIRA_POST_ERROR ${res.status}: ${await res.text()}`); process.exit(1); }
  const j = await res.json();
  console.log(`POSTED Jira ${key} comment id=${j.id}`);
} else if (mr && repo) {
  if (!confirm) { console.log(`[DRY-RUN] GitLab note → MR !${mr} (${repo})\n---\n${body}`); process.exit(0); }
  try {
    const out = execFileSync('glab', ['mr', 'note', mr, '-R', repo, '-m', body], { encoding: 'utf8' });
    console.log(`POSTED GitLab note:\n${out}`);
  } catch (e) {
    console.error(`GITLAB_POST_ERROR: ${e.message}`);
    process.exit(1);
  }
} else {
  console.error('USAGE: --key FAL-xxx | --mr <iid> --repo <path>  (+ --confirm), body qua STDIN');
  process.exit(1);
}
