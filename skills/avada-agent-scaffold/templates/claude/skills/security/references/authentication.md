# Authentication Patterns

## Endpoint Types

| Endpoint Type | Auth Required | Example |
|--------------|---------------|---------|
| Admin API | Shop session + JWT | `/api/admin/*` |
| Storefront API | Customer token OR signature | `/api/storefront/*` |
| Popup/Widget | HMAC signature | `/popup/*` |
| Webhook | Shopify HMAC | `/webhooks/*` |
| Public | None (no sensitive data) | `/health`, `/status` |

## Admin Controller Pattern

```javascript
import {getCurrentShop} from '@functions/helpers/auth';

async function getResources(ctx) {
  const shopId = getCurrentShop(ctx);  // From authenticated session
  const resources = await resourceRepo.getByShopId(shopId);
  ctx.body = {success: true, data: resources};
}
```

## Get Shop ID Securely

```javascript
// GOOD: From authenticated session
const shopId = getCurrentShop(ctx);
const shopId = ctx.state.shop.id;

// BAD: From user-controlled input
const shopId = ctx.params.shopId;  // User can specify any shop!
const shopId = ctx.query.shopId;   // User can specify any shop!
```

## Middleware Pattern

```javascript
async function requireAuth(ctx, next) {
  const shop = ctx.state.shop;

  if (!shop || !shop.id) {
    ctx.status = 401;
    ctx.body = {success: false, error: 'Unauthorized'};
    return;
  }

  await next();
}

// Apply to routes
router.use('/api/admin', requireAuth);
```

## Storefront Authentication

```javascript
// For storefront endpoints, get the logged-in customer from App Proxy
async function getStorefrontContext(ctx) {
  const customerId = ctx.query.logged_in_customer_id;

  if (!customerId) {
    return null; // Guest user
  }

  return await resourceRepo.getByShopifyId(customerId);
}
```
