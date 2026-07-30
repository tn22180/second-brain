import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {
  buildSlice,
  estimateTokens,
  NEAR_MISS_THRESHOLD,
  parseIncidentHeader,
  similarity
} from '../src/brain/slice';
import {buildConfig} from '../src/config';
import {appNames} from '../src/registry';

const cfg = buildConfig({SLACK_BOT_TOKEN: 'x', SLACK_ERROR_CHANNEL_ID: 'x'});

describe('the real brain', () => {
  test.each(appNames())('a %s slice fits the 6k budget', appName => {
    const slice = buildSlice({
      brainRoot: cfg.paths.brainRoot,
      appName,
      fingerprint: 'nonexistent',
      service: 'api',
      message: 'boom',
      tokenBudget: cfg.brainSliceTokenBudget
    });
    // A brain that outgrows the budget is a build failure, not something to notice
    // three months later when every job has quietly got slower.
    expect(slice.overBudget).toBe(false);
    expect(slice.tokens).toBeLessThanOrEqual(cfg.brainSliceTokenBudget);
    expect(slice.sections.map(s => s.name)).toEqual(['CORE', 'patterns', `app:${appName}`, 'index']);
  });

  test('a slice never carries another app', () => {
    const slice = buildSlice({
      brainRoot: cfg.paths.brainRoot,
      appName: 'BLOG',
      fingerprint: 'x',
      service: undefined,
      message: undefined,
      tokenBudget: cfg.brainSliceTokenBudget
    });
    // No other app's file is in the slice. Asserted on paths, not on substrings:
    // patterns.md legitimately names all five apps when it records fleet state.
    expect(slice.sections.filter(s => s.path.includes('/apps/')).map(s => s.path)).toEqual([
      join(cfg.paths.brainRoot, 'apps', 'BLOG.md')
    ]);
    // Canaries that appear only in another app's file.
    expect(slice.text).not.toContain('cloudRunWorker.js'); // IMG-OPT.md only
    expect(slice.text).not.toContain('avada-seo-optimize-image-job'); // SEO.md only
    expect(slice.skipped.filter(s => s.reason === 'other app').length).toBe(appNames().length - 1);
  });

  test('an app with no brain file is reported, not silently empty', () => {
    const slice = buildSlice({
      brainRoot: cfg.paths.brainRoot,
      appName: 'JOY',
      fingerprint: 'x',
      service: undefined,
      message: undefined,
      tokenBudget: cfg.brainSliceTokenBudget
    });
    expect(slice.sections.some(s => s.name.startsWith('app:'))).toBe(false);
    expect(slice.skipped.some(s => s.reason.includes('no brain file for app JOY'))).toBe(true);
  });

  test('every app file states whether its logger emits severity', () => {
    // The agent has to know that an empty `errors` read is expected in four of five
    // apps, or it will report the empty read as a finding.
    for (const appName of appNames()) {
      const slice = buildSlice({
        brainRoot: cfg.paths.brainRoot,
        appName,
        fingerprint: 'x',
        service: undefined,
        message: undefined,
        tokenBudget: cfg.brainSliceTokenBudget
      });
      const appSection = slice.sections.find(s => s.name === `app:${appName}`)!;
      expect(appSection.text).toContain('Logger severity');
    }
  });
});

describe('estimateTokens', () => {
  test('roughly four characters per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(4000))).toBe(1000);
  });
});

describe('similarity', () => {
  test('the same bug with different ids scores high', () => {
    const a = "[getPreview] shop-a Error fetching the resource: Cannot read properties of undefined (reading 'includes')";
    const b = "[getPreview] shop-b Error fetching the resource: Cannot read properties of undefined (reading 'includes')";
    expect(similarity(a, b)).toBeGreaterThan(NEAR_MISS_THRESHOLD);
  });

  test('different bugs score low', () => {
    expect(
      similarity('Unterminated string in JSON at position 900', 'Memory limit of 1024 MiB exceeded')
    ).toBeLessThan(NEAR_MISS_THRESHOLD);
  });

  test('empty input is not similar to anything', () => {
    expect(similarity('', 'anything at all here')).toBe(0);
  });
});

