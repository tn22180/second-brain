/**
 * Copied verbatim (modulo TS types) from avada-prod-error-alert/src/fingerprint.js.
 *
 * Why copied and not imported: the lib is published to public npm as
 * `avada-prod-error-alert@0.1.0`, but its `src/index.js` exports only
 * `createErrorAlertHandler` — these three functions are not part of the public
 * surface. Copying keeps this project unblocked; `test/fingerprint.parity.test.ts`
 * imports the lib's own source from disk and fails the build if the two drift.
 *
 * Keeping them identical matters: the alerting side derives its Firestore
 * dedupe doc id from these, so a divergence would silently split fingerprints
 * across the two halves of the system.
 */

export const INFRA_ERROR_PATTERNS = [
  'no available instance',
  'memory limit',
  'oom',
  'container terminated',
  'startup tcp probe failed',
  'deadline_exceeded'
];

export function normalize(message: string): string {
  const firstLine = String(message).split('\n')[0] ?? '';
  return firstLine
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '#url')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '#email')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '#uuid')
    .replace(/\b[a-z0-9]{18,}\b/gi, '#id')
    .replace(/["'`][^"'`]*["'`]/g, '#str')
    .replace(/\b\d[\d.,]*\b/g, '#n')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export type ErrorKind = 'app' | 'infra';

export function classify(message: string): ErrorKind {
  const lower = String(message).toLowerCase();
  return INFRA_ERROR_PATTERNS.some(p => lower.includes(p)) ? 'infra' : 'app';
}

export function hashId(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/**
 * The fingerprint this project keys everything on.
 *
 * Same recipe as `createErrorAlertHandler` (`${appName}|${service}|${kind}|${normalize(message)}`),
 * but fed from the Slack message rather than the raw log entry. The snippet in a
 * Slack alert is truncated at 700 chars by `buildSlackPayload`, and `normalize`
 * only ever looks at the first line, so in practice the two agree for most
 * errors — but nothing else in this codebase may assume they are equal.
 */
export function fingerprintOf(input: {
  appName: string;
  service: string;
  kind: ErrorKind;
  message: string;
}): string {
  return hashId(`${input.appName}|${input.service}|${input.kind}|${normalize(input.message)}`);
}
