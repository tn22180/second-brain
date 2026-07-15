---
description: Generate merge request description with design doc links
argument-hint: [optional: MR title or feature name]
---

## Feature
$ARGUMENTS

## Instructions

### Step 1: Analyze Changes

```bash
# What branch are we on?
git branch --show-current

# What changed vs target branch?
git log --oneline origin/master..HEAD
git diff --stat origin/master..HEAD

# List all changed files
git diff --name-only origin/master..HEAD
```

### Step 2: Find Related Design Artifacts

```bash
# Design doc
ls docs/design/features/feat-*.md

# API spec
ls docs/api/feat-*.yaml

# Plan
ls docs/features/*.md
```

### Step 3: Categorize Changes

Group changed files by area:

| Area | Files | Changes |
|------|-------|---------|
| **Backend — Repository** | `repositories/*.js` | New/modified collections |
| **Backend — Service** | `services/*.js` | Business logic |
| **Backend — Controller** | `controllers/*.js` | API handlers |
| **Backend — Routes** | `routes/*.js` | New endpoints |
| **Backend — Middleware** | `middleware*/*.js` | Auth, validation |
| **Backend — Background** | `handlers/pubsub/*.js`, `handlers/schedule/*.js` | Async processing |
| **Frontend — Pages** | `pages/*.js` | UI components |
| **Frontend — Hooks** | `hooks/*.js` | Custom hooks |
| **Extensions** | `extensions/` | Shopify extensions |
| **Config** | `firestore-indexes/`, `config/` | Infrastructure |
| **Docs** | `docs/` | Documentation |

### Step 4: Generate MR Description

```markdown
## What

[1-3 sentences: what this MR does and why]

## Design

- 📐 Design doc: `docs/design/features/feat-{slug}.md` (or "N/A — task size XS/S")
- 📋 API spec: `docs/api/feat-{slug}.yaml` (or "N/A")

## Changes

### Backend
- [List key backend changes with file paths]

### Frontend
- [List key frontend changes with file paths]

### Extensions
- [List extension changes, or "None"]

### Database
- **New collections:** [list or "None"]
- **New indexes:** [list or "None"]
- **Schema changes:** [list or "None"]

## How to Test

### Prerequisites
- [ ] [Any setup needed]

### Test Steps
1. [Step-by-step manual testing instructions]
2. [Include specific test data if needed]
3. [Verify expected outcomes]

### Edge Cases to Check
- [ ] [Edge case 1]
- [ ] [Edge case 2]

## Multi-Tenant Check
- [ ] All Firestore queries scoped by `shopId`
- [ ] No cross-shop data leakage
- [ ] Redis cache keys prefixed with shop identifier

## Performance Check
- [ ] Webhook handlers respond < 5 seconds
- [ ] No `await` in loops
- [ ] Batch operations ≤ 500 items
- [ ] Redis cache has Firestore fallback

## Rollout
- [ ] Feature flag: [name] (or "No feature flag needed")
- [ ] Migration needed: [yes/no]
- [ ] Backward compatible: [yes/no]

## Screenshots (if UI changes)
[Attach screenshots or "No UI changes"]
```

### Step 5: Output

1. Print the full MR description in markdown
2. If on a feature branch, suggest the git push command:
   ```bash
   git push origin $(git branch --show-current)
   ```
3. Note any missing items (no design doc, no tests, etc.)
