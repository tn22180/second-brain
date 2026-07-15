# Async/Await Patterns

## Parallel Execution

```javascript
// BAD: Sequential (3000ms)
const customers = await getCustomers();
const settings = await getSettings();
const tiers = await getTiers();

// GOOD: Parallel (1000ms)
const [customers, settings, tiers] = await Promise.all([
  getCustomers(),
  getSettings(),
  getTiers()
]);
```

## Avoid Await in Loops

```javascript
// BAD: Sequential loop
for (const customer of customers) {
  await updateCustomer(customer);
}

// GOOD: Parallel
await Promise.all(customers.map(c => updateCustomer(c)));

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
  customers.map(c => updateCustomer(c))
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
