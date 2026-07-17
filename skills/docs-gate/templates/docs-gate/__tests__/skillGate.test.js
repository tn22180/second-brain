// scripts/docs-gate/__tests__/skillGate.test.js
const {parseFrontmatter, analyzeSkillGate} = require('../skillGate');

const good = `---
name: thing
description: does a thing
trigger: fires on "reindex backfill", which CLAUDE.md never mentions
why-not-claude-md: CLAUDE.md has no room for the 6-stage chunk state machine
---

# Thing
`;

describe('parseFrontmatter', () => {
  test('parses simple key: value pairs', () => {
    expect(parseFrontmatter(good).name).toBe('thing');
    expect(parseFrontmatter(good)['why-not-claude-md']).toMatch(/6-stage/);
  });

  test('returns null when there is no frontmatter', () => {
    expect(parseFrontmatter('# Just a heading')).toBeNull();
  });
});

describe('analyzeSkillGate', () => {
  const run = content =>
    analyzeSkillGate({
      skills: [{path: '.claude/skills/x/SKILL.md', content}],
      alwaysLoadedPaths: []
    });

  test('passes a skill with both keys filled in', () => {
    expect(run(good).findings).toEqual([]);
  });

  test('fails a skill missing the trigger key', () => {
    const c = good.replace(/trigger: .*\n/, '');
    expect(run(c).findings[0].reason).toMatch(/trigger/);
  });

  test('fails a skill missing why-not-claude-md', () => {
    const c = good.replace(/why-not-claude-md: .*\n/, '');
    expect(run(c).findings[0].reason).toMatch(/why-not-claude-md/);
  });

  test('fails an empty key', () => {
    const c = good.replace(/trigger: .*/, 'trigger:');
    expect(run(c).findings[0].reason).toMatch(/trigger/);
  });

  test('fails boilerplate placeholder text', () => {
    const c = good.replace(/trigger: .*/, 'trigger: TODO');
    expect(run(c).findings[0].reason).toMatch(/boilerplate/);
  });

  test('fails angle-bracket placeholder text', () => {
    const c = good.replace(/trigger: .*/, 'trigger: <describe when this fires>');
    expect(run(c).findings[0].reason).toMatch(/boilerplate/);
  });

  test('fails a skill with no frontmatter at all', () => {
    expect(run('# Thing').findings[0].reason).toMatch(/frontmatter/);
  });

  test('warns when most cited paths are already always-loaded', () => {
    const c = good + '\nSee `packages/a/x.js:1` and `packages/a/y.js:2`.\n';
    const {findings, stats} = analyzeSkillGate({
      skills: [{path: '.claude/skills/x/SKILL.md', content: c}],
      alwaysLoadedPaths: ['packages/a/x.js', 'packages/a/y.js']
    });
    expect(findings).toEqual([]);
    expect(stats.warnings[0]).toMatch(/100%/);
  });

  test('fails boilerplate that has real words trailing the placeholder token', () => {
    const c = good.replace(/trigger: .*/, 'trigger: TODO fill in later');
    expect(run(c).findings[0].reason).toMatch(/boilerplate/);
  });

  test('fails a whole-value "..." placeholder', () => {
    const c = good.replace(/trigger: .*/, 'trigger: ...');
    expect(run(c).findings[0].reason).toMatch(/boilerplate/);
  });

  // These three are real, repo-plausible justification text that happens to open with a
  // boilerplate marker character. A prefix-anchored regex flags them as false positives — the
  // gate must only reject `<...>`/`...` when they ARE the entire value, not when they merely
  // open a longer sentence.
  test('passes real trigger text that opens with a bracketed term, not a placeholder', () => {
    const c = good.replace(
      /trigger: .*/,
      'trigger: <script> injection is the exact vector this skill defends against'
    );
    expect(run(c).findings).toEqual([]);
  });

  test('passes real trigger text that opens with a JSX component tag', () => {
    const c = good.replace(
      /trigger: .*/,
      'trigger: <AnchorTextModal /> mounting is what triggers this, not CLAUDE.md text'
    );
    expect(run(c).findings).toEqual([]);
  });

  test('passes real trigger text that opens with an ellipsis continuation', () => {
    const c = good.replace(
      /trigger: .*/,
      'trigger: ... continues the roadmap doc scoped decision to split this out'
    );
    expect(run(c).findings).toEqual([]);
  });
});

