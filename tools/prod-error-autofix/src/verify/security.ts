import {extractJson} from '../agent/analysisSchema';
import {spawnClaude, type ClaudeRunner} from '../agent/claudeCli';

/**
 * The last gate before a machine-written diff becomes a merge request.
 *
 * The smoke gate answers "does it work". Nothing before this asks "is it safe to
 * merge unattended", and that question is different in kind: a fix can pass every
 * test while hardcoding a token, widening an authorization check, or deleting the
 * webhook signature verification that was causing the error in the first place.
 * That last one is the realistic failure — the cheapest way to stop an endpoint
 * throwing is to stop it validating.
 *
 * Two layers, in this order:
 *
 *  1. Patterns over the diff. Free, deterministic, and testable. Only rules with a
 *     near-zero false-positive rate live here, because a gate that cries wolf on
 *     every job gets turned off.
 *  2. A model review of the same diff, read-only, with a deliberately high bar:
 *     "would a reviewer refuse to merge this", not "could this be nicer".
 *
 * Both block. `securityGate` never opens an MR it could not clear, and a review
 * that failed to run counts as not cleared — see `REVIEW_UNAVAILABLE_IS_A_BLOCK`.
 */

export interface Finding {
  /** Stable id, so the same problem reads the same way across incidents. */
  rule: string;
  file: string;
  /** Line in the post-image, best effort from the hunk header. */
  line: number;
  /** The offending line. Secret-shaped matches are redacted before this is stored. */
  excerpt: string;
  why: string;
}

export interface DiffLine {
  file: string;
  line: number;
  text: string;
}

/**
 * Added and removed lines, separately, because they mean opposite things.
 *
 * Scanning both together is the obvious mistake: a diff that *deletes* a hardcoded
 * token would be blocked for containing one.
 */
export function parseDiff(diff: string): {added: DiffLine[]; removed: DiffLine[]} {
  const added: DiffLine[] = [];
  const removed: DiffLine[] = [];
  let file = '';
  let newLine = 0;
  let oldLine = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      const path = raw.slice(4).trim();
      file = path === '/dev/null' ? file : path.replace(/^b\//, '');
      continue;
    }
    if (raw.startsWith('--- ')) continue;
    if (raw.startsWith('diff --git')) {
      const m = /diff --git a\/(\S+) b\/(\S+)/.exec(raw);
      if (m) file = m[2]!;
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      continue;
    }
    if (raw.startsWith('+')) {
      added.push({file, line: newLine, text: raw.slice(1)});
      newLine++;
    } else if (raw.startsWith('-')) {
      removed.push({file, line: oldLine, text: raw.slice(1)});
      oldLine++;
    } else if (raw.startsWith(' ')) {
      newLine++;
      oldLine++;
    }
  }
  return {added, removed};
}

interface Rule {
  rule: string;
  pattern: RegExp;
  why: string;
  /** Secret-shaped: the match is redacted before it reaches a log or Slack. */
  redact?: boolean;
}

/**
 * Credential formats only — never `password\s*=`.
 *
 * The generic shapes fire on fixtures, on variable names, and on the repo's own
 * config plumbing, and a gate that blocks every job is a gate that gets disabled.
 * A real-format token is worth blocking on even inside a test file: a string that
 * matches `xoxb-` is either a live secret or a test that will teach the next model
 * to write one.
 */
