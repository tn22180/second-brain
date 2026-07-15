---
name: firestore-database
description: Use this skill when the user asks about "Firestore", "database queries", "indexes", "batch operations", "pagination", "TTL", "write limits", or any Firestore-related work. Provides Firestore query optimization, indexing, and best practices.
---

# Firestore Best Practices

## Query Optimization

### Filters & Limits

```javascript
// ❌ BAD: Fetch all, filter in JS
const all = await customersRef.get();
const active = all.docs.filter(d => d.data().status === 'active');

// ✅ GOOD: Filter in query
const active = await customersRef
  .where('status', '==', 'active')
  .where('shopId', '==', shopId)
  .limit(100)
  .get();
```

### Batch Reads

```javascript
// ❌ BAD: Read in loop (N reads)
for (const id of customerIds) {
  const doc = await customerRef.doc(id).get();
}

// ✅ GOOD: Batch read (1 operation)
const docs = await firestore.getAll(
  ...customerIds.map(id => customerRef.doc(id))
);
```

### Check Empty Collections

```javascript
// ❌ BAD: Uses .size
if (snapshot.size === 0) { }

// ✅ GOOD: Uses .empty (fast)
if (snapshot.empty) { }
```

---

## Batch Operations

```javascript
const batch = firestore.batch();
const BATCH_SIZE = 500;

for (let i = 0; i < items.length; i += BATCH_SIZE) {
  const chunk = items.slice(i, i + BATCH_SIZE);
  chunk.forEach(item => {
    batch.set(collectionRef.doc(item.id), item);
  });
  await batch.commit();
}
```

---

## Indexes

### Index File Structure

If `firestore-indexes/` folder exists, **always add indexes there** (not directly to `firestore.indexes.json`):

```
firestore-indexes/
├── build.js              # Merge all → firestore.indexes.json
├── split.js              # Split into collection files
├── customers.json        # Indexes for customers
└── {collection}.json     # One file per collection
```

### Workflow

1. Create/edit `firestore-indexes/{collection}.json`
2. Run `yarn firestore:build` to regenerate `firestore.indexes.json`

| Command | Description |
|---------|-------------|
| `yarn firestore:build` | Merge into firestore.indexes.json |
| `yarn firestore:split` | Split into collection files |

### When Index Required

| Query Pattern | Index Needed? |
|---------------|---------------|
| Single field `where()` | NO (auto) |
| `where()` + `orderBy()` different fields | YES |
| Multiple inequality `where()` | YES |

### Sortable Lists: Both Directions Required

When a repository uses `paginateQuery` or supports sortable grids/lists, **create indexes for BOTH ASC and DESC directions**:

```json
// firestore-indexes/{collection}.json
{
  "indexes": [
    {
      "collectionGroup": "trustBadges",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "shopId", "order": "ASCENDING"},
        {"fieldPath": "order", "order": "ASCENDING"}
      ]
    },
    {
      "collectionGroup": "trustBadges",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "shopId", "order": "ASCENDING"},
        {"fieldPath": "order", "order": "DESCENDING"}
      ]
    }
  ]
}
```

**Why both directions?**
- `paginateQuery` helper uses `startAfter`/`endBefore` cursors
- Cursor direction depends on sort order (ASC vs DESC)
- Missing direction index causes `FAILED_PRECONDITION` error

---

## Index Exemptions

Use for large fields you don't query:

```json
{
  "fieldOverrides": [
    {
      "collectionGroup": "webhookLogs",
      "fieldPath": "body",
      "indexes": []
    }
  ]
}
```

---

## TTL (Time-To-Live) Pattern

Automatically delete old documents without cron jobs:

### 1. Add `expireAt` Field in Repository

```javascript
/** TTL duration in milliseconds (90 days) */
const TTL_MS = 90 * 24 * 60 * 60 * 1000;

function getExpireAt(now) {
  return new Date(now.getTime() + TTL_MS);
}

export async function createNotification({shopId, data}) {
  const now = new Date();

  return collection.add({
    ...data,
    shopId,
    createdAt: now,
    expireAt: getExpireAt(now)  // TTL field
  });
}
```

### 2. Add TTL fieldOverride in Index File

```json
// firestore-indexes/{collection}.json
{
  "indexes": [...],
  "fieldOverrides": [
    {
      "collectionGroup": "salePopNotifications",
      "fieldPath": "expireAt",
      "ttl": true,
      "indexes": []
    }
  ]
}
```

