---
name: tony-wf
description: Use when user invokes /tony-wf with a path to a markdown brief file - reads the brief, brainstorms via superpowers, creates a plan, sets up TaskCreate checklist and appends progress to the brief file, then executes tasks sequentially with review after each task
---

# Tony Workflow

## Overview

Read a markdown brief file, brainstorm via `superpowers:brainstorming`, break into tasks, track progress with TaskCreate (terminal) and appended Progress section in the brief file, then execute each task sequentially with review between tasks.

## Flow

```dot
digraph tony_wf {
    rankdir=TB;
    "Read brief file" -> "Invoke brainstorming skill";
    "Invoke brainstorming skill" -> "Analyze + create plan";
    "Analyze + create plan" -> "Create TaskCreate checklist";
    "Create TaskCreate checklist" -> "Append Progress to brief";
    "Append Progress to brief" -> "Execute task N";
    "Execute task N" -> "Review task N output";
    "Review task N output" -> "Task OK?" [shape=diamond];
    "Task OK?" -> "Update TaskCreate + brief" [label="yes"];
    "Task OK?" -> "Fix issues" [label="no"];
    "Fix issues" -> "Review task N output";
    "Update TaskCreate + brief" -> "More tasks?" [shape=diamond];
    "More tasks?" -> "Execute task N" [label="yes, N++"];
    "More tasks?" -> "Final verification" [label="no"];
    "Final verification" -> "Update brief as COMPLETE";
}
```

## Instructions

### 1. Read the brief

The user provides a path as argument: `/tony-wf path/to/brief.md`

Read the file. If no path given, ask for it.

### 2. Brainstorm (REQUIRED)

**Before planning, invoke the `superpowers:brainstorming` skill.** This explores user intent, requirements, and design before jumping into implementation. Do NOT skip this step.

### 3. Analyze and plan

After brainstorming:
- Understand all requirements from the brief
- Break into discrete, ordered tasks
- Identify dependencies between tasks

### 4. Create dual tracking

**TaskCreate (terminal):** Create a task for each item using TaskCreate.

**Progress in brief (file):** Append a `## Progress` section directly into the brief file (do NOT create a separate PROGRESS.md). Format:

```markdown
---

## Progress

Started: [date]

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Task description | ⬜ | |
| 2 | Task description | ⬜ | |

### Log

#### ⬜ Task 1: [name]
- Status: ⬜ pending
- Started: -
- Completed: -
```

### 5. Execute sequentially

For each task:
1. Update status to 🔄 `in-progress` in both TodoWrite and PROGRESS.md
2. Execute the task
3. **Review the output** - check quality, correctness, no regressions
4. If review fails → fix → re-review
5. If review passes → update status to ✅ `completed` in both TodoWrite and PROGRESS.md, add notes
6. Move to next task

### Status icons
- ⬜ pending
- 🔄 in-progress
- ✅ completed

### 6. Final verification

After all tasks complete:
- Run relevant verification (tests, build, lint) if applicable
- Update PROGRESS.md status to COMPLETE with summary
- Report final status to user

## Red Flags

| Thought | Reality |
|---------|---------|
| "Skip review, it's simple" | Every task gets reviewed. No exceptions. |
| "Update PROGRESS.md later" | Update both trackers immediately after each task. |
| "Skip to next task" | Current task must pass review first. |
| "Brief is unclear, just guess" | Ask the user for clarification. |
