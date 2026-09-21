#!/usr/bin/env node
// jira.mjs — CLI MỘT CỬA cho mọi thao tác Jira của skill jira.
// Thêm verb = thêm 1 case, không đẻ file mới. Guard phân tầng ở scripts/lib/jira.mjs.
//
// Exit code: 0 ok / dry-run · 1 sai đối số · 2 lỗi API · 3 thiếu token
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { jiraEnv } from '../../../scripts/lib/jira.mjs';
import { runRead, READ_VERB_NAMES } from './lib/verbs-read.mjs';
import { runWrite, WRITE_VERB_NAMES } from './lib/verbs-write.mjs';

const SKILL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = `Dùng: node jira.mjs <verb> [đối số] [--confirm] [--force]

ĐỌC (T0, chạy thẳng):
  get FAL-279[,FAL-280] [--fields=a,b]   search "<JQL>" [max]
  sprints    board    transitions FAL-279    meta

GHI:
  update FAL-279 (stdin field)   transition FAL-279 Done
  assign FAL-279 lamln[,dungtt]
  sprint FAL-279 --active|--id=59|--backlog
  comment FAL-279 "<nội dung>"   attach FAL-279 <file…>
  link FAL-280 Relates FAL-279   unlink <linkId>   delete FAL-279
  raw <METHOD> <path> (stdin body)

Tạo issue mới: KHÔNG có verb "create" ở CLI này → dùng scripts/create-issue.mjs
(xem references/create.md).`;

// Mã lỗi "sai đối số" (exit 1) — MỌI verb (đọc lẫn ghi) khi thêm mã lỗi tham số mới PHẢI
// đăng ký vào đây. Quên đăng ký thì lỗi rơi vào nhánh else bên dưới và thoát nhầm exit 2
// ("lỗi API") dù lỗi thực chất do người dùng gõ sai đối số.
const ARG_ERROR_CODES = new Set([
  'NOT_FAL_KEY', 'MISSING_JQL', 'UNKNOWN_VERB',
  'MISSING_TARGET', 'MISSING_USER', 'MISSING_MODE', 'MISSING_FILE',
  'EMPTY_COMMENT', 'EMPTY_UPDATE', 'UNKNOWN_FIELD', 'INVALID_DUE_DATE_FORMAT',
  'INVALID_JSON', 'UNKNOWN_LINK_TYPE', 'MISSING_LINK_ID', 'BAD_METHOD', 'MISSING_PATH',
  'MULTI_KEY_UNSUPPORTED', 'INVALID_TRANSITION',
]);
const ARG_ERROR_RE = new RegExp(`^(${[...ARG_ERROR_CODES].join('|')})`);

const [verb, ...rest] = process.argv.slice(2);
const args = rest.filter((a) => a !== '--confirm' && a !== '--force');
const opts = { confirm: rest.includes('--confirm'), force: rest.includes('--force') };

if (!verb || verb === '--help' || verb === '-h') { console.log(USAGE); process.exit(verb ? 0 : 1); }

let env;
try {
  env = jiraEnv(SKILL_ROOT);
} catch (e) {
  console.error(String(e.message || e));
  process.exit(3);
}

const meta = JSON.parse(readFileSync(join(SKILL_ROOT, 'jira-metadata.json'), 'utf8'));
const ctx = { env, meta, skillRoot: SKILL_ROOT, opts };

try {
  if (READ_VERB_NAMES.includes(verb)) {
    await runRead(verb, args, ctx);
  } else if (WRITE_VERB_NAMES.includes(verb)) {
    await runWrite(verb, args, ctx);
  } else {
    console.error(`UNKNOWN_VERB "${verb}"\n\n${USAGE}`);
    process.exit(1);
  }
} catch (e) {
  const msg = String(e.message || e);
  console.error(msg);
  process.exit(ARG_ERROR_RE.test(msg) ? 1 : 2);
}
