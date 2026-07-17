const fs = require('fs');
const path = require('path');
const {isLiving, resolveLivingFiles, lineCountOf, REPO_ROOT} = require('../gitContext');

// lineCountOf reads the filesystem, so it is tested against real tracked files rather than a stub.
// Every citation test stubs it, which is exactly how a +1 error survived: the suite was green while
// `worker.config.yml:50-221` passed against a 220-line file.
//
// Expectations are derived by counting '\n' — `wc -l` semantics — rather than hardcoding a literal,
// because that is an genuinely independent algorithm from the split/pop under test, and it does not
// wire the suite to the current length of a config file that legitimately grows.
function wcL(relPath) {
  const content = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
  const newlines = (content.match(/\n/g) || []).length;
  return content.endsWith('\n') || content === '' ? newlines : newlines + 1;
}

describe('lineCountOf', () => {
  // Ends in a trailing newline. The trailing newline TERMINATES line 220; it does not open a 221st.
  const WITH_NEWLINE = 'packages/functions/worker.config.yml';
  // The rare tracked file with NO trailing newline: its last line still counts.
  const WITHOUT_NEWLINE = '.vscode/launch.json';

  test('a trailing newline does not invent an extra line', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, WITH_NEWLINE), 'utf8');
    expect(content.endsWith('\n')).toBe(true); // guard: the fixture must still be this shape
    expect(lineCountOf(WITH_NEWLINE)).toBe(wcL(WITH_NEWLINE));
    // Pin the bug directly: the naive split('\n').length is one too many.
    expect(lineCountOf(WITH_NEWLINE)).toBe(content.split('\n').length - 1);
  });

  test('a file with no trailing newline still counts its last line', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, WITHOUT_NEWLINE), 'utf8');
    expect(content.endsWith('\n')).toBe(false); // guard: the fixture must still be this shape
    expect(lineCountOf(WITHOUT_NEWLINE)).toBe(wcL(WITHOUT_NEWLINE));
    // Here split('\n').length happens to be right — the fix must not over-correct and drop a line.
    expect(lineCountOf(WITHOUT_NEWLINE)).toBe(content.split('\n').length);
  });

  // The end-to-end version of the same bug, wired through the real check with the real
  // lineCountOf. This is the test the citation suite could not have: it stubs lineCountOf, so it
  // could never see that the number was wrong. `worker.config.yml:50-221` is the citation that was
  // live in this branch while the gate reported PASS.
  // NB: the cited line is derived from wcL(), NOT from lineCountOf(). Deriving it from the
  // function under test would make this tautological — `total + 1` is "past EOF" for whatever
  // total the function returns, including a wrong one. Anchoring to the independent count is what
  // makes this fail when the off-by-one comes back.
  test('analyzeCitations flags a citation one line past a real EOF', () => {
    const {analyzeCitations} = require('../citations');
    const pastEof = wcL(WITH_NEWLINE) + 1; // = 221 against the real 220-line file

    const {findings} = analyzeCitations({
      docs: [{path: 'docs/features/fake.md', content: `cites ${WITH_NEWLINE}:50-${pastEof}`}],
      trackedFiles: [WITH_NEWLINE],
      lineCountOf
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].reason).toMatch(/past end of file/);
    expect(findings[0].citation).toBe(`${WITH_NEWLINE}:50-${pastEof}`);
  });

  test('analyzeCitations accepts a citation ending exactly at a real EOF', () => {
    const {analyzeCitations} = require('../citations');
    const lastLine = wcL(WITH_NEWLINE); // = 220, the real last line

    const {findings} = analyzeCitations({
      docs: [{path: 'docs/features/fake.md', content: `cites ${WITH_NEWLINE}:50-${lastLine}`}],
      trackedFiles: [WITH_NEWLINE],
      lineCountOf
    });

    expect(findings).toEqual([]);
  });
});

describe('isLiving', () => {
  test('admits a one-level-deep package CLAUDE.md', () => {
    expect(isLiving('packages/functions/CLAUDE.md')).toBe(true);
    expect(isLiving('packages/copyright/CLAUDE.md')).toBe(true);
  });

  test('rejects a nested packages/foo/bar/CLAUDE.md', () => {
    expect(isLiving('packages/foo/bar/CLAUDE.md')).toBe(false);
  });

  test('admits the exact-match living files', () => {
    expect(isLiving('CLAUDE.md')).toBe(true);
    expect(isLiving('PATTERNS.md')).toBe(true);
    expect(isLiving('.cursorrules')).toBe(true);
  });

  test('admits docs/features, docs/runbooks and .claude/skills markdown', () => {
    expect(isLiving('docs/features/sitemap.md')).toBe(true);
    expect(isLiving('docs/runbooks/worker-fleet.md')).toBe(true);
    expect(isLiving('.claude/skills/firestore/SKILL.md')).toBe(true);
  });

  test('excludes docs/superpowers/specs and docs/superpowers/plans', () => {
    expect(isLiving('docs/superpowers/specs/docs-gate.md')).toBe(false);
    expect(isLiving('docs/superpowers/plans/docs-gate.md')).toBe(false);
  });

  test('does not admit a false-prefix path like docs/features-other/x.md', () => {
    expect(isLiving('docs/features-other/x.md')).toBe(false);
  });

  test('rejects a non-.md file inside a living dir', () => {
    expect(isLiving('docs/features/diagram.png')).toBe(false);
  });
});

describe('resolveLivingFiles', () => {
  test('returns exact-match files plus every tracked packages/*/CLAUDE.md', () => {
    const tracked = [
      'CLAUDE.md',
      'PATTERNS.md',
      '.cursorrules',
      'packages/functions/CLAUDE.md',
      'packages/assets/CLAUDE.md',
      'packages/functions/src/app.js'
    ];
    const result = resolveLivingFiles(tracked);
    expect(result).toEqual([
      'CLAUDE.md',
      'PATTERNS.md',
      '.cursorrules',
      'packages/functions/CLAUDE.md',
      'packages/assets/CLAUDE.md'
    ]);
  });

  test('does not invent entries for packages absent from the tracked list', () => {
    const tracked = ['CLAUDE.md', 'packages/functions/CLAUDE.md'];
    const result = resolveLivingFiles(tracked);
    expect(result).not.toContain('packages/copyright/CLAUDE.md');
    expect(result).not.toContain('packages/assets/CLAUDE.md');
  });
});
