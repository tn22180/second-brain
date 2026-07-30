import {describe, expect, test} from 'bun:test';
import {classify, fingerprintOf, hashId, normalize} from '../src/fingerprint';

describe('normalize', () => {
  test('keeps only the first line', () => {
    expect(normalize('boom\nstack frame 1\nstack frame 2')).toBe('boom');
  });

  test('replaces the volatile parts so one bug is one fingerprint', () => {
    expect(normalize('shop https://a.myshopify.com/x failed')).toBe('shop #url failed');
    expect(normalize('mail seomduc@gmail.com bounced')).toBe('mail #email bounced');
    expect(normalize('id 550e8400-e29b-41d4-a716-446655440000 gone')).toBe('id #uuid gone');
    expect(normalize('doc abcdefghij0123456789 missing')).toBe('doc #id missing');
    expect(normalize('field "title" empty')).toBe('field #str empty');
    expect(normalize('position 12,345.6 reached')).toBe('position #n reached');
  });

  test('caps at 200 chars', () => {
    expect(normalize('lorem ipsum '.repeat(50)).length).toBe(200);
  });

  test('a long alnum run collapses to #id before the 200-char cap applies', () => {
    // Ordering matters: the {18,} id rule runs first, so a 500-char token is 3
    // chars by the time slice(0, 200) sees it. Both halves of the system must
    // agree on this or the same error hashes differently on each side.
    expect(normalize('a'.repeat(500))).toBe('#id');
  });
});

describe('classify', () => {
  test('infra patterns win', () => {
    expect(classify('Memory limit of 1024 MiB exceeded')).toBe('infra');
    expect(classify('The request was aborted because there was no available instance')).toBe('infra');
    expect(classify('Container terminated on signal 9')).toBe('infra');
  });

  test('everything else is an app error', () => {
    expect(classify('AxiosError: Request failed with status code 403')).toBe('app');
    expect(classify('Unterminated string in JSON at position 900')).toBe('app');
  });
});

describe('fingerprintOf', () => {
  const alert = {appName: 'BLOG', service: 'api', kind: 'app' as const, message: 'boom at 12'};

  test('matches the handler recipe exactly', () => {
    expect(fingerprintOf(alert)).toBe(hashId('BLOG|api|app|boom at #n'));
  });

  test('same bug on two shops is one fingerprint', () => {
    const a = {...alert, message: 'AxiosError 403 for https://a.myshopify.com'};
    const b = {...alert, message: 'AxiosError 403 for https://b.myshopify.com'};
    expect(fingerprintOf(a)).toBe(fingerprintOf(b));
  });

  test('same message in a different app or service is a different fingerprint', () => {
    expect(fingerprintOf({...alert, appName: 'SEO'})).not.toBe(fingerprintOf(alert));
    expect(fingerprintOf({...alert, service: 'apiv2'})).not.toBe(fingerprintOf(alert));
    expect(fingerprintOf({...alert, kind: 'infra'})).not.toBe(fingerprintOf(alert));
  });

  test('stack frames below line 1 do not split the fingerprint', () => {
    const one = {...alert, message: 'boom at 12\n    at foo (/a.js:1:1)'};
    const two = {...alert, message: 'boom at 12\n    at bar (/b.js:9:9)'};
    expect(fingerprintOf(one)).toBe(fingerprintOf(two));
  });

  test('is filesystem-safe — it becomes a dir and a branch name', () => {
    expect(fingerprintOf(alert)).toMatch(/^[0-9a-z]+$/);
  });
});
