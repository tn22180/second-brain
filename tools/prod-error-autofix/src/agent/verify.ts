import {existsSync, readFileSync, statSync} from 'node:fs';
import {isAbsolute, join, normalize as normalizePath, relative} from 'node:path';
import {spawnRunner, type Runner} from '../gcloud/run';
import type {Analysis, Citation, Evidence} from './analysisSchema';

/**
 * The gate that stops a plausible answer from becoming an MR.
 *
 * Two independent checks, both of which the model cannot fake:
 *  - every cited file:line resolves on disk, in `src/`, on a non-blank line
 *  - every evidence query re-runs against GCP and still matches something
 */

export interface CitationVerdict {
  citation: Citation;
  ok: boolean;
  reason: string | undefined;
  /** Set when we could map a `lib/` path to its `src/` twin. */
  suggestion: string | undefined;
}

/**
 * Prod stack traces name the deployed babel output — `/workspace/lib/x/y.js` — and
 * the line numbers there do not match `src/`. So a `lib/` citation is rejected, but
 * with the `src/` path handed back rather than a bare "wrong".
 */
export function libToSrc(file: string): string | undefined {
  const cleaned = file.replace(/^\/workspace\//, '').replace(/^\.\//, '');
  const marker = /(^|\/)lib\//;
  if (!marker.test(cleaned)) return undefined;
  const tail = cleaned.replace(/^.*?(^|\/)lib\//, '');
  return `packages/functions/src/${tail}`;
}

function insideRepo(repoRoot: string, file: string): boolean {
  const abs = isAbsolute(file) ? normalizePath(file) : normalizePath(join(repoRoot, file));
  const rel = relative(normalizePath(repoRoot), abs);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

export function verifyCitation(repoRoot: string, citation: Citation): CitationVerdict {
  const fail = (reason: string, suggestion?: string): CitationVerdict => ({
    citation,
    ok: false,
    reason,
    suggestion
  });

  const suggestion = libToSrc(citation.file);
  if (suggestion) {
    return fail(
      'cites the deployed babel output; line numbers there do not match the source',
      suggestion
    );
  }

  if (!insideRepo(repoRoot, citation.file)) {
    return fail('path escapes the worktree');
  }

  const abs = isAbsolute(citation.file) ? citation.file : join(repoRoot, citation.file);
  if (!existsSync(abs)) return fail('file does not exist');
  if (!statSync(abs).isFile()) return fail('not a file');

  const lines = readFileSync(abs, 'utf8').split('\n');
  if (citation.line > lines.length) {
    return fail(`file has ${lines.length} lines, citation points at ${citation.line}`);
  }
  if (!(lines[citation.line - 1] ?? '').trim()) {
    return fail(`line ${citation.line} is blank`);
  }
  return {citation, ok: true, reason: undefined, suggestion: undefined};
}

export interface EvidenceVerdict {
  evidence: Evidence;
  ok: boolean;
  observed: number | undefined;
  reason: string | undefined;
}

/**
 * Re-runs the model's own filter. `--limit 1` is enough: the claim under test is
 * "this query matches something", not the exact count, and a full re-read would
 * cost as much as the original pull.
 */
export async function verifyEvidence(
  input: {projectId: string; timeoutMs: number},
  evidence: Evidence,
  runner: Runner = spawnRunner
): Promise<EvidenceVerdict> {
  const res = await runner(
    [
      'gcloud',
      'logging',
      'read',
      evidence.logQuery,
      `--project=${input.projectId}`,
      '--limit=1',
      '--format=json'
    ],
    input.timeoutMs
  );
  if (res.code !== 0) {
    return {
      evidence,
      ok: false,
      observed: undefined,
      reason: `query did not run: ${(res.stderr || res.stdout).trim().slice(0, 200)}`
    };
  }
  let parsed: unknown[] = [];
  try {
    parsed = JSON.parse(res.stdout || '[]') as unknown[];
  } catch {
    parsed = [];
  }
  if (!parsed.length) {
    return {evidence, ok: false, observed: 0, reason: 'query matched nothing — evidence not reproducible'};
  }
  return {evidence, ok: true, observed: parsed.length, reason: undefined};
}

export interface VerifyReport {
  citations: CitationVerdict[];
  evidence: EvidenceVerdict[];
  ok: boolean;
  /** Written back into the next round's prompt. */
  rejections: string[];
}

export async function verifyAnalysis(
  input: {repoRoot: string; projectId: string; timeoutMs: number; requireEvidence: boolean},
  analysis: Analysis,
  runner: Runner = spawnRunner
): Promise<VerifyReport> {
  const citations = analysis.citations.map(c => verifyCitation(input.repoRoot, c));
  const evidence: EvidenceVerdict[] = [];
  if (input.requireEvidence) {
    for (const e of analysis.evidence) {
      evidence.push(await verifyEvidence({projectId: input.projectId, timeoutMs: input.timeoutMs}, e, runner));
    }
  }

  const rejections: string[] = [];
  for (const v of citations) {
    if (!v.ok) {
      rejections.push(
        `citation ${v.citation.file}:${v.citation.line} rejected — ${v.reason}` +
          (v.suggestion ? `. The source path is ${v.suggestion}; find the symbol by name, not by that line number.` : '')
      );
    }
  }
  for (const v of evidence) {
    if (!v.ok) rejections.push(`evidence rejected — ${v.reason}\n  query: ${v.evidence.logQuery}`);
  }
  if (analysis.confidence === 'low') {
    rejections.push('confidence is low; either find evidence that raises it or this ends as inconclusive');
  }

  return {citations, evidence, ok: rejections.length === 0, rejections};
}
