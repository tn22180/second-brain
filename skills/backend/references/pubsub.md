# Pub/Sub Patterns (Scalable Background Processing)

## When to Use Pub/Sub

| Scenario | Recommended |
|----------|-------------|
| High-volume webhooks (100+ per minute) | Pub/Sub |
| Fan-out to multiple consumers | Pub/Sub |
| Decoupled microservices | Pub/Sub |
| At-least-once delivery needed | Pub/Sub |
| Delayed execution (specific time) | Use Cloud Tasks |
| Rate-limited API calls | Use Cloud Tasks |

## Publishing Messages

```javascript
import {PubSub} from '@google-cloud/pubsub';

const pubsub = new PubSub();

// Publish single message
async function publishMessage(topicName, data) {
  const topic = pubsub.topic(topicName);
  const messageBuffer = Buffer.from(JSON.stringify(data));

  const messageId = await topic.publishMessage({data: messageBuffer});
  return messageId;
}

// Publish with attributes (for filtering)
async function publishWithAttributes(topicName, data, attributes) {
  const topic = pubsub.topic(topicName);
  const messageBuffer = Buffer.from(JSON.stringify(data));

  const messageId = await topic.publishMessage({
    data: messageBuffer,
    attributes: {
      shopId: data.shopId,
      eventType: attributes.eventType
    }
  });
  return messageId;
}

// Batch publish for high volume
async function publishBatch(topicName, items) {
  const topic = pubsub.topic(topicName, {
    batching: {
      maxMessages: 100,
      maxMilliseconds: 100
    }
  });

  const promises = items.map(item =>
    topic.publishMessage({data: Buffer.from(JSON.stringify(item))})
  );

  return Promise.all(promises);
}
```

## Subscriber Functions (Firebase)

```javascript
import * as functions from 'firebase-functions';

// Basic subscriber
exports.processOrderEvents = functions.pubsub
  .topic('order-events')
  .onPublish(async (message, context) => {
    const data = JSON.parse(Buffer.from(message.data, 'base64').toString());

    try {
      await processOrder(data);
    } catch (error) {
      console.error('Processing failed:', error);
      throw error; // Pub/Sub will retry
    }
  });

// With message attributes filtering (server-side)
exports.processVipOrders = functions.pubsub
  .topic('order-events')
  .onPublish(async (message, context) => {
    const attributes = message.attributes;

    // Skip non-VIP orders early
    if (attributes.tierLevel !== 'vip') {
      return;
    }

    const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
    await processVipOrder(data);
  });
```

## Fan-Out Pattern (One Event -> Multiple Actions)

```javascript
// Webhook receives order -> Publish once -> Multiple subscribers process
app.post('/webhooks/orders/create', async (req, res) => {
  if (!verifyHmac(req)) {
    return res.status(401).send('Unauthorized');
  }

  // Single publish, multiple consumers handle different aspects
  await pubsub.topic('order-created').publishMessage({
    data: Buffer.from(JSON.stringify(req.body)),
    attributes: {
      shopId: req.body.shopId,
      orderValue: String(req.body.total_price)
    }
  });

  res.status(200).send('OK');
});

// Consumer 1: Calculate points
exports.calculatePoints = functions.pubsub
  .topic('order-created')
  .onPublish(async (message) => {
    const order = JSON.parse(Buffer.from(message.data, 'base64').toString());
    await pointsService.calculateAndAward(order);
  });

// Consumer 2: Update VIP tier
exports.updateTier = functions.pubsub
  .topic('order-created')
  .onPublish(async (message) => {
    const order = JSON.parse(Buffer.from(message.data, 'base64').toString());
    await tierService.recalculate(order.customerId);
  });

// Consumer 3: Send notification
exports.sendNotification = functions.pubsub
  .topic('order-created')
  .onPublish(async (message) => {
    const order = JSON.parse(Buffer.from(message.data, 'base64').toString());
    await notificationService.sendPointsEarned(order);
  });
```

## Error Handling & Dead Letter Queue

```javascript
// Configure subscription with DLQ in GCP Console or Terraform
// subscription: order-events-sub
// dead_letter_topic: order-events-dlq
// max_delivery_attempts: 5

// Process dead letter messages
exports.handleDeadLetters = functions.pubsub
  .topic('order-events-dlq')
  .onPublish(async (message) => {
    const data = JSON.parse(Buffer.from(message.data, 'base64').toString());

    // Log for investigation
    console.error('Dead letter received:', {
      data,
      attributes: message.attributes,
      deliveryAttempt: message.attributes?.deliveryAttempt
    });

    // Store for manual review
    await firestore.collection('failedEvents').add({
      data,
      attributes: message.attributes,
      timestamp: new Date()
    });
  });
```

## Ordering Messages (When Order Matters)

```javascript
// Use ordering key for messages that must be processed in sequence
async function publishOrderedMessage(topicName, data, orderingKey) {
  const topic = pubsub.topic(topicName, {
    messageOrdering: true
  });

  await topic.publishMessage({
    data: Buffer.from(JSON.stringify(data)),
    orderingKey // e.g., customerId - ensures all messages for same customer processed in order
  });
}
```

## Decision: Pub/Sub vs Cloud Tasks

| Need | Solution |
|------|----------|
| Process NOW, scale automatically | Pub/Sub |
| Process LATER (delay) | Cloud Tasks |
| Multiple consumers for same event | Pub/Sub (fan-out) |
| Rate-limited external API | Cloud Tasks |
| At-least-once delivery | Both work |
| Exactly-once processing | Implement idempotency |
