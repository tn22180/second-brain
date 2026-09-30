import {describe, expect, test} from 'bun:test';
import {redact} from '../src/redact';

// Fixtures are assembled at runtime so no secret-shaped literal sits in the repo for scanners.
const j = (...p: string[]) => p.join('');

describe('redact', () => {
  test.each([
    ['bearer', j('Authorization: Bearer ', 'abc.DEF-123_xyz456789')],
    ['gitlab pat', j('push failed glpat', '-', 'AbCdEf0123456789xYz_')],
    ['telegram bot', j('bot', '1234567890', ':', 'AAH', 'x'.repeat(32), '/sendMessage')],
    ['anthropic', j('sk', '-ant-', 'api03-', 'Z'.repeat(40))],
    ['google api', j('AI', 'za', 'S'.repeat(35))],
    ['jwt', j('eyJ', 'hbGciOiJIUzI1NiJ9', '.', 'eyJ', 'zdWIiOiIxIn0', '.', 'sig_nature-123')],
    ['env assignment', j('SHOPIFY_ACCESS_TOKEN_KEY', '=', 'b8f1c0ffee42')],
    ['json field', j('{"client_secret"', ': ', '"s3cr3t-value"}')],
    ['private key', j('-----BEGIN ', 'PRIVATE KEY-----\nMIIE\n-----END ', 'PRIVATE KEY-----')]
  ])('%s is masked', (_name, input) => {
    const out = redact(input);
    expect(out).toContain('[REDACTED]');
    expect(out).not.toMatch(/abc\.DEF|AbCdEf0123|x{32}|Z{40}|S{35}|hbGciOiJ|b8f1c0ffee42|s3cr3t|MIIE/);
  });

  test('ordinary failure text is untouched', () => {
    const s = 'Tests: 2 failed, 63 passed\nat foo (src/a.js:12:3)\ncommit d25efe1aa1c3f61bab15f602d06379ca8f7cd47f token count 5';
    expect(redact(s)).toBe(s);
  });
});
