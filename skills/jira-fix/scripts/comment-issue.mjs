#!/usr/bin/env node
/**
 * Pha 6: comment ngược link MR lên ticket.
 *
 *   node comment-issue.mjs --key FAL-720 --body-file comment.txt [--confirm]
 *
 * Không có `--confirm` thì chỉ in ra để đọc. Comment là thứ cả team thấy và không xoá lại được
 * cho sạch, nên nó đi qua đúng cổng duyệt như mọi thao tác ghi khác.
 *
 * Skill KHÔNG đổi status ticket. Chuyển To Do → In Progress → Done là tín hiệu người này đã
 * cầm việc; một cái bot bật cờ đó làm hỏng thứ duy nhất board đang nói thật.
 */
import {readFileSync} from 'node:fs';
import {loadEnv, parseIssueKey, addComment, main} from './lib/jira.mjs';

await main(async () => {

  function arg(name, required = true) {
    const i = process.argv.indexOf(`--${name}`);
    const v = i > -1 ? process.argv[i + 1] : undefined;
    if (required && !v) {
      console.error(`thiếu --${name}`);
      process.exit(2);
    }
    return v;
  }

  const key = parseIssueKey(arg('key'));
  const body = readFileSync(arg('body-file'), 'utf8');

  if (!process.argv.includes('--confirm')) {
    console.log(`DRY-RUN — sẽ comment lên ${key}:\n\n${body}\n\nChạy lại kèm --confirm để đăng thật.`);
    process.exit(0);
  }

  const cfg = loadEnv();
  const res = await addComment(cfg, key, body);
  console.log(JSON.stringify({ok: true, key, commentId: res.id, url: `${cfg.baseUrl}/browse/${key}`}, null, 2));

});
