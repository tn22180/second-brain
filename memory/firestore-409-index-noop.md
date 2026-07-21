---
name: firestore-409-index-noop
description: "Firestore '409 index already exists' on a redeploy is a no-op, not an error"
metadata:
  node_type: memory
  type: reference
  originSessionId: da55231c-7c93-48d5-94d9-be62125b495d
---

Redeploying a Firestore composite index that already exists returns **`409 index already exists`**.
This is a **no-op, not a failure** — the index is already in place. Don't treat it as a deploy error
or try to "fix" it; nothing needs to change. Applies to any Avada app deploying `firestore.indexes`.
