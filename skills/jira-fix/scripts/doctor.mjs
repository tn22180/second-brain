#!/usr/bin/env node
/**
 * Kiểm tra mọi thứ skill phụ thuộc, TRƯỚC khi tốn một vòng phân tích.
 *
 * Có `git ls-remote` trong này vì remote của cả 5 repo là HTTPS chứ không phải SSH: quyền push
 * phụ thuộc credential helper, và chỗ để phát hiện nó hỏng là ở đây — không phải sau khi fix
 * đã viết xong và chỉ còn thiếu mỗi cú push.
 */
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {loadEnv, myself} from './lib/jira.mjs';
import {loadRegistry} from './lib/apps.mjs';
import {git} from './lib/git.mjs';

const rows = [];
const add = (name, ok, detail) => rows.push({name, ok, detail});

let cfg;
try {
  cfg = loadEnv();
  const me = await myself(cfg);
  add('jira token', true, `${cfg.baseUrl} — ${me.name}`);
} catch (err) {
  add('jira token', false, err.message);
}

const registry = loadRegistry();
const only = process.argv.includes('--repo') ? process.argv[process.argv.indexOf('--repo') + 1] : undefined;

for (const app of registry.apps) {
  if (only && app.repo !== only) continue;
  const repoPath = join(registry.reposRoot, app.repo);
  if (!existsSync(repoPath)) {
    add(`${app.repo} clone`, false, `không có trên đĩa: ${repoPath}`);
    continue;
  }
  const remote = await git(repoPath, ['remote', 'get-url', 'origin'], {timeoutMs: 30_000});
  const url = remote.stdout.trim();
  add(`${app.repo} remote`, url === app.remote, url === app.remote ? url : `registry ghi ${app.remote}, trên đĩa là ${url}`);

  const ls = await git(repoPath, ['ls-remote', '--heads', 'origin', app.defaultBranch], {timeoutMs: 60_000});
  add(
    `${app.repo} origin/${app.defaultBranch}`,
    ls.code === 0 && ls.stdout.includes(app.defaultBranch),
    ls.code === 0 ? ls.stdout.trim().split('\t')[0]?.slice(0, 12) : (ls.stderr || ls.stdout).trim().slice(0, 200)
  );
}

const pad = Math.max(...rows.map(r => r.name.length));
for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(pad)}  ${r.detail}`);
process.exit(rows.every(r => r.ok) ? 0 : 1);
