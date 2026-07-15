# Firebase Functions Configuration

## Right-Sizing Guide

| Function Type | Memory | Timeout |
|---------------|--------|---------|
| Simple API handler | 256MB | 60s |
| Webhook handler | 256-512MB | 60s |
| Data sync (small) | 512MB | 120s |
| Data sync (large) | 1GB | 540s |
| Bulk operations | 1GB | 540s |
| High-traffic API | 512MB | 60s |

## Webhook Handlers (CRITICAL)

**Shopify requires response within 5 seconds or it will retry.**

```javascript
// BAD: Heavy processing (may timeout)
app.post('/webhooks/orders/create', async (req, res) => {
  await calculatePoints(req.body);
  await updateCustomer(req.body);
  res.status(200).send('OK');
});

// GOOD: Queue and respond fast
app.post('/webhooks/orders/create', async (req, res) => {
  if (!verifyHmac(req)) {
    return res.status(401).send('Unauthorized');
  }

  await webhookQueueRef.add({
    type: 'orders/create',
    payload: req.body
  });

  res.status(200).send('OK');
});
```

## Cron Jobs (Scheduled Functions)

```javascript
import * as functions from 'firebase-functions';

// Daily cleanup at midnight UTC
exports.dailyCleanup = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    await cleanupExpiredRewards();
    await archiveOldActivities();
  });

// Every 5 minutes - sync pending updates
exports.syncPendingUpdates = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    const pending = await getPendingUpdates();
    await processBatch(pending);
  });

// Weekly tier recalculation (Sunday 2am)
exports.weeklyTierRecalc = functions.pubsub
  .schedule('0 2 * * 0')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    await tierService.recalculateAllTiers();
  });
```

## Background Processing Methods

| Method | Use Case | Volume | Latency |
|--------|----------|--------|---------|
| Firestore trigger | Simple queuing | Low-Medium | Real-time |
| Cloud Tasks | Delayed processing, rate limits | Medium | Configurable |
| **Pub/Sub** | High volume, fan-out, scaling | **High** | **Real-time** |

## Cold Start Optimization

```javascript
// Initialize outside handler (reused across invocations)
const firestore = admin.firestore();
const shopifyClients = new Map();

// Lazy initialization for expensive resources
let expensiveService = null;
function getExpensiveService() {
  if (!expensiveService) {
    expensiveService = new ExpensiveService();
  }
  return expensiveService;
}
```
