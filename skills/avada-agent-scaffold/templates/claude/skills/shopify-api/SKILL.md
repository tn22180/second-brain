---
name: shopify-api-integration
description: Use this skill when the user asks about "Shopify GraphQL", "Admin API", "metafields", "webhooks", "rate limiting", "pagination", "App Bridge", or any Shopify API integration work. Provides Shopify API patterns, rate limit handling, and best practices.
---

# Shopify API Best Practices

## Quick Reference

| Topic | Reference File |
|-------|---------------|
| GraphQL Queries, Pagination, Mutations | [references/graphql.md](references/graphql.md) |
| HMAC Verification, Webhook Handlers | [references/webhooks.md](references/webhooks.md) |
| Metafield Types, Batch Operations | [references/metafields.md](references/metafields.md) |
| Direct API Calls, Resource Picker | [references/app-bridge.md](references/app-bridge.md) |

---

## API Version Check (CRITICAL)

**Always verify API version before implementing!**

```javascript
// Check what version your app uses
// shopify.app.toml
[api]
api_version = "2024-10"  // Verify this matches your implementation
```

---

## API Selection Guide

| Need | Solution |
|------|----------|
| Customize checkout UI | Checkout UI Extension |
| Apply discounts | Discount Function |
| Validate cart | Cart Validation Function |
| React to events | Webhooks |
| Read/write data | GraphQL Admin API |
| Sync large data | Bulk Operations |
| Store custom data | Metafields/Metaobjects |

---

## Volume Decision Guide

| Volume | Strategy |
|--------|----------|
| < 50 items | Regular GraphQL |
| 50-500 items | Batch with Cloud Tasks + rate limiting |
| **500+ items** | **Bulk Operations API** |

**For detailed bulk mutation patterns, see:** `shopify-bulk-operations` skill

---

## Rate Limiting

**Rate Limits:**
- Regular metafield API: **2 requests/second**, **40 requests/minute**
- Bulk Operations: **No rate limits** - runs server-side on Shopify

### Cloud Tasks (Recommended for Rate Limits)

```javascript
// BAD: In-function sleep wastes CPU time
await sleep(60000); // 60s sleep = 60s CPU billed

// GOOD: Schedule retry with Cloud Tasks
async function scheduleRetry(payload, delaySeconds) {
  await client.createTask({
    parent: client.queuePath(project, location, 'shopify-retry'),
    task: {
      httpRequest: {
        url: `${baseUrl}/api/retry-shopify`,
        body: Buffer.from(JSON.stringify(payload)).toString('base64')
      },
      scheduleTime: {
        seconds: Math.floor(Date.now() / 1000) + delaySeconds
      }
    }
  });
}
```

---

## Quick Patterns

### GraphQL Query

```javascript
const response = await shopify.graphql(`
  query getProduct($id: ID!) {
    product(id: $id) {
      id
      title
    }
  }
`, { id: productId });
```

### Set Metafield

```javascript
await shopify.graphql(`
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`, {
  metafields: [{
    ownerId: ownerId,
    namespace: '$app:feature',
    key: 'count',
    type: 'number_integer',
    value: '42'
  }]
});
```

### Webhook Response (CRITICAL: < 5 seconds)

```javascript
app.post('/webhooks/orders/create', async (req, res) => {
  if (!verifyHmac(req)) {
    return res.status(401).send('Unauthorized');
  }

  await enqueue('orders/create', req.body);
  res.status(200).send('OK');
});
```
