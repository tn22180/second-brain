---
name: cloud-tasks-queue
description: Use this skill when the user asks about "Cloud Tasks", "background jobs", "delayed processing", "rate limit handling", "async queue", "enqueue task", or any task queue work. Provides Cloud Tasks patterns for background processing with automatic retries and rate limiting.
---

# Google Cloud Tasks Patterns

## Overview

Cloud Tasks provides reliable, asynchronous task execution with automatic retries, rate limiting, and scheduled delays.

**Cost:** ~$0.40 per million operations (95% cheaper than Firestore queues)

---

## Basic Usage

```javascript
import {enqueueTask} from '../services/cloudTaskService';

// Immediate task
await enqueueTask({
  functionName: 'enqueueSubscriber',
  data: {
    type: 'processResource',
    data: {shopId, resourceId, itemId}
  }
});

// With delay (common for webhooks)
await enqueueTask({
  functionName: 'enqueueSubscriber',
  opts: {scheduleDelaySeconds: 3},
  data: {
    type: 'syncWidget',
    data: {shop, resource}
  }
});
```

---

## Rate Limit Handling

```javascript
case 'externalSync': {
  const {shopId, resourceId, payload, retryCount = 0} = data;

  const result = await externalService.sync(payload);

  if (result.success === false && result.retryAfter) {
    await enqueueTask({
      functionName: 'enqueueSubscriber',
      data: {
        type: 'externalSync',
        data: {shopId, resourceId, payload, retryCount: retryCount + 1}
      },
      opts: {scheduleDelaySeconds: Math.ceil(result.retryAfter)}
    });
    return; // Don't throw - prevents Cloud Tasks auto-retry
  }
  break;
}
```

---

## Common Delay Values

| Use Case | Delay | Reason |
|----------|-------|--------|
| Order webhook processing | 3s | Wait for Shopify data consistency |
| Widget sync | 3s | Allow related data to settle |
| Resource segment update | 5s | Wait for resource creation |
| Rate limit retry | varies | Use `retry-after` header |

---

## Error Handling

| Error Type | Action |
|------------|--------|
| Permanent (no integration) | Return early, don't throw |
| Retriable (network timeout) | Throw for auto retry |
| Rate limit | Re-enqueue with delay |

---

## Checklist

```
□ Use enqueueTask() from cloudTaskService
□ Include task type in data payload
□ Add retry count for rate-limited operations
□ Return early for permanent failures
□ Re-enqueue with delay for rate limits
□ Set max retry count to prevent infinite loops
```
