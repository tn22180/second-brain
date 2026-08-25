#!/usr/bin/env node
import {main} from './lib/jira.mjs';
/**
 * Pha 6: commit trong worktree rồi mở MR bằng **git push options**.
 *
 *   node open-mr.mjs --dir <worktree> --base master \
 *     --title "fix(apc): ..." --body-file body.md --allow-file allow.txt [--draft] [--dry-run]
 *
 * Không dùng GitLab API: 5 repo đẩy qua HTTPS và `glab auth status` trên máy này trả 401 với
 * không token nào trong config/keyring/env. Push option chỉ cần đúng thứ credential mà `git push`
 * vẫn đang dùng — đó cũng là lý do URL của MR phải bới ra từ output của push chứ không đọc từ
 * response body.
 */
import {readFileSync} from 'node:fs';
import {basename} from 'node:path';
import {git, branchAllowed, singleLine, parseMrUrl, parseCreateLink, remoteToWebUrl, buildCreateMrUrl, outOfScope} from './lib/git.mjs';

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
  const has = name => process.argv.includes(`--${name}`);

  const dir = arg('dir');
  const baseBranch = arg('base');
  const titleRaw = arg('title');
  const body = readFileSync(arg('body-file'), 'utf8');
  const allow = readFileSync(arg('allow-file'), 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
  const dryRun = has('dry-run');
  const draft = has('draft');
  const TIMEOUT = 180_000;
  const MAX_TITLE = 300;

  const title = draft && !/^Draft:/i.test(titleRaw) ? `Draft: ${titleRaw}` : titleRaw;

  const fail = (failure, detail, extra = {}) => {
    console.log(JSON.stringify({ok: false, failure, detail, ...extra}, null, 2));
    process.exit(1);
  };

  const branchRes = await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'], {timeoutMs: TIMEOUT});
  if (branchRes.code !== 0) fail('refused', `không đọc được branch của ${dir}`);
  const branch = branchRes.stdout.trim();

  if (!branchAllowed(branch)) fail('refused', `branch ${branch} không nằm trong allowlist fix/FAL-`);
  if (branch === baseBranch) fail('refused', 'từ chối push thẳng lên base branch');

  // Stage đúng những gì đã duyệt, thay vì `git add -A` rồi kiểm tra sau: worktree còn chứa
  // `node_modules` symlink (repo không gitignore nó ở gốc) và mọi rác của lần chạy trước.
  // Bơm cả cây vào index rồi lọc ra là cho phép một cú trượt tay có cơ hội đi vào commit.
  const added = await git(dir, ['add', '--', ...allow], {timeoutMs: TIMEOUT});
  if (added.code !== 0) fail('commit_failed', (added.stderr || added.stdout).trim().slice(0, 300));

  const staged = await git(dir, ['diff', '--cached', '--name-only'], {timeoutMs: TIMEOUT});
  const changed = staged.stdout.split('\n').map(s => s.trim()).filter(Boolean);
  if (!changed.length) fail('nothing_to_commit', 'không file nào trong allow-list có thay đổi');

  // Vẫn kiểm lại: một pattern trong allow-list có thể là thư mục và kéo theo file không lường trước.
  const stray = outOfScope(changed, allow);
  if (stray.length) {
    await git(dir, ['reset'], {timeoutMs: TIMEOUT});
    fail('out_of_scope', `file ngoài phạm vi đã duyệt: ${stray.join(', ')}`, {changed, allow});
  }

  // Thay đổi nằm ngoài allow-list không chặn commit, nhưng người duyệt cần biết chúng tồn tại.
  const tracked = await git(dir, ['diff', '--name-only'], {timeoutMs: TIMEOUT});
  const leftBehind = tracked.stdout.split('\n').map(s => s.trim()).filter(Boolean);

  // CI dùng immutable install: MR thêm dependency mà không kèm yarn.lock thì pipeline fail.
  const touchedPkg = changed.filter(f => basename(f) === 'package.json');
  const lockCommitted = changed.some(f => basename(f) === 'yarn.lock');
  const warnings = [];
  if (leftBehind.length) {
    warnings.push(`thay đổi KHÔNG được commit vì ngoài allow-list: ${leftBehind.join(', ')}`);
  }
  if (touchedPkg.length && !lockCommitted) {
    warnings.push(`sửa ${touchedPkg.join(', ')} nhưng không có yarn.lock trong diff — CI immutable install sẽ fail`);
  }

  if (dryRun) {
    const stat = await git(dir, ['diff', '--cached', '--stat'], {timeoutMs: TIMEOUT});
    await git(dir, ['reset'], {timeoutMs: TIMEOUT});
    console.log(JSON.stringify({ok: true, dryRun: true, branch, baseBranch, title, changed, warnings, diffStat: stat.stdout.trim()}, null, 2));
    process.exit(0);
  }

  const committed = await git(dir, ['commit', '-m', title, '-m', body], {timeoutMs: TIMEOUT});
  if (committed.code !== 0) fail('commit_failed', (committed.stderr || committed.stdout).trim().slice(0, 300));
  const headSha = (await git(dir, ['rev-parse', 'HEAD'], {timeoutMs: TIMEOUT})).stdout.trim();

  const pushed = await git(
    dir,
    [
      'push',
      '-o', 'merge_request.create',
      '-o', `merge_request.target=${singleLine(baseBranch, 200)}`,
      '-o', `merge_request.title=${singleLine(title, MAX_TITLE)}`,
      '-o', 'merge_request.remove_source_branch',
      '--set-upstream', 'origin', `HEAD:refs/heads/${branch}`
    ],
    {timeoutMs: TIMEOUT}
  );

  // GitLab in khối MR ra stderr, lẫn với progress của push.
  const output = `${pushed.stderr}\n${pushed.stdout}`;
  if (pushed.code !== 0) {
    fail('push_failed', (pushed.stderr || pushed.stdout).trim().slice(0, 500), {branch, headSha, changed});
  }

  const mrUrl = parseMrUrl(output);
  if (!mrUrl) {
    // Branch đã lên remote, nên một link tạo tay là đủ để kết thúc bằng một cú click.
    let createMrUrl = parseCreateLink(output);
    if (!createMrUrl) {
      const remote = await git(dir, ['remote', 'get-url', 'origin'], {timeoutMs: TIMEOUT});
      const webUrl = remote.code === 0 ? remoteToWebUrl(remote.stdout) : undefined;
      if (webUrl) createMrUrl = buildCreateMrUrl(webUrl, branch, baseBranch, title);
    }
    console.log(JSON.stringify({ok: false, failure: 'no_mr_url', pushed: true, branch, headSha, createMrUrl, changed, warnings, detail: output.trim().slice(0, 400)}, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ok: true, mrUrl, branch, baseBranch, headSha, draft, changed, warnings}, null, 2));

});
