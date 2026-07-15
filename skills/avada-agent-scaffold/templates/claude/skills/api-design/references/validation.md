# Input Validation

## Validation Strategy

Validation is split into **two layers**:

1. **Middleware (Zod or Yup)** — Schema validation: types, formats, lengths, required fields. Runs before the controller. Rejects malformed requests with 400.
2. **Service** — Business validation: uniqueness checks, reserved values, authorization, cross-entity rules. Runs inside the service layer.

```
Request → [Schema Middleware] → Controller → [Service Validation] → Repository
             ↑ 400 if invalid             ↑ {success: false} if invalid
```

## Zod Schemas

Define schemas in `middleware/{feature}Validation.js`.

```javascript
import {z} from 'zod';

// Reusable transforms
const normalizeSlug = value => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') return value.trim().toLowerCase();
  return value;
};

// Create schema — all fields required
const createSchema = z.object({
  name: z.string().trim().min(2, 'Name must be 2-100 chars').max(100),
  email: z.string().email('Invalid email'),
  slug: z.preprocess(
    normalizeSlug,
    z.string().regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only').max(50)
  ).optional(),
  type: z.enum(['basic', 'premium', 'enterprise']),
  tags: z.array(z.string()).max(20).optional()
});

// Update schema — all fields optional
const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().email().optional(),
  slug: z.preprocess(
    normalizeSlug,
    z.union([z.string().regex(/^[a-z0-9-]+$/).max(50), z.null()])
  ).optional(),
  isEnabled: z.boolean().optional()
});
```

### Zod Validation Middleware

Generic `validate()` factory that wraps any Zod schema into Koa middleware:

```javascript
function formatZodError(error) {
  return error.issues.map(issue => issue.message).join(', ');
}

function validate(schema) {
  return async function validateBody(ctx, next) {
    const body = ctx.req?.body ?? ctx.request?.body ?? {};
    const result = schema.safeParse(body);

    if (!result.success) {
      ctx.status = 400;
      ctx.body = {success: false, error: formatZodError(result.error)};
      return;
    }

    // Replace body with parsed/transformed data (trimmed, normalized)
    ctx.req.body = result.data;
    ctx.request.body = result.data;

    return next();
  };
}

export const validateCreate = validate(createSchema);
export const validateUpdate = validate(updateSchema);
```

### Common Zod Patterns

```javascript
z.string().email()                          // Email
z.string().max(100).optional()              // Optional string with max length
z.number().positive()                       // Positive number
z.enum(['active', 'inactive'])              // Enum
z.array(z.string()).max(50)                 // Array with limit
z.string().datetime()                       // Date string (ISO)
z.object({                                  // Nested object
  firstName: z.string().min(1),
  lastName: z.string().min(1)
})
z.preprocess(                               // Preprocess (normalize before validation)
  val => val?.trim().toLowerCase(),
  z.string().min(1)
)
z.union([z.string(), z.null()])             // Union (nullable)
z.object({                                  // Pagination
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional()
})
```

## Yup Schemas

```javascript
import * as Yup from 'yup';

export const createSchema = Yup.object({
  name: Yup.string().min(2).max(100).required(),
  email: Yup.string().email().required(),
  type: Yup.string().oneOf(['basic', 'premium', 'enterprise']).required(),
  tags: Yup.array().of(Yup.string()).max(20).optional()
});

export const updateSchema = Yup.object({
  name: Yup.string().min(2).max(100).optional(),
  email: Yup.string().email().optional(),
  isEnabled: Yup.boolean().optional()
});
```

### Yup Validation Middleware

```javascript
export function validateInput(schema) {
  return async (ctx, next) => {
    try {
      ctx.request.body = await schema.validate(ctx.request.body, {
        stripUnknown: true
      });
      await next();
    } catch (error) {
      ctx.status = 400;
      ctx.body = {success: false, error: error.message};
    }
  };
}
```

### Common Yup Patterns

```javascript
Yup.string().email().required()             // Email
Yup.string().max(100).optional()            // Optional string with max length
Yup.number().positive().optional()          // Positive number
Yup.string().oneOf(['active', 'inactive'])  // Enum
Yup.array().of(Yup.string()).max(50)        // Array with limit
Yup.date().min(new Date()).optional()        // Date
Yup.object({                                // Nested object
  firstName: Yup.string().required(),
  lastName: Yup.string().required()
})
```

## Route with Validation

```javascript
import {validateCreate, validateUpdate} from '@functions/middleware/{feature}Validation';

router.post('/items', validateCreate, controller.create);
router.put('/items/:id', validateUpdate, controller.update);
// GET/DELETE don't need body validation
router.get('/items', controller.list);
router.delete('/items/:id', controller.delete);
```

## Service-Level Business Validation

Business rules that require database lookups go in the service, not middleware:

```javascript
// services/{feature}Service.js

async function validateSlug(slug, shopId, excludeId = null) {
  if (!slug) return {valid: true};

  // Reserved value check (in-memory)
  if (RESERVED_SLUGS.includes(slug)) {
    return {valid: false, error: `Slug "${slug}" is reserved`};
  }

  // Uniqueness check (requires DB query)
  const isTaken = await repo.isSlugTaken({slug, shopId, excludeId});
  if (isTaken) {
    return {valid: false, error: `Slug "${slug}" is already in use`};
  }

  return {valid: true};
}
```

## File Organization

```
middleware/
├── errorHandler.js          # Global error handler
└── {feature}Validation.js   # One file per feature/resource
```
