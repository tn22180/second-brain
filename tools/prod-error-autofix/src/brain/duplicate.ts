import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

/**
 * Two alerts, one bug.
 *
 * The fingerprint is built from the error message, so the same defect reaching the log
 * through two call paths produces two fingerprints and gets analysed, fixed and reviewed
 * twice. It happened twice in the first unattended night:
 *
 *   1ce20uv `HTTP 500 POST /api/gen-ai-suggested/recommendBlogPost`
 *   1h51j7i `[genSuggested] ... ZodError: [`            → message similarity 0.000
 *   rs8tvy  `[getShopifyArticleById] ... TypeError`
 *   phe6lm  `[handleNewAuthor] ... TypeError`           → similarity 0.727, near miss fired
 *
 * The first pair proves message similarity can never be the gate — nothing in the two
 * strings overlaps. The second proves loading the prior incident into the prompt is not
 * enough on its own: the model saw it and opened a second MR anyway.
 *
 * What did match, exactly, in both pairs, was the accused code:
 *
 *   1ce20uv / 1h51j7i → openAi.service.js:101, 4 of 4 cited files identical
 *   rs8tvy  / phe6lm  → shopifyGraphQlService.js:850, 3 of 4 identical
 *
 * So the gate is the citation list, and it can only run after ANALYZE — the analysis is
 * what produces the citations. That cost is already spent; what this saves is the FIX, the
 * smoke run, the MR and the human review, and it stops two branches touching the same file
 * from racing each other into a conflict.
 */

export interface PriorFix {
  fingerprint: string;
  mrUrl: string;
  /** Cited files, in the order the analysis ranked them, deduped. */
  files: string[];
}

/**
 * `- \`path/to/file.js:101\` — why` from the incident's `## Code` section.
 *
 * Walked line by line rather than sliced with one regex: `\Z` is not an anchor in
 * JavaScript, it is the letter Z, so `(?=^## |\Z)` ended the section at the first capital
 * Z in the prose — `isZodV4` on the very first citation line of `1ce20uv`, which cut 7
 * citations down to 1 while still looking like it worked.
 */
export function citedFiles(incidentText: string): string[] {
  const out: string[] = [];
  let inSection = false;
  for (const raw of incidentText.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      inSection = line === '## Code';
      continue;
    }
    if (!inSection) continue;
    const m = /^-\s+`([^`]+):(\d+)`/.exec(line);
    if (m && !out.includes(m[1]!)) out.push(m[1]!);
  }
  return out;
}

function mrOf(incidentText: string): string | undefined {
  return /^- MR: (\S+)$/m.exec(incidentText)?.[1];
}

/**
 * Every incident that already has an MR, minus this one.
 *
 * `stillOpen` decides whether a prior counts. A merged *and deployed* fix that did not stop
 * the error is not a duplicate — it is a fix that did not work, which is a different path
 * and deserves a fresh look. Blocking on it would make the system unable to correct itself.
 */
export function loadPriorFixes(
  brainRoot: string,
  excludeFingerprint: string,
  stillOpen: (fingerprint: string) => boolean
): PriorFix[] {
  const dir = join(brainRoot, 'incidents');
  if (!existsSync(dir)) return [];
  const out: PriorFix[] = [];
  for (const file of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const fingerprint = file.replace(/\.md$/, '');
    if (fingerprint === excludeFingerprint) continue;
    const text = readFileSync(join(dir, file), 'utf8');
    const mrUrl = mrOf(text);
    if (!mrUrl || !stillOpen(fingerprint)) continue;
    const files = citedFiles(text);
    if (files.length) out.push({fingerprint, mrUrl, files});
  }
  return out;
}

/**
 * Half the accused files shared is a lot: an analysis names the specific lines it is
 * willing to be judged on, so two of them agreeing on half the files are describing one
 * defect. The primary citation must match as well — that is the line the fix will change,
 * and two fixes changing the same line is the collision this exists to prevent.
 */
export const OVERLAP_THRESHOLD = 0.5;

export interface DuplicateVerdict {
  prior: PriorFix;
  overlap: number;
  sharedFiles: string[];
}

export function duplicateOf(citedNow: string[], priors: PriorFix[]): DuplicateVerdict | undefined {
  const top = citedNow[0];
  if (!top) return undefined;
  let best: DuplicateVerdict | undefined;
  for (const prior of priors) {
    if (prior.files[0] !== top) continue;
    const shared = citedNow.filter(f => prior.files.includes(f));
    const overlap = shared.length / new Set([...citedNow, ...prior.files]).size;
    if (overlap >= OVERLAP_THRESHOLD && (!best || overlap > best.overlap)) {
      best = {prior, overlap, sharedFiles: shared};
    }
  }
  return best;
}
