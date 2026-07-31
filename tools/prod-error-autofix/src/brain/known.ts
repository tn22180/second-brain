import {appendFileSync, existsSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

/**
 * What the brain already knows about a fingerprint.
 *
 * The state DB is the dedupe, and that is not enough on its own: it can be cleared
 * (it was, on 2026-07-31), it can be lost with the disk, and an MR opened by hand
 * never reaches it at all. `1ph12wf` is the case that proves it — the fix was pushed
 * and merged into master by hand after the pipeline's push failed, while both the DB
 * and the index still said `— · inconclusive`. The next occurrence of that error
 * would have paid for a full Opus analysis to rediscover a fix already in production.
 *
 * `brain/index.md` outlives all of that: it is a file in git, one line per
 * fingerprint, rewritten in place by LEARN.
 */

export interface KnownIncident {
  fingerprint: string;
  dateIso: string;
  appName: string;
  service: string;
  rootCause: string;
  mrUrl: string | undefined;
  status: string;
}

/** `- \`fp\` · date · APP · service · cause · mr · status` */
export function parseIndexLine(line: string): KnownIncident | undefined {
  const m = /^-\s+`([^`]+)`\s+·\s+(.*)$/.exec(line.trim());
  if (!m) return undefined;
  const parts = m[2]!.split('·').map(s => s.trim());
  if (parts.length < 6) return undefined;
  // Counted from the tail: the root cause is free text and routinely contains '·',
  // so only the last two fields have a fixed position.
  const mr = parts[parts.length - 2]!;
  return {
    fingerprint: m[1]!,
    dateIso: parts[0]!,
    appName: parts[1]!,
    service: parts[2]!,
    // The cause itself may contain '·'; everything between service and mr is cause.
    rootCause: parts.slice(3, parts.length - 2).join(' · '),
    mrUrl: mr && mr !== '—' ? mr : undefined,
    status: parts[parts.length - 1]!
  };
}

/** The inverse of `parseIndexLine`. Sole writer of the format, so the two cannot drift. */
export function formatIndexLine(k: KnownIncident): string {
  return (
    `- \`${k.fingerprint}\` · ${k.dateIso.slice(0, 10)} · ${k.appName} · ${k.service} · ` +
    `${k.rootCause} · ${k.mrUrl ?? '—'} · ${k.status}`
  );
}

export const INDEX_MARKER = '<!-- LEARN appends below this line -->';

/**
 * One line per fingerprint: a repeat rewrites in place rather than appending, so the
 * index never grows two records that disagree about the same error.
 */
export function upsertIndexLine(brainRoot: string, fingerprint: string, line: string): boolean {
  const path = join(brainRoot, 'index.md');
  if (!existsSync(path)) return false;
  const current = readFileSync(path, 'utf8');
  const existing = new RegExp(`^- \`${fingerprint}\`.*$`, 'm');
  if (existing.test(current)) {
    writeFileSync(path, current.replace(existing, line), 'utf8');
  } else if (current.includes(INDEX_MARKER)) {
    writeFileSync(path, current.replace(INDEX_MARKER, `${INDEX_MARKER}\n${line}`), 'utf8');
  } else {
    appendFileSync(path, `\n${line}\n`, 'utf8');
  }
  return true;
}

export function loadKnownIncidents(brainRoot: string): Map<string, KnownIncident> {
  const path = join(brainRoot, 'index.md');
  const out = new Map<string, KnownIncident>();
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const parsed = parseIndexLine(line);
    if (parsed) out.set(parsed.fingerprint, parsed);
  }
  return out;
}

export function knownIncident(brainRoot: string, fingerprint: string): KnownIncident | undefined {
  return loadKnownIncidents(brainRoot).get(fingerprint);
}

/**
 * Whether this record is enough to stop a fresh job.
 *
 * Only a recorded MR counts. An `inconclusive` record means the last attempt failed to
 * produce anything, and that is exactly the case worth retrying.
 */
export function isAlreadyFixed(known: KnownIncident | undefined): known is KnownIncident {
  return Boolean(known?.mrUrl);
}
