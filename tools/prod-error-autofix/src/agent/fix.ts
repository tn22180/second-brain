import type {Runner} from '../gcloud/run';
import {
  changedFiles,
  diffStat,
  diffText,
  forbiddenTouches,
  isTestFile,
  type ChangedFile
} from '../git/worktreeStatus';
import type {ParsedAlert} from '../parseAlert';
import type {Analysis} from './analysisSchema';
import {extractJson} from './analysisSchema';
import {FIX_TOOLS, spawnClaude, type ClaudeRunner} from './claudeCli';

/**
 * Writes the fix, on a confirmed root cause only.
 *
 * Cheaper model than ANALYZE on purpose: once the cause is pinned and cited, the
 * edit is mechanical, and the baseline diff gate behind this catches what a weaker
 * model gets wrong. What the stage is *not* allowed to do is decide what the bug is
 * — it never sees the log bundle, only the verified analysis.
 *
 * Nothing here trusts the agent's account of its own work: the outcome is read back
 * out of git.
 */

export interface FixInput {
  analysis: Analysis;
  alert: ParsedAlert;
  /** The worktree. Cwd for the agent, and the only directory it may write to. */
  repoPath: string;
  brainSlice: string;
  model: string;
  timeoutMs: number;
  attempt: number;
  /** Set on a retry: what was tried before and shipped without fixing it. */
  previousAttempt: {rootCause: string; diff: string | undefined} | undefined;
}

export type FixFailure =
  | 'agent_failed'
  | 'no_changes'
  | 'no_test_added'
  | 'touched_forbidden'
  | 'only_tests_changed';

export interface FixOutcome {
  ok: boolean;
  failure: FixFailure | undefined;
  detail: string | undefined;
  changed: ChangedFile[];
  testFiles: string[];
  sourceFiles: string[];
  diffStat: string;
  diff: string;
  costUsd: number;
  /** The agent's own words, for the MR body. Never used as verification. */
  summary: string;
  mrTitle: string;
  risks: string | undefined;
}

export function buildFixPrompt(input: FixInput): string {
  const {analysis, alert} = input;
  const parts: string[] = [
    '# Fix this, and only this',
    '',
    'The cause below is already confirmed: the citations were checked against this worktree and the',
    'log evidence was re-run. Do not re-litigate it, and do not go looking for other bugs.',
    '',
    '## Root cause',
    analysis.rootCause,
    '',
    '## Mechanism',
    analysis.mechanism,
    '',
    '## Code involved',
    ...analysis.citations.map(c => `- ${c.file}:${c.line} — ${c.why}`),
    '',
    '## How to reproduce it in a test',
    analysis.reproPlan,
    '',
    '## Intended shape of the fix',
    analysis.fixSketch,
    '',
    `## Context: ${alert.appName} ${alert.service ?? ''}`.trimEnd(),
    `The production error was: ${alert.message.split('\n')[0]}`,
    ''
  ];

  if (input.previousAttempt) {
    parts.push(
      '## A previous fix for this shipped and did not work',
      `previous root cause: ${input.previousAttempt.rootCause}`,
      'Do not reproduce that approach.',
      input.previousAttempt.diff ? '```diff\n' + input.previousAttempt.diff.slice(0, 4000) + '\n```' : '',
      ''
    );
  }

  parts.push(
    '## Rules',
    '1. **Smallest diff that fixes the cause.** No refactoring, no drive-by cleanups, no unrelated',
    '   fixes however tempting. Someone reviews this by hand.',
    '2. **Add a test that reproduces the bug** — failing before your change, passing after. Put it',
    '   where this repo already puts tests and follow the conventions you find there.',
    '3. **Do not touch** `package.json`, any lockfile, `.gitlab-ci.yml`, `firebase.json`,',
    '   `.firebaserc`, or any `.env`. CI installs immutably, so a dependency change breaks the',
    '   pipeline — and adding a dependency is a bigger decision than this bug.',
    '4. **Read this app’s own `CLAUDE.md` and `.claude/skills/` first.** These five apps look alike',
    '   and differ in the details; another app’s conventions do not apply here.',
    '5. Preserve existing response contracts unless the cause *is* the contract. Changing a status',
    '   code changes which path the frontend takes.',
    '',
    '## Reply',
    'After the edits, reply with this JSON object and nothing else:',
    '```json',
    '{"summary": "what you changed and why, a few sentences", "mrTitle": "fix(prod): ...", "risks": "what a reviewer should look at"}',
    '```'
  );

  return parts.filter(p => p !== '').join('\n');
}

