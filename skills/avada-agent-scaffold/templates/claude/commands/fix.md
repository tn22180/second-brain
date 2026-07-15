---
description: Analyze and fix issues
argument-hint: [issue description]
---

## Issue
$ARGUMENTS

## Decision Tree

Route to appropriate fix strategy:

| Issue Type | Action |
|------------|--------|
| Type/lint errors | Run `npm run lint`, fix errors |
| Test failures | Use `tester` agent to analyze |
| Firebase/Firestore issues | Use `debugger` agent |
| Shopify API issues | Use `debugger` agent with MCP tools |
| Build failures | Run build, analyze, fix systematically |
| Complex/multiple issues | Use `debugger` agent first |

## Workflow
1. Identify issue type
2. Route to appropriate strategy
3. Implement fix following Avada standards
4. Verify with tests/build
