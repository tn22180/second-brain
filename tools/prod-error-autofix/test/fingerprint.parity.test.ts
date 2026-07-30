import {describe, expect, test} from 'bun:test';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {buildConfig} from '../src/config';
import {classify, hashId, INFRA_ERROR_PATTERNS, normalize} from '../src/fingerprint';

/**
 * Drift guard. `src/fingerprint.ts` is a copy of the alerting lib's own
 * fingerprint module (see the comment there for why it is copied). This test
 * loads the lib's source from disk and requires byte-identical behaviour.
 *
 * If it fails, the two halves of the system are computing different fingerprints
 * and dedupe is broken — that is the finding, not a test to relax.
 */
const LIB_SRC = join(
  buildConfig({SLACK_BOT_TOKEN: 'x', SLACK_ERROR_CHANNEL_ID: 'x'}).paths.reposRoot,
  'avada-prod-error-alert',
  'src',
  'fingerprint.js'
);

/** Every branch of `normalize`, plus real strings from the jobs/bugprod.md triage. */
const CORPUS = [
  '',
  '   ',
  'AxiosError: Request failed with status code 403',
  'app error[seoProxyApi] flip-sky.myshopify.com error https://seo.apps.avada.io AxiosError',
  'Unterminated string in JSON at position 12345',
  'Unexpected end of JSON input',
  "Cannot read properties of undefined (reading 'includes')",
  "Cannot read properties of null (reading 'id')",
  'Memory limit of 1024 MiB exceeded with 1046 MiB used',
  'no available instance',
  'Container terminated on signal 9.',
  'startup TCP probe failed',
  'DEADLINE_EXCEEDED: deadline exceeded',
  'Response code 429 (Too Many Requests)',
  'error for shop 550e8400-e29b-41d4-a716-446655440000 failed',
  'contact seomduc@gmail.com about job abcdefghij0123456789',
  'query "select * from x" returned 0 rows',
  "value 'quoted' and `backtick` mixed",
  'counts 1,234.56 and 42 and 0',
  'first line only\nsecond line ignored\nthird',
  'tabs\tand   collapsed     whitespace',
  `padded ${'x'.repeat(300)} overflow`,
  'MiXeD CaSe MeSsAgE',
  'https://console.cloud.google.com/logs/query;query=abc?project=avada-blog-app'
];

describe('fingerprint parity with avada-prod-error-alert', () => {
  test('the lib source is where we think it is', () => {
    expect(existsSync(LIB_SRC)).toBe(true);
  });

  test('normalize, classify and hashId agree on the whole corpus', async () => {
    const lib = (await import(LIB_SRC)) as {
      normalize: (m: string) => string;
      classify: (m: string) => string;
      hashId: (s: string) => string;
      INFRA_ERROR_PATTERNS: string[];
    };

    expect(lib.INFRA_ERROR_PATTERNS).toEqual(INFRA_ERROR_PATTERNS);

    for (const message of CORPUS) {
      expect(normalize(message)).toBe(lib.normalize(message));
      expect(classify(message) as string).toBe(lib.classify(message));
      expect(hashId(message)).toBe(lib.hashId(message));
    }
  });

  test('composed dedupe key matches the handler recipe', async () => {
    const lib = (await import(LIB_SRC)) as {
      normalize: (m: string) => string;
      hashId: (s: string) => string;
    };
    // createErrorAlertHandler.js: hashId(`${appName}|${service}|${kind}|${normalize(message)}`)
    for (const message of CORPUS) {
      const key = `BLOG|api|app|${normalize(message)}`;
      expect(hashId(key)).toBe(lib.hashId(`BLOG|api|app|${lib.normalize(message)}`));
    }
  });
});
