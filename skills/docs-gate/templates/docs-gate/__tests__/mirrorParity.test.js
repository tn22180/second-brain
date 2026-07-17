const {analyzeMirrorParity, mirrorOf, isMirrored} = require('../mirrorParity');

describe('mirrorOf', () => {
  test('maps .claude -> .agent, including the renamed dirs', () => {
    expect(mirrorOf('.claude/skills/sitemap/SKILL.md')).toBe('.agent/skills/sitemap/SKILL.md');
    expect(mirrorOf('.claude/agents/planner.md')).toBe('.agent/agents/planner.md');
    // commands -> workflows, workflows -> rules. The scaffold's rename, not ours.
    expect(mirrorOf('.claude/commands/plan.md')).toBe('.agent/workflows/plan.md');
    expect(mirrorOf('.claude/workflows/documentation-management.md')).toBe(
      '.agent/rules/documentation-management.md'
    );
  });

  test('maps .agent -> .claude', () => {
    expect(mirrorOf('.agent/skills/sitemap/SKILL.md')).toBe('.claude/skills/sitemap/SKILL.md');
    expect(mirrorOf('.agent/workflows/plan.md')).toBe('.claude/commands/plan.md');
    expect(mirrorOf('.agent/rules/documentation-management.md')).toBe(
      '.claude/workflows/documentation-management.md'
    );
  });

  test('ignores paths outside the mirror', () => {
    // .claude/hooks has no .agent counterpart by design.
    expect(mirrorOf('.claude/hooks/auto-lint.sh')).toBe(null);
    expect(mirrorOf('packages/functions/src/app.js')).toBe(null);
    expect(isMirrored('.claude/hooks/auto-lint.sh')).toBe(false);
    expect(isMirrored('.claude/settings.json')).toBe(false);
    expect(isMirrored('.claude/skills/x/SKILL.md')).toBe(true);
  });
});

describe('analyzeMirrorParity', () => {
  const pair = (claudePath, agentPath, content) => [
    {path: claudePath, content},
    {path: agentPath, content}
  ];

  test('passes an identical mirror', () => {
    const {findings, stats} = analyzeMirrorParity({
      files: pair('.claude/skills/a/SKILL.md', '.agent/skills/a/SKILL.md', 'same')
    });
    expect(findings).toEqual([]);
    expect(stats.pairs).toBe(1);
  });

  test('fails when the two copies drifted', () => {
    const {findings} = analyzeMirrorParity({
      files: [
        {path: '.claude/skills/a/SKILL.md', content: 'new text'},
        {path: '.agent/skills/a/SKILL.md', content: 'stale text'}
      ]
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].reason).toMatch(/drifted/);
  });

  // The hazard the scaffold's hand-copy steps invite.
  test('fails when a .claude file was never mirrored', () => {
    const {findings} = analyzeMirrorParity({
      files: [{path: '.claude/skills/a/SKILL.md', content: 'x'}]
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].counterpart).toBe('.agent/skills/a/SKILL.md');
    expect(findings[0].reason).toMatch(/not mirrored/);
  });

  // CRITICAL 3: a skill pack added ONLY under .agent/skills/ bypassed the skill gate and the
  // citation check entirely. Parity makes it fail — it has no source under .claude/.
  test('fails a skill that exists only under .agent/', () => {
    const {findings} = analyzeMirrorParity({
      files: [{path: '.agent/skills/sneaky/SKILL.md', content: 'no justification anywhere'}]
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].counterpart).toBe('.claude/skills/sneaky/SKILL.md');
    expect(findings[0].reason).toMatch(/mirror, not a source/);
  });

  test('reports drift once, not once per side', () => {
    const {findings} = analyzeMirrorParity({
      files: [
        {path: '.claude/commands/plan.md', content: 'a'},
        {path: '.agent/workflows/plan.md', content: 'b'}
      ]
    });
    expect(findings).toHaveLength(1);
  });

  test('compares across the renamed dirs, not by literal path', () => {
    const {findings, stats} = analyzeMirrorParity({
      files: [
        ...pair('.claude/commands/plan.md', '.agent/workflows/plan.md', 'same'),
        ...pair('.claude/workflows/doc.md', '.agent/rules/doc.md', 'same')
      ]
    });
    expect(findings).toEqual([]);
    expect(stats.pairs).toBe(2);
  });
});
