---
name: seo-gen2-worker-firebase-config
description: "gen2 worker needs FIREBASE_CONFIG env for storageBucket; FIREBASE_STORAGE_BUCKET is useless because an import-chain no-arg init runs before worker.mjs's bucket block."
metadata: 
  node_type: memory
  type: reference
  originSessionId: a3f0f490-5c60-457e-82b7-5860fe12e2f5
  modified: 2026-08-12T10:13:23.238Z
---

The gen2 worker (`worker.mjs`) has a firebase-init ORDER bug: line 21 `require('./src/helpers/
worker/sanitizePayload.js')` pulls an import chain that triggers a no-arg
`firebase.initializeApp()` (the auth.js/authSa.js `if (apps.length===0) initializeApp()` pattern)
BEFORE worker.mjs's own bucket-aware init block (~line 93). The chain wins → app created bucketless
→ the block is skipped (`apps.length` already 1) → `admin.storage().bucket()` throws **"Bucket name
not specified"** on any file/workListStore job.

Therefore `FIREBASE_STORAGE_BUCKET` env is USELESS (the block that reads it never runs). The
order-independent fix is **`FIREBASE_CONFIG='{"storageBucket":"avada-seo.appspot.com","projectId":
"avada-seo"}'`** — the no-arg init reads FIREBASE_CONFIG, so the first (winning) app gets the bucket.

Applied via compose env on central (`fbconfig-override.yml`, services gen2-leader/gen2-worker1)
and on boxes (`compose.gen2-follower.yml`). Durable fix (not yet done, manual deploy): move the
init block above the sanitizePayload require in worker.mjs, and fold FIREBASE_CONFIG into the CI
image env so a rebuild can't lose it. See [[seo-gen2-follower-fleet-deploy]].
