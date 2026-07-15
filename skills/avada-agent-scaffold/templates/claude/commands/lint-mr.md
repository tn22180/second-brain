---
description: ESLint fix all files changed in current MR/branch
---

## Task
Find all files changed in the current branch compared to master and run ESLint fix on them.

## Workflow

1. Get the list of changed files:
```bash
git diff --name-only master...HEAD -- '*.js' '*.jsx' '*.ts' '*.tsx'
```

2. If no files found, also check uncommitted changes:
```bash
git diff --name-only HEAD -- '*.js' '*.jsx' '*.ts' '*.tsx'
```

3. Filter to only existing files (exclude deleted files)

4. Run ESLint fix on each file:
```bash
npx eslint --fix <file>
```

5. Report summary:
   - Number of files processed
   - Files with remaining errors (if any)
   - Suggest running `yarn eslint-fix` for full project lint if needed

## Notes
- Only process JS/TS files
- Skip files that no longer exist (deleted in MR)
- Continue on errors to fix as many files as possible
