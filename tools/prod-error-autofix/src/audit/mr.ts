import {join} from 'node:path';
import {FIX_TOOLS, type ClaudeRunner} from '../agent/claudeCli';
import type {Runner} from '../gcloud/run';
import type {OpenMrInput, OpenMrResult} from '../git/openMr';
import {auditBranchName, type WorktreeInput, type WorktreeResult} from '../git/worktree';
import {FORBIDDEN_PATTERNS} from '../git/worktreeStatus';
import type {RateVerdict} from '../state/rateGate';
import type {JestRun, JestRunInput} from '../verify/jest';
import type {BaselineInput, BaselineResult} from '../verify/smoke';
import {redactSecret, type SecurityFinding} from './securitySchema';
import type {TriageFinding, TriageVerdict} from './triage';

/**
 * The only part of the audit that pushes, so every step in it fails closed.
 *
 * Two lanes, never one MR: a reviewer approving a security fix must not be
 * approving a batch of deletions in the same breath. Each lane cuts its **own**
 * worktree from the same `origin/<base>` — two agents editing one tree produce a
 * diff that cannot be split afterwards.
 *
 * Every side effect is injected. Nothing here reads a token: the remotes are HTTPS
 * across two hosts and authentication is the ambient credential helper's job.
 */

export type MrLaneKind = 'security' | 'cleanup';

export type MrRefusal =
  | 'nothing_to_fix'
  | 'worktree_failed'
  | 'agent_failed'
  | 'diff_failed'
  | 'no_changes'
  | 'out_of_scope'
  | 'forbidden_file'
  | 'no_baseline'
  | 'tests_failed'
  | 'capped'
  | 'push_failed'
  | 'no_mr_url';

export interface MrLaneResult {
  kind: MrLaneKind;
  branch: string;
  worktreeDir: string;
  pushed: boolean;
  mrUrl: string | undefined;
  /** Set unless the MR was opened. Never undefined alongside `pushed: false`. */
  refusal: MrRefusal | undefined;
  detail: string | undefined;
  /** What the diff actually touched, read from git rather than from the agent. */
  files: string[];
  costUsd: number | undefined;
}

export interface MrLaneInput {
  appName: string;
  repo: string;
  /** The main checkout. Worktrees are cut from it and never written to. */
  repoPath: string;
  baseBranch: string;
  worktreeRoot: string;
  /** `yyyymmdd` — at most one MR per kind per repo per day. */
  dateStr: string;
  model: string;
  brainSlice: string | undefined;
  testCmd: string[];
  security: SecurityFinding[];
  /** Every lint finding that went to triage, with the verdicts that came back. */
  lint: TriageFinding[];
  verdicts: TriageVerdict[];
  nowMs: number;
  timeouts: {git: number; agent: number; jest: number};
}

/**
 * Required, with no defaults on purpose: a missing dependency has to be a type
 * error, not a call that quietly reaches the real git.
 */
export interface MrLaneDeps {
  runner: Runner;
  claude: ClaudeRunner;
  createWorktree: (input: WorktreeInput, runner: Runner) => Promise<WorktreeResult>;
  linkNodeModules: (input: {repoPath: string; worktreeDir: string}) => Promise<{linked: string[]; missing: string[]}>;
  commitWip: (
    input: {worktreeDir: string; message: string; timeoutMs: number},
    runner: Runner
  ) => Promise<{ok: boolean; sha: string | undefined; detail: string | undefined}>;
  removeWorktree: (
    input: {repoPath: string; dir: string; timeoutMs: number},
    runner: Runner
  ) => Promise<{ok: boolean; detail: string | undefined}>;
  runJest: (input: JestRunInput, runner: Runner) => Promise<JestRun>;
  /** `measureBaseline` from `verify/smoke`. Run on the worktree before the agent edits it. */
  measureBaseline: (input: BaselineInput, runner: Runner) => Promise<BaselineResult>;
  /** `Store.getBaseline` / `Store.putBaseline`, bound by the caller — no live store reaches this file. */
  getBaseline: (repo: string, baseSha: string) => string[] | undefined;
  putBaseline: (repo: string, baseSha: string, failures: string[], nowMs: number) => void;
  openMr: (input: OpenMrInput, runner: Runner) => Promise<OpenMrResult>;
  /** `checkMrCaps` bound to the store and the caps by the caller. */
  checkCaps: (repo: string, nowMs: number) => RateVerdict;
  recordMr: (repo: string, nowMs: number) => void;
}

