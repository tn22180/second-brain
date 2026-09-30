import {afterAll, expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildConfig} from '../src/config';
import {listApps, type App} from '../src/registry';
import {Store} from '../src/state/store';
import {auditJobWorktreeDir, runAuditJob} from '../src/audit/job';
import type {SecurityLaneInput} from '../src/audit/securityLane';
import {spawnRunner} from '../src/gcloud/run';

/**
 * The one test that runs the sweep planner against real git rather than the fake
 * in audit.job.test.ts: rename detection and path quoting are git's behaviour, and
 * a fake only ever answers what the test author already believed.
 */

const NOW = 1_755_000_000_000;
const DAY = 86_400_000;
const APP: App = listApps(
  buildConfig({SLACK_BOT_TOKEN: 'xoxb-1', SLACK_ERROR_CHANNEL_ID: 'C0PROD', AUTOFIX_STATE_DB: ':memory:'})
).find(a => a.appName === 'SEO')!;

const root = mkdtempSync(join(tmpdir(), 'audit-incremental-git-'));
afterAll(() => rmSync(root, {recursive: true, force: true}));

async function git(dir: string, ...args: string[]): Promise<string> {
  const res = await spawnRunner(
    ['git', '-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
    10_000
  );
  if (res.code !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
}

function write(dir: string, path: string, body: string): void {
  mkdirSync(join(dir, path, '..'), {recursive: true});
  writeFileSync(join(dir, path), body);
}

test('a real diff lists both sides of a rename and the deleted file, and drops the lockfile', async () => {
  const dir = auditJobWorktreeDir(root, APP.repo, '2026-08-19');
  mkdirSync(dir, {recursive: true});
  await git(dir, 'init', '-q');
  // Identical content is what makes git's default diff pair the rename up.
  const renamed = Array.from({length: 20}, (_, i) => `export const line${i} = ${i};`).join('\n');
  write(dir, 'src/a.js', 'export const a = 1;\n');
  write(dir, 'src/old-name.js', renamed);
  write(dir, 'src/gone.js', 'export const gone = true;\n');
  write(dir, 'yarn.lock', 'lock v1\n');
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-q', '-m', 'base');
  const base = await git(dir, 'rev-parse', 'HEAD');

  const store = new Store(':memory:');
  store.setSecuritySweep('SEO', {sha: base, fullAtMs: NOW - DAY, nowMs: NOW - DAY});

  write(dir, 'src/a.js', 'export const a = 2;\n');
  await git(dir, 'mv', 'src/old-name.js', 'src/new-name.js');
  await git(dir, 'rm', '-q', 'src/gone.js');
  write(dir, 'yarn.lock', 'lock v2\n');
  write(dir, '.env', 'KEY=value\n');
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-q', '-m', 'change');

  const seen: SecurityLaneInput[] = [];
  const result = await runAuditJob(APP, {
    cfg: {
      worktreeRoot: root,
      dateStr: '2026-08-19',
      mrEnabled: false,
      digest: false,
      nowMs: NOW,
      gitTimeoutMs: 10_000,
      security: {model: 'm', timeoutMs: 1000, fullEveryDays: 7},
      triage: {model: 'm', timeoutMs: 1000},
      eslintTimeoutMs: 1000,
      mr: {model: 'm', agentTimeoutMs: 1000, jestTimeoutMs: 1000},
      jira: undefined
    },
    // The worktree is the repo built above; creating and removing it is not under test.
    createWorktree: async input => ({ok: true, value: {dir: input.dir, branch: input.branch, baseSha: base}}),
    linkNodeModules: async () => ({linked: [], missing: []}),
    removeWorktree: async () => ({ok: true, detail: undefined}),
    runEslintLane: async () => ({ok: true, findings: [], filesScanned: 0}),
    securityLane: async input => {
      seen.push(input);
      return {ok: true, findings: [], dropped: 0, hasSecuritySkill: true, costUsd: 0};
    },
    triageLane: async () => ({ok: true, verdicts: [], deletable: [], costUsd: 0}),
    runMrLane: async () => {
      throw new Error('not called');
    },
    runJiraLane: async () => {
      throw new Error('not called');
    },
    store,
    runner: spawnRunner,
    fileExists: () => true
  });

  expect(result.securitySweep?.mode).toBe('incremental');
  expect([...seen[0]!.files!].sort()).toEqual(['.env', 'src/a.js', 'src/gone.js', 'src/new-name.js', 'src/old-name.js']);
  expect(store.getSecuritySweep('SEO')?.sha).toBe(await git(dir, 'rev-parse', 'HEAD'));
});
