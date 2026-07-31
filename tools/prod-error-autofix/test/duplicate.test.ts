import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  citedSites,
  duplicateOf,
  loadPriorFixes,
  type CiteSite,
  type PriorFix
} from '../src/brain/duplicate';

/** Shaped exactly like `renderIncident` writes it. */
function incident(input: {files: string[]; mrUrl?: string}): string {
  return [
    '# incident',
    '',
    '## Code',
    ...input.files.map((f, i) => `- \`${f}:${100 + i}\` — why this line`),
    '',
    '## Evidence',
    '- 1 matching entries: `some query`',
    '',
    '## Job',
    '- analyze rounds: 1',
    ...(input.mrUrl ? [`- MR: ${input.mrUrl}`] : []),
    ''
  ].join('\n');
}

// The real pair from 2026-07-31: same defect in getCompletion, message similarity 0.000.
const OPENAI = [
  'packages/functions/src/services/openAi.service.js',
  'packages/functions/src/Schema/zodGenFullBlog.js',
  'packages/functions/src/const/genAIBlog.js'
];

/** `incident()` numbers its citations from 100, so file i sits at line 100 + i. */
const sites = (files: string[]): CiteSite[] => files.map((file, i) => ({file, line: 100 + i}));

describe('citedSites', () => {
  test('reads the ## Code section in order, one entry per file, with its first line', () => {
    const text = incident({files: [...OPENAI, 'packages/functions/src/services/openAi.service.js']});
    expect(citedSites(text)).toEqual(sites(OPENAI));
  });

  test('stops at the next section — evidence queries are not citations', () => {
    expect(citedSites(incident({files: ['a.js']}))).toEqual([{file: 'a.js', line: 100}]);
  });

  /**
   * The first cut of this used `(?=^## |\Z)` to bound the section. `\Z` is the letter Z in
   * JavaScript, so `1ce20uv` lost 6 of its 7 citations at the word `isZodV4` and the gate
   * still returned a confident-looking overlap of 1.00 on a single file.
   */
  test('prose containing a capital Z does not truncate the section', () => {
    const text = [
      '## Code',
      '- `a.js:101` — isZodV4 branch replaces zodResponseFormat(schema)',
      '- `b.js:9` — z.enum(SEARCH_INTENT)',
      '',
      '## Evidence',
      '- `c.js:1` — not a citation'
    ].join('\n');
    expect(citedSites(text)).toEqual([
      {file: 'a.js', line: 101},
      {file: 'b.js', line: 9}
    ]);
  });

  test('an incident with no Code section cites nothing', () => {
    expect(citedSites('# incident\n\n## Job\n- cost: $1\n')).toEqual([]);
  });
});

