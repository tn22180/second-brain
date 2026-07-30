import {spawnRunner, type Runner} from '../gcloud/run';

/**
 * Commits the fix and opens the merge request with **git push options**.
 *
 * No GitLab API: `glab auth status` on this machine returns 401 with no token in
 * the config, keyring or environment, while git operations are configured over SSH.
 * Push options need nothing but the SSH key, which is also why the MR URL has to be
 * scraped out of the push output rather than read from a response body.
 */

export interface OpenMrInput {
  /** The worktree, not the main checkout. */
  worktreeDir: string;
  branch: string;
  baseBranch: string;
  title: string;
  description: string;
  timeoutMs: number;
}

export interface OpenMrResult {
  ok: boolean;
  mrUrl: string | undefined;
  fixSha: string | undefined;
  pushed: boolean;
  failure: 'nothing_to_commit' | 'commit_failed' | 'push_failed' | 'no_mr_url' | 'refused' | undefined;
  detail: string | undefined;
}

/** GitLab truncates long push-option values; the full write-up goes in the thread. */
const MAX_DESCRIPTION = 4000;

/**
 * On a successful push with `merge_request.create`, GitLab answers:
 *
 *   remote: View merge request for fix/prod-blog-abc:
 *   remote:   https://gitlab.com/avada/blogs/-/merge_requests/123
 *
 * A URL under `/-/merge_requests/new?...` is a *link to create one by hand* — what
 * GitLab prints when no push option was used — so only a numeric id counts as an
 * MR that exists.
 */
export function parseMrUrl(output: string): string | undefined {
  const match = /https?:\/\/\S*?\/-\/merge_requests\/(\d+)\b/.exec(output);
  return match ? match[0]!.replace(/[).,;'"]+$/, '') : undefined;
}

export function isCreateLinkOnly(output: string): boolean {
  return /\/-\/merge_requests\/new\b/.test(output) && parseMrUrl(output) === undefined;
}

export async function openMr(input: OpenMrInput, runner: Runner = spawnRunner): Promise<OpenMrResult> {
  const git = (args: string[]) => runner(['git', '-C', input.worktreeDir, ...args], input.timeoutMs);

  if (!input.branch.startsWith('fix/prod-')) {
    return {
      ok: false,
      mrUrl: undefined,
      fixSha: undefined,
      pushed: false,
      failure: 'refused',
      detail: `branch ${input.branch} is not a fix/prod-* branch`
    };
  }
  if (input.branch === input.baseBranch) {
    return {
      ok: false,
      mrUrl: undefined,
      fixSha: undefined,
      pushed: false,
      failure: 'refused',
      detail: 'refusing to push onto the base branch'
    };
  }

  const added = await git(['add', '-A']);
  if (added.code !== 0) {
    return {
      ok: false,
      mrUrl: undefined,
      fixSha: undefined,
      pushed: false,
      failure: 'commit_failed',
      detail: (added.stderr || added.stdout).trim().slice(0, 300)
    };
  }

  const staged = await git(['diff', '--cached', '--name-only']);
  if (!staged.stdout.trim()) {
    return {
      ok: false,
      mrUrl: undefined,
      fixSha: undefined,
      pushed: false,
      failure: 'nothing_to_commit',
      detail: 'nothing staged after git add -A'
    };
  }

  const committed = await git(['commit', '-m', input.title, '-m', input.description]);
  if (committed.code !== 0) {
    return {
      ok: false,
      mrUrl: undefined,
      fixSha: undefined,
      pushed: false,
      failure: 'commit_failed',
      detail: (committed.stderr || committed.stdout).trim().slice(0, 300)
    };
  }
  const head = await git(['rev-parse', 'HEAD']);
  const fixSha = head.code === 0 ? head.stdout.trim() : undefined;

  const pushed = await git([
    'push',
    '-o',
    'merge_request.create',
    '-o',
    `merge_request.target=${input.baseBranch}`,
    '-o',
    `merge_request.title=${input.title}`,
    '-o',
    `merge_request.description=${input.description.slice(0, MAX_DESCRIPTION)}`,
    '-o',
    'merge_request.remove_source_branch',
    '--set-upstream',
    'origin',
    `HEAD:refs/heads/${input.branch}`
  ]);

  // GitLab writes the MR block to stderr, alongside the usual push progress.
  const output = `${pushed.stderr}\n${pushed.stdout}`;
  if (pushed.code !== 0) {
    return {
      ok: false,
      mrUrl: parseMrUrl(output),
      fixSha,
      pushed: false,
      failure: 'push_failed',
      detail: (pushed.stderr || pushed.stdout).trim().slice(0, 500)
    };
  }

  const mrUrl = parseMrUrl(output);
  if (!mrUrl) {
    // The branch is on the remote either way; say so, so the work is not lost.
    return {
      ok: false,
      mrUrl: undefined,
      fixSha,
      pushed: true,
      failure: 'no_mr_url',
      detail: isCreateLinkOnly(output)
        ? 'push succeeded but GitLab only offered a create-by-hand link — the merge_request.create push option did not take'
        : `push succeeded, no merge request URL in the output: ${output.trim().slice(0, 300)}`
    };
  }

  return {ok: true, mrUrl, fixSha, pushed: true, failure: undefined, detail: undefined};
}

export interface MrBodyInput {
  appName: string;
  service: string | undefined;
  fingerprint: string;
  rootCause: string;
  mechanism: string;
  citations: {file: string; line: number; why: string}[];
  evidence: {logQuery: string; matched: number}[];
  agentSummary: string;
  risks: string | undefined;
  smokeLine: string;
  logsUrl: string | undefined;
  threadUrl: string | undefined;
  attempt: number;
}

/** The MR body. Written for the human who has to review it, not for a bot. */
export function buildMrBody(input: MrBodyInput): string {
  const lines: string[] = [
    '## Why',
    '',
    `Production error on **${input.appName}**${input.service ? ` (\`${input.service}\`)` : ''}, opened`,
    `automatically from the \`#prod-errors\` alert. Fingerprint \`${input.fingerprint}\`` +
      (input.attempt > 1 ? `, attempt ${input.attempt} — an earlier fix shipped and the error survived it.` : '.'),
    '',
    '**Root cause.** ' + input.rootCause,
    '',
    '**Mechanism.** ' + input.mechanism,
    '',
    '## Evidence',
    '',
    ...input.evidence.map(e => `- ${e.matched} matching log entries: \`${e.logQuery}\``),
    '',
    '## Code',
    '',
    ...input.citations.map(c => `- \`${c.file}:${c.line}\` — ${c.why}`),
    '',
    '## What changed',
    '',
    input.agentSummary,
    '',
    '## Tests',
    '',
    input.smokeLine,
    '',
    'The reproduce test was run with the source change reverted and it failed there, so it does',
    'exercise the bug rather than the fix.'
  ];

  if (input.risks) lines.push('', '## For the reviewer', '', input.risks);

  const links: string[] = [];
  if (input.logsUrl) links.push(`[Logs Explorer](${input.logsUrl})`);
  if (input.threadUrl) links.push(`[Slack thread](${input.threadUrl})`);
  if (links.length) lines.push('', '---', '', links.join(' · '));

  lines.push(
    '',
    'Opened by `prod-error-autofix`. The analysis was produced under a verification loop —',
    'every citation above resolves in this branch and every log query above was re-run — but no',
    'part of this has been reviewed by a person yet.'
  );

  return lines.join('\n');
}