/**
 * `FORBIDDEN_PATTERNS` is the promise the README already makes, plus the audit's
 * own eslint config: `runEslint` writes `.audit.eslintrc.json` into the worktree,
 * and a run that dies between writing it and its `finally` would otherwise leave it
 * where an agent could commit it into a branch.
 */
export const AUDIT_FORBIDDEN_PATTERNS: RegExp[] = [
  ...FORBIDDEN_PATTERNS,
  /(^|\/)\.audit\.eslintrc\.json$/
];

export function forbiddenAuditTouches(paths: string[]): string[] {
  return paths.filter(p => AUDIT_FORBIDDEN_PATTERNS.some(re => re.test(p)));
}

/**
 * The cleanup lane's eligibility, re-derived here rather than trusted from the
 * caller. `runTriage` already filters `deletable` to `no-unused-vars`; this is the
 * same rule applied at the point where a deletion turns into a push, because
 * `no-undef` means a MISSING IMPORT and the repair for one is never a deletion.
 */
export function eligibleCleanup(lint: TriageFinding[], verdicts: TriageVerdict[]): TriageFinding[] {
  const deleted = new Set(verdicts.filter(v => v.verdict === 'delete').map(v => v.fp));
  return lint.filter(f => f.rule === 'no-unused-vars' && deleted.has(f.fp));
}

export function auditWorktreeDir(worktreeRoot: string, repo: string, kind: MrLaneKind, dateStr: string): string {
  return join(worktreeRoot, `${repo}-${kind}-${dateStr.replace(/[^0-9]/g, '')}`);
}

export function auditMrTitle(kind: MrLaneKind, appName: string, count: number): string {
  return kind === 'security'
    ? `audit(security): [${appName}] ${count} finding${count === 1 ? '' : 's'} from the daily sweep`
    : `audit(cleanup): [${appName}] remove ${count} unused declaration${count === 1 ? '' : 's'}`;
}

export interface AuditMrBodyInput {
  kind: MrLaneKind;
  appName: string;
  dateStr: string;
  security: SecurityFinding[];
  cleanup: TriageFinding[];
  agentSummary: string;
  jestLine: string;
}

/**
 * Every string that came from a finding or from the agent goes through
 * `redactSecret` on the way in: a `secret` finding's own title is the most likely
 * place for a live token, and an MR description is a wider audience than the repo.
 */
export function buildAuditMrBody(input: AuditMrBodyInput): string {
  const lines: string[] = [
    '## Why',
    '',
    `Opened by the daily \`prod-error-autofix\` audit of **${input.appName}**, run ${input.dateStr}.`,
    ''
  ];

  if (input.kind === 'security') {
    lines.push(
      '## Findings',
      '',
      ...input.security.map(
        f =>
          `- \`${f.file}:${f.line}\` — **${f.severity}** / \`${f.category}\` — ${redactSecret(f.title)}\n` +
          `  ${redactSecret(f.why)}`
      ),
      ''
    );
  } else {
    lines.push(
      '## Declarations removed',
      '',
      ...input.cleanup.map(f => `- \`${f.file}:${f.line}\` — \`${f.rule}\` — ${redactSecret(f.message)}`),
      '',
      'Declarations only: no file was deleted and no export was removed. `require()` is',
      'dynamic in these trees, and reachability across one needs an analysis this audit',
      'does not yet run.',
      ''
    );
  }

  lines.push(
    '## What changed',
    '',
    redactSecret(input.agentSummary),
    '',
    '## Tests',
    '',
    input.jestLine,
    '',
    'The diff was checked against the findings above before this branch was pushed: a file',
    'no finding named, or any of `.env*`, a lockfile, `package.json`, `.gitlab-ci.yml`,',
    '`firebase.json` or `.firebaserc`, refuses the MR outright.',
    '',
    'No part of this has been reviewed by a person yet.'
  );

  return lines.join('\n');
}

