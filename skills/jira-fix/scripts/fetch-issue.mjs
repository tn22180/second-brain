#!/usr/bin/env node
/**
 * Pha 1+2: đọc ticket và chốt repo.
 *
 *   node fetch-issue.mjs <link|FAL-720> [--raw]
 *
 * In một JSON gọn thay vì nguyên response 17 KB: response đầy đủ chở theo ~150 field null
 * và avatar URL của từng user, đọc hết vào context là trả tiền cho thứ không dùng.
 * `--raw` giữ lại lối thoát khi cần một field chưa được map ở đây.
 */
import {loadEnv, parseIssueKey, getIssue, main} from './lib/jira.mjs';
import {resolveApp} from './lib/apps.mjs';

await main(async () => {

  const args = process.argv.slice(2);
  const raw = args.includes('--raw');
  const target = args.find(a => !a.startsWith('--'));
  if (!target) {
    console.error('usage: fetch-issue.mjs <link|FAL-720> [--raw]');
    process.exit(2);
  }

  const cfg = loadEnv();
  const key = parseIssueKey(target);
  const issue = await getIssue(cfg, key);
  const f = issue.fields || {};

  if (raw) {
    console.log(JSON.stringify(issue, null, 2));
    process.exit(0);
  }

  const app = resolveApp(f);

  console.log(
    JSON.stringify(
      {
        key: issue.key,
        url: `${cfg.baseUrl}/browse/${issue.key}`,
        summary: f.summary,
        issuetype: f.issuetype?.name,
        status: f.status?.name,
        priority: f.priority?.name,
        falconApp: f.customfield_11203?.value,
        reporter: f.reporter?.name,
        // cf10700 "Assignees" (mảng) là field team dùng thật; `assignee` gốc của Jira gần như luôn null.
        assignees: (f.customfield_10700 || []).map(u => u.name),
        labels: f.labels || [],
        components: (f.components || []).map(c => c.name),
        parent: f.parent?.key,
        subtasks: (f.subtasks || []).map(s => s.key),
        issuelinks: (f.issuelinks || []).map(l => ({
          type: l.type?.name,
          key: (l.inwardIssue || l.outwardIssue || {}).key
        })),
        attachments: (f.attachment || []).map(a => ({
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
          content: a.content
        })),
        comments: (f.comment?.comments || []).map(c => ({
          author: c.author?.name,
          created: c.created,
          body: c.body
        })),
        description: f.description || '',
        app: app.ok
          ? {
              repo: app.app.repo,
              repoPath: app.app.repoPath,
              defaultBranch: app.app.defaultBranch,
              testCmd: app.app.testCmd,
              codePaths: app.app.codePaths,
              resolvedFrom: app.source
            }
          : null,
        appError: app.ok ? null : {reason: app.reason, detail: app.detail}
      },
      null,
      2
    )
  );

});
