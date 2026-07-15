---
description: Create implementation plan for a feature or task
argument-hint: [task description]
---

## Task
$ARGUMENTS

## Reference Skills (MUST read before planning)
- `.claude/skills/layer-architecture/SKILL.md` — **Layer rules, import direction, service/repo/presenter templates, anti-patterns**
- `.claude/skills/backend/SKILL.md` — Async patterns, Firebase functions, PubSub
- `.claude/skills/firestore/SKILL.md` — Repository helpers, query patterns, indexes
- `.claude/skills/api-design/SKILL.md` — Controller pattern, response format
- `.claude/skills/software-architect/SKILL.md` — Architecture decisions, Firestore design

## Instructions

### Step 0: Gather Context

**If a task-tracker URL/ID is provided in `$ARGUMENTS`:** Read the linked task body for
requirements and acceptance criteria before planning.

### Step 1: Plan

Use the `planner` agent to:
1. Read relevant reference skills above (especially `layer-architecture` for backend refactoring tasks)
2. Research the codebase and Shopify APIs
3. Analyze architecture requirements
4. Create a comprehensive implementation plan that follows layer rules

## Output Requirements

**MANDATORY:** Save the plan to `docs/features/{feature-name}.md`

### Plan Document Structure

```markdown
# {Feature Name} Implementation Plan

## Overview
Brief description of the feature and its purpose.

## Requirements
- List of functional requirements
- List of non-functional requirements

## Architecture
- Components affected
- Data flow
- Dependencies

## API Changes (if applicable)
- New endpoints
- Modified endpoints
- Request/response formats

## Database Changes (if applicable)
- New collections/fields
- Firestore indexes (add to `firestore-indexes/{collection}.json`)
- Migrations needed

## Global Constraints
Cross-cutting rules EVERY task must honor — SDD hands this block verbatim to each task's reviewer. Include exact values/formats, `shopId` multi-tenant scoping, response shape `{success, data, error}`, webhook <5s, feature-flag/rollout + rollback notes.

## Tasks (SDD-executable)
Break the work into numbered, **self-contained** tasks that `superpowers:subagent-driven-development` runs one at a time. Rules:
- Each task is a `## Task N: {title}` heading — `task-brief` extracts a task by this exact heading pattern.
- Tasks are the **LAST** sections of the doc: put nothing but more `## Task` headings after them (a task's brief captures everything until the next task heading).
- Each task carries everything its implementer needs — assume **no** cross-task context. Order core-logic-first.

## Task 1: {title}
- **Owner agent**: {backend-implementer | frontend-implementer}
- **Files**: `path/to/file` — what changes
- **Steps**: concrete implementation steps
- **Interfaces**: signatures/contracts later tasks depend on
- **Tests**: unit/integration to add (TDD)
- **Acceptance**: observable done-criteria

## Task 2: {title}
- (same shape)
```

**DO NOT** start implementing - only create the plan and save to docs.
