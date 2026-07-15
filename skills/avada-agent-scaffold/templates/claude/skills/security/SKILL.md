---
name: security-audit
description: Use this skill when the user asks to "audit security", "check for vulnerabilities", "review authentication", "prevent IDOR", "protect customer data", "verify webhooks", "check HMAC", or any security-related review work. Provides security patterns for authentication, authorization, IDOR prevention, PII protection, and webhook verification.
---

# Security Patterns (packages/functions)

> For **API design patterns**, see `api-design` skill

## Quick Reference

| Topic | Reference File |
|-------|---------------|
| Ownership Checks, Audit Commands | [references/idor-prevention.md](references/idor-prevention.md) |
| Webhook HMAC, Popup Signatures | [references/hmac-verification.md](references/hmac-verification.md) |
| Endpoint Types, Session Handling | [references/authentication.md](references/authentication.md) |

---

## Critical Vulnerabilities

| Vulnerability | Risk | Example |
|--------------|------|---------|
| **IDOR** | High | User A accesses User B's data via `/api/resource/123` |
| **Unauthenticated PII** | Critical | Returning email in public API response |
| **Missing Auth** | Critical | `/popup/*` endpoints without authentication |
| **Shop Isolation** | Critical | Shop A accessing Shop B's data |

---

## PII Protection

### Classification

| Data Type | Classification | Public Endpoint? |
|-----------|---------------|------------------|
| Email, Phone, Address | PII | Never |
| Date of Birth | PII | Never |
| Payment Info | Sensitive PII | Never |
| First Name | Low Risk | With signature |
| Resource status, Item count | Non-PII | With signature |

### Secure Response

```javascript
// Only return non-sensitive data
ctx.body = {
  firstName: resource.firstName,
  status: resource.status,
  itemCount: resource.itemCount
  // Never: email, phone, address
};
```

---

## Input Validation

```javascript
async function updateResource(ctx) {
  const shopId = getCurrentShop(ctx);
  const {resourceId} = ctx.params;
  const {firstName, lastName} = ctx.request.body;  // Whitelist fields

  const resource = await resourceRepo.getById(resourceId);
  if (resource.shopId !== shopId) {
    ctx.status = 403;
    return;
  }

  await resourceRepo.update(resourceId, {
    firstName: firstName?.trim().slice(0, 50),
    lastName: lastName?.trim().slice(0, 50)
  });
}
```

---

## Best Practices

| Do | Don't |
|----|-------|
| Get shopId from `getCurrentShop(ctx)` | Use `ctx.params.shopId` |
| Scope all queries by shopId | Query without shop filter |
| Whitelist response fields | Return full objects |
| Verify HMAC on webhooks | Trust headers blindly |
| Validate and sanitize inputs | Use `ctx.request.body` directly |
| Use `crypto.timingSafeEqual` | Compare strings with `===` |

---

## Security Checklist

```
Authentication:
- Sensitive endpoints require auth
- Shop ID from session, not params
- Resource ID verified against token

Authorization:
- Users access only their data
- Shop isolation verified
- No IDOR vulnerabilities

Data Protection:
- No PII in unauthenticated responses
- Response fields whitelisted
- Inputs validated and sanitized

Webhooks:
- HMAC verification on all webhooks
- Timestamp validation
- No bypass headers
```
