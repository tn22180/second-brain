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
  | {ok: true; verdicts: TriageVerdict[]; deletable: TriageVerdict[]; costUsd: number | undefined}
  | {ok: false; failure: TriageLaneFailure; detail: string; costUsd: number | undefined};

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

export async function runTriage(input: TriageInput, claude: ClaudeRunner = spawnClaude): Promise<TriageResult> {
  const res = await claude({
    prompt: buildTriagePrompt(input),
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
    // Prose is a failed lane, not "nothing to delete" — a silent empty result here
    // would read as "triaged, found nothing worth deleting" on a run that never ran.
    return {
      ok: false,
      failure: 'invalid_answer',
      detail: res.text.trim().slice(0, 300) || 'the agent did not reply with a JSON array',
      costUsd: res.costUsd
    };
  }

  // Known fingerprints only: a verdict for an fp we never sent is a hallucinated
  // id and must not authorise anything. Last one wins on a duplicate answer.
  const byFp = new Map(raw.filter(v => v.fp).map(v => [v.fp, v] as const));
  const known = new Set(input.findings.map(f => f.fp));
  for (const fp of byFp.keys()) if (!known.has(fp)) byFp.delete(fp);

  // One entry per input finding, always — a finding the agent never answered
  // comes back unsure rather than silently disappearing from the report.
  const verdicts: TriageVerdict[] = input.findings.map(f => {
    const v = byFp.get(f.fp);
    return v ? {fp: f.fp, verdict: v.verdict, reason: v.reason} : {fp: f.fp, verdict: 'unsure', reason: 'agent did not return a verdict for this finding'};
  });

  // `no-undef` means a symbol is USED with nothing defining or importing it. The
  // repair is to add an import, never to remove anything, so such a finding is
  // reported and is never eligible for the cleanup MR whatever the agent voted.
  // Only `no-unused-vars` describes something that can be deleted.
  const deletableRules = new Set(input.findings.filter(f => f.rule === 'no-unused-vars').map(f => f.fp));

  return {
    ok: true,
    verdicts,
    deletable: verdicts.filter(v => v.verdict === 'delete' && deletableRules.has(v.fp)),
    costUsd: res.costUsd
  };
}
