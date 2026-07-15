---
description: Extract patterns and lessons from the current MR/branch and update .claude/ skills
argument-hint: [optional: area to focus on]
---

# Learn From MR

Analyze changes in the current MR/branch to extract patterns, approaches, and lessons learned. Update `.claude/` skills, rules, and agents accordingly.

## Arguments
- `$ARGUMENTS` - Optional: specific area to focus on (e.g., "repository patterns", "storefront", "constants")

## Process

### Phase 1: Analyze Changes

1. **Get changed files in current branch**
```bash
git diff master --name-only
```

2. **Review the actual changes**
```bash
git diff master -- [files]
```

3. **Identify patterns and approaches used:**
   - New architectural patterns
   - Refactoring decisions made
   - Code organization changes
   - API/data flow decisions
   - Performance optimizations
   - Security improvements

### Phase 2: Compare to Current Documentation

Review existing `.claude/` files for gaps:

| Area | Files to Check |
|------|----------------|
| Layer architecture | `.claude/skills/layer-architecture/SKILL.md` |
| Backend patterns | `.claude/skills/backend/SKILL.md` |
| Frontend patterns | `.claude/skills/frontend/SKILL.md` |
| Firestore patterns | `.claude/skills/firestore/SKILL.md` |
| Shopify API | `.claude/skills/shopify-api/SKILL.md` |
| Scripttag/Storefront | `.claude/skills/scripttag/SKILL.md` |
| API design | `.claude/skills/api-design/SKILL.md` |
| Planner agent | `.claude/agents/planner.md` |
| Code reviewer | `.claude/agents/code-reviewer.md` |
| Commands | `.claude/commands/*.md` |

### Phase 3: Extract Lessons

For each significant pattern or decision found:

1. **Document the pattern**
   - What was done?
   - Why was it done this way?
   - What's the benefit?

2. **Check if already documented**
   - Is this pattern in `.claude/` already?
   - Is the existing documentation complete?
   - Does it need updating or expanding?

3. **Categorize the update**
   - New rule to add
   - Existing rule to clarify
   - New example to add
   - New skill section needed
   - Agent prompt update

### Phase 4: Propose Updates

Output a structured list of updates:

```markdown
## Proposed `.claude/` Updates

### New Patterns Found

1. **[Pattern Name]**
   - Found in: `path/to/file.js`
   - Description: [what and why]
   - Update target: `.claude/skills/xxx/SKILL.md`

### Rules to Add/Update

1. **[Rule]**
   - Current state: [missing / incomplete / outdated]
   - Proposed change: [add / update / clarify]
   - Target file: `.claude/skills/xxx/SKILL.md`

### Examples to Add

1. **[Example]**
   - Context: [when to use]
   - Target: `.claude/commands/xxx.md`
```

### Phase 5: Apply Updates

After user approval, update the relevant `.claude/` files:

1. Add new patterns to appropriate skills
2. Update rules
3. Add examples to commands
4. Update agent prompts if needed

## Focus Areas

### Code Patterns
- Early return usage
- map/filter/reduce vs for loops
- Error handling patterns
- Async/await patterns
- Destructuring patterns

### Architecture
- Handler → Service → Repository flow
- Multi-tenant (shopId) scoping
- Constants organization
- Shared code between packages

### Shopify Integration
- API choices (GraphQL vs REST vs Bulk)
- Metafield patterns
- Webhook handling
- App Bridge usage
- Theme App Extension patterns

### Performance
- Parallel execution (Promise.all)
- Lazy loading
- Bundle optimization
- Firestore query optimization

### Storefront
- Data delivery (metafield vs API)
- Script loading patterns
- Widget initialization

## Output Format

```markdown
# MR Learning Report

## Branch: [branch-name]
## Files Changed: [count]

## Key Patterns Identified

### 1. [Pattern Name]
- **What**: [description]
- **Why**: [rationale]
- **Example**: [code snippet]
- **Status**: [New / Already documented / Needs update]

## Proposed Updates

### [Target File]
- [ ] [Specific change to make]

## Summary
- New patterns: X
- Updates needed: Y
- Already documented: Z
```

---

Now analyze the current MR: $ARGUMENTS
