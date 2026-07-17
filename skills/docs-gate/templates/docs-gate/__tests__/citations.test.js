const {parseCitations, isAnchored} = require('../citations');

describe('parseCitations', () => {
  test('parses a single-line citation', () => {
    const out = parseCitations('See `packages/functions/src/a.js:69` for detail.');
    expect(out).toEqual([
      {
        path: 'packages/functions/src/a.js',
        startLine: 69,
        endLine: 69,
        docLine: 1,
        skipped: false,
        skipReason: null
      }
    ]);
  });

  test('parses a line-span citation', () => {
    const out = parseCitations('`packages/assets/src/b.js:47-48`');
    expect(out[0].startLine).toBe(47);
    expect(out[0].endLine).toBe(48);
  });

  test('records the 1-based doc line number', () => {
    const out = parseCitations('intro\n\n`packages/functions/src/a.js:5`');
    expect(out[0].docLine).toBe(3);
  });

  test('finds citations inside fenced code blocks', () => {
    const out = parseCitations('```\npackages/assets/src/loadables/Sitemap.js:3\n```');
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe('packages/assets/src/loadables/Sitemap.js');
  });

  test('marks a citation carrying a skip comment', () => {
    const out = parseCitations(
      '`packages/functions/src/x.js:9` <!-- citation-skip: fleet-only -->'
    );
    expect(out[0].skipped).toBe(true);
    expect(out[0].skipReason).toBe('fleet-only');
  });

  test('finds several citations on one line', () => {
    const out = parseCitations('`packages/a/x.js:1` and `packages/b/y.js:2`');
    expect(out.map(c => c.path)).toEqual(['packages/a/x.js', 'packages/b/y.js']);
  });

  // The skip was matched against the whole LINE, so one reason silenced every citation on it.
  test('one skip comment does not exempt every citation on the line', () => {
    const out = parseCitations(
      '`packages/a/x.js:1` `packages/b/y.js:2` `packages/c/z.js:3` <!-- citation-skip: one reason -->'
    );
    expect(out.map(c => c.skipped)).toEqual([false, false, true]);
  });

  test('a skip exempts the nearest citation preceding it', () => {
    const out = parseCitations(
      '`packages/a/x.js:1` <!-- citation-skip: r1 --> `packages/b/y.js:2` <!-- citation-skip: r2 --> `packages/c/z.js:3`'
    );
    expect(out.map(c => c.skipped)).toEqual([true, true, false]);
    expect(out.map(c => c.skipReason)).toEqual(['r1', 'r2', null]);
  });

  // Back-compat: the documented syntax, and the only form in the corpus.
  test('a lone citation is still exempted by a skip anywhere on its line', () => {
    expect(parseCitations('`packages/a/x.js:1` <!-- citation-skip: after -->')[0].skipped).toBe(
      true
    );
    expect(parseCitations('<!-- citation-skip: before --> `packages/a/x.js:1`')[0].skipped).toBe(
      true
    );
  });

  test('a path named inside a skip reason is not itself a citation', () => {
    expect(parseCitations('<!-- citation-skip: packages/a/dead.js:5 is fleet-only -->')).toEqual(
      []
    );
  });

  test('ignores a bare word with no line number', () => {
    expect(parseCitations('see dispatchWork.js for detail')).toEqual([]);
  });
});

describe('isAnchored', () => {
  test('accepts packages/ and extensions/ roots', () => {
    expect(isAnchored('packages/functions/src/a.js')).toBe(true);
    expect(isAnchored('extensions/theme/blocks/b.liquid')).toBe(true);
  });

  test('rejects domain shorthand', () => {
    expect(isAnchored('service.js')).toBe(false);
    expect(isAnchored('controllers/internalLinkController.js')).toBe(false);
  });

  test('rejects a document-relative package.json', () => {
    expect(isAnchored('package.json')).toBe(false);
  });
});

const {analyzeCitations} = require('../citations');

const lineCounts = {
  'packages/functions/src/a.js': 100,
  'packages/assets/src/pages/AuditDetail/KeywordBuilder/weapons/service.js': 80,
  'package.json': 95
};
const tracked = Object.keys(lineCounts);
const lineCountOf = p => lineCounts[p];

