/**
 * The contract the ANALYZE stage has to satisfy. Validation is strict on purpose:
 * a malformed answer costs one more round, while a silently half-parsed one costs
 * an MR built on a cause nobody checked.
 */

export interface Citation {
  file: string;
  line: number;
  why: string;
}

export interface Evidence {
  logQuery: string;
  matched: number;
  sample: string | undefined;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface Analysis {
  rootCause: string;
  mechanism: string;
  citations: Citation[];
  evidence: Evidence[];
  confidence: Confidence;
  reproPlan: string;
  fixSketch: string;
  isInfra: boolean;
}

export type ValidationResult = {ok: true; value: Analysis} | {ok: false; errors: string[]};

/**
 * Agents wrap JSON in prose or fences however they like. Take the last balanced
 * object in the text — the last one, because a model that restates the schema
 * before answering puts the real answer second.
 */
export function extractJson(text: string): string | undefined {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(m => m[1]!.trim());
  const candidates = fenced.length ? fenced : [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i]!;
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return candidate;
    } catch {
      // keep looking
    }
  }
  return undefined;
}

const CONFIDENCES: Confidence[] = ['high', 'medium', 'low'];

export function validateAnalysis(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {ok: false, errors: ['analysis must be a JSON object']};
  }
  const o = raw as Record<string, unknown>;

  const requireString = (key: keyof Analysis): string => {
    const v = o[key];
    if (typeof v !== 'string' || !v.trim()) {
      errors.push(`${key} must be a non-empty string`);
      return '';
    }
    return v.trim();
  };

  const rootCause = requireString('rootCause');
  const mechanism = requireString('mechanism');
  const reproPlan = requireString('reproPlan');
  const fixSketch = requireString('fixSketch');

  const confidenceRaw = o.confidence;
  if (typeof confidenceRaw !== 'string' || !CONFIDENCES.includes(confidenceRaw as Confidence)) {
    errors.push(`confidence must be one of ${CONFIDENCES.join(', ')}`);
  }

  if (typeof o.isInfra !== 'boolean') errors.push('isInfra must be a boolean');

  const citations: Citation[] = [];
  if (!Array.isArray(o.citations)) {
    errors.push('citations must be an array');
  } else if (o.citations.length === 0) {
    errors.push('citations must not be empty — name the code you are accusing');
  } else {
    o.citations.forEach((c, i) => {
      const entry = (c ?? {}) as Record<string, unknown>;
      const file = typeof entry.file === 'string' ? entry.file.trim() : '';
      const line = typeof entry.line === 'number' ? entry.line : Number(entry.line);
      const why = typeof entry.why === 'string' ? entry.why.trim() : '';
      if (!file) errors.push(`citations[${i}].file must be a string`);
      if (!Number.isInteger(line) || line < 1) errors.push(`citations[${i}].line must be a positive integer`);
      if (!why) errors.push(`citations[${i}].why must explain what that line does`);
      if (file && Number.isInteger(line) && line >= 1 && why) citations.push({file, line, why});
    });
  }

  const evidence: Evidence[] = [];
  if (!Array.isArray(o.evidence)) {
    errors.push('evidence must be an array');
  } else if (o.evidence.length === 0) {
    errors.push('evidence must not be empty — a cause with no log behind it is a guess');
  } else {
    o.evidence.forEach((e, i) => {
      const entry = (e ?? {}) as Record<string, unknown>;
      const logQuery = typeof entry.logQuery === 'string' ? entry.logQuery.trim() : '';
      const matched = typeof entry.matched === 'number' ? entry.matched : Number(entry.matched);
      if (!logQuery) errors.push(`evidence[${i}].logQuery must be a runnable gcloud logging filter`);
      if (!Number.isFinite(matched) || matched < 0) errors.push(`evidence[${i}].matched must be a number`);
      if (logQuery && Number.isFinite(matched) && matched >= 0) {
        evidence.push({
          logQuery,
          matched,
          sample: typeof entry.sample === 'string' ? entry.sample.slice(0, 1000) : undefined
        });
      }
    });
  }

  if (errors.length) return {ok: false, errors};
  return {
    ok: true,
    value: {
      rootCause,
      mechanism,
      citations,
      evidence,
      confidence: confidenceRaw as Confidence,
      reproPlan,
      fixSketch,
      isInfra: o.isInfra as boolean
    }
  };
}

export function parseAnalysis(text: string): ValidationResult {
  const json = extractJson(text);
  if (!json) return {ok: false, errors: ['no JSON object found in the reply']};
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return {ok: false, errors: [`JSON did not parse: ${(e as Error).message}`]};
  }
  return validateAnalysis(raw);
}
