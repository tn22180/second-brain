# Async/Await Patterns

## Parallel Execution

```javascript
// BAD: Sequential (3000ms)
const resources = await getResources();
const settings = await getSettings();
const items = await getItems();

// GOOD: Parallel (1000ms)
const [resources, settings, items] = await Promise.all([
  getResources(),
  getSettings(),
  getItems()
]);
```

## Avoid Await in Loops

```javascript
// BAD: Sequential loop
for (const item of items) {
  await updateItem(item);
}

// GOOD: Parallel
await Promise.all(items.map(i => updateItem(i)));

// BETTER: Chunked for rate limits
async function processInChunks(items, fn, chunkSize = 10) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(chunk.map(fn));
  }
}
```

## Promise.allSettled for Partial Failures

```javascript
// When some operations can fail without blocking others
const results = await Promise.allSettled(
  items.map(i => updateItem(i))
);

const successful = results.filter(r => r.status === 'fulfilled');
const failed = results.filter(r => r.status === 'rejected');

if (failed.length > 0) {
  console.error(`${failed.length} operations failed`);
}
```

## Retry with Exponential Backoff

```javascript
async function withRetry(fn, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```
