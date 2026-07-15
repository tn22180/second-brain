---
name: api-design
description: Use this skill when the user asks to "create an API endpoint", "build a REST API", "add a controller", "design an API", "implement CRUD operations", "add validation", "handle API errors", or any backend API development work. Provides REST API design patterns, response formats, validation, and best practices.
---

# REST API Design (packages/functions)

> For **security patterns**, see `security` skill

## Quick Reference

| Topic | Reference File |
|-------|---------------|
| Response Helpers, Status Codes, Error Codes | [references/response-format.md](references/response-format.md) |
| Storefront Endpoints, Shop Resolution, PII | [references/client-api.md](references/client-api.md) |
| Yup Schemas, Validation Middleware | [references/validation.md](references/validation.md) |

---

## CRITICAL: Firebase/Koa Context

```javascript
// WRONG - Standard Koa (does NOT work in Firebase)
const data = ctx.request.body;

// CORRECT - Firebase/Koa
const data = ctx.req.body;
```

| Property | Access Pattern |
|----------|----------------|
| Request body | `ctx.req.body` |
| Query params | `ctx.query` |
| URL params | `ctx.params` |
| Response body | `ctx.body = {...}` |

---

## Directory Structure

```
packages/functions/src/
├── routes/              # Route definitions
├── controllers/         # Request handlers
├── middleware/          # Auth, validation
└── validations/         # Yup schemas
```

---

## RESTful Conventions

| Action | Method | Route |
|--------|--------|-------|
| List | GET | `/resources` |
| Get one | GET | `/resources/:id` |
| Create | POST | `/resources` |
| Update | PUT | `/resources/:id` |
| Delete | DELETE | `/resources/:id` |
| Action | POST | `/resources/:id/action` |

---

## Controller Pattern

> **Layer rule:** Controller calls **service** (not repository directly). Response formatting goes through **presenter**. See `layer-architecture` skill for full rules.

```javascript
import {xxxService} from '../services/xxxService';
import {presentXxx} from '../presenters/restApi/xxxPresenter';

export async function getOne(ctx) {
  try {
    const {shop} = ctx.state;
    const {id} = ctx.params;

    const result = await xxxService.getById(shop.id, id);

    if (!result.success) {
      ctx.status = 404;
      ctx.body = errorResponse(result.error, 'NOT_FOUND', 404);
      return;
    }

    ctx.body = itemResponse(presentXxx(result.data));
  } catch (error) {
    console.error('Error:', error);
    ctx.status = 500;
    ctx.body = errorResponse('Server error', 'INTERNAL_ERROR', 500);
  }
}
```

---

## Pagination (Cursor-Based)

```javascript
// Request
GET /api/resources?limit=20&cursor=eyJpZCI6IjEyMyJ9

// Response
{
  "data": [...],
  "meta": {
    "pagination": {
      "hasNext": true,
      "nextCursor": "eyJpZCI6IjE0MyJ9",
      "limit": 20
    }
  }
}
```

---

## Checklist

```
- Controller calls service (NOT repository directly)
- Response formatted via presenter (NOT inline pick())
- Uses response helpers (successResponse/errorResponse)
- Correct HTTP status codes
- Input validated with Yup schema
- Queries scoped by shopId
- No FieldValue usage in controller (wrap in repo method)
- Error handling with try-catch
- Rate limiting applied
- Authentication middleware
```
