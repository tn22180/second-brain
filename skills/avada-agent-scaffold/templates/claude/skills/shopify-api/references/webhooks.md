# Webhook Handling

## Response Time (CRITICAL)

**Must respond within 5 seconds!**

```javascript
// BAD: Heavy processing (may timeout)
app.post('/webhooks/orders/create', async (req, res) => {
  await processResource(req.body);
  await updateResource(req.body);
  await syncToShopify(req.body);
  res.status(200).send('OK');
});

// GOOD: Queue and respond fast
app.post('/webhooks/orders/create', async (req, res) => {
  // Quick validation
  if (!verifyHmac(req)) {
    return res.status(401).send('Unauthorized');
  }

  // Queue for background processing
  await webhookQueueRef.add({
    type: 'orders/create',
    payload: req.body
  });

  // Respond immediately
  res.status(200).send('OK');
});
```

## HMAC Verification

```javascript
import crypto from 'crypto';

function verifyHmac(req) {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const body = req.rawBody;
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(hmac),
    Buffer.from(hash)
  );
}
```

## Webhook Headers

| Header | Purpose |
|--------|---------|
| `X-Shopify-Hmac-Sha256` | HMAC signature for verification |
| `X-Shopify-Shop-Domain` | Shop domain that triggered webhook |
| `X-Shopify-Topic` | Webhook topic (e.g., `orders/create`) |
| `X-Shopify-Webhook-Id` | Unique webhook delivery ID |
| `X-Shopify-API-Version` | API version used |

## Idempotency

```javascript
app.post('/webhooks/orders/create', async (req, res) => {
  const webhookId = req.get('X-Shopify-Webhook-Id');

  // Check if already processed
  const processed = await checkProcessed(webhookId);
  if (processed) {
    return res.status(200).send('OK'); // Already handled
  }

  // Mark as processing
  await markProcessing(webhookId);

  // Queue for background
  await enqueue('orders/create', req.body);

  res.status(200).send('OK');
});
```

## Webhook Subscription via GraphQL

```graphql
mutation createWebhook($topic: WebhookSubscriptionTopic!, $url: URL!) {
  webhookSubscriptionCreate(
    topic: $topic
    webhookSubscription: {
      callbackUrl: $url
      format: JSON
    }
  ) {
    webhookSubscription {
      id
    }
    userErrors {
      field
      message
    }
  }
}
```

## Common Webhook Topics

| Topic | Triggered When |
|-------|----------------|
| `ORDERS_CREATE` | New order placed |
| `ORDERS_UPDATED` | Order modified |
| `ORDERS_PAID` | Order payment received |
| `CUSTOMERS_CREATE` | New customer registered |
| `CUSTOMERS_UPDATE` | Customer data changed |
| `PRODUCTS_UPDATE` | Product modified |
| `APP_UNINSTALLED` | App removed from store |
```