describe('parseFrontmatter — YAML block scalars', () => {
  test('folded ">" with wrapped continuation lines parses to the joined text, not ">"', () => {
    const content = `---
name: thing
trigger: >
  fires on "reindex backfill", phrases CLAUDE.md never mentions
why-not-claude-md: >
  CLAUDE.md has no room for the 6-stage chunk state machine
---
`;
    const fm = parseFrontmatter(content);
    expect(fm.trigger).toBe('fires on "reindex backfill", phrases CLAUDE.md never mentions');
    expect(fm['why-not-claude-md']).toBe(
      'CLAUDE.md has no room for the 6-stage chunk state machine'
    );
  });

  test('regression: a folded key with no body must fail the gate, not pass with ">"', () => {
    const content = `---
name: thing
description: does a thing
trigger: >
why-not-claude-md: >
---
`;
    const fm = parseFrontmatter(content);
    expect(fm.trigger).toBe('');
    expect(fm['why-not-claude-md']).toBe('');

    const {findings} = analyzeSkillGate({
      skills: [{path: '.claude/skills/x/SKILL.md', content}],
      alwaysLoadedPaths: []
    });
    expect(findings.length).toBe(2);
    expect(findings[0].reason).toMatch(/trigger/);
    expect(findings[1].reason).toMatch(/why-not-claude-md/);
  });

  test('literal "|" joins continuation lines with newlines, not spaces', () => {
    const content = `---
trigger: |
  line one
  line two
---
`;
    expect(parseFrontmatter(content).trigger).toBe('line one\nline two');
  });

  test('folded "-" chomping strips trailing blank continuation lines', () => {
    const content = `---
trigger: >-
  fires on real triggers

why-not-claude-md: filled in
---
`;
    expect(parseFrontmatter(content).trigger).toBe('fires on real triggers');
  });

  test('literal "+" chomping keeps trailing blank continuation lines', () => {
    const content = `---
trigger: |+
  line one

why-not-claude-md: filled in
---
`;
    expect(parseFrontmatter(content).trigger).toBe('line one\n');
  });

  test('a block scalar skill with real folded text passes the gate cleanly', () => {
    const content = `---
name: bigquery-billing
description: >
  BigQuery exports, views, and analytics for Avada SEO. Use for "BigQuery",
  "credit history export".
trigger: >
  fires on "BigQuery", "credit history export", "bq views" — terms CLAUDE.md
  never mentions
why-not-claude-md: >
  CLAUDE.md has no room for the view/export schema and deploy-views.sh flow
---
`;
    // Assert on the PARSED VALUE, not just the finding count. Before block-scalar support,
    // parseFrontmatter read `trigger: >` as the literal one-character value ">" — that's neither
    // empty (so it doesn't trip the "missing" check) nor a boilerplate marker (so it doesn't trip
    // BOILERPLATE_RE either), so `findings` comes back empty against the OLD broken parser too.
    // A findings-only assertion can't tell the two apart. Pinning the joined text makes this test
    // actually discriminate the bug this scenario is named after.
    const fm = parseFrontmatter(content);
    expect(fm.trigger).toBe(
      'fires on "BigQuery", "credit history export", "bq views" — terms CLAUDE.md never mentions'
    );
    expect(fm['why-not-claude-md']).toBe(
      'CLAUDE.md has no room for the view/export schema and deploy-views.sh flow'
    );

    const {findings} = analyzeSkillGate({
      skills: [{path: '.claude/skills/bigquery-billing/SKILL.md', content}],
      alwaysLoadedPaths: []
    });
    expect(findings).toEqual([]);
  });

  test('plain key: value still parses exactly as before (no regression)', () => {
    expect(parseFrontmatter(good).trigger).toBe(
      'fires on "reindex backfill", which CLAUDE.md never mentions'
    );
  });
});
