import {ANALYZE_TOOLS, spawnClaude, type ClaudeFailure, type ClaudeRunner} from '../agent/claudeCli';
import {extractJsonArray} from './securitySchema';
import type {LintFinding} from './eslint';

/**
 * Lane B's triage step: eslint says a symbol is unreferenced, but it cannot see a
 * dynamic `require()`, a re-export, or a deliberate placeholder. This asks a model,
 * per finding, whether the symbol is genuinely dead — because Task 8 turns a
 * `delete` verdict into an actual deletion in a merge request, every default here
 * has to point the safe way: away from deleting live code.
 */

export type Verdict = 'delete' | 'keep' | 'unsure';

const VERDICTS: Verdict[] = ['delete', 'keep', 'unsure'];

/** A LintFinding with the fingerprint the caller computed via `findingFp` — the
 * id this lane sends the agent and matches its answer back against. */
export interface TriageFinding extends LintFinding {
  fp: string;
}

export interface TriageVerdict {
  fp: string;
  verdict: Verdict;
  reason: string;
}

export type TriageLaneFailure = ClaudeFailure | 'invalid_answer';

/**
 * Measured failure: 851 findings in one `claude -p` call died with "killed
 * after 360000ms" — a context problem (one giant prompt), not a patience
 * problem, and the first run of every app starts with an empty ledger, so the
 * whole backlog looks like this. 50 keeps a batch's JSON block a few KB and, in
 * back-of-envelope terms, empirically finishes well inside a normal per-call
 * timeout; 851 findings becomes 18 sequential calls, still comfortably inside
 * the job's 45-minute per-app ceiling since each call is now cheap.
 */
export const TRIAGE_BATCH_SIZE = 50;

/** Findings run sequentially, never batched concurrently — see triage.ts
 * module comment / task instructions: this lane already runs alongside the
 * security lane inside a job with a 45-minute-per-app ceiling, so adding
 * fan-out here would fan out inside a fan-out. */
function batchFindings<T>(findings: T[], size: number): T[][] {
  // An empty finding list still gets one (empty) batch, not zero batches —
  // callers of runTriage rely on exactly one agent call happening either way.
  if (findings.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < findings.length; i += size) out.push(findings.slice(i, i + size));
  return out;
}

/** One batch's failure, folded into the whole-lane result so a report can say
 * how many of the batches a first run split into came back bad. */
export interface TriageBatchFailure {
  batchIndex: number;
  findingCount: number;
  failure: TriageLaneFailure;
  detail: string;
}

export interface TriageInput {
  appName: string;
  /** Also the agent's `cwd`, so `require()` targets and re-exports resolve. */
  worktreeDir: string;
  model: string;
  timeoutMs: number;
  brainSlice: string | undefined;
  findings: TriageFinding[];
}

export type TriageResult =
  | {
      ok: true;
      verdicts: TriageVerdict[];
      deletable: TriageVerdict[];
      costUsd: number | undefined;
      /** How many batches this run split into, and which of them (if any) failed
       * and fell back to `unsure` for their own findings only. Empty when every
       * batch answered — the ordinary, non-degraded case. Optional (not just
       * possibly-empty) so a hand-built TriageResult fixture from before batching
       * existed — e.g. in test/audit.job.test.ts, which this task may not touch —
       * still satisfies the type. `runTriage` itself always sets both. */
      totalBatches?: number;
      batchFailures?: TriageBatchFailure[];
    }
  | {
      ok: false;
      failure: TriageLaneFailure;
      detail: string;
      costUsd: number | undefined;
      /** Present even on a whole-lane failure: every batch failing is the
       * degenerate case of partial failure, not a different shape of result.
       * Optional for the same pre-batching-fixture reason as the `ok: true` arm. */
      totalBatches?: number;
      batchFailures?: TriageBatchFailure[];
    };

/** Read-only: this lane answers a question, it does not touch the worktree. No
 * gcloud either — triage reasons about the checked-out code, not about prod. */
