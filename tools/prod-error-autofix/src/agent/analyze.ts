import type {Runner} from '../gcloud/run';
import type {LogBundle} from '../gcloud/logs';
import {summarize} from '../gcloud/logs';
import type {ParsedAlert} from '../parseAlert';
import {parseAnalysis, type Analysis} from './analysisSchema';
import {ANALYZE_TOOLS, spawnClaude, type ClaudeRunner} from './claudeCli';
import {verifyAnalysis, type VerifyReport} from './verify';

/**
 * The bounded research loop.
 *
 * Up to N rounds. Each round must produce a schema-valid `analysis.json` whose
 * citations resolve on disk and whose evidence queries still match. Anything that
 * fails is fed back as a named rejection, so a round is only ever spent on new
 * information.
 *
 * Running out of rounds is a legitimate outcome: the triage this project is seeded
 * from got 4 of 7 endpoint hypotheses wrong from static reading alone, and only the
 * logs settled them. An unexplained error reported honestly beats a confident MR
 * built on a guess.
 */

export interface AnalyzeInput {
  alert: ParsedAlert;
  fingerprint: string;
  repoPath: string;
  projectId: string;
  brainSlice: string;
  logs: LogBundle | undefined;
  logsPath: string | undefined;
  model: string;
  maxRounds: number;
  timeoutMs: number;
  gcloudTimeoutMs: number;
  /** Diff and outcome of a previous attempt whose fix reached prod and failed. */
  previousAttempt: {mrUrl: string | undefined; rootCause: string; diff: string | undefined} | undefined;
}

export interface AnalyzeRound {
  round: number;
  ok: boolean;
  errors: string[];
  analysis: Analysis | undefined;
  verify: VerifyReport | undefined;
  costUsd: number | undefined;
}

export interface AnalyzeOutcome {
  ok: boolean;
  analysis: Analysis | undefined;
  rounds: AnalyzeRound[];
  totalCostUsd: number;
  /** Present when ok is false. */
  reason: 'inconclusive' | 'agent_failed' | undefined;
  detail: string | undefined;
}

export function buildAnalyzePrompt(input: AnalyzeInput, round: number, rejections: string[]): string {
  const {alert} = input;
  const parts: string[] = [];

  parts.push(
    `# Round ${round} of ${input.maxRounds}`,
    '',
    '## The alert',
    `app: ${alert.appName}`,
    `service: ${alert.service ?? '(unknown — the alert arrived in a degraded form)'}`,
    `severity: ${alert.severity}`,
    `kind: ${alert.kind}${alert.kind === 'infra' ? ' — infra class, report only, no code fix' : ''}`,
    `occurrences in the sender window: ${alert.totalCount}${alert.suppressed ? ` (+${alert.suppressed} suppressed)` : ''}`,
    `prod project: ${input.projectId}`,
    `parse confidence: ${alert.source}${alert.source === 'short' ? ' — fields below the app name may be missing or re-derived' : ''}`,
    '',
    '### Message',
    '```',
    alert.message,
    '```'
  );

  if (input.logs) {
    parts.push(
      '',
      '## Logs already pulled for you',
      `window ${input.logs.fromIso} → ${input.logs.toIso}`,
      `counts: ${summarize(input.logs)}`,
      input.logsPath ? `full JSON on disk: ${input.logsPath}` : '',
      '',
      'Filters used:',
      ...input.logs.queries.map(q => `- ${q.name}: ${q.filter}`),
      '',
      'You may run further `gcloud logging read` queries against this project.'
    );
    const samples = input.logs.queries
      .flatMap(q => q.entries.slice(0, 3).map(e => ({q: q.name, e})))
      .slice(0, 9);
    if (samples.length) {
      parts.push('', '### Samples');
      for (const {q, e} of samples) {
        parts.push(
          `- [${q}] ${e.timestamp ?? '?'} ${e.severity ?? ''} ${e.tag ?? ''} ${e.status ?? ''} ${e.method ?? ''} ${e.url ?? ''}`.trim(),
          e.message ? `  ${e.message.split('\n')[0]}` : '',
          e.stack ? `  stack: ${e.stack.split('\n').slice(0, 3).join(' / ')}` : ''
        );
      }
    }
  } else {
    parts.push('', '## Logs', 'No log bundle was available. Say so rather than inferring a cause from the code.');
  }

  if (input.previousAttempt) {
    parts.push(
      '',
      '## A previous fix for this same fingerprint reached prod and the error still fired',
      `previous root cause: ${input.previousAttempt.rootCause}`,
      input.previousAttempt.mrUrl ? `previous MR: ${input.previousAttempt.mrUrl}` : '',
      'Treat that root cause as **refuted**. Do not restate it.',
      input.previousAttempt.diff ? '```diff\n' + input.previousAttempt.diff.slice(0, 4000) + '\n```' : ''
    );
  }

  if (rejections.length) {
    parts.push(
      '',
      `## Your round ${round - 1} answer was rejected`,
      ...rejections.map(r => `- ${r}`),
      '',
      'Fix these specifically. Repeating a rejected citation or query wastes the round.'
    );
  }

  parts.push(
    '',
    '## Now',
    'Investigate in the worktree you are in. Read this app’s own CLAUDE.md and .claude/skills first.',
    'Reply with the `analysis.json` object and nothing else.'
  );

  return parts.filter(p => p !== '').join('\n');
}