describe('duplicateOf', () => {
  const prior: PriorFix = {
    fingerprint: '1ce20uv',
    mrUrl: 'https://gitlab.com/x/-/merge_requests/795',
    sites: sites(OPENAI)
  };

  test('the real 1ce20uv/1h51j7i pair is caught', () => {
    // 1h51j7i cited the same three files, ranked slightly differently.
    const now = [
      {file: OPENAI[0]!, line: 100},
      {file: OPENAI[2]!, line: 7},
      {file: OPENAI[1]!, line: 12}
    ];
    const dup = duplicateOf(now, [prior])!;
    expect(dup.prior.fingerprint).toBe('1ce20uv');
    expect(dup.overlap).toBe(1);
  });

  test('a different primary citation is not a duplicate, however much else overlaps', () => {
    // Same supporting files, but the accused line is elsewhere — a different defect
    // that happens to live in the same subsystem.
    const now = [
      {file: OPENAI[1]!, line: 101},
      {file: OPENAI[0]!, line: 100},
      {file: OPENAI[2]!, line: 102}
    ];
    expect(duplicateOf(now, [prior])).toBeUndefined();
  });

  /**
   * The `j3krke` / `se28ls` false positive: both ranked `genAIBlogController.js` first, at
   * :513 (`genIdeas`) and :337 (`genSuggested`). Two defects, one file, and `j3krke` was
   * folded into an MR that fixed neither.
   */
  test('the same primary file in a different function is not a duplicate', () => {
    const far = [{file: OPENAI[0]!, line: 100 + 176}, ...sites(OPENAI).slice(1)];
    expect(duplicateOf(far, [prior])).toBeUndefined();
  });

  test('the same primary file a few lines off is still the same defect', () => {
    const near = [{file: OPENAI[0]!, line: 100 + 12}, ...sites(OPENAI).slice(1)];
    expect(duplicateOf(near, [prior])!.prior.fingerprint).toBe('1ce20uv');
  });

  /**
   * The pipeline hands over raw citations, and an analysis routinely names several lines in
   * one file. Counting each of them against a set-sized union put `overlap` at 1.50 in
   * production — a ratio that cannot exceed 1.
   */
  test('repeat citations of one file do not inflate the overlap past 1', () => {
    const repeated = [
      {file: OPENAI[0]!, line: 100},
      {file: OPENAI[0]!, line: 140},
      {file: OPENAI[0]!, line: 180},
      {file: OPENAI[1]!, line: 101},
      {file: OPENAI[2]!, line: 102}
    ];
    expect(duplicateOf(repeated, [prior])!.overlap).toBe(1);
  });

  test('sharing only the primary file is below the bar', () => {
    const now = [{file: OPENAI[0]!, line: 100}, ...sites(['a.js', 'b.js', 'c.js', 'd.js'])];
    expect(duplicateOf(now, [prior])).toBeUndefined();
  });

  test('no citations means no verdict, never a false match', () => {
    expect(duplicateOf([], [prior])).toBeUndefined();
  });

  test('the strongest overlap wins when two priors match', () => {
    const weaker: PriorFix = {
      fingerprint: 'weak',
      mrUrl: 'u',
      sites: [{file: OPENAI[0]!, line: 100}, ...sites(['x.js', 'y.js'])]
    };
    const dup = duplicateOf(sites(OPENAI), [weaker, prior])!;
    expect(dup.prior.fingerprint).toBe('1ce20uv');
  });

  test('the shared files are reported, so the reply can name them', () => {
    expect(duplicateOf(sites(OPENAI), [prior])!.sharedFiles).toEqual(OPENAI);
  });
});

describe('loadPriorFixes', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autofix-dup-'));
    mkdirSync(join(dir, 'incidents'), {recursive: true});
  });
  afterEach(() => rmSync(dir, {recursive: true, force: true}));

  const write = (fp: string, files: string[], mrUrl?: string) =>
    writeFileSync(join(dir, 'incidents', `${fp}.md`), incident({files, mrUrl}), 'utf8');

  const open = () => true;

  test('only incidents that actually reached an MR count', () => {
    write('withMr', OPENAI, 'https://gitlab.com/x/-/merge_requests/795');
    write('noMr', OPENAI);
    expect(loadPriorFixes(dir, 'other', open).map(p => p.fingerprint)).toEqual(['withMr']);
  });

  test('the fingerprint being analysed never blocks itself', () => {
    write('self', OPENAI, 'https://gitlab.com/x/-/merge_requests/795');
    expect(loadPriorFixes(dir, 'self', open)).toEqual([]);
  });

  /**
   * A merged fix that did not stop the error is a fix that failed, not a duplicate.
   * Blocking on it would leave the system unable to correct its own bad fix.
   */
  test('a resolved prior stops blocking', () => {
    write('done', OPENAI, 'https://gitlab.com/x/-/merge_requests/795');
    expect(loadPriorFixes(dir, 'other', () => false)).toEqual([]);
  });

  test('an incident with an MR but no citations cannot match anything', () => {
    write('empty', [], 'https://gitlab.com/x/-/merge_requests/795');
    expect(loadPriorFixes(dir, 'other', open)).toEqual([]);
  });

  test('a missing incidents dir is empty, not an error', () => {
    expect(loadPriorFixes(join(dir, 'nope'), 'x', open)).toEqual([]);
  });
});
