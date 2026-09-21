#!/usr/bin/env node
// Thao tác Jira cho luồng verify: get / attach evidence / transition.
// KHÔNG tạo issue ở đây — tạo issue dùng skill jira (/falcon:jira).
// Dùng:
//   node jira-actions.mjs get FAL-123
//   node jira-actions.mjs attach FAL-123 ./evidence-1.png [./evidence-2.png …]
//   node jira-actions.mjs transition FAL-123 "Done"
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jiraEnv, jiraFetch as coreFetch, pickTransition, formatTransitionHelp, errorBody } from '../../../scripts/lib/jira.mjs';

const SKILL_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Re-export để test cũ (`import { pickTransition } from '../jira-actions.mjs'`) không phải sửa đường dẫn.
export { pickTransition };

// Shim giữ NGUYÊN chữ ký cũ (env, path, opts) và NGUYÊN chuỗi JIRA_API_ERROR — reference của skill
// này in thẳng message ra cho tester đọc, đổi chuỗi là đổi tài liệu.
//
// Chỗ gọi cũ truyền `body` ở 2 dạng khác nhau: FormData (attach) và CHUỖI JSON đã stringify
// (transition). Lõi chung nhận `form` cho multipart và `body` là OBJECT (tự stringify) — nên shim
// phải phân loại, không bê thẳng qua.
async function jiraFetch(env, path, opts = {}) {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const jsonBody = !isForm && typeof opts.body === 'string' ? JSON.parse(opts.body)
    : !isForm && opts.body ? opts.body : undefined;
  const { status, json, text } = await coreFetch(`/rest/api/2/${path}`, {
    method: opts.method || 'GET',
    env,
    ...(isForm ? { form: opts.body } : jsonBody ? { body: jsonBody } : {}),
  });
  if (!(status >= 200 && status < 300)) {
    throw new Error(`JIRA_API_ERROR: ${opts.method || 'GET'} ${path} → HTTP ${status} ${errorBody(json, text).slice(0, 300)}`);
  }
  return json;
}

const [cmd, key, ...args] = process.argv.slice(2);
const USAGE = 'Dùng: node jira-actions.mjs <get|attach|transition> <FAL-key> [tham số]';

// Chạy CLI chỉ khi được gọi trực tiếp (import trong test thì không chạy)
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (!cmd || !key || !/^[A-Z]+-\d+$/.test(key)) throw new Error(USAGE);
    const env = jiraEnv(SKILL_ROOT);

    if (cmd === 'get') {
      const issue = await jiraFetch(env, `issue/${key}?fields=summary,status,description`);
      console.log(JSON.stringify({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status?.name,
        description: issue.fields.description || '',
      }, null, 2));
    } else if (cmd === 'attach') {
      if (!args.length) throw new Error('Thiếu file evidence. ' + USAGE);
      const form = new FormData();
      for (const f of args) form.append('file', new Blob([readFileSync(f)]), basename(f));
      const out = await jiraFetch(env, `issue/${key}/attachments`, {
        method: 'POST',
        headers: { 'X-Atlassian-Token': 'no-check' },
        body: form,
      });
      console.log(JSON.stringify({ ok: true, attached: out.map((a) => a.filename) }));
    } else if (cmd === 'transition') {
      const target = args[0];
      if (!target) throw new Error('Thiếu tên status đích, vd "Done". ' + USAGE);
      const { transitions } = await jiraFetch(env, `issue/${key}/transitions`);
      const t = pickTransition(transitions, target);
      if (!t) throw new Error(`NO_SUCH_TRANSITION: ${formatTransitionHelp(transitions, target)}`);
      await jiraFetch(env, `issue/${key}/transitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transition: { id: t.id } }),
      });
      console.log(JSON.stringify({ ok: true, key, transitioned: t.name }));
    } else {
      throw new Error(USAGE);
    }
  } catch (err) {
    console.error(String(err.message || err));
    process.exit(1);
  }
}