export async function analyze(
  input: AnalyzeInput,
  deps: {claude?: ClaudeRunner; runner?: Runner} = {}
): Promise<AnalyzeOutcome> {
  const claude = deps.claude ?? spawnClaude;
  const rounds: AnalyzeRound[] = [];
  let rejections: string[] = [];
  let totalCostUsd = 0;

  for (let round = 1; round <= input.maxRounds; round++) {
    const prompt = buildAnalyzePrompt(input, round, rejections);
    const res = await claude({
      prompt,
      model: input.model,
      appendSystemPrompt: input.brainSlice,
      cwd: input.repoPath,
      allowedTools: ANALYZE_TOOLS,
      addDirs: [],
      // Read-only stage; nothing here should need to accept an edit.
      permissionMode: 'default',
      timeoutMs: input.timeoutMs
    });
    totalCostUsd += res.costUsd ?? 0;

    if (!res.ok) {
      rounds.push({
        round,
        ok: false,
        errors: [`agent failed: ${res.failure} — ${res.detail ?? ''}`.trim()],
        analysis: undefined,
        verify: undefined,
        costUsd: res.costUsd
      });
      // A timeout or a crashed CLI is not something the next prompt can fix.
      if (res.failure === 'timeout' || res.failure === 'nonzero') {
        return {
          ok: false,
          analysis: undefined,
          rounds,
          totalCostUsd,
          reason: 'agent_failed',
          detail: `${res.failure}: ${res.detail ?? ''}`.trim()
        };
      }
      rejections = ['your previous reply could not be read at all; reply with the JSON object only'];
      continue;
    }

    const parsed = parseAnalysis(res.text);
    if (!parsed.ok) {
      rounds.push({round, ok: false, errors: parsed.errors, analysis: undefined, verify: undefined, costUsd: res.costUsd});
      rejections = parsed.errors;
      continue;
    }

    const analysis = parsed.value;
    const verify = await verifyAnalysis(
      {
        repoRoot: input.repoPath,
        projectId: input.projectId,
        timeoutMs: input.gcloudTimeoutMs,
        // Nothing to re-run a query against if the bundle never loaded.
        requireEvidence: input.logs !== undefined
      },
      analysis,
      deps.runner
    );
    rounds.push({round, ok: verify.ok, errors: verify.rejections, analysis, verify, costUsd: res.costUsd});

    if (verify.ok) {
      return {ok: true, analysis, rounds, totalCostUsd, reason: undefined, detail: undefined};
    }
    rejections = verify.rejections;
  }

  const last = [...rounds].reverse().find(r => r.analysis);
  return {
    ok: false,
    analysis: last?.analysis,
    rounds,
    totalCostUsd,
    reason: 'inconclusive',
    detail: `${input.maxRounds} rounds without a verified root cause`
  };
}