describe('analyzeCitations', () => {
  test('passes a live anchored citation', () => {
    const docs = [{path: 'docs/features/x.md', content: '`packages/functions/src/a.js:69`'}];
    const {findings, stats} = analyzeCitations({docs, trackedFiles: tracked, lineCountOf});
    expect(findings).toEqual([]);
    expect(stats.anchored).toBe(1);
  });

  test('fails an anchored citation whose file is untracked', () => {
    const docs = [{path: 'docs/features/x.md', content: '`packages/functions/src/gone.js:5`'}];
    const {findings} = analyzeCitations({docs, trackedFiles: tracked, lineCountOf});
    expect(findings).toHaveLength(1);
    expect(findings[0].reason).toMatch(/not tracked/);
    expect(findings[0].doc).toBe('docs/features/x.md');
  });

  test('fails an anchored citation past end of file', () => {
    const docs = [{path: 'docs/features/x.md', content: '`packages/functions/src/a.js:120`'}];
    const {findings} = analyzeCitations({docs, trackedFiles: tracked, lineCountOf});
    expect(findings).toHaveLength(1);
    expect(findings[0].reason).toMatch(/100 lines/);
  });

  test('uses the end of a span when checking EOF', () => {
    const docs = [{path: 'docs/features/x.md', content: '`packages/functions/src/a.js:99-105`'}];
    const {findings} = analyzeCitations({docs, trackedFiles: tracked, lineCountOf});
    expect(findings).toHaveLength(1);
  });

  // The label dropped the "-105", sending whoever triages the finding to line 99 — a line the doc
  // never cited and which is perfectly alive.
  test('labels a span finding with the full range the doc wrote', () => {
    const docs = [{path: 'docs/features/x.md', content: '`packages/functions/src/a.js:99-105`'}];
    const {findings} = analyzeCitations({docs, trackedFiles: tracked, lineCountOf});
    expect(findings[0].citation).toBe('packages/functions/src/a.js:99-105');
  });

  test('labels a single-line finding without a range', () => {
    const docs = [{path: 'docs/features/x.md', content: '`packages/functions/src/a.js:120`'}];
    const {findings} = analyzeCitations({docs, trackedFiles: tracked, lineCountOf});
    expect(findings[0].citation).toBe('packages/functions/src/a.js:120');
  });

  test('honours a citation-skip comment', () => {
    const docs = [
      {
        path: 'docs/features/x.md',
        content: '`packages/functions/src/gone.js:5` <!-- citation-skip: fleet-only -->'
      }
    ];
    const {findings, stats} = analyzeCitations({docs, trackedFiles: tracked, lineCountOf});
    expect(findings).toEqual([]);
    expect(stats.skipped).toBe(1);
  });

  // One reason, three dead citations: the gate reported 0 findings and "skipped: 3".
  test('one skip comment cannot silence three dead citations', () => {
    const docs = [
      {
        path: 'docs/features/x.md',
        content:
          '`packages/f/gone1.js:5` `packages/f/gone2.js:5` `packages/f/gone3.js:5` ' +
          '<!-- citation-skip: one reason -->'
      }
    ];
    const {findings, stats} = analyzeCitations({docs, trackedFiles: tracked, lineCountOf});
    expect(findings).toHaveLength(2);
    expect(stats.skipped).toBe(1);
  });

  // stats.skipped counts uses of the escape hatch. A shorthand citation was never checkable, so
  // skipping it is a no-op that must not inflate the number the spec promises is countable.
  test('stats.skipped counts only anchored citations, not shorthand', () => {
    const docs = [
      {path: 'docs/features/x.md', content: '`service.js:165` <!-- citation-skip: shorthand -->'}
    ];
    const {stats} = analyzeCitations({docs, trackedFiles: tracked, lineCountOf});
    expect(stats.skipped).toBe(0);
    expect(stats.shorthand).toBe(1);
  });

  // Regression: measurement found suffix matching resolved this to the 80-line
  // weapons/service.js and reported a live citation dead. Never resolve shorthand.
  test('skips domain shorthand instead of resolving it', () => {
    const docs = [{path: '.claude/skills/elasticsearch/SKILL.md', content: '`service.js:165`'}];
    const {findings, stats} = analyzeCitations({docs, trackedFiles: tracked, lineCountOf});
    expect(findings).toEqual([]);
    expect(stats.shorthand).toBe(1);
    expect(stats.anchored).toBe(0);
  });

  // Regression: package.json in packages/functions/CLAUDE.md means its sibling,
  // not the 95-line root package.json.
  test('skips a document-relative package.json citation', () => {
    const docs = [{path: 'packages/functions/CLAUDE.md', content: '`package.json:121-122`'}];
    const {findings, stats} = analyzeCitations({docs, trackedFiles: tracked, lineCountOf});
    expect(findings).toEqual([]);
    expect(stats.shorthand).toBe(1);
  });
});
