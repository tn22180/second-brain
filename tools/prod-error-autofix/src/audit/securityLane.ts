import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {ANALYZE_TOOLS, spawnClaude, type ClaudeFailure, type ClaudeRunner} from '../agent/claudeCli';
import {validateSecurity, type SecurityFinding} from './securitySchema';

/**
 * Lane A of the daily audit: one read-only sweep of a whole repo for the five
 * surfaces that matter in a Shopify app on Firestore.
 *
 * Scope is the repo, not a diff — this is a sweep, not a review of one change.
 * The prompt names the surfaces to keep that bounded; without them the agent
 * wanders and reports style.
 */

/** `ANALYZE_TOOLS` minus gcloud: the audit reads code, it does not query prod. */
export const SECURITY_TOOLS: string[] = ANALYZE_TOOLS.filter(t => !t.startsWith('Bash(gcloud'));

/** Repo-relative. Four of the five repos have one; `blogs` has no `.claude/` at all. */
export const SECURITY_SKILL_PATH = join('.claude', 'skills', 'security');

export interface SecurityLaneInput {
  appName: string;
  /** Also the agent's `cwd`, which is what makes the repo's own skills load. */
  worktreeDir: string;
  model: string;
  timeoutMs: number;
  brainSlice: string | undefined;
  /**
   * Injected so the lane is testable without a checkout on disk. Takes an
   * absolute path.
   */
  fileExists?: (absPath: string) => boolean;
}

export type SecurityLaneFailure = ClaudeFailure | 'invalid_answer';

interface LaneCommon {
  /** False means this repo was swept without its own security skill loaded. */
  hasSecuritySkill: boolean;
  costUsd: number | undefined;
}

export type SecurityLaneResult =
  | (LaneCommon & {
      ok: true;
      findings: SecurityFinding[];
      /** Findings whose `file` did not resolve in the worktree. */
      dropped: number;
    })
  | (LaneCommon & {
      ok: false;
      failure: SecurityLaneFailure;
      detail: string;
      errors: string[];
    });

export function buildSecurityPrompt(input: SecurityLaneInput): string {
  return [
    `# Security sweep — ${input.appName}`,
    '',
    'You are in a throwaway worktree of the repo. Read only. Do not edit anything.',
    "Read this repo's own CLAUDE.md and .claude/skills/security first — they are the",
    'authority on how this app is built; anything below is the shape of the answer.',
    '',
    '## Surfaces to sweep, in this order',
    '',
    '1. `shop_scoping` — a Firestore query, handler or bulk job that reads or writes',
    "   without filtering on the caller's own shop id. Cross-shop IDOR is the top risk",
    '   in this fleet.',
    '2. `untrusted_input` — shop domain, plan, quota, price, credit balance or role taken',
    '   from the request body/query instead of from the session or Firestore.',
    '3. `secret` — a literal key, token or service-account JSON in the tree, including in',
    '   comments, fixtures, docs and test files.',
    '4. `secret_in_log` — a logger, error report or command line printing a token, a whole',
    '   config object, or a full request header.',
    '5. `authn` — an endpoint with no authentication or the wrong one, and webhook handlers',
    '   with no HMAC verification.',
    '',
    '## Rules',
    '',
    '- Every finding must name a `file:line` that exists in this worktree. A citation that',
    '  does not resolve is dropped, so an invented one buys you nothing.',
    '- Report the location and the kind of a secret. **Never quote the value.**',
    '- No style, no performance, no dead code — another lane owns those.',
    '',
    '## Answer',
    '',
    'Reply with a JSON array and nothing else. No prose before or after it.',
    'A clean repo is `[]` — that is a valid and expected answer, and much better than a',
    'padded one.',
    '',
    '```json',
    '[',
    '  {',
    '    "file": "packages/functions/src/handlers/x.js",',
    '    "line": 42,',
    '    "severity": "high | medium | low",',
    '    "category": "shop_scoping | untrusted_input | secret | secret_in_log | authn | other",',
    '    "title": "one line, what is wrong",',
    '    "why": "what an attacker gets, in one or two sentences",',
    '    "fix": "what to change"',
    '  }',
    ']',
    '```'
  ].join('\n');
}

export async function runSecurityLane(
  input: SecurityLaneInput,
  claude: ClaudeRunner = spawnClaude
): Promise<SecurityLaneResult> {
  const exists = input.fileExists ?? existsSync;
  const hasSecuritySkill = exists(join(input.worktreeDir, SECURITY_SKILL_PATH));

  const res = await claude({
    prompt: buildSecurityPrompt(input),
    model: input.model,
    appendSystemPrompt: input.brainSlice,
    cwd: input.worktreeDir,
    allowedTools: SECURITY_TOOLS,
    addDirs: [],
    permissionMode: 'default',
    timeoutMs: input.timeoutMs
  });

  if (!res.ok) {
    return {
      ok: false,
      failure: res.failure ?? 'agent_error',
      detail: res.detail ?? 'the agent failed without saying why',
      errors: [],
      hasSecuritySkill,
      costUsd: res.costUsd
    };
  }

  const parsed = validateSecurity(res.text);
  if (!parsed.ok) {
    // Prose is a failed lane, not a clean repo. Reporting it as zero findings
    // would read as "swept, nothing found" on a morning nothing was swept.
    return {
      ok: false,
      failure: 'invalid_answer',
      detail: parsed.errors.slice(0, 5).join('; '),
      errors: parsed.errors,
      hasSecuritySkill,
      costUsd: res.costUsd
    };
  }

  const findings: SecurityFinding[] = [];
  let dropped = 0;
  for (const f of parsed.value) {
    // Dropped, never downgraded: an agent that invents a citation to look useful
    // is worse than one that finds nothing.
    if (exists(join(input.worktreeDir, f.file))) findings.push(f);
    else dropped++;
  }

  return {ok: true, findings, dropped, hasSecuritySkill, costUsd: res.costUsd};
}
