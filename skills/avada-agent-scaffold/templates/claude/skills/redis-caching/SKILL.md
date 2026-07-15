---
name: redis-caching
description: Use this skill when working with Redis — caching, cache invalidation, TTL strategy, circuit breaker, fire-and-forget writes, connection management, cache-aside, or read-through caching in Cloud Functions / workers. Trigger phrases: "Redis", "cache", "ioredis", "cache stale", "invalidate cache", "circuit breaker".
---

# Redis Caching ({{APP_NAME}})

Redis is a **read-through cache** to cut Firestore reads and latency. It is **never** the
source of truth. (This app uses `ioredis`; the patterns below apply to `node-redis` too —
adjust the client calls.)

```
Request → Function → Redis (hit?) → return cached
                        ↓ miss
                     Firestore → return + cache (fire-and-forget)
```

## Non-negotiable principles

1. **Fail open** — a Redis failure must NEVER block a request. Always fall back to the DB.
2. **Fire-and-forget writes** — cache writes must not add latency to the response path.
3. **Circuit breaker** — stop hitting Redis after repeated failures; retry after a cooldown.
4. **Cache is disposable** — any key can be evicted anytime; the app must work without it.

## Connection (module-scope singleton + circuit breaker)

Declare the client OUTSIDE the handler so warm invocations reuse it. Return `null` (never
throw) on failure so callers fall back to the DB.

```javascript
import Redis from 'ioredis';
import logger from '@functions/helpers/logger';

let client = null;
let isCircuitOpen = false;
let circuitResetAt = 0;
const CONNECT_TIMEOUT_MS = 500;
const READ_TIMEOUT_MS = 300;
const CIRCUIT_OPEN_MS = 60_000;

function openCircuit() {
  isCircuitOpen = true;
  circuitResetAt = Date.now() + CIRCUIT_OPEN_MS;
  logger.warn('[redis]', `circuit OPEN for ${CIRCUIT_OPEN_MS / 1000}s`);
}

function getRedis() {
  if (isCircuitOpen && Date.now() < circuitResetAt) return null;
  if (isCircuitOpen) isCircuitOpen = false; // half-open: try again
  if (client) return client;
  client = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    connectTimeout: CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    lazyConnect: false,
  });
  client.on('error', e => { logger.error('[redis]', e.message, e); openCircuit(); });
  return client;
}
```

## Timeout wrapper (slow Redis is worse than no Redis)

```javascript
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('redis timeout')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
```

| Op | Timeout |
|----|---------|
| Connect | 500 ms |
| Read (GET/HGET/MGET) | 300 ms |
| Write (SET/DEL) | none — fire-and-forget |

## Core operations

```javascript
async function cacheGet(key) {
  try {
    const r = getRedis();
    if (!r) return null;
    const raw = await withTimeout(r.get(key), READ_TIMEOUT_MS);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    logger.warn('[redis] get', key, e.message);
    return null; // fall back to DB
  }
}

// Fire-and-forget — do NOT await in the request path
function cacheSet(key, value, ttlSec = 300) {
  const r = getRedis();
  if (!r) return;
  r.set(key, JSON.stringify(value), 'EX', ttlSec).catch(e => logger.warn('[redis] set', key, e.message));
}

function cacheDel(key) {
  const r = getRedis();
  if (!r) return;
  r.del(key).catch(e => logger.warn('[redis] del', key, e.message));
}
```

## Cache-aside read

```javascript
async function getResourceCached(shopID, id) {
  const key = `shop:${shopID}:resource:${id}`;
  const hit = await cacheGet(key);
  if (hit) return hit;
  const data = await resourceRepo.getById(id, shopID);
  if (data) cacheSet(key, data, 300);
  return data;
}
```

## Invalidation — delete, don't update

Invalidate on EVERY entity mutation. Delete the key; let the next read repopulate.

```javascript
async function updateResource(shopID, id, patch) {
  await resourceRepo.updateById(id, shopID, patch);
  cacheDel(`shop:${shopID}:resource:${id}`);
}
```

Cross-service invalidation → publish a `cache-invalidation` Pub/Sub message with the keys;
subscribers delete them.

## Key naming

`{entity}:{shopID}:{sub}` — e.g. `shop:123:settings`, `shop:123:resource:456`.
Use a Redis **hash** for related fields (`hSet`) to save memory. Set a TTL for computed/
temporary data; use no-TTL + delete-on-update for config/settings.

## What NOT to cache

Tokens/PII (unless encrypted + short TTL), per-request-changing data, objects > 100 KB,
write-heavy data (invalidation cost > read savings).

## Debugging stale cache

Layered elimination: DB → Firestore snapshot → Redis → CDN → browser/SW. Confirm the right
instance (prod vs staging). Scan for orphaned keys read-only before deleting. A "saved but
reload shows old" bug is almost always a missing `cacheDel` on the write path.

## Checklist
```
□ Module-scope singleton client, returns null on failure
□ Circuit breaker (default 60s), connect 500ms / read 300ms timeouts
□ Every read try/catch → null → DB fallback
□ Fire-and-forget writes (never awaited in request path)
□ cacheDel on every entity update (delete, not update)
□ Key naming {entity}:{shopID}:{sub}; TTL for computed data
□ Redis + compute co-located in same region
```