const FORBIDDEN_RULE = [
  '- **Do not touch** `package.json`, any lockfile, `.gitlab-ci.yml`, `firebase.json`,',
  '  `.firebaserc`, or any `.env` file. A diff containing one of them is thrown away',
  '  unpushed, so editing one only loses your work.'
].join('\n');

export function buildSecurityFixPrompt(input: MrLaneInput): string {
  return [
    `# Fix these security findings — ${input.appName}`,
    '',
    'You are in a throwaway worktree of the repo. A read-only sweep produced the findings',
    'below and each citation was checked against this worktree. Fix them, and only them.',
    '',
    '## Findings',
    '',
    ...input.security.map(f =>
      [
        `### \`${f.file}:${f.line}\` — ${f.severity} / ${f.category}`,
        redactSecret(f.title),
        `Why it matters: ${redactSecret(f.why)}`,
        `Intended fix: ${redactSecret(f.fix)}`,
        ''
      ].join('\n')
    ),
    '## Rules',
    '',
    '- **Edit only the files listed above.** The diff is checked against that list and a',
    '  file outside it refuses the whole merge request, including the fixes that were right.',
    '- Do not create files. A new file is by definition outside the list.',
    '- Smallest diff that closes the finding. No refactoring, no drive-by cleanups.',
    FORBIDDEN_RULE,
    "- **Read this app's own `CLAUDE.md` and `.claude/skills/` first.** These five apps look",
    '  alike and differ in the details; another app’s conventions do not apply here.',
    '- Preserve existing response contracts unless the finding *is* the contract.',
    '',
    '## Reply',
    '',
    'After the edits, reply with a few sentences saying what you changed and what a reviewer',
    'should look at. No JSON.'
  ].join('\n');
}

export function buildCleanupPrompt(input: MrLaneInput, eligible: TriageFinding[]): string {
  return [
    `# Remove these unused declarations — ${input.appName}`,
    '',
    'You are in a throwaway worktree of the repo. eslint flagged each declaration below as',
    'unreferenced and a triage pass confirmed each one is reached no other way — not by a',
    'dynamic `require()`, not by a re-export. Remove them, and nothing else.',
    '',
    '## Declarations',
    '',
    ...eligible.map(f => `- \`${f.file}:${f.line}\` — ${f.message}`),
    '',
    '## Rules',
    '',
    '- **Remove the declaration only.** Do not delete any file, and do not remove any',
    '  `export` — a name exported from this repo can be imported from outside eslint’s view,',
    '  and `require()` is built from strings in these trees.',
    '- **Edit only the files listed above.** The diff is checked against that list and a file',
    '  outside it refuses the whole merge request.',
    '- Do not rename, reformat or reorder anything else in those files. The diff has to be',
    '  readable as "these lines went away".',
    '- If removing one leaves an import or a `const {a, b}` binding half-used, remove only the',
    '  dead half. If you cannot tell, leave that finding alone and say so in your reply.',
    FORBIDDEN_RULE,
    '',
    '## Reply',
    '',
    'After the edits, reply with a few sentences saying what you removed and anything you',
    'deliberately left alone. No JSON.'
  ].join('\n');
}

/** Tracked changes plus untracked files: a file the agent created is a change too. */
async function diffFiles(
  worktreeDir: string,
  timeoutMs: number,
  runner: Runner
): Promise<{ok: true; files: string[]} | {ok: false; detail: string}> {
  const tracked = await runner(['git', '-C', worktreeDir, 'diff', '--name-only'], timeoutMs);
  if (tracked.code !== 0) {
    return {ok: false, detail: (tracked.stderr || tracked.stdout).trim().slice(0, 300)};
  }
  const untracked = await runner(['git', '-C', worktreeDir, 'ls-files', '--others', '--exclude-standard'], timeoutMs);
  if (untracked.code !== 0) {
    return {ok: false, detail: (untracked.stderr || untracked.stdout).trim().slice(0, 300)};
  }
  const files = `${tracked.stdout}\n${untracked.stdout}`
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  return {ok: true, files: [...new Set(files)]};
}

