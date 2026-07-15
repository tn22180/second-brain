# Response Format

## Response Helpers

```javascript
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  itemResponse
} from '../helpers/restApiResponse';

// Single item
ctx.body = itemResponse(resource);

// Paginated list
ctx.body = paginatedResponse(resources, pageInfo, total);

// Error
ctx.status = 400;
ctx.body = errorResponse('Invalid email', 'VALIDATION_ERROR', 400);
```

## Response Structure

| Type | Format |
|------|--------|
| Success | `{success: true, data, meta, timestamp}` |
| Error | `{success: false, error: {message, code, statusCode}, timestamp}` |
| Paginated | `{success: true, data: [], meta: {pagination: {...}}}` |

## HTTP Status Codes

| Code | When to Use |
|------|-------------|
| 200 | Successful GET, PUT |
| 201 | Successful POST (created) |
| 204 | Successful DELETE |
| 400 | Validation error, malformed request |
| 401 | Missing/invalid authentication |
| 403 | Authenticated but not authorized |
| 404 | Resource not found |
| 422 | Business logic error |
| 429 | Rate limit exceeded |
| 500 | Server error |

## Error Codes

| Code | When |
|------|------|
| `UNAUTHORIZED` | Missing/invalid credentials |
| `FORBIDDEN` | No permission |
| `PLAN_RESTRICTED` | Feature not in plan |
| `VALIDATION_ERROR` | Invalid input |
| `NOT_FOUND` | Resource doesn't exist |
| `RATE_LIMITED` | Too many requests |
| `INTERNAL_ERROR` | Server error |
