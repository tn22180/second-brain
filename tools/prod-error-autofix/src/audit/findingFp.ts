import {createHash} from 'node:crypto';

/**
 * Strips what moves between runs so the same problem keeps one identity: digits,
 * uuids, hex blobs and timestamps. The **line number is deliberately not part of
 * the fingerprint** — an unrelated edit above a finding must not resurface it as new.
 */
export function normaliseTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
    .replace(/\b[0-9a-f]{16,}\b/g, '<hex>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findingFp(input: {app: string; file: string; rule: string; title: string}): string {
  const key = [input.app, input.file, input.rule, normaliseTitle(input.title)].join('|');
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}
