---
description: Document feature changes and updates
argument-hint: [feature name or description]
---

## Feature to Document
$ARGUMENTS

## Instructions

Generate documentation for the current branch's changes compared to master.

### Step 1: Analyze Branch Changes

Run these commands to understand the full scope of changes:

```bash
# Find the base branch
git merge-base HEAD origin/master

# All commits on this branch
git log --oneline $(git merge-base HEAD origin/master)..HEAD

# All changed files grouped by directory
git diff --stat $(git merge-base HEAD origin/master)..HEAD

# Changed files list (for reading key files)
git diff --name-only $(git merge-base HEAD origin/master)..HEAD

# Full diff for specific files when needed
git diff $(git merge-base HEAD origin/master)..HEAD -- path/to/file
```

If a specific feature is mentioned in `$ARGUMENTS`, focus on files and commits related to that feature. Otherwise, document all changes.

### Step 2: Read Changed Files

For each significantly changed file:
- Read the file to understand what it does
- Check the diff to understand what was added/changed
- Group related files into features

### Step 3: Determine Documentation Type

| Change Type | Documentation Needed |
|-------------|---------------------|
| New API endpoint | API docs, examples, response format |
| New feature | Feature description, usage, configuration |
| Breaking change | Migration guide, changelog |
| Bug fix | Changelog entry |
| Configuration change | Settings documentation |
| New integration | Integration guide |
| Security fix | Security audit notes |
| New system/architecture | Architecture overview, key files reference |

### Step 4: Generate Documentation

Based on the changes, create or update documentation in `docs/`:

1. **Architecture/System docs** (for new systems)
   - Overview and design decisions
   - Component diagram (text-based)
   - Key files reference table
   - Configuration and environment setup

2. **Feature docs** (for new features)
   - Purpose and use case
   - How it works (workflow/phases)
   - Configuration options
   - Related features and dependencies

3. **API docs** (for endpoint changes)
   - Endpoint URL and method
   - Request/response format
   - Authentication requirements
   - Example requests

4. **Security docs** (for security changes)
   - Findings and fixes
   - Threat model
   - Positive security findings

### Step 5: Output

Save documentation to `docs/` directory:
- Name the file descriptively: `docs/{branch-name}.md` or `docs/{feature-name}.md`
- Use clear markdown with table of contents for longer docs
- Include a **Key Files Reference** table mapping files to their purpose
- Keep it concise — document what a new developer needs to understand the changes
