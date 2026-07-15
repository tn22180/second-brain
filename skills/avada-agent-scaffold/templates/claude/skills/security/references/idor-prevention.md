# IDOR Prevention

## Audit Checklist

| Check | Secure | Vulnerable |
|-------|--------|------------|
| Shop ID source | `getCurrentShop(ctx)`, `ctx.state.shop.id` | `ctx.params`, `ctx.query` |
| Query scoping | `.where('shopId', '==', shopId)` | `.doc(id).get()` alone |
| Ownership check | `if (resource.shopId !== shopId)` | Return data directly |
| Update/Delete | Verify ownership first | `repo.update(id, data)` |

## Grep Commands for Audit

```bash
grep -rn "ctx.params.shopId" controllers/
grep -rn "ctx.params.resourceId" controllers/
grep -rn "getById(" repositories/
grep -rn ".doc(.*).get()" repositories/
```

## Secure Pattern

```javascript
async function getResource(ctx) {
  const shopId = getCurrentShop(ctx);
  const {resourceId} = ctx.params;

  const resource = await resourceRepo.getById(resourceId);

  if (resource.shopId !== shopId) {
    ctx.status = 403;
    return;
  }

  ctx.body = {success: true, data: resource};
}
```

## Repository Pattern with Ownership Check

```javascript
// Ownership validation
export async function getById(id, shopId) {
  const doc = await collection.doc(id).get();
  if (!doc.exists) return null;

  const data = prepareDoc({doc});
  if (data.shopId !== shopId) {
    logger.warn('[getById]', shopId, `unauthorized access attempt on ${id}`);
    return null;
  }
  return data;
}

// Update with ownership check
export async function updateById(id, shopId, data) {
  const existing = await getById(id, shopId);
  if (!existing) {
    return {success: false, error: 'Not found or access denied'};
  }
  // ... update logic
}
```

## Common IDOR Vulnerabilities

| Pattern | Risk |
|---------|------|
| Using `ctx.params.shopId` | CRITICAL - user can specify any shop |
| No ownership check on getById | HIGH - cross-shop data access |
| Direct doc access without shop filter | HIGH - enumeration attack |
| Update/Delete without ownership check | CRITICAL - data manipulation |