interface FixReply {
  summary: string;
  mrTitle: string;
  risks: string | undefined;
}

export function parseFixReply(text: string, fallbackTitle: string): FixReply {
  const json = extractJson(text);
  if (json) {
    try {
      const o = JSON.parse(json) as Record<string, unknown>;
      const summary = typeof o.summary === 'string' && o.summary.trim() ? o.summary.trim() : text.trim().slice(0, 2000);
      const mrTitle =
        typeof o.mrTitle === 'string' && o.mrTitle.trim() ? o.mrTitle.trim().slice(0, 120) : fallbackTitle;
      const risks = typeof o.risks === 'string' && o.risks.trim() ? o.risks.trim() : undefined;
      return {summary, mrTitle, risks};
    } catch {
      // fall through — a malformed reply is cosmetic, the diff is what matters
    }
  }
  return {summary: text.trim().slice(0, 2000), mrTitle: fallbackTitle, risks: undefined};
}

/** `fix(prod): <cause>` — kept short enough to read in a merge request list. */
export function defaultMrTitle(analysis: Analysis, alert: ParsedAlert): string {
  const cause = analysis.rootCause.replace(/\s+/g, ' ').trim();
  const head = cause.length > 80 ? `${cause.slice(0, 77)}...` : cause;
  return `fix(prod): [${alert.appName}] ${head}`;
}

export async function fix(
  input: FixInput,
  deps: {claude?: ClaudeRunner; runner?: Runner} = {}
): Promise<FixOutcome> {
  const claude = deps.claude ?? spawnClaude;
  const empty = {
    changed: [] as ChangedFile[],
    testFiles: [] as string[],
    sourceFiles: [] as string[],
    diffStat: '',
    diff: '',
    summary: '',
    mrTitle: defaultMrTitle(input.analysis, input.alert),
    risks: undefined
  };

  const res = await claude({
    prompt: buildFixPrompt(input),
    model: input.model,
    appendSystemPrompt: input.brainSlice,
    cwd: input.repoPath,
    allowedTools: FIX_TOOLS,
    // The worktree is the only writable directory; no add-dir widens that.
    addDirs: [],
    permissionMode: 'acceptEdits',
    timeoutMs: input.timeoutMs
  });

  const costUsd = res.costUsd ?? 0;
  if (!res.ok) {
    return {
      ...empty,
      ok: false,
      failure: 'agent_failed',
      detail: `${res.failure}: ${res.detail ?? ''}`.trim(),
      costUsd
    };
  }

  const changed = await changedFiles(input.repoPath, deps.runner);
  const paths = changed.map(c => c.path);
  const reply = parseFixReply(res.text, defaultMrTitle(input.analysis, input.alert));
  const base = {
    changed,
    testFiles: paths.filter(isTestFile),
    sourceFiles: paths.filter(p => !isTestFile(p)),
    diffStat: await diffStat(input.repoPath, deps.runner),
    diff: await diffText(input.repoPath, deps.runner),
    summary: reply.summary,
    mrTitle: reply.mrTitle,
    risks: reply.risks,
    costUsd
  };

  if (!changed.length) {
    return {...base, ok: false, failure: 'no_changes', detail: 'the worktree is unchanged'};
  }

  const forbidden = forbiddenTouches(paths);
  if (forbidden.length) {
    return {
      ...base,
      ok: false,
      failure: 'touched_forbidden',
      detail: `must not be modified by an auto MR: ${forbidden.join(', ')}`
    };
  }

  if (!base.testFiles.length) {
    return {
      ...base,
      ok: false,
      failure: 'no_test_added',
      detail: 'no test file was added or modified, so nothing proves the bug is gone'
    };
  }

  if (!base.sourceFiles.length) {
    return {
      ...base,
      ok: false,
      failure: 'only_tests_changed',
      detail: 'only tests changed — a test alone does not fix a production error'
    };
  }

  return {...base, ok: true, failure: undefined, detail: undefined};
}
