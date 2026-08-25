#!/usr/bin/env node
import {main} from './lib/jira.mjs';
/**
 * Pha 5: cây làm việc cô lập cho MỘT nhóm fix.
 *
 *   node worktree.mjs --key FAL-720 --repo ai-product-copy --slug swagger-token-auth [--remove]
 *
 * Một nhóm = một worktree = một branch = một MR. Không dùng chung cây giữa các nhóm: reviewer
 * duyệt fix auth không được duyệt kèm một mớ thay đổi khác trong cùng diff.
 */
import {loadRegistry, branchName, worktreeDir} from './lib/apps.mjs';
import {createWorktree, reopenWorktree, removeWorktree, branchAllowed} from './lib/git.mjs';
import {join} from 'node:path';

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

  const registry = loadRegistry();
  const key = arg('key');
  const repo = arg('repo');
  const slug = arg('slug');
  const spec = registry.apps.find(a => a.repo === repo);
  if (!spec) {
    console.error(`repo ngoài registry: ${repo} — chỉ ${registry.apps.map(a => a.repo).join(', ')}`);
    process.exit(2);
  }

  const repoPath = join(registry.reposRoot, spec.repo);
  const branch = branchName(key, slug);
  const dir = worktreeDir(registry, key, slug);

  if (process.argv.includes('--remove')) {
    const res = await removeWorktree(repoPath, dir, 120_000);
    console.log(JSON.stringify({removed: res.code === 0, dir, detail: (res.stderr || res.stdout).trim()}, null, 2));
    process.exit(0);
  }

  if (!branchAllowed(branch)) {
    console.error(`branch ${branch} không nằm trong allowlist`);
    process.exit(2);
  }

  // `--existing` mở lại branch của một MR đang mở. Không có nó, branch bị reset về base và mọi
  // commit đã push biến mất khỏi cây local.
  const res = process.argv.includes('--existing')
    ? await reopenWorktree({repoPath, branch, dir, timeoutMs: 180_000})
    : await createWorktree({
        repoPath,
        baseBranch: spec.defaultBranch,
        branch,
        dir,
        timeoutMs: 180_000
      });
  if (!res.ok) {
    console.error(res.detail);
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      {dir: res.dir, branch: res.branch, baseBranch: spec.defaultBranch, baseSha: res.baseSha, repoPath, testCmd: spec.testCmd, nodeModules: res.nodeModules},
      null,
      2
    )
  );

});