export const TRIAGE_TOOLS: string[] = ANALYZE_TOOLS.filter(t => !t.startsWith('Bash(gcloud'));

export function buildTriagePrompt(input: TriageInput): string {
  const rows = input.findings.map(f => ({fp: f.fp, file: f.file, line: f.line, rule: f.rule, message: f.message}));
  return [
    `# Dead-code triage — ${input.appName}`,
    '',
    'You are in a throwaway worktree of the repo. Read only. Do not edit anything.',
    'eslint flagged each finding below as an unreferenced symbol (no-unused-vars) or an',
    'undefined one (no-undef). A no-undef finding is a MISSING IMPORT, not dead code —',
    'answer keep or unsure for those; nothing is ever deleted to fix one. eslint cannot',
    'see a dynamic `require()`, a re-export from',
    'a barrel file, or a deliberate placeholder kept for a documented reason — decide,',
    'per finding, whether the symbol is genuinely dead.',
    '',
    '## Verdicts',
    '',
    '- `delete` — no reference anywhere, including dynamic require(), re-export, or string-built import.',
    '- `keep` — reached another way: a dynamic require(), a re-export, a placeholder for a documented reason.',
    "- `unsure` — you could not tell. This is the safe answer when in doubt; it is never treated as delete.",
    '',
    '## Findings',
    '',
    '```json',
    JSON.stringify(rows, null, 2),
    '```',
    '',
    '## Answer',
    '',
    'Reply with a JSON array and nothing else — one entry per finding above, each carrying',
    "the finding's own `fp` back unchanged:",
    '',
    '```json',
    '[{"fp": "<the fp from above>", "verdict": "delete | keep | unsure", "reason": "one line"}]',
    '```',
    '',
    'A finding you leave out of the array is treated as unsure, never as delete.'
  ].join('\n');
}

function isVerdict(v: unknown): v is Verdict {
  return typeof v === 'string' && (VERDICTS as string[]).includes(v);
}

/**
 * Loose per-entry validation on purpose: a malformed entry (bad fp type, verdict
 * outside the enum) is dropped rather than failing the whole lane, because the
 * fallback for a dropped entry is `unsure` — already the safe default — not a
 * lost run. Only "the reply wasn't a JSON array at all" is a lane failure; see
 * the prose test in test/audit.triage.test.ts.
 */
function parseRawVerdicts(text: string): {fp: string; verdict: Verdict; reason: string}[] | undefined {
  const json = extractJsonArray(text);
  if (!json) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!Array.isArray(raw)) return undefined;

  const out: {fp: string; verdict: Verdict; reason: string}[] = [];
  for (const entry of raw) {
    const o = (entry ?? {}) as Record<string, unknown>;
    if (typeof o.fp !== 'string' || !isVerdict(o.verdict)) continue;
    out.push({fp: o.fp, verdict: o.verdict, reason: typeof o.reason === 'string' ? o.reason : ''});
  }
  return out;
}

type BatchOutcome =
  | {ok: true; verdicts: TriageVerdict[]; costUsd: number | undefined}
  | {ok: false; failure: TriageLaneFailure; detail: string; costUsd: number | undefined};

/** One `claude -p` call over one batch's findings — everything `runTriage` used
 * to do in a single shot, now scoped to `batch` instead of the whole backlog. */
