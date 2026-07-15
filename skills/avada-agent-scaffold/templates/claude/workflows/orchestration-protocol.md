# Orchestration Protocol

## Sequential Chaining
Chain agents when tasks have dependencies:

**Feature Development:**
```
planner → implement → tester → /refactor (optional) → /typedoc → code-reviewer → /impact
```

**Bug Fix:**
```
debugger → implement fix → tester → /refactor (optional) → code-reviewer
```

**New API Endpoint:**
```
planner → implement handler/service/repo → tester → /refactor (optional) → /typedoc → /review
```

- Each agent completes fully before the next begins
- Pass context and outputs between agents

## Parallel Execution
Spawn multiple agents simultaneously for independent tasks:

**Safe to parallelize:**
- Backend service + Frontend component (separate packages)
- Multiple independent API endpoints
- Tests + Documentation updates
- Multiple Firestore indexes

**Avoid parallelizing:**
- Files that share imports/dependencies
- Handler + its corresponding service (tightly coupled)
- Operations on the same Firestore collection

## When to Use Which

| Scenario | Approach |
|----------|----------|
| New feature with frontend + backend | Sequential (backend first) |
| Multiple independent bug fixes | Parallel |
| Refactoring shared utilities | Sequential |
| Adding tests for existing code | Parallel per file |
| Shopify webhook + background job | Sequential (webhook first) |
