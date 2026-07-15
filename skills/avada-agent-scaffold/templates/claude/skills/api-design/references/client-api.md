# Client API (Storefront Public Endpoints)

For **public-facing storefront endpoints** accessed via Shopify App Proxy. Different from admin API - no authentication, shop identified by query param.

## Directory Structure

```
packages/functions/src/
├── routes/
│   └── clientApi.js           # Public storefront routes
├── controllers/
│   └── clientApi/             # Storefront handlers
│       └── featureClientController.js
└── presenters/
    └── featurePresenter.js    # Strip PII before response
```

## Route Configuration

```javascript
// routes/clientApi.js
import Router from 'koa-router';
import * as featureController from '../controllers/clientApi/featureClientController';

const router = new Router({prefix: '/clientApi'});

// No authentication middleware - public endpoints
// Shop identified via app proxy 'shop' query param

router.get('/feature/:resourceId', featureController.getResource);
router.get('/feature/bulk', featureController.getBulkResources);
router.post('/feature', featureController.submitResource);
router.get('/feature/settings', featureController.getSettings);

export default router;
```

## Shop Resolution Pattern

```javascript
async function getShopFromQuery(ctx) {
  const shopDomain = ctx.query.shop || ctx.query.shopifyDomain;

  if (!shopDomain) {
    return {shop: null, error: 'Missing shop parameter'};
  }

  const shop = await shopRepository.getShopByShopifyDomain(shopDomain);
  if (!shop) {
    return {shop: null, error: 'Shop not found'};
  }

  return {shop, error: null};
}
```

## Controller Pattern

```javascript
export async function getResource(ctx) {
  const {resourceId} = ctx.params;

  const {shop, error} = await getShopFromQuery(ctx);
  if (error) {
    ctx.body = {success: false, error};
    return;
  }

  const result = await featureService.getResource(shop.id, resourceId);

  // CRITICAL: Strip PII before returning to storefront
  ctx.body = {
    ...result,
    data: presentForStorefront(result.data)
  };
}
```

## Presenter Pattern (Strip PII)

```javascript
// presenters/featurePresenter.js

export function presentForStorefront(item) {
  if (!item) return null;

  // Destructure to exclude sensitive fields
  const {email, ownerId, shopId, internalId, ...safeItem} = item;

  return safeItem;
}
```

## Bulk Endpoints with Limits

```javascript
export async function getBulkResources(ctx) {
  let {ids} = ctx.query;

  // Handle comma-separated string
  if (typeof ids === 'string') {
    ids = ids.split(',').map(id => id.trim());
  }

  // CRITICAL: Limit array size to prevent abuse
  if (ids.length > 100) {
    ctx.body = {success: false, error: 'Maximum 100 items allowed'};
    return;
  }

  const result = await featureService.getBulkResources(shop.id, ids);
  ctx.body = result;
}
```

## Client API vs Admin API

| Aspect | Admin API | Client API |
|--------|-----------|------------|
| Auth | JWT/Session | None (app proxy) |
| Shop context | `ctx.state.shop` | `ctx.query.shop` |
| Data exposure | Full (for admin) | Sanitized (no PII) |
| Rate limiting | Per-shop | Per-IP |
| Input limits | Higher | Strict (prevent abuse) |
