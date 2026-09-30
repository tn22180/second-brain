import {describe, expect, test} from 'bun:test';
import {inScope, stagedDiff} from '../src/git';
import {makeRepo, sh, write} from './helpers';

describe('inScope', () => {
  test('exact file', () => expect(inScope('src/a.js', ['src/a.js'])).toBe(true));
  test('directory allow entry', () => {
    expect(inScope('src/__tests__/a.test.js', ['src/__tests__/'])).toBe(true);
    expect(inScope('src/__testsX/a.js', ['src/__tests__/'])).toBe(false);
  });
  test('sibling outside', () => expect(inScope('src/b.js', ['src/a.js'])).toBe(false));
});

describe('stagedDiff', () => {
  test('includes untracked files in changed and sha', async () => {
    const repo = makeRepo();
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    write(repo, 'src/__tests__/a.test.js', 'test("x",()=>{});\n');
    const d = await stagedDiff(repo, ['src/a.js', 'src/__tests__/']);
    expect(d.changed.sort()).toEqual(['src/__tests__/a.test.js', 'src/a.js']);
    expect(d.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(d.diff).toContain('a.test.js');
    // index left clean for the next step (open-mr does its own add)
    expect(sh(repo, 'git', 'diff', '--cached', '--name-only')).toBe('');
  });
  test('changes outside allow are not staged or hashed', async () => {
    const repo = makeRepo();
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    const before = await stagedDiff(repo, ['src/a.js']);
    write(repo, 'src/b.js', 'module.exports = 9;\n');
    const after = await stagedDiff(repo, ['src/a.js']);
    expect(after.sha).toBe(before.sha);
    expect(after.changed).toEqual(['src/a.js']);
  });
  test('an edit after hashing changes the sha', async () => {
    const repo = makeRepo();
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    const one = await stagedDiff(repo, ['src/a.js']);
    write(repo, 'src/a.js', 'module.exports = 4;\n');
    const two = await stagedDiff(repo, ['src/a.js']);
    expect(two.sha).not.toBe(one.sha);
  });
  test('empty diff returns no changed files', async () => {
    const repo = makeRepo();
    const d = await stagedDiff(repo, ['src/a.js']);
    expect(d.changed).toEqual([]);
  });
  test('allowed-but-absent new file is legal; tracked deletion is staged', async () => {
    const repo = makeRepo();
    sh(repo, 'rm', 'src/b.js');
    const d = await stagedDiff(repo, ['src/b.js', 'src/new-not-created.js']);
    expect(d.changed).toEqual(['src/b.js']);
  });
  test('sha equals git write-tree after the same add (what open-mr computes)', async () => {
    const repo = makeRepo();
    write(repo, 'src/a.js', 'module.exports = "é漢";\n');
    const d = await stagedDiff(repo, ['src/a.js']);
    sh(repo, 'git', 'add', '--', 'src/a.js');
    expect(sh(repo, 'git', 'write-tree').trim()).toBe(d.sha);
  });
});