### 3. Deploy Indexes

```bash
yarn firestore:build   # Merge index files
firebase deploy --only firestore:indexes
```

**Notes:**
- TTL deletion is eventual (may take 24-48 hours after expireAt)
- Use for logs, temporary data, notifications
- No Firestore reads/writes cost for TTL deletions

---

## Write Rate Limits

**Limit: 1 write per document per second**

```javascript
// ❌ BAD: Multiple writes to same doc
await shopRef.doc(shopId).update({ lastSyncAt: new Date() });

// ✅ GOOD: Write to separate collection
await shopUpdatesRef.add({
  shopId,
  lastSyncAt: new Date(),
  expiredAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
});
```

---

## Repository Pattern

**ONE repository = ONE collection**

```javascript
const customersRef = firestore.collection('customers');

export const getByShop = (shopId) =>
  customersRef.where('shopId', '==', shopId).get();

export const update = (id, data) =>
  customersRef.doc(id).update({ ...data, updatedAt: new Date() });
```

---

## Repository Helper Functions

Import standardized utilities from `repositories/helper.js`:

```javascript
import {
  prepareDoc,
  paginateQuery,
  getOrderBy,
  getByIds,
  batchCreate,
  batchUpdate,
  batchDelete,
  getDocsInChunks
} from './helper';
```

| Function | Purpose | Use Case |
|----------|---------|----------|
| `prepareDoc({doc})` | Format document with date conversion | All read operations |
| `paginateQuery({queriedRef, collection, query})` | Cursor-based pagination with hasPre/hasNext | List endpoints |
| `getOrderBy(sortType)` | Parse "field_direction" string | Sortable lists |
| `getByIds({collection, ids, filters})` | Batch fetch by IDs (handles 10-item 'in' limit) | Bulk lookups |
| `batchCreate/Update/Delete` | Chunked batch operations (500 limit) | Bulk mutations |
| `getDocsInChunks({collection, shopId})` | Recursive fetch for large datasets | Exports, migrations |

### paginateQuery Usage

```javascript
export async function getItemList({shopId, query = {}}) {
  const {order, status} = query;

  // Always start with shopId filter
  let queriedRef = collection.where('shopId', '==', shopId);

  // Apply optional filters
  if (status) {
    queriedRef = queriedRef.where('status', '==', status);
  }

  // Apply sorting
  const {sortField, direction} = getOrderBy(order);
  queriedRef = queriedRef.orderBy(sortField, direction);

  // Returns: {data, count, total, pageInfo: {hasPre, hasNext, totalPage}}
  return await paginateQuery({queriedRef, collection, query});
}
```

### getByIds Usage

```javascript
// Fetch multiple documents by ID with shopId filter
const items = await getByIds({
  collection,
  ids: ['id1', 'id2', 'id3'],
  filters: {shopId}  // Security: always include shopId
});

// Fetch by custom field
const items = await getByIds({
  collection,
  ids: ['SKU001', 'SKU002'],
  idField: 'sku',
  selectFields: ['name', 'price']
});
```

---

## Sample Repository Template

For new repositories, use `packages/functions/src/repositories/sampleRepository.js` as a template.

**Includes patterns for:**
- Multi-tenant security (shopId validation)
- Ownership validation before updates/deletes
- Paginated list with filters and sorting
- Batch create/update/delete operations
- Field uniqueness checking
- Count queries

```bash
# Copy and rename for new collection
cp packages/functions/src/repositories/sampleRepository.js \
   packages/functions/src/repositories/myFeatureRepository.js
```

**Key patterns in template:**

```javascript
// Ownership validation
export async function getById(id, shopId) {
  const doc = await collection.doc(id).get();
  if (!doc.exists) return null;

  const data = prepareDoc({doc});
  if (data.shopId !== shopId) {
    console.error(`Unauthorized access: ${shopId} tried to access ${id}`);
    return null;
  }
  return data;
}

// Update with ownership check
export async function updateById(id, shopId, data) {
  const existing = await getById(id, shopId);
  if (!existing) {
    return {success: false, error: 'Not found or access denied'};
  }
  // ... update logic
}
```

---

## Aggregate Pattern with Transactions

For maintaining counters, averages, and breakdowns that must stay consistent with related data. Common uses: rating averages, point totals, inventory counts, statistics.

### Aggregate Document Structure

