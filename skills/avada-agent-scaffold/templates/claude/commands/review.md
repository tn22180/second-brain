---
description: Review code as a Senior Fullstack Developer following Avada Development standards
argument-hint: [files or description to review]
---

## Review Target
$ARGUMENTS

## Instructions

### Step 0: Determine Review Scope

**If `$ARGUMENTS` specifies files:** Review those files directly.

**If `$ARGUMENTS` is empty:** Auto-detect changes to review:
```bash
# Check for branch changes against main branch
git diff --name-only $(git merge-base HEAD master)...HEAD

# Check for uncommitted changes
git diff --name-only

# Check for staged changes
git diff --cached --name-only
```
Review ALL changed files found above. If no changes found, ask the user what to review.

### Step 1: Code Review

Review the code as a Senior Fullstack Developer following Avada Development standards.

**Reference Skills:**
- `.claude/skills/layer-architecture/SKILL.md` — **Layer rules, import direction, anti-patterns** (MUST read for backend reviews)
- `.claude/skills/backend/SKILL.md` — Backend patterns
- `.claude/skills/firestore/SKILL.md` — Firestore best practices
- `.claude/skills/frontend/SKILL.md` — Frontend patterns
- `.claude/skills/security/SKILL.md` — Security rules
- `.claude/skills/shopify-api/SKILL.md` — Shopify API patterns
- `.claude/skills/polaris/SKILL.md` — Polaris components

## Review Checklist

### Architecture (Backend) — see `layer-architecture` skill

```
handlers/      → Dispatch ONLY — parse event, call 1 service, return. Max 30 lines.
controllers/   → Validate input → call service → call presenter → set ctx.body
services/      → Business logic — orchestrate repos, external APIs, cross-collection
repositories/  → ONE collection, pure CRUD — no other repo/service imports
presenters/    → Format output — field picking, key renaming, date formatting
helpers/       → Pure utilities — no DB, no API calls, no side-effects
```

**Import direction (one way only):** `handlers/controllers → services → repositories`

> **SCOPE RULE:** These layer rules apply to **new code and changed code only**.
> Existing violations in untouched files are known tech debt (tracked separately).
> Do NOT flag layer violations in code that is not part of the current change.
> However, if the change **adds a new** repo→service import, handler→repo import,
> or business logic in a handler/repo — flag it even if the file already has violations.
> Rule of thumb: **don't make it worse**.

- [ ] **Handler only dispatches** — calls 1 service method, zero business logic
- [ ] **Controller = HTTP adapter** — validate → service → presenter → response
- [ ] **No NEW controller→repository imports** — new code must go through service layer
- [ ] **No `FieldValue` in controllers** — wrap in repository methods
- [ ] **No `pick()` in controllers for new code** — use presenter for response formatting
- [ ] **Service contains business logic** — validation, transformation, decision-making
- [ ] **Repository is 1:1 with Firestore collection** — no cross-collection imports
- [ ] **No NEW repository→service imports** — don't introduce new circular dependencies
- [ ] **No NEW repository→repository imports** — cross-collection = service layer
- [ ] **Helpers are pure** — no DB calls, no API calls, no imports from repos/services
- [ ] **Response format:** `{success, data, error}`
- [ ] **Auth:** uses `getCurrentShop(ctx)` for shopId
- [ ] **No hardcoded shop IDs** — use shop-level config/feature flags
- [ ] **No duplicate business logic** — shared logic extracted to single service method

### Code Quality
- [ ] **Early return** — guard clauses, no nested else/else-if
- [ ] **Small functions** — single responsibility, one function does one thing
- [ ] **Naming** — camelCase (vars/functions), PascalCase (components/classes), UPPER_SNAKE_CASE (constants)
- [ ] **Booleans** — prefixed with `is/has`
- [ ] **Functions** — start with verbs, use object params + destructuring for >3 params
- [ ] **JSDoc** — on public service/handler functions
- [ ] **Parallel execution** — `Promise.all` for independent async ops

### Firestore
- [ ] All queries filter by `shopId` first (multi-tenant)
- [ ] Batch operations ≤ 500 items
- [ ] `in` operator ≤ 30 items
- [ ] Uses `.empty` not `.size === 0`
- [ ] Indexes defined for compound queries
- [ ] TTL configured for log/temp collections

### Performance
- [ ] No `await` in loops (use `Promise.all`)
- [ ] Tree-shaking imports (no barrel imports in storefront)
- [ ] Redis cache has Firestore fallback
- [ ] Webhook handlers respond < 5 seconds
- [ ] Firestore: use `where` filters early, select only needed fields

### Security
- [ ] Input sanitization
- [ ] No committed credentials/secrets
- [ ] HMAC verification for webhooks
- [ ] shopId isolation (no cross-tenant access)
- [ ] Rate limiting on public endpoints

### Frontend (if applicable)
- [ ] `.js` files only (no `.jsx`)
- [ ] Polaris v12+ components, Icons v9 (no Minor/Major suffixes)
- [ ] Lazy-loaded pages via loadables
- [ ] React Context for feature state (not prop drilling)
- [ ] One component per file (PascalCase filename)
- [ ] Use `url` prop for navigation (not `onClick` + `window.open`)

## Output Format

```markdown
## Review Summary

**Overall:** [LGTM / Needs changes / Needs discussion]

## Critical Issues 🔴
[Security, data loss, breaking bugs, tenant isolation violations]

## High Priority 🟠
[Performance, architecture violations, missing error handling]

## Medium Priority 🟡
[DRY violations, missing docs, test gaps, naming]

## Low Priority 🟢
[Style, minor improvements]

## Positive Feedback 👍
[Well-implemented patterns worth noting]

## Code Examples
[Specific fixes with before/after code]
```
