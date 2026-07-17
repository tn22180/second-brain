const {analyzeFeatureDoc} = require('../featureDoc');

const SRC = 'packages/functions/src/services/thing.js';
const DOC = 'docs/features/thing.md';

describe('analyzeFeatureDoc', () => {
  test('ignores a fix/ branch', () => {
    const {findings, stats} = analyzeFeatureDoc({
      branch: 'fix/some-bug',
      changedFiles: [SRC],
      commitMessages: ['fix: a bug']
    });
    expect(findings).toEqual([]);
    expect(stats.gated).toBe(false);
  });

  test('gates a feat/ branch and a feature/ branch alike', () => {
    ['feat/x', 'feature/x'].forEach(branch => {
      const {findings} = analyzeFeatureDoc({
        branch,
        changedFiles: [SRC],
        commitMessages: ['feat: x']
      });
      expect(findings).toHaveLength(1);
      expect(findings[0].reason).toMatch(/docs\/features/);
    });
  });

  test('passes a feat/ branch that changes a feature doc', () => {
    const {findings} = analyzeFeatureDoc({
      branch: 'feat/x',
      changedFiles: [SRC, DOC],
      presentChangedFiles: [SRC, DOC],
      commitMessages: ['feat: x']
    });
    expect(findings).toEqual([]);
  });

  // The deletion IS the "changed docs/features/*.md" — a feat/* branch could delete every feature
  // doc in the repo and go green, because `git diff --name-only` lists deletions and the check
  // could not tell them apart.
  test('a DELETED feature doc does not satisfy the gate', () => {
    const {findings} = analyzeFeatureDoc({
      branch: 'feat/ship-it',
      changedFiles: [SRC, DOC], // DOC appears in the diff...
      presentChangedFiles: [SRC], // ...but it was deleted, so it does not exist at HEAD
      commitMessages: ['feat: x']
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].reason).toMatch(/docs\/features/);
  });

  test('a deleted SOURCE file still counts as touching feature code', () => {
    const {findings, stats} = analyzeFeatureDoc({
      branch: 'feat/x',
      changedFiles: [SRC], // SRC was deleted...
      presentChangedFiles: [], // ...so nothing survives at HEAD
      commitMessages: ['feat: x']
    });
    expect(stats.gated).toBe(true);
    expect(stats.featureFiles).toBe(1);
    expect(findings).toHaveLength(1);
  });

  // Fail closed: a caller that forgets the new list must not get the old bypass back.
  test('omitting presentChangedFiles fails rather than passing', () => {
    const {findings} = analyzeFeatureDoc({
      branch: 'feat/x',
      changedFiles: [SRC, DOC],
      commitMessages: ['feat: x']
    });
    expect(findings).toHaveLength(1);
  });

  test('passes a feat/ branch touching only tests', () => {
    const {findings} = analyzeFeatureDoc({
      branch: 'feat/x',
      changedFiles: ['packages/functions/src/__tests__/thing.test.js'],
      commitMessages: ['feat: x']
    });
    expect(findings).toEqual([]);
  });

  test('passes a feat/ branch touching no feature code', () => {
    const {findings} = analyzeFeatureDoc({
      branch: 'feat/x',
      changedFiles: ['README.md', 'yarn.lock'],
      commitMessages: ['feat: x']
    });
    expect(findings).toEqual([]);
  });

  test('honours the [no-docs] escape hatch', () => {
    const {findings, stats} = analyzeFeatureDoc({
      branch: 'feat/x',
      changedFiles: [SRC],
      presentChangedFiles: [SRC],
      commitMessages: ['feat: x\n\n[no-docs] internal refactor only']
    });
    expect(findings).toEqual([]);
    expect(stats.escaped).toBe(true);
  });

  // commitMessages is `git log --format=%B` split per line, so an unanchored match let a commit
  // that merely QUOTES an earlier [no-docs] commit exempt the whole branch.
  test('a commit that only mentions an earlier [no-docs] commit does not escape', () => {
    const {findings, stats} = analyzeFeatureDoc({
      branch: 'feat/x',
      changedFiles: [SRC],
      presentChangedFiles: [SRC],
      commitMessages: [
        'Revert "feat: thing"',
        'This reverts commit abc123.',
        '    [no-docs] internal refactor only'
      ]
    });
    expect(stats.escaped).toBe(false);
    expect(findings).toHaveLength(1);
  });

  // The hole: `git branch --show-current` returns '' on a detached HEAD. The old code ran that
  // through FEATURE_BRANCH_RE (never matches ''), took the same exit as a real non-feature
  // branch, and reported zero findings — a silent pass on a branch it could not identify.
  test('an empty/unknown branch fails closed instead of silently passing', () => {
    const {findings, stats} = analyzeFeatureDoc({
      branch: '',
      changedFiles: [SRC],
      presentChangedFiles: [SRC],
      commitMessages: ['feat: x']
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].reason).toMatch(/could not be determined/);
    expect(stats.unknownBranch).toBe(true);
  });

  // Fails closed regardless of what changed — an undeterminable branch can't be ruled safe even
  // when nothing in this diff looks feature-shaped, because we don't actually know what branch
  // that diff belongs to.
  test('an empty branch fails closed even with no feature files changed', () => {
    const {findings, stats} = analyzeFeatureDoc({
      branch: '',
      changedFiles: ['README.md'],
      presentChangedFiles: ['README.md'],
      commitMessages: ['docs: tweak readme']
    });
    expect(findings).toHaveLength(1);
    expect(stats.unknownBranch).toBe(true);
  });

  test('a null/undefined branch also fails closed (not just empty string)', () => {
    const {findings, stats} = analyzeFeatureDoc({
      branch: undefined,
      changedFiles: [SRC],
      commitMessages: ['feat: x']
    });
    expect(findings).toHaveLength(1);
    expect(stats.unknownBranch).toBe(true);
  });

  test('gates extensions/ changes too', () => {
    const {findings} = analyzeFeatureDoc({
      branch: 'feat/x',
      changedFiles: ['extensions/theme-app/blocks/a.liquid'],
      commitMessages: ['feat: x']
    });
    expect(findings).toHaveLength(1);
  });
});
