// scripts/lib/config.mjs — config riêng của skill support-handoff (base URL Jira, field ID).
// Token KHÔNG còn đọc ở đây: đã chuyển sang lib chung `scripts/lib/env.mjs` cấp repo, nơi
// chấp nhận cả SLACK_TOKEN lẫn SLACK_USER_TOKEN (hai skill từng đặt hai tên cho cùng 1 token).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSlackToken, resolveAny, envCandidates, parseEnvFile } from '../../../../scripts/lib/env.mjs';

const SKILL_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); // support-handoff/

export { parseEnvFile };

export const JIRA_BASE = loadJiraEnvSafe().baseUrl;

function loadJiraEnvSafe() {
  // JIRA_BASE đọc lúc import → chưa có token cũng không được ném, để lệnh `--help` chạy được.
  const base = resolveAny(['JIRA_BASE_URL'], envCandidates(SKILL_ROOT)) || 'https://space.avada.net';
  return { baseUrl: base.replace(/\/$/, '') };
}

// Field id merge request: KHÔNG còn đọc từ env ở đây (JIRA_FIELD_MERGE_REQUEST đã hết tác dụng) —
// dùng hằng FIELDS.mergeRequest ở scripts/lib/jira.mjs, nguồn chung cho mọi skill.

// getJiraToken() ĐÃ XOÁ (2026-07-22): không còn nơi nào gọi — fetch-task.mjs/set-status.mjs đã
// chuyển sang `jiraEnv()` của scripts/lib/jira.mjs. Xác nhận qua `grep -rn getJiraToken` trước khi xoá.

export function getSlackToken() {
  return loadSlackToken(SKILL_ROOT);
}
