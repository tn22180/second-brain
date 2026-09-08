fingerprint: 1kbc5wp
service: optimizeStoreSubscriber
message: Error: Update() requires either a single JavaScript object or an alternating list of field/value pairs that can be followed by an optional precondition. At least one field must be updated.
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-09-08T02:48:24.123Z
status: fix_disabled
attempt: 1

# IMG-OPT · optimizeStoreSubscriber · 1kbc5wp

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** subscribeOptimizeStore clears the gift-run flag via updateShopData(shop.id, {speedUpFreeRunStartedAt: null}), but 'speedUpFreeRunStartedAt' is listed in blockFields, so removeFields strips the only key and updateShopData calls Firestore update({}) with an empty object, which throws.

**Mechanism.** packages/functions/src/handlers/pubsub/subscribeOptimizeStore.js:127 calls updateShopData(shop.id, {speedUpFreeRunStartedAt: null}) on the freeRun branch. Payload has no isDevZone, so shopRepository.js:178 runs removeFields(postData, blockFields); 'speedUpFreeRunStartedAt' is blockFields entry packages/functions/src/config/pickFields.js:82, so prepareData becomes {}. None of the later branches ('isLimitImage' in ..., 'plan' in ...) add a key, so shopRepository.js:216 executes collection.doc(shopId).update({}) → @google-cloud/firestore reference.js:434 throws 'Update() requires ... At least one field must be updated.' The prod stack frames match exactly: updateShopData (lib/repositories/shopRepository.js:306) ← subscribeOptimizeStore (lib/handlers/pubsub/subscribeOptimizeStore.js:110), same relative files, babel-shifted lines. The throw is inside updateShopData's own try, so its catch logs the raw Error (shopRepository.js:233 console.error(e)) — which is why the alert text carries no '[subscribeOptimizeStore] clear freeRunStartedAt failed' prefix from the caller's .catch. No request fails; updateShopData returns {success:false} and the handler proceeds to trackEvent. The real damage is the dropped write: speedUpFreeRunStartedAt stays set forever, so packages/functions/src/helpers/onboarding/checklistStatus.js:33 (speedUp: !!shop.speedUpFreeRunStartedAt) and packages/functions/src/controllers/optimizeStoreController.js:28 keep reading it as a completed/in-progress gift run; the FE side is bounded only by its own 60-minute stale guard in packages/assets/src/helpers/growthGiftEligibility.js.

Confidence: `high`

## Code
- `packages/functions/src/handlers/pubsub/subscribeOptimizeStore.js:127` — the freeRun branch that calls updateShopData with the single blocked field — matches prod frame lib/handlers/pubsub/subscribeOptimizeStore.js:110
- `packages/functions/src/repositories/shopRepository.js:178` — removeFields(postData, blockFields) strips the only key because the payload has no isDevZone
- `packages/functions/src/config/pickFields.js:82` — 'speedUpFreeRunStartedAt' is a blockFields entry, so it can never be written through updateShopData
- `packages/functions/src/repositories/shopRepository.js:216` — collection.doc(shopId).update(prepareUpdateData({})) — the throwing call, prod frame lib/repositories/shopRepository.js:306
- `packages/functions/src/repositories/shopRepository.js:439` — consumeSpeedUpFreeRunToken writes the same field directly via tx.update, bypassing blockFields — the field is only ever settable, never clearable through updateShopData
- `packages/functions/src/helpers/onboarding/checklistStatus.js:33` — speedUp checklist step is derived from the never-cleared field, so it stays true permanently

## Evidence
- 1 matching entries: `(resource.labels.function_name="optimizeStoreSubscriber" OR resource.labels.service_name="optimizeStoreSubscriber") AND timestamp>="2026-08-25T00:00:00Z" AND textPayload:"At least one field must be updated"`
- 1 matching entries: `(resource.labels.function_name="optimizeStoreSubscriber" OR resource.labels.service_name="optimizeStoreSubscriber") AND timestamp>="2026-09-07T20:36:29.907Z" AND timestamp<="2026-09-07T21:06:29.907Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.62

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
