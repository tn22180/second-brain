# Documentation Management

## Key Documentation Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Main instructions, quick reference |
| `.claude/workflows/*.md` | Development workflows and rules |
| `.claude/skills/*/SKILL.md` | Domain-specific knowledge |
| `.claude/commands/*.md` | Slash command definitions |
| `.claude/agents/*.md` | Agent configurations |
| `packages/functions/index.d.ts` | TypeScript type definitions |

## When to Update Documentation

### After Feature Implementation
- Update `index.d.ts` if new types/interfaces added
- Run `/typedoc` to update JSDoc comments
- Add to relevant skill file if new pattern established

### After Learning from Code Reviews
- Run `/learn-from-mr` to extract patterns
- Update `.claude/workflows/development-rules.md` with new rules
- Update relevant skill files with examples

### After Adding New Commands/Skills
- Update `CLAUDE.md` commands table
- Update `CLAUDE.md` skills table

## Plans Directory

### Location
Save implementation plans in `./docs/features/` (or `./plans/`) directory.

### Naming Convention
```
docs/features/{feature-name}.md
plans/YYMMDD-HHMM-feature-name/
├── plan.md           # Overview with phases
├── phase-01-*.md     # Detailed phase files
└── research/         # Research notes if needed
```

### Plan File Structure

**Overview (plan.md):**
- Keep under 80 lines
- List phases with status
- Key dependencies
- Success criteria

**Phase Files:**
- Context and related files
- Requirements (functional + non-functional)
- Implementation steps (numbered)
- Affected files list
- Todo checklist
- Risk assessment

## Update Protocol

1. **Before:** Read current documentation state
2. **During:** Maintain consistency with existing patterns
3. **After:** Verify cross-references are accurate
4. **Quality:** Ensure updates match actual implementation
