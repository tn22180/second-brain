---
name: backend-development
description: Use this skill when the user asks about "async patterns", "Promise.all", "parallel execution", "Firebase functions", "webhook handlers", "cron jobs", "cold start", "timeout", "pubsub", "background processing", "message queue", "fan-out", "event-driven", or any Node.js/Firebase backend patterns. Provides async/await patterns, function configuration, Pub/Sub messaging, and scalable background processing.
---

# Node.js & Firebase Functions Patterns

## Quick Reference

| Topic | Reference File |
|-------|---------------|
| Promise.all, Parallel Execution, Chunking | [references/async-patterns.md](references/async-patterns.md) |
| Pub/Sub, Fan-out, Message Ordering | [references/pubsub.md](references/pubsub.md) |
| Function Sizing, Webhooks, Cron Jobs | [references/firebase-functions.md](references/firebase-functions.md) |
| Firestore Queues, Priority Queues | [references/queue-patterns.md](references/queue-patterns.md) |

---

## Async/Await Quick Patterns

```javascript
// Parallel (GOOD)
const [customers, settings, tiers] = await Promise.all([
  getCustomers(),
  getSettings(),
  getTiers()
]);

// Avoid await in loops (BAD)
for (const customer of customers) {
  await updateCustomer(customer); // Sequential!
}

// Use Promise.all instead (GOOD)
await Promise.all(customers.map(c => updateCustomer(c)));
```

---

## Firebase Functions Sizing

| Function Type | Memory | Timeout |
|---------------|--------|---------|
| Simple API handler | 256MB | 60s |
| Webhook handler | 256-512MB | 60s |
| Data sync (large) | 1GB | 540s |

---

## Webhook Handlers (CRITICAL)

**Shopify requires response within 5 seconds!**

```javascript
// Queue and respond fast
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

---

## Background Processing Decision

| Method | Use Case | Volume |
|--------|----------|--------|
| Firestore trigger | Simple queuing | Low-Medium |
| Cloud Tasks | Delayed processing, rate limits | Medium |
| **Pub/Sub** | High volume, fan-out, scaling | **High** |

See `cloud-tasks` skill for delayed/scheduled patterns.

---

## Checklist

```
- Independent async operations use Promise.all
- No await inside loops
- Functions right-sized (memory, timeout)
- Webhooks respond < 5 seconds
- Heavy processing in background queue
- Proper error handling with try-catch
- High-volume events use Pub/Sub fan-out
- Delayed tasks use Cloud Tasks
```
