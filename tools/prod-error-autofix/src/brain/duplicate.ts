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

/** A cited location. Deduped by file: the first line the analysis gave for that file. */
export interface CiteSite {
  file: string;
  line: number;
}

export interface PriorFix {
  fingerprint: string;
  mrUrl: string;
  /** Cited sites, in the order the analysis ranked them, one per file. */
  sites: CiteSite[];
}

/** One entry per file, keeping the first (highest-ranked) line the analysis gave for it. */
export function dedupeSites(sites: CiteSite[]): CiteSite[] {
  const out: CiteSite[] = [];
  for (const s of sites) if (!out.some(o => o.file === s.file)) out.push(s);
  return out;
}

/**
 * `- \`path/to/file.js:101\` — why` from the incident's `## Code` section.
 *
 * Walked line by line rather than sliced with one regex: `\Z` is not an anchor in
 * JavaScript, it is the letter Z, so `(?=^## |\Z)` ended the section at the first capital
 * Z in the prose — `isZodV4` on the very first citation line of `1ce20uv`, which cut 7
 * citations down to 1 while still looking like it worked.
 */
export function citedSites(incidentText: string): CiteSite[] {
  const out: CiteSite[] = [];
  let inSection = false;
  for (const raw of incidentText.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      inSection = line === '## Code';
      continue;
    }
    if (!inSection) continue;
    const m = /^-\s+`([^`]+):(\d+)`/.exec(line);
    if (m) out.push({file: m[1]!, line: Number(m[2])});
  }
  return dedupeSites(out);
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
    const sites = citedSites(text);
    if (sites.length) out.push({fingerprint, mrUrl, sites});
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

/**
 * Same file is not the same defect. `j3krke` was blocked against `se28ls` because both
 * ranked `genAIBlogController.js` first — but at :513 (`genIdeas`, sending a plain-text
 * completion with no schema) versus :337 (`genSuggested`, truncated JSON). Two functions
 * 176 lines apart in a ~900-line controller, and the MR it was folded into fixed neither.
 *
 * Two analyses of one defect land on the same function, so the window is a function's
 * worth of lines, not a file's.
 */
export const PRIMARY_LINE_WINDOW = 40;

export interface DuplicateVerdict {
  prior: PriorFix;
  overlap: number;
  sharedFiles: string[];
}

export function duplicateOf(citedNow: CiteSite[], priors: PriorFix[]): DuplicateVerdict | undefined {
  // Deduped first: the caller passes raw citations, and several citations in one file used
  // to be counted once each against a set-sized union, which put `overlap` above 1.0.
  const now = dedupeSites(citedNow);
  const top = now[0];
  if (!top) return undefined;
  let best: DuplicateVerdict | undefined;
  for (const prior of priors) {
    const priorTop = prior.sites[0];
    if (!priorTop || priorTop.file !== top.file) continue;
    if (Math.abs(priorTop.line - top.line) > PRIMARY_LINE_WINDOW) continue;
    const priorFiles = prior.sites.map(s => s.file);
    const shared = now.map(s => s.file).filter(f => priorFiles.includes(f));
    const overlap = shared.length / new Set([...now.map(s => s.file), ...priorFiles]).size;
    if (overlap >= OVERLAP_THRESHOLD && (!best || overlap > best.overlap)) {
      best = {prior, overlap, sharedFiles: shared};
    }
  }
  return best;
}
