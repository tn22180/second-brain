# Queue System (Firestore-based)

For simple queuing without Cloud Tasks/Pub/Sub overhead.

## Basic Queue Pattern

```javascript
// Add to queue
async function enqueue(type, payload, shopId) {
  await firestore.collection('queues').add({
    type,
    payload,
    shopId,
    status: 'pending',
    createdAt: new Date(),
    attempts: 0
  });
}

// Process queue with Firestore trigger
exports.processQueue = functions.firestore
  .document('queues/{docId}')
  .onCreate(async (snap, context) => {
    const job = snap.data();
    const docRef = snap.ref;

    try {
      await docRef.update({status: 'processing'});

      switch (job.type) {
        case 'sync_customer':
          await syncCustomer(job.payload);
          break;
        case 'send_email':
          await sendEmail(job.payload);
          break;
      }

      await docRef.update({status: 'completed', completedAt: new Date()});
    } catch (error) {
      const attempts = job.attempts + 1;
      if (attempts >= 3) {
        await docRef.update({status: 'failed', error: error.message});
      } else {
        await docRef.update({status: 'pending', attempts});
      }
    }
  });
```

## Queue vs Cloud Tasks vs Pub/Sub

| Feature | Firestore Queue | Cloud Tasks | Pub/Sub |
|---------|-----------------|-------------|---------|
| Setup complexity | Low | Medium | Medium |
| Delayed execution | Manual | Built-in | No |
| Rate limiting | Manual | Built-in | No |
| Fan-out | No | No | Yes |
| High volume | Limited | Good | Best |
| Cost | Firestore reads | Task fees | Message fees |
| Retries | Manual | Automatic | Automatic |

## Priority Queue Pattern

```javascript
async function enqueueWithPriority(type, payload, shopId, priority = 'normal') {
  const priorityScore = {high: 1, normal: 2, low: 3}[priority];

  await firestore.collection('queues').add({
    type,
    payload,
    shopId,
    priority: priorityScore,
    status: 'pending',
    createdAt: new Date()
  });
}

// Process by priority
exports.processQueue = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async () => {
    const pending = await firestore.collection('queues')
      .where('status', '==', 'pending')
      .orderBy('priority')
      .orderBy('createdAt')
      .limit(10)
      .get();

    for (const doc of pending.docs) {
      await processJob(doc);
    }
  });
```

## Cleanup Old Jobs

```javascript
exports.cleanupOldJobs = functions.pubsub
  .schedule('0 0 * * *')
  .onRun(async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const old = await firestore.collection('queues')
      .where('status', '==', 'completed')
      .where('completedAt', '<', cutoff)
      .limit(500)
      .get();

    const batch = firestore.batch();
    old.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  });
```
