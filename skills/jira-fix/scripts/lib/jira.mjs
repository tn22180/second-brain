import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const DEFAULT_BASE = 'https://space.avada.net';
const HERE = dirname(fileURLToPath(import.meta.url));

// Token nằm TRONG skill (engine root = jira-fix/) để gói tự chứa, không phụ thuộc cwd nơi mở Claude.
// Ứng viên thứ hai là .env của `jira-create`: cùng instance, cùng personal access token — bắt user
// dán token hai lần chỉ tạo thêm một bản sao phải xoay vòng.
const SKILL_ENV = join(HERE, '..', '..', '.env');
const SIBLING_ENV = join(HERE, '..', '..', '..', 'jira-create', '.env');

export function loadEnv(envPath) {
  let token = process.env.JIRA_TOKEN || '';
  let baseUrl = process.env.JIRA_BASE_URL || '';
  const candidates = envPath ? [envPath] : [SKILL_ENV, SIBLING_ENV, '.env'];
  for (const p of candidates) {
    if (token) break;
    try {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        if (m[1] === 'JIRA_TOKEN' && !token) token = m[2].trim();
        if (m[1] === 'JIRA_BASE_URL' && !baseUrl) baseUrl = m[2].trim();
      }
    } catch { /* không có file → ứng viên kế tiếp */ }
  }
  if (!token) throw new Error('MISSING_JIRA_TOKEN');
  return {baseUrl: (baseUrl || DEFAULT_BASE).replace(/\/$/, ''), token};
}

/**
 * `FAL-720`, `https://space.avada.net/browse/FAL-720`, kèm query/anchor đều ra `FAL-720`.
 * Chỉ nhận project FAL: một key project khác nghĩa là đang đọc nhầm instance/board, và
 * skill này không có repo map cho nó.
 */
export function parseIssueKey(input) {
  const raw = String(input || '').trim();
  const m = raw.match(/\b([A-Z][A-Z0-9_]+)-(\d+)\b/);
  if (!m) throw new Error(`KEY_NOT_FOUND: không rút được mã issue từ "${raw}"`);
  const key = `${m[1]}-${m[2]}`;
  if (m[1] !== 'FAL') throw new Error(`PROJECT_NOT_FAL: ${key} — skill chỉ làm project FAL`);
  return key;
}

/**
 * Dừng bằng một dòng người đọc được, không phải stack trace của Node.
 *
 * Ca thường gặp nhất là gõ nhầm mã issue, và một stack 20 dòng cho việc đó chỉ làm khó nhìn ra
 * thứ duy nhất cần biết: mã nào sai.
 */
export function die(message) {
  console.error(message);
  process.exit(1);
}

/** Bọc thân script: mọi lỗi đã biết thành một dòng, lỗi lạ vẫn giữ stack để còn debug được. */
export async function main(fn) {
  try {
    await fn();
  } catch (err) {
    const m = String(err?.message || err);
    if (/^(HTTP|KEY_NOT_FOUND|PROJECT_NOT_FAL|MISSING_JIRA_TOKEN)/.test(m)) {
      die(
        m.startsWith('MISSING_JIRA_TOKEN')
          ? 'Thiếu JIRA_TOKEN. Copy .env.example thành .env trong thư mục skill rồi điền token.'
          : m.replace(/^HTTP 404 [^:]*:.*/s, 'Issue không tồn tại, hoặc token không có quyền đọc nó.')
      );
    }
    throw err;
  }
}

async function call(cfg, path, init = {}) {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      // Bearer chứ không Basic: instance là Jira Server + personal access token.
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

export function getIssue(cfg, key) {
  return call(cfg, `/rest/api/2/issue/${encodeURIComponent(key)}`);
}

export function addComment(cfg, key, body) {
  return call(cfg, `/rest/api/2/issue/${encodeURIComponent(key)}/comment`, {
    method: 'POST',
    body: JSON.stringify({body})
  });
}

export function myself(cfg) {
  return call(cfg, '/rest/api/2/myself');
}