```javascript
// Collection: {feature}Aggregates (e.g., productAggregates, orderAggregates)
{
  shopId: string,
  resourceId: string,          // ID of parent resource
  average: number,             // Calculated: sum / total
  total: number,               // Counter
  breakdown: {                 // Per-category counters (optional)
    category1: number,
    category2: number
  },
  updatedAt: Timestamp
}
```

### Compound Doc ID Pattern

Use composite keys for aggregates scoped to multiple fields:

```javascript
function getDocId(shopId, resourceId) {
  return `${shopId}_${resourceId}`;
}

const docRef = collection.doc(getDocId(shopId, resourceId));
```

### Increment with Transaction

```javascript
export async function incrementAggregate(shopId, resourceId, value, category = null) {
  const docRef = collection.doc(getDocId(shopId, resourceId));

  await firestore.runTransaction(async transaction => {
    const doc = await transaction.get(docRef);

    if (!doc.exists) {
      // Initialize new aggregate
      const newDoc = {
        shopId,
        resourceId,
        average: value,
        total: 1,
        updatedAt: FieldValue.serverTimestamp()
      };
      if (category) {
        newDoc.breakdown = {[category]: 1};
      }
      transaction.set(docRef, newDoc);
      return;
    }

    // Recalculate average
    const data = doc.data();
    const newTotal = data.total + 1;
    const newAverage = (data.average * data.total + value) / newTotal;

    const updates = {
      total: newTotal,
      average: Math.round(newAverage * 10) / 10,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (category) {
      updates[`breakdown.${category}`] = FieldValue.increment(1);
    }

    transaction.update(docRef, updates);
  });
}
```

### Decrement with Transaction

```javascript
export async function decrementAggregate(shopId, resourceId, value, category = null) {
  const docRef = collection.doc(getDocId(shopId, resourceId));

  await firestore.runTransaction(async transaction => {
    const doc = await transaction.get(docRef);
    if (!doc.exists) return;

    const data = doc.data();
    const newTotal = Math.max(0, data.total - 1);

    if (newTotal === 0) {
      const updates = {
        total: 0,
        average: 0,
        updatedAt: FieldValue.serverTimestamp()
      };
      if (category) {
        updates[`breakdown.${category}`] = FieldValue.increment(-1);
      }
      transaction.update(docRef, updates);
      return;
    }

    // Recalculate average
    const oldSum = data.average * data.total;
    const newAverage = (oldSum - value) / newTotal;

    const updates = {
      total: newTotal,
      average: Math.round(newAverage * 10) / 10,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (category) {
      updates[`breakdown.${category}`] = FieldValue.increment(-1);
    }

    transaction.update(docRef, updates);
  });
}
```

### Bulk Read for Aggregates

```javascript
export async function getAggregatesBulk(shopId, resourceIds) {
  if (!resourceIds.length) return {};

  const docIds = resourceIds.map(id => getDocId(shopId, id));
  const docs = await firestore.getAll(...docIds.map(id => collection.doc(id)));

  const result = {};
  resourceIds.forEach((resourceId, index) => {
    const doc = docs[index];
    result[resourceId] = doc.exists ? doc.data() : getDefaultAggregate(shopId, resourceId);
  });

  return result;
}

function getDefaultAggregate(shopId, resourceId) {
  return {shopId, resourceId, average: 0, total: 0, breakdown: {}};
}
```

### Recalculate from Scratch

```javascript
// For data repair or after bulk imports
export async function recalculateAggregate(shopId, resourceId, items, valueField = 'value') {
  const breakdown = {};
  let totalValue = 0;

  items.forEach(item => {
    const val = item[valueField];
    totalValue += val;
    if (item.category) {
      breakdown[item.category] = (breakdown[item.category] || 0) + 1;
    }
  });

  const total = items.length;
  const average = total > 0 ? Math.round((totalValue / total) * 10) / 10 : 0;

  await collection.doc(getDocId(shopId, resourceId)).set({
    shopId,
    resourceId,
    average,
    total,
    breakdown,
    updatedAt: FieldValue.serverTimestamp()
  });
}
```

### Aggregate Pattern Checklist

```
- Use transactions for increment/decrement (consistency)
- Handle non-existent docs (initialize defaults)
- Use FieldValue.increment() for counters
- Recalculate averages in transaction
- Round averages to 1 decimal place
- Provide bulk read for collection/list pages
- Include recalculate function for data repair
```