describe('incident selection', () => {
  const tmp = join('/tmp', `autofix-brain-${process.pid}`);

  beforeEach(() => {
    mkdirSync(join(tmp, 'apps'), {recursive: true});
    mkdirSync(join(tmp, 'incidents'), {recursive: true});
    writeFileSync(join(tmp, 'CORE.md'), 'core');
    writeFileSync(join(tmp, 'patterns.md'), 'patterns');
    writeFileSync(join(tmp, 'index.md'), 'index');
    writeFileSync(join(tmp, 'apps', 'BLOG.md'), 'blog app notes');
  });

  afterEach(() => {
    rmSync(tmp, {recursive: true, force: true});
  });

  const slice = (over: {fingerprint?: string; service?: string; message?: string} = {}) =>
    buildSlice({
      brainRoot: tmp,
      appName: 'BLOG',
      fingerprint: over.fingerprint ?? 'fp-new',
      service: over.service ?? 'api',
      message: over.message ?? 'Unterminated string in JSON at position 900',
      tokenBudget: 6000
    });

  test('an exact fingerprint match is loaded', () => {
    writeFileSync(join(tmp, 'incidents', 'fp-known.md'), 'fingerprint: fp-known\nservice: api\nbody');
    const s = slice({fingerprint: 'fp-known'});
    expect(s.sections.map(n => n.name)).toContain('incident');
    expect(s.text).toContain('fp-known');
  });

  test('a near miss on the same service is loaded', () => {
    writeFileSync(
      join(tmp, 'incidents', 'fp-old.md'),
      'fingerprint: fp-old\nservice: api\nmessage: Unterminated string in JSON at position 42\n\nbody'
    );
    expect(slice().sections.some(n => n.name === 'incident')).toBe(true);
  });

  test('a similar message on a different service is not loaded', () => {
    writeFileSync(
      join(tmp, 'incidents', 'fp-other.md'),
      'fingerprint: fp-other\nservice: apiv2\nmessage: Unterminated string in JSON at position 42\n\nbody'
    );
    expect(slice({service: 'api'}).sections.some(n => n.name === 'incident')).toBe(false);
  });

  test('an unrelated incident is not loaded, and is reported as skipped', () => {
    writeFileSync(
      join(tmp, 'incidents', 'fp-unrelated.md'),
      'fingerprint: fp-unrelated\nservice: api\nmessage: Memory limit of 1024 MiB exceeded\n\nbody'
    );
    const s = slice();
    expect(s.sections.some(n => n.name === 'incident')).toBe(false);
    expect(s.skipped.some(x => x.path.includes('fp-unrelated'))).toBe(true);
  });

  test('the closest of several near misses wins, and only one is loaded', () => {
    writeFileSync(
      join(tmp, 'incidents', 'fp-close.md'),
      'fingerprint: fp-close\nservice: api\nmessage: Unterminated string in JSON at position 900\n\nclose one'
    );
    writeFileSync(
      join(tmp, 'incidents', 'fp-looser.md'),
      'fingerprint: fp-looser\nservice: api\nmessage: Unterminated string in JSON somewhere else entirely today\n\nlooser one'
    );
    const s = slice();
    expect(s.sections.filter(n => n.name === 'incident').length).toBe(1);
    expect(s.text).toContain('close one');
    expect(s.text).not.toContain('looser one');
  });

  test('no message means no near-miss matching at all', () => {
    writeFileSync(
      join(tmp, 'incidents', 'fp-old.md'),
      'fingerprint: fp-old\nservice: api\nmessage: Unterminated string in JSON at position 42\n\nbody'
    );
    expect(slice({message: ''}).sections.some(n => n.name === 'incident')).toBe(false);
  });

  test('going over budget is reported rather than truncated', () => {
    writeFileSync(join(tmp, 'apps', 'BLOG.md'), 'x'.repeat(40_000));
    const s = buildSlice({
      brainRoot: tmp,
      appName: 'BLOG',
      fingerprint: 'fp',
      service: 'api',
      message: 'm',
      tokenBudget: 6000
    });
    expect(s.overBudget).toBe(true);
    expect(s.tokens).toBeGreaterThan(6000);
    // The text is still complete — the caller decides, the slice does not lie about size.
    expect(s.text).toContain('x'.repeat(100));
  });
});

describe('parseIncidentHeader', () => {
  test('reads the fields it matches on', () => {
    const h = parseIncidentHeader('fingerprint: abc\nservice: job:img\nmessage: boom here\nrest', 'fallback');
    expect(h).toEqual({fingerprint: 'abc', service: 'job:img', message: 'boom here'});
  });

  test('falls back to the filename when the header is missing', () => {
    expect(parseIncidentHeader('no header at all', 'fallback').fingerprint).toBe('fallback');
  });
});
