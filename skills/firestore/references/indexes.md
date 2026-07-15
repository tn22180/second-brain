# Firestore Indexes & TTL

## Index File Structure

If `firestore-indexes/` folder exists, **always add indexes there** (not directly to `firestore.indexes.json`):

```
firestore-indexes/
├── build.js              # Merge all → firestore.indexes.json
├── split.js              # Split into collection files
├── customers.json        # Indexes for customers
└── {collection}.json     # One file per collection
```

## Workflow

1. Create/edit `firestore-indexes/{collection}.json`
2. Run `yarn firestore:build` to regenerate `firestore.indexes.json`

| Command | Description |
|---------|-------------|
| `yarn firestore:build` | Merge into firestore.indexes.json |
| `yarn firestore:split` | Split into collection files |

## When Index Required

| Query Pattern | Index Needed? |
|---------------|---------------|
| Single field `where()` | NO (auto) |
| `where()` + `orderBy()` different fields | YES |
| Multiple inequality `where()` | YES |

## Sortable Lists: Both Directions Required

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
