// scripts/lib/config.mjs
// Portable: KHÔNG khoá cứng đường dẫn máy. Token + field id resolve qua env / .env cạnh skill,
// nên chạy được trên máy bất kỳ Tech Lead nào (bản phân phối team-ops dùng cùng file này).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.join(__dirname, '..', '..'); // review-mr-queue/

export const JIRA_BASE = (process.env.JIRA_BASE_URL || 'https://space.avada.net').replace(/\/$/, '');

// Field id — cố định theo instance Jira Falcon (probe 2026-07-14). Cho override qua env nếu instance đổi.
// Bundle sẵn để skill TỰ CHỨA, không phụ thuộc jira-metadata.json của skill jira (tên skill jira khác
// nhau giữa brain `jira-create` và team-ops `jira`).
const FIELD_IDS = {
  mergeRequest: process.env.JIRA_FIELD_MERGE_REQUEST || 'customfield_10800',
  assignees: process.env.JIRA_FIELD_ASSIGNEES || 'customfield_10700',
};

export function getFieldId(name) {
  const id = FIELD_IDS[name];
  if (!id) throw new Error(`FIELD_NOT_FOUND: ${name}`);
  return id;
}

function parseEnvFile(file) {
  try {
    const out = {};
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  } catch { return {}; }
}

// Token: env → .env trong skill này → .env skill jira cạnh bên (`jira` ở team-ops, `jira-create` ở brain)
// → .env ở cwd. Portable dù cài personal (~/.claude/skills) hay theo project, chạy từ cwd bất kỳ.
export function getJiraToken() {
  if (process.env.JIRA_TOKEN) return process.env.JIRA_TOKEN;
  const candidates = [
    path.join(SKILL_ROOT, '.env'),
    path.join(SKILL_ROOT, '..', 'jira', '.env'),
    path.join(SKILL_ROOT, '..', 'jira-create', '.env'),
    path.join(process.cwd(), '.env'),
  ];
  for (const f of candidates) {
    const v = parseEnvFile(f).JIRA_TOKEN;
    if (v) return v;
  }
  throw new Error('MISSING_JIRA_TOKEN');
}