export async function runMrLane(
  input: MrLaneInput & {kind: MrLaneKind},
  deps: MrLaneDeps
): Promise<MrLaneResult> {
  const {kind} = input;
  const cleanup = eligibleCleanup(input.lint, input.verdicts);
  const findingFiles = kind === 'security' ? input.security.map(f => f.file) : cleanup.map(f => f.file);
  const inScope = new Set(findingFiles);

  const branch = auditBranchName(kind, input.repo, input.dateStr);
  const worktreeDir = auditWorktreeDir(input.worktreeRoot, input.repo, kind, input.dateStr);
  const base: MrLaneResult = {
    kind,
    branch,
    worktreeDir,
    pushed: false,
    mrUrl: undefined,
    refusal: undefined,
    detail: undefined,
    files: [],
    costUsd: undefined
  };

  if (!inScope.size) {
    return {...base, refusal: 'nothing_to_fix', detail: `no ${kind} finding is eligible for an MR`};
  }

  const worktree = await deps.createWorktree(
    {repoPath: input.repoPath, baseBranch: input.baseBranch, branch, dir: worktreeDir, timeoutMs: input.timeouts.git},
    deps.runner
  );
  if (!worktree.ok) {
    return {...base, refusal: 'worktree_failed', detail: worktree.detail};
  }

  try {
    // Without this the repo's own jest cannot run in a fresh worktree at all, and a
    // baseline that cannot run reads as a red one.
    await deps.linkNodeModules({repoPath: input.repoPath, worktreeDir});

    // The only moment this worktree is both known-needed and still clean: measured
    // after the agent has run, a "baseline" measures the fix instead of the base.
    // Cached per (repo, base sha) because both lanes cut from the same commit and
    // one repo's suite takes minutes.
    const baseSha = worktree.value.baseSha;
    let baseline = deps.getBaseline(input.repo, baseSha);
    let baselineDetail: string | undefined;
    if (!baseline) {
      const measured = await deps.measureBaseline(
        {repoPath: worktreeDir, testCmd: input.testCmd, timeoutMs: input.timeouts.jest},
        deps.runner
      );
      if (measured.ok) {
        baseline = measured.failures;
        deps.putBaseline(input.repo, baseSha, baseline, input.nowMs);
      } else {
        baselineDetail = measured.detail;
      }
    }
    // Fail closed, the same stance `smokeGate` takes on `no_baseline`: an unmeasured
    // base is not "nothing was failing". Refused here rather than after the agent so
    // a run that can never push does not pay for one.
    if (!baseline) {
      return {
        ...base,
        refusal: 'no_baseline',
        detail:
          `could not measure ${input.repo}@${baseSha.slice(0, 8)}, so a pre-existing failure ` +
          `cannot be told from one this diff caused: ${baselineDetail ?? 'no detail'}`
      };
    }

    const agent = await deps.claude({
      prompt: kind === 'security' ? buildSecurityFixPrompt(input) : buildCleanupPrompt(input, cleanup),
      model: input.model,
      appendSystemPrompt: input.brainSlice,
      cwd: worktreeDir,
      allowedTools: FIX_TOOLS,
      // The worktree is the only writable directory; no add-dir widens that.
      addDirs: [],
      permissionMode: 'acceptEdits',
      timeoutMs: input.timeouts.agent
    });
    const costUsd = agent.costUsd;
    if (!agent.ok) {
      return {
        ...base,
        costUsd,
        refusal: 'agent_failed',
        detail: `${agent.failure ?? 'agent_error'}: ${agent.detail ?? ''}`.trim()
      };
    }

    const diff = await diffFiles(worktreeDir, input.timeouts.git, deps.runner);
    if (!diff.ok) {
      return {...base, costUsd, refusal: 'diff_failed', detail: diff.detail};
    }
    const files = diff.files;
    if (!files.length) {
      return {...base, costUsd, refusal: 'no_changes', detail: 'the agent left the worktree unchanged'};
    }

    // Scope before anything else that could pass: the promise this MR makes to its
    // reviewer is that it touches only what the report named.
    const stray = files.filter(f => !inScope.has(f));
    if (stray.length) {
      return {
        ...base,
        costUsd,
        files,
        refusal: 'out_of_scope',
        detail: `no ${kind} finding named: ${stray.join(', ')}`
      };
    }

    const forbidden = forbiddenAuditTouches(files);
    if (forbidden.length) {
      return {
        ...base,
        costUsd,
        files,
        refusal: 'forbidden_file',
        detail: `must never be modified by an auto MR: ${forbidden.join(', ')}`
      };
    }

    const jest = await deps.runJest(
      {repoPath: worktreeDir, testCmd: input.testCmd, extraArgs: [], timeoutMs: input.timeouts.jest},
      deps.runner
    );
    // A jest that could not run is not a pass — there is no comparison to make.
    if (!jest.summary) {
      return {
        ...base,
        costUsd,
        files,
        refusal: 'tests_failed',
        detail: jest.detail ?? 'jest did not produce a readable result'
      };
    }
    // Green is the wrong bar, not a stricter one. `blogs` master carries three
    // module-resolution suite failures (src/verify/jest.ts:57-58), so demanding green
    // refuses that repo's MR every morning forever and the report cannot tell that
    // apart from a fix that broke the tests. The question is whether THIS diff broke
    // something, which is the comparison `smokeGate` already makes for the Slack lane.
    const before = new Set(baseline);
    const newFailures = jest.summary.failures.filter(f => !before.has(f)).sort();
    if (newFailures.length) {
      return {
        ...base,
        costUsd,
        files,
        refusal: 'tests_failed',
        detail: `${newFailures.length} test(s) fail that passed on the base commit: ${newFailures.slice(0, 5).join(', ')}`
      };
    }
    const jestLine =
      `${jest.summary.totalTests} tests, ${jest.summary.failures.length} failing · ` +
      `baseline ${baseline.length} failing`;

    const cap = deps.checkCaps(input.repo, input.nowMs);
    if (!cap.allowed) {
      return {...base, costUsd, files, refusal: 'capped', detail: cap.detail ?? cap.cap};
    }

    const count = kind === 'security' ? input.security.length : cleanup.length;
    const opened = await deps.openMr(
      {
        worktreeDir,
        branch,
        baseBranch: input.baseBranch,
        title: auditMrTitle(kind, input.appName, count),
        description: buildAuditMrBody({
          kind,
          appName: input.appName,
          dateStr: input.dateStr,
          security: input.security,
          cleanup,
          agentSummary: agent.text.trim().slice(0, 2000),
          jestLine
        }),
        timeoutMs: input.timeouts.git
      },
      deps.runner
    );

    // Counted the moment a branch reaches the remote, MR or not: the cap exists to
    // stop a storm of pushes, and a crash after this point must not lose the count.
    if (opened.pushed) deps.recordMr(input.repo, input.nowMs);

    if (opened.ok) {
      return {...base, costUsd, files, pushed: true, mrUrl: opened.mrUrl, refusal: undefined, detail: undefined};
    }
    return {
      ...base,
      costUsd,
      files,
      pushed: opened.pushed,
      mrUrl: opened.mrUrl,
      refusal: opened.pushed ? 'no_mr_url' : 'push_failed',
      detail: opened.detail
    };
  } finally {
    // A worktree is a full checkout — seven of them filled this machine's disk on
    // 2026-07-31. The branch ref lives in the main repo and survives the removal, so
    // a refused diff is still there to look at once it has been committed.
    await deps.commitWip(
      {worktreeDir, message: `wip: audit ${kind} lane, ${input.repo} ${input.dateStr}`, timeoutMs: input.timeouts.git},
      deps.runner
    );
    await deps.removeWorktree({repoPath: input.repoPath, dir: worktreeDir, timeoutMs: input.timeouts.git}, deps.runner);
  }
}

/**
 * Sequential, not concurrent: both lanes cut a worktree from the same main checkout
 * and `git worktree add` takes that repo's index lock, so running them together
 * races for it. The cap is also read per lane, and a cap is a count of pushes that
 * have already happened.
 */
export async function runBothMrLanes(
  input: MrLaneInput,
  deps: MrLaneDeps
): Promise<{security: MrLaneResult; cleanup: MrLaneResult}> {
  const security = await runMrLane({...input, kind: 'security'}, deps);
  const cleanup = await runMrLane({...input, kind: 'cleanup'}, deps);
  return {security, cleanup};
}
