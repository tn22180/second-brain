---
description: Update JSDoc comments and TypeScript type definitions
argument-hint: [file path or feature name]
---

## Target
$ARGUMENTS

## Instructions

Update JSDoc documentation and TypeScript type definitions for the specified files or feature.

### Step 1: Identify Files to Document

| Source | Action |
|--------|--------|
| Specific file | Read the file directly |
| Feature name | Search for related service, repository, controller files |
| Recent changes | `git diff --name-only master...HEAD -- '*.js'` |

### Step 2: Update JSDoc Comments

For each function, ensure JSDoc includes:

```javascript
/**
 * Brief description of what the function does
 *
 * @param {Type} paramName - Description of parameter
 * @param {Object} [options] - Optional parameters object
 * @param {string} [options.field] - Description of optional field
 * @returns {Promise<ReturnType>} Description of return value
 */
```

#### JSDoc Guidelines

| Element | Format |
|---------|--------|
| Description | Start with verb (Get, Create, Update, Delete) |
| Parameters | Include type, name, and purpose |
| Optional params | Wrap in brackets `[paramName]` |
| Object params | Document nested properties |
| Returns | Include Promise wrapper if async |
| Errors | Document possible error conditions |

### Step 3: Add TypeScript Types to index.d.ts

Location: `packages/functions/index.d.ts`

#### Type Definition Pattern

```typescript
// Entity types
declare interface EntityName {
  id: string;
  shopId: string;
  // ... other fields
  createdAt: Date | Timestamp | string;
  updatedAt: Date | Timestamp | string;
}

// Status/enum types
declare type EntityStatus = 'pending' | 'active' | 'inactive';

// Response types
declare interface EntityResponse {
  success: boolean;
  data: EntityName;
  error?: string;
}

// List response with pagination
declare interface EntitiesResponse {
  success: boolean;
  data: {
    items: EntityName[];
    pagination: {
      hasMore: boolean;
      cursor?: string;
    };
  };
}
```

### Step 4: Reference Types in JSDoc

After adding types to index.d.ts, reference them in JSDoc:

```javascript
/**
 * Get entity by ID
 *
 * @param {string} shopId - Shop ID for multi-tenant scoping
 * @param {string} id - Entity ID
 * @returns {Promise<EntityResponse>}
 */
```

### Step 5: Verify Consistency

Ensure:
- [ ] All public functions have JSDoc
- [ ] Types match actual data structures
- [ ] Parameter types match function signatures
- [ ] Return types match actual returns
- [ ] No sensitive fields exposed in storefront types

### Output

Report what was updated:
1. Files with updated JSDoc
2. Types added to index.d.ts
3. Any inconsistencies found