async function runTriageBatch(input: TriageInput, batch: TriageFinding[], claude: ClaudeRunner): Promise<BatchOutcome> {
  const batchInput: TriageInput = {...input, findings: batch};
  const res = await claude({
    prompt: buildTriagePrompt(batchInput),
    model: input.model,
    appendSystemPrompt: input.brainSlice,
    cwd: input.worktreeDir,
    allowedTools: TRIAGE_TOOLS,
    addDirs: [],
    permissionMode: 'default',
    timeoutMs: input.timeoutMs
  });

  if (!res.ok) {
    return {
      ok: false,
      failure: res.failure ?? 'agent_error',
      detail: res.detail ?? 'the agent failed without saying why',
      costUsd: res.costUsd
    };
  }

  const raw = parseRawVerdicts(res.text);
  if (!raw) {
    // Prose is a failed batch, not "nothing to delete" — a silent empty result here
    // would read as "triaged, found nothing worth deleting" on a batch that never ran.
    return {
      ok: false,
      failure: 'invalid_answer',
      detail: res.text.trim().slice(0, 300) || 'the agent did not reply with a JSON array',
      costUsd: res.costUsd
    };
  }

  // Known fingerprints only, and only from THIS batch: a verdict for an fp we
  // never sent in this call — whether hallucinated or bled in from another
  // batch's answer — is not authorised to land here. Last one wins on a dupe.
  const byFp = new Map(raw.filter(v => v.fp).map(v => [v.fp, v] as const));
  const known = new Set(batch.map(f => f.fp));
  for (const fp of byFp.keys()) if (!known.has(fp)) byFp.delete(fp);

  // One entry per finding in this batch, always — a finding the agent never
  // answered comes back unsure rather than silently disappearing from the report.
  const verdicts: TriageVerdict[] = batch.map(f => {
    const v = byFp.get(f.fp);
    return v ? {fp: f.fp, verdict: v.verdict, reason: v.reason} : {fp: f.fp, verdict: 'unsure', reason: 'agent did not return a verdict for this finding'};
  });

  return {ok: true, verdicts, costUsd: res.costUsd};
}

export async function runTriage(input: TriageInput, claude: ClaudeRunner = spawnClaude): Promise<TriageResult> {
  const batches = batchFindings(input.findings, TRIAGE_BATCH_SIZE);
  const verdicts: TriageVerdict[] = [];
  const batchFailures: TriageBatchFailure[] = [];
  let costUsd: number | undefined;

  // Sequential on purpose (see TRIAGE_BATCH_SIZE's comment and the module-level
  // note above `batchFindings`): this lane is already one half of a fan-out.
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    const outcome = await runTriageBatch(input, batch, claude);
    if (outcome.costUsd !== undefined) costUsd = (costUsd ?? 0) + outcome.costUsd;

    if (outcome.ok) {
      verdicts.push(...outcome.verdicts);
      continue;
    }

    batchFailures.push({batchIndex: i, findingCount: batch.length, failure: outcome.failure, detail: outcome.detail});
    // A batch that failed outright degrades to the same safe default as a
    // finding the agent silently skipped — unsure — but only for ITS findings.
    // Before batching, one bad answer lost all 851; now it loses only its batch.
    for (const f of batch) {
      verdicts.push({fp: f.fp, verdict: 'unsure', reason: `triage batch failed: ${outcome.failure}`});
    }
  }

  if (batchFailures.length === batches.length) {
    // Every batch failed — the degenerate case of partial failure, and still a
    // named lane failure, not a silent "triaged, found nothing worth deleting."
    const first = batchFailures[0]!;
    return {
      ok: false,
      failure: first.failure,
      detail: `${batchFailures.length}/${batches.length} batch(es) failed; first failure (batch ${first.batchIndex}, ${first.findingCount} findings): ${first.failure}: ${first.detail}`,
      costUsd,
      totalBatches: batches.length,
      batchFailures
    };
  }

  // `no-undef` means a symbol is USED with nothing defining or importing it. The
  // repair is to add an import, never to remove anything, so such a finding is
  // reported and is never eligible for the cleanup MR whatever the agent voted.
  // Only `no-unused-vars` describes something that can be deleted.
  const deletableRules = new Set(input.findings.filter(f => f.rule === 'no-unused-vars').map(f => f.fp));

  return {
    ok: true,
    verdicts,
    deletable: verdicts.filter(v => v.verdict === 'delete' && deletableRules.has(v.fp)),
    costUsd,
    totalBatches: batches.length,
    batchFailures
  };
}
