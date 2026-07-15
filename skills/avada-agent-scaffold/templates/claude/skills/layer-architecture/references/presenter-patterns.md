# Presenter Patterns

## Core Principles

1. **Pure function** — `(internalModel) → apiShape`. No side-effects, no DB, no business logic.
2. **One presenter per resource per consumer** — same resource may have different shapes for different APIs.
3. **Presenter owns field whitelist** — constants live in presenter file, not in controller/config.
4. **Composition** — presenters compose each other for nested shapes.

---

## Basic Presenter

```javascript
// presenters/restApi/resourcePresenter.js
import {formatDateFields} from '@avada/firestore-utils';

const BASIC_FIELDS = ['id', 'title', 'event', 'status', 'value', 'createdAt', 'updatedAt'];
const DETAILED_FIELDS = ['id', 'title', 'status', 'amount', 'expiredAfter', 'createdAt'];

export function presentBasicResource(resource) {
  const picked = {};
  for (const f of BASIC_FIELDS) {
    if (resource[f] !== undefined) picked[f] = resource[f];
  }
  return formatDateFields(picked);
}

export function presentDetailedResource(resource) {
  const picked = {};
  for (const f of DETAILED_FIELDS) {
    if (resource[f] !== undefined) picked[f] = resource[f];
  }
  return {
    ...formatDateFields(picked),
    amount: parseInt(picked.amount) || 0,
    expiredTime: picked.expiredAfter === 'permanent' ? '' : picked.expiredAfter
  };
}

export function presentResource(resource) {
  return resource.type === 'detailed'
    ? presentDetailedResource(resource)
    : presentBasicResource(resource);
}

export function presentResourceList(resources) {
  return resources.map(presentResource);
}
```

---

## Composition — Nested Shapes

```javascript
// presenters/restApi/itemPresenter.js
import {formatDateFields} from '@avada/firestore-utils';
import {presentResource} from './resourcePresenter';

const ITEM_FIELDS = ['id', 'code', 'status', 'expiredAt', 'createdAt'];

export function presentItem(item) {
  const picked = {};
  for (const f of ITEM_FIELDS) {
    if (item[f] !== undefined) picked[f] = item[f];
  }
  return {
    ...formatDateFields(picked),
    shopifyOwnerId: parseInt(item.shopifyOwnerId) || null,
    resource: item.resource ? presentResource(item.resource) : null
  };
}
```

---

## Key Renaming — External API

```javascript
// presenters/integrations/providerPresenter.js
import {formatDateTimeFull} from '../../helpers/utils/dateHelper';

export function presentShopForProvider(shop) {
  return {
    shop_url: shop.shopifyDomain,
    country_code: shop.countryCode,
    shop_name: shop.name,
    shopify_plan: shop.planName,
    shopify_created: formatDateTimeFull({date: shop.createdAt, format: 'yyyy-mm-dd'}),
    shop_id: shop.id
  };
}
```

---

## Credential Masking

```javascript
// presenters/integration/integrationPresenter.js
const SECRET_FIELDS = ['secretKey', 'accessToken', 'privateToken', 'refreshToken'];

export function presentIntegration(integration) {
  const result = {...integration};
  result.hasSecretKey = SECRET_FIELDS.some(f => Boolean(result[f]));
  for (const f of SECRET_FIELDS) delete result[f];
  return result;
}
```

---

## GraphQL → REST Shape Transform

```javascript
// presenters/shopify/productPresenter.js
export function presentShopifyProduct(node) {
  return {
    id: parseInt(node.id.replace(/.*\//, '')),
    title: node.title,
    handle: node.handle,
    created_at: node.createdAt,
    variants: (node.variants?.nodes || []).map(v => ({
      id: parseInt(v.id.replace(/.*\//, '')),
      price: v.price,
      title: v.title,
      compare_at_price: v.compareAtPrice,
      inventory_quantity: v.inventoryQuantity
    })),
    image: node.featuredImage ? {src: node.featuredImage.url} : null
  };
}
```

---

## Controller Usage

```javascript
// controllers/restApiV2/resourceController.js
import {presentResource, presentResourceList} from '../../presenters/restApi/resourcePresenter';

export async function listResources(ctx) {
  const {shop} = ctx.state;
  const result = await resourceService.list(shop.id, ctx.query);

  ctx.body = {
    success: true,
    data: presentResourceList(result.data),
    meta: result.meta
  };
}

export async function getOne(ctx) {
  const result = await resourceService.getById(ctx.state.shop.id, ctx.params.id);
  if (!result.success) { ctx.status = 404; ctx.body = result; return; }
  ctx.body = {success: true, data: presentResource(result.data)};
}
```

---

## Directory Structure

```
presenters/
├── restApi/              # REST API v1 + v2
│   ├── resourcePresenter.js
│   ├── itemPresenter.js
│   ├── widgetPresenter.js
│   └── shopPresenter.js
├── shopify/              # Shopify API format
│   └── productPresenter.js
├── inhouse/              # Internal API
│   └── inhousePresenter.js
└── integration/          # Third-party integrations
    ├── integrationPresenter.js
    └── providerPresenter.js
```
