# Repository Helper Functions

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

## Function Reference

| Function | Purpose | Use Case |
|----------|---------|----------|
| `prepareDoc({doc})` | Format document with date conversion | All read operations |
| `paginateQuery({queriedRef, collection, query})` | Cursor-based pagination with hasPre/hasNext | List endpoints |
| `getOrderBy(sortType)` | Parse "field_direction" string | Sortable lists |
| `getByIds({collection, ids, filters})` | Batch fetch by IDs (handles 10-item 'in' limit) | Bulk lookups |
| `batchCreate/Update/Delete` | Chunked batch operations (500 limit) | Bulk mutations |
| `getDocsInChunks({collection, shopId})` | Recursive fetch for large datasets | Exports, migrations |

---

## paginateQuery

Cursor-based pagination with automatic hasPre/hasNext detection.

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

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `after` | string | Document ID to start after (next page) |
| `before` | string | Document ID to end before (prev page) |
| `limit` | number | Items per page (default: 20) |
| `hasCount` | boolean | Include total count |
| `getAll` | boolean | Fetch all documents (ignores pagination) |

---

## getByIds

Batch fetch documents by IDs, handling Firestore's 10-item 'in' operator limit.

```javascript
// Fetch by document IDs with shopId filter
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

## getDocsInChunks

Recursively fetch all documents for large datasets (exports, migrations).

```javascript
const allCustomers = await getDocsInChunks({
  collection: customersCollection,
  shopId: 'shop123',
  perPage: 1000  // Chunk size
});
```

**Warning:** Can be memory-intensive. Consider streaming for very large collections.

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

### Ownership Validation Pattern

```javascript
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
```

### Update with Ownership Check

```javascript
export async function updateById(id, shopId, data) {
  const existing = await getById(id, shopId);
  if (!existing) {
    return {success: false, error: 'Not found or access denied'};
  }

  const updateData = {
    ...data,
    updatedAt: new Date()
  };

  // Remove protected fields
  delete updateData.id;
  delete updateData.shopId;
  delete updateData.createdAt;

  await collection.doc(id).update(updateData);
  return {success: true, data: {id, ...existing, ...updateData}};
}
```

### Field Uniqueness Check

```javascript
export async function isFieldUnique(shopId, field, value, excludeId = null) {
  const docs = await collection
    .where('shopId', '==', shopId)
    .where(field, '==', value)
    .limit(1)
    .get();

  if (docs.empty) return true;
  if (excludeId && docs.docs[0].id === excludeId) return true;
  return false;
}
```
