import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {normalize} from '../fingerprint';

/**
 * Builds the brain slice for one job.
 *
 * The whole point of the brain is that a job does not re-discover an app's layout
 * from scratch every time — and the whole point of *slicing* it is that the brain
 * can grow without every job paying for all of it.
 *
 * Always loaded: CORE, patterns, the one app file for the alert, the index.
 * Conditionally: at most one past incident, when it is the same fingerprint or a
 * near miss on the same service.
 * Never: other apps' files, or the rest of the incidents.
 */

export interface SliceInput {
  brainRoot: string;
  appName: string;
  /** Used to pull the matching incident, when there is one. */
  fingerprint: string;
  /** Used for near-miss matching when the fingerprint itself is new. */
  service: string | undefined;
  message: string | undefined;
  tokenBudget: number;
}

export interface SliceSection {
  name: string;
  path: string;
  text: string;
  tokens: number;
}

export interface BrainSlice {
  sections: SliceSection[];
  text: string;
  tokens: number;
  budget: number;
  overBudget: boolean;
  /** Files considered but left out, with why — surfaced by `autofix dry-run`. */
  skipped: {path: string; reason: string}[];
}

/**
 * Cheap character-based estimate (~4 chars per token). Deliberately not a real
 * tokenizer: this is a build-time guard rail, and being approximately right every
 * run beats being exactly right at the cost of a dependency.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function read(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Jaccard overlap on normalized-message words. Enough to spot "same bug, new id". */
export function similarity(a: string, b: string): number {
  const wordsOf = (s: string) => new Set(normalize(s).split(' ').filter(w => w.length > 2));
  const left = wordsOf(a);
  const right = wordsOf(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const w of left) if (right.has(w)) shared++;
  return shared / (left.size + right.size - shared);
}

export const NEAR_MISS_THRESHOLD = 0.6;

interface IncidentHeader {
  fingerprint: string;
  service: string | undefined;
  message: string | undefined;
}

/** Incident files start with an HTML comment carrying the fields we match on. */
export function parseIncidentHeader(text: string, fallbackFp: string): IncidentHeader {
  const field = (name: string) =>
    new RegExp(`^${name}:\\s*(.+)$`, 'im').exec(text)?.[1]?.trim() || undefined;
  return {
    fingerprint: field('fingerprint') ?? fallbackFp,
    service: field('service'),
    message: field('message')
  };
}

function pickIncident(input: SliceInput): {path: string; text: string; reason: string} | undefined {
  const dir = join(input.brainRoot, 'incidents');
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir).filter(f => f.endsWith('.md'));

  const exactName = `${input.fingerprint}.md`;
  if (files.includes(exactName)) {
    const text = read(join(dir, exactName));
    if (text) return {path: join(dir, exactName), text, reason: 'same fingerprint'};
  }

  if (!input.service || !input.message) return undefined;
  let best: {path: string; text: string; score: number} | undefined;
  for (const file of files) {
    const path = join(dir, file);
    const text = read(path);
    if (!text) continue;
    const header = parseIncidentHeader(text, file.replace(/\.md$/, ''));
    // Same service is a precondition: a similar message in a different service is
    // a different bug, and loading it would put the wrong code in front of the model.
    if (header.service !== input.service || !header.message) continue;
    const score = similarity(input.message, header.message);
    if (score >= NEAR_MISS_THRESHOLD && (!best || score > best.score)) best = {path, text, score};
  }
  return best ? {path: best.path, text: best.text, reason: `near miss ${best.score.toFixed(2)}`} : undefined;
}

export function buildSlice(input: SliceInput): BrainSlice {
  const sections: SliceSection[] = [];
  const skipped: {path: string; reason: string}[] = [];

  const add = (name: string, path: string) => {
    const text = read(path);
    if (text === undefined) {
      skipped.push({path, reason: 'missing'});
      return;
    }
    sections.push({name, path, text, tokens: estimateTokens(text)});
  };

  add('CORE', join(input.brainRoot, 'CORE.md'));
  add('patterns', join(input.brainRoot, 'patterns.md'));

  const appPath = join(input.brainRoot, 'apps', `${input.appName}.md`);
  if (existsSync(appPath)) {
    add(`app:${input.appName}`, appPath);
  } else {
    skipped.push({path: appPath, reason: `no brain file for app ${input.appName}`});
  }

  add('index', join(input.brainRoot, 'index.md'));

  const incident = pickIncident(input);
  if (incident) {
    sections.push({
      name: 'incident',
      path: incident.path,
      text: incident.text,
      tokens: estimateTokens(incident.text)
    });
  }

  // Everything deliberately excluded, recorded so `dry-run` can show it.
  const appsDir = join(input.brainRoot, 'apps');
  if (existsSync(appsDir)) {
    for (const file of readdirSync(appsDir)) {
      if (file !== `${input.appName}.md`) {
        skipped.push({path: join(appsDir, file), reason: 'other app'});
      }
    }
  }
  const incidentsDir = join(input.brainRoot, 'incidents');
  if (existsSync(incidentsDir)) {
    for (const file of readdirSync(incidentsDir)) {
      const path = join(incidentsDir, file);
      if (path !== incident?.path && file.endsWith('.md')) {
        skipped.push({path, reason: 'not this fingerprint'});
      }
    }
  }

  const text = sections.map(s => `<!-- ${s.name} — ${s.path} -->\n${s.text.trim()}`).join('\n\n---\n\n');
  const tokens = estimateTokens(text);
  return {sections, text, tokens, budget: input.tokenBudget, overBudget: tokens > input.tokenBudget, skipped};
}
