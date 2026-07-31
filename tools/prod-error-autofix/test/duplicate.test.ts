import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {citedFiles, duplicateOf, loadPriorFixes, type PriorFix} from '../src/brain/duplicate';

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

describe('citedFiles', () => {
  test('reads the ## Code section in order, deduped, without line numbers', () => {
    const text = incident({files: [...OPENAI, 'packages/functions/src/services/openAi.service.js']});
    expect(citedFiles(text)).toEqual(OPENAI);
  });

  test('stops at the next section — evidence queries are not citations', () => {
    expect(citedFiles(incident({files: ['a.js']}))).toEqual(['a.js']);
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
    expect(citedFiles(text)).toEqual(['a.js', 'b.js']);
  });

  test('an incident with no Code section cites nothing', () => {
    expect(citedFiles('# incident\n\n## Job\n- cost: $1\n')).toEqual([]);
  });
});

describe('duplicateOf', () => {
  const prior: PriorFix = {fingerprint: '1ce20uv', mrUrl: 'https://gitlab.com/x/-/merge_requests/795', files: OPENAI};

  test('the real 1ce20uv/1h51j7i pair is caught', () => {
    // 1h51j7i cited the same three files, ranked slightly differently.
    const now = [OPENAI[0]!, OPENAI[2]!, OPENAI[1]!];
    const dup = duplicateOf(now, [prior])!;
    expect(dup.prior.fingerprint).toBe('1ce20uv');
    expect(dup.overlap).toBe(1);
  });

  test('a different primary citation is not a duplicate, however much else overlaps', () => {
    // Same supporting files, but the accused line is elsewhere — a different defect
    // that happens to live in the same subsystem.
    expect(duplicateOf([OPENAI[1]!, OPENAI[0]!, OPENAI[2]!], [prior])).toBeUndefined();
  });

  test('sharing only the primary file is below the bar', () => {
    const now = [OPENAI[0]!, 'a.js', 'b.js', 'c.js', 'd.js'];
    expect(duplicateOf(now, [prior])).toBeUndefined();
  });

  test('no citations means no verdict, never a false match', () => {
    expect(duplicateOf([], [prior])).toBeUndefined();
  });

  test('the strongest overlap wins when two priors match', () => {
    const weaker: PriorFix = {fingerprint: 'weak', mrUrl: 'u', files: [OPENAI[0]!, 'x.js', 'y.js']};
    const dup = duplicateOf(OPENAI, [weaker, prior])!;
    expect(dup.prior.fingerprint).toBe('1ce20uv');
  });

  test('the shared files are reported, so the reply can name them', () => {
    expect(duplicateOf(OPENAI, [prior])!.sharedFiles).toEqual(OPENAI);
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
