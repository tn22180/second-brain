/**
 * The contract Lane A has to satisfy, and the redaction every finding passes
 * through on the way in.
 *
 * Same discipline as `src/agent/analysisSchema.ts`: collect every error rather
 * than throwing on the first, because the caller reports the whole list back to
 * the agent and a one-error-at-a-time loop burns a round per field.
 *
 * This lane answers with an ARRAY, so it cannot reuse that module's `extractJson`
 * — that one rejects arrays on purpose (`analysisSchema.ts:61`).
 */

export type SecuritySeverity = 'high' | 'medium' | 'low';

export type SecurityCategory =
  | 'shop_scoping'
  | 'untrusted_input'
  | 'secret'
  | 'secret_in_log'
  | 'authn'
  | 'other';

export interface SecurityFinding {
  file: string;
  line: number;
  severity: SecuritySeverity;
  category: SecurityCategory;
  title: string;
  why: string;
  fix: string;
}

export type SecurityValidation =
  | {ok: true; value: SecurityFinding[]}
  | {ok: false; errors: string[]};

export const SEVERITIES: SecuritySeverity[] = ['high', 'medium', 'low'];

export const CATEGORIES: SecurityCategory[] = [
  'shop_scoping',
  'untrusted_input',
  'secret',
  'secret_in_log',
  'authn',
  'other'
];

/**
 * Ordered most specific first: a vendor-prefixed key is consumed whole before the
 * bare-blob rules get a chance to eat only its tail.
 *
 * The two bare-blob rules exclude `/` and `.` and demand both a digit and a letter
 * so that a file path, a dotted identifier or a long camelCase symbol survives.
 * A redaction that eats the `file:line` of a finding makes it unactionable, which
 * is how a blunt rule gets switched off.
 */
const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  // The separator is `[_-]`, not `_`: GitLab PATs are `glpat-` and Anthropic keys
  // are `sk-ant-…`, and a hyphen-only rule would have let both through whole.
  /\b(?:shpat|shpca|shpss|shppa|shpsa|github_pat|glpat|sk|pk|rk|ghp|gho|ghu|ghs|ghr)[_-][A-Za-z0-9_-]{8,}/gi,
  /\bxox[abeoprs]-[A-Za-z0-9-]{10,}/gi,
  /\bAIza[A-Za-z0-9_-]{20,}/g,
  /\b[0-9a-f]{32,}\b/gi,
  /\b(?=[A-Za-z0-9+_]*\d)(?=[A-Za-z0-9+_]*[A-Za-z])[A-Za-z0-9+_]{32,}={0,2}/g
];

/**
 * Called where a finding is BUILT, not where it is sent. `audit_findings.title`
 * is persisted to `state.db`; a value stripped only on the way to Telegram would
 * already be on disk.
 */
export function redactSecret(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, '<redacted>');
  return out;
}

/**
 * Takes the last balanced array in the text — the last one, because a model that
 * restates the schema before answering puts the real answer second.
 *
 * The greedy first-bracket-to-last-bracket span goes in first so it is tried
 * LAST: it is the fallback for a `]` inside a string throwing off the depth scan.
 */
export function extractJsonArray(text: string): string | undefined {
  const candidates: string[] = [];

  const first = text.indexOf('[');
  const last = text.lastIndexOf(']');
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));

  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) candidates.push(m[1]!.trim());

  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, i + 1));
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }

  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i]!;
    try {
      if (Array.isArray(JSON.parse(candidate))) return candidate;
    } catch {
      // keep looking
    }
  }
  return undefined;
}

export function validateSecurityFindings(raw: unknown): SecurityValidation {
  if (!Array.isArray(raw)) {
    return {ok: false, errors: ['the answer must be a JSON array of findings']};
  }

  const errors: string[] = [];
  const value: SecurityFinding[] = [];

  raw.forEach((entry, i) => {
    const o = (entry ?? {}) as Record<string, unknown>;

    const str = (key: 'file' | 'title' | 'why' | 'fix', note: string): string => {
      const v = o[key];
      if (typeof v !== 'string' || !v.trim()) {
        errors.push(`findings[${i}].${key} ${note}`);
        return '';
      }
      return v.trim();
    };

    const file = str('file', 'must be a repo-relative path');
    const title = str('title', 'must be a one-line statement of the problem');
    const why = str('why', 'must say what an attacker gets');
    const fix = str('fix', 'must say what to change');

    const lineRaw = o.line;
    const line = typeof lineRaw === 'number' ? lineRaw : Number(lineRaw);
    if (!Number.isInteger(line) || line < 1) {
      errors.push(`findings[${i}].line must be a positive integer`);
    }

    const severity = o.severity;
    if (typeof severity !== 'string' || !SEVERITIES.includes(severity as SecuritySeverity)) {
      errors.push(`findings[${i}].severity must be one of ${SEVERITIES.join(', ')}`);
    }

    const category = o.category;
    if (typeof category !== 'string' || !CATEGORIES.includes(category as SecurityCategory)) {
      errors.push(`findings[${i}].category must be one of ${CATEGORIES.join(', ')}`);
    }

    if (file && title && why && fix && Number.isInteger(line) && line >= 1) {
      value.push({
        file,
        line,
        severity: severity as SecuritySeverity,
        category: category as SecurityCategory,
        // Redacted here, at construction: nothing downstream is trusted to remember.
        title: redactSecret(title),
        why: redactSecret(why),
        fix: redactSecret(fix)
      });
    }
  });

  if (errors.length) return {ok: false, errors};
  return {ok: true, value};
}

export function validateSecurity(text: string): SecurityValidation {
  const json = extractJsonArray(text);
  if (!json) return {ok: false, errors: ['no JSON array found in the reply']};
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return {ok: false, errors: [`JSON did not parse: ${(e as Error).message}`]};
  }
  return validateSecurityFindings(raw);
}