const SECRET_RULES: Rule[] = [
  {rule: 'private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, why: 'private key material in the diff', redact: true},
  {rule: 'slack-token', pattern: /\bxox[bpasr]-[A-Za-z0-9-]{10,}/, why: 'Slack token literal', redact: true},
  {rule: 'anthropic-key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/, why: 'Anthropic API key literal', redact: true},
  {rule: 'openai-key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/, why: 'OpenAI API key literal', redact: true},
  {rule: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/, why: 'GitHub token literal', redact: true},
  {rule: 'aws-key-id', pattern: /\bAKIA[0-9A-Z]{16}\b/, why: 'AWS access key id', redact: true},
  {rule: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/, why: 'Google API key literal', redact: true},
  {rule: 'gitlab-token', pattern: /\bglpat-[A-Za-z0-9_-]{20,}/, why: 'GitLab PAT literal', redact: true},
  {
    rule: 'db-url-credentials',
    pattern: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@/,
    why: 'connection string with an inline password',
    redact: true
  }
];

/**
 * Constructs that turn a data bug into a code-execution or trust bug. Each is
 * checked against added lines only.
 */
const DANGEROUS_RULES: Rule[] = [
  {rule: 'tls-verification-off', pattern: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/, why: 'disables TLS certificate verification'},
  {rule: 'eval', pattern: /(?:^|[^.\w])eval\s*\(|new\s+Function\s*\(/, why: 'evaluates a string as code'},
  {rule: 'shell-interpolation', pattern: /\b(?:execSync|exec|spawnSync)\s*\(\s*[`'"][^`'"]*\$\{/, why: 'builds a shell command by string interpolation'},
  {rule: 'firestore-rules-open', pattern: /allow\s+(?:read|write|create|update|delete)[^:]*:\s*if\s+true\b/, why: 'Firestore rule granted unconditionally'},
  {rule: 'wildcard-cors', pattern: /Access-Control-Allow-Origin['"]?\s*[,:]\s*['"]\*['"]/, why: 'CORS opened to every origin'},
  {rule: 'permissive-jwt', pattern: /algorithms\s*:\s*\[\s*['"]none['"]|verify\s*:\s*false/, why: 'signature verification turned off'}
];

/**
 * Removing one of these is the cheapest way to stop an endpoint from throwing, and
 * the alert this daemon reacts to is very often that exact throw. `1ph12wf`-class
 * fixes are why the gate looks at deletions at all.
 */
const REMOVED_CONTROL_RULES: Rule[] = [
  {rule: 'removed-signature-check', pattern: /verify(?:Webhook|Signature|Hmac)|validateHmac|hmac\.(?:digest|verify)|timingSafeEqual/i, why: 'deletes a signature or HMAC verification'},
  {rule: 'removed-auth-check', pattern: /\b(?:requireAuth|isAuthenticated|checkPermission|authorize|authenticate|verifyToken|verifyIdToken)\s*\(/, why: 'deletes an authentication or authorization call'},
  {rule: 'removed-shop-scope', pattern: /\.where\s*\(\s*['"]shopId['"]|shopId\s*[:=]\s*(?:ctx|req)\b/, why: 'deletes a per-shop scoping clause — a tenant isolation boundary'}
];

/** Paths where any change is worth a human deciding, whatever the content. */
const SENSITIVE_PATHS: {rule: string; pattern: RegExp; why: string}[] = [
  {rule: 'touches-secrets-file', pattern: /(^|\/)\.env|(^|\/)serviceAccount.*\.json$|(^|\/)credentials?\.(?:json|ya?ml)$/i, why: 'changes a credentials file'},
  {rule: 'touches-ci', pattern: /(^|\/)\.gitlab-ci\.ya?ml$|(^|\/)\.github\/workflows\//, why: 'changes CI configuration, which runs with deploy credentials'},
  {rule: 'touches-firestore-rules', pattern: /firestore\.rules$|storage\.rules$/, why: 'changes datastore access rules'}
];

/** Keeps a matched credential out of the incident record, the log and the Slack reply. */
export function redactSecret(text: string, match: string): string {
  const keep = match.slice(0, Math.min(6, match.length));
  return text.replace(match, `${keep}…<redacted ${match.length} chars>`).trim().slice(0, 200);
}

function apply(rules: Rule[], lines: DiffLine[]): Finding[] {
  const out: Finding[] = [];
  for (const line of lines) {
    for (const rule of rules) {
      const m = rule.pattern.exec(line.text);
      if (!m) continue;
      out.push({
        rule: rule.rule,
        file: line.file,
        line: line.line,
        excerpt: rule.redact ? redactSecret(line.text, m[0]) : line.text.trim().slice(0, 200),
        why: rule.why
      });
    }
  }
  return out;
}

/** Everything the patterns can decide, with no model call and no network. */
export function scanDiff(diff: string): Finding[] {
  const {added, removed} = parseDiff(diff);
  const findings = [
    ...apply(SECRET_RULES, added),
    ...apply(DANGEROUS_RULES, added),
    ...apply(REMOVED_CONTROL_RULES, removed)
  ];

  // A control that moved rather than went away is not a removal. Compared on the
  // whole added side, not line-for-line: a fix that rewrites a guard legitimately
  // changes its wording and its position.
  const addedText = added.map(a => a.text).join('\n');
  const kept = new Set(
    REMOVED_CONTROL_RULES.filter(r => r.pattern.test(addedText)).map(r => r.rule)
  );

  const files = new Set([...added, ...removed].map(l => l.file).filter(Boolean));
  for (const file of files) {
    for (const path of SENSITIVE_PATHS) {
      if (path.pattern.test(file)) {
        findings.push({rule: path.rule, file, line: 0, excerpt: file, why: path.why});
      }
    }
  }
  return findings.filter(f => !kept.has(f.rule));
}

/**
 * A review that did not run is not a review that passed.
 *
 * Same stance as the smoke gate's `no_baseline`: this daemon opens merge requests
 * with nobody watching, so every unanswered question resolves against the MR. The
 * cost of being wrong here is a job parked at `inconclusive`; the cost of failing
 * open is a machine-written credential leak with a green checkmark on it.
 */
export const REVIEW_UNAVAILABLE_IS_A_BLOCK = true;

export const REVIEW_TOOLS = ['Read', 'Grep', 'Glob', 'Bash(git diff:*)', 'Bash(git log:*)'];

export interface SecurityInput {
  diff: string;
  repoPath: string;
  appName: string;
  /** What the fix was meant to do — a reviewer needs the intent to judge the change. */
  rootCause: string;
  model: string;
  timeoutMs: number;
}

export type SecurityFailure = 'patterns' | 'review' | 'review_unavailable';

export interface SecurityOutcome {
  ok: boolean;
  failure: SecurityFailure | undefined;
  findings: Finding[];
  /** False when the model layer never got to run because the patterns already blocked. */
  reviewed: boolean;
  costUsd: number;
  detail: string | undefined;
}

export function buildReviewPrompt(input: SecurityInput): string {
  return [
    '# Security review of a machine-written patch',
    '',
    'This diff was written by an automated agent to fix a production error, and it will be',
    'pushed as a merge request with no human in the loop unless you stop it. You are the last',
    'reader before that happens.',
    '',
    '## What the fix was for',
    input.rootCause,
    '',
    '## The bar',
    '',
    'Report a finding only for something that would make a reviewer **refuse to merge**:',
    '',
    '- a credential, token or key written into the source',
    '- an authentication, authorization or signature check weakened, removed, or made bypassable',
    '- a tenant boundary crossed — data of one shop reachable by another',
    '- untrusted input reaching a shell, a query, a filesystem path, or an evaluator',
    '- a security control disabled to make the error go away rather than fixed',
    '- sensitive data (tokens, PII, full request bodies) newly written to logs',
    '',
    'Do NOT report: style, naming, missing tests, performance, error-handling polish,',
    'pre-existing issues the diff does not touch, or anything you would phrase as "could be',
    'improved". Those are not this gate. An empty findings list is the expected result and is',
    'a perfectly good answer.',
    '',
    'The diff is below in full. You may read the surrounding files in the worktree to check',
    'whether something is genuinely reachable before reporting it — a guard that exists one',
    'caller up means there is no finding.',
    '',
    '## Diff',
    '',
    '```diff',
    input.diff,
    '```',
    '',
    '## Reply',
    '',
    'JSON only, no prose around it:',
    '',
    '```json',
    '{"findings": [{"rule": "short-kebab-id", "file": "path/from/repo/root.js", "line": 12,',
    '  "why": "one sentence: what an attacker does, and what they get"}]}',
    '```',
    '',
    'Empty list if the patch is safe to merge:  {"findings": []}'
  ].join('\n');
}

export function parseReviewReply(text: string): {findings: Finding[]} | undefined {
  const json = extractJson(text);
  if (!json) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  // A reply with no `findings` key at all is malformed, not clean — the difference
  // matters, because one blocks and the other does not.
  if (!Array.isArray(o.findings)) return undefined;
  const findings: Finding[] = [];
  for (const item of o.findings) {
    const f = (item ?? {}) as Record<string, unknown>;
    const why = typeof f.why === 'string' ? f.why.trim() : '';
    if (!why) continue;
    findings.push({
      rule: typeof f.rule === 'string' && f.rule.trim() ? f.rule.trim().slice(0, 60) : 'review',
      file: typeof f.file === 'string' ? f.file.trim() : '',
      line: Number.isFinite(Number(f.line)) ? Number(f.line) : 0,
      excerpt: '',
      why: why.slice(0, 400)
    });
  }
  return {findings};
}

export async function securityGate(
  input: SecurityInput,
  deps: {claude?: ClaudeRunner} = {}
): Promise<SecurityOutcome> {
  const patternFindings = scanDiff(input.diff);
  if (patternFindings.length) {
    return {
      ok: false,
      failure: 'patterns',
      findings: patternFindings,
      reviewed: false,
      costUsd: 0,
      detail: `${patternFindings.length} vấn đề bắt bằng pattern: ${[...new Set(patternFindings.map(f => f.rule))].join(', ')}`
    };
  }

  const claude = deps.claude ?? spawnClaude;
  const res = await claude({
    prompt: buildReviewPrompt(input),
    model: input.model,
    appendSystemPrompt: undefined,
    cwd: input.repoPath,
    allowedTools: REVIEW_TOOLS,
    addDirs: [],
    permissionMode: undefined,
    timeoutMs: input.timeoutMs
  });
  const costUsd = res.costUsd ?? 0;

  if (!res.ok) {
    return {
      ok: !REVIEW_UNAVAILABLE_IS_A_BLOCK,
      failure: 'review_unavailable',
      findings: [],
      reviewed: false,
      costUsd,
      detail: `review không chạy được (${res.failure}): ${res.detail ?? ''}`.trim()
    };
  }

  const parsed = parseReviewReply(res.text);
  if (!parsed) {
    return {
      ok: !REVIEW_UNAVAILABLE_IS_A_BLOCK,
      failure: 'review_unavailable',
      findings: [],
      reviewed: false,
      costUsd,
      detail: 'review trả về thứ không phải JSON có key findings'
    };
  }

  if (parsed.findings.length) {
    return {
      ok: false,
      failure: 'review',
      findings: parsed.findings,
      reviewed: true,
      costUsd,
      detail: `${parsed.findings.length} vấn đề security từ review`
    };
  }

  return {ok: true, failure: undefined, findings: [], reviewed: true, costUsd, detail: undefined};
}

/** One line for the Slack reply, the MR body and the incident record. */
export function describeSecurity(outcome: SecurityOutcome): string {
  if (outcome.ok) return outcome.reviewed ? 'pattern sạch · review sạch' : 'pattern sạch · review bỏ qua';
  if (!outcome.findings.length) return outcome.detail ?? 'security gate chặn';
  return outcome.findings
    .map(f => `${f.rule} · ${f.file}${f.line ? `:${f.line}` : ''} — ${f.why}`)
    .join('\n');
}
