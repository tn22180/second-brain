fingerprint: 1bfed3n
service: recursivesubscribergen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:56:59.661Z
status: infra
attempt: 1

# SEO · recursivesubscribergen2 · 1bfed3n

**Outcome.** infra class — reported, no MR

**Root cause.** Two distinct causes share this window: (a) the alerted line — one STARTUP TCP probe DEADLINE_EXCEEDED on a recursivesubscribergen2 cold start at 04:47:42Z — is infra, a duplicate of the platform-side container-start fault that hit 267 containers across ~20 avada-seo/us-central1 services during the 2026-08-14T04:0x–05:0xZ deploy window (already recorded under dw8unc, 1lwydlk, e9i6k0 …); (b) the only application error in the window is a separate, deterministic code defect — getProductsToOptimizeImage's catch returns a bare `[]`, so the caller's `{products, pageInfo}` destructure yields `products === undefined` and `products.map(formatProductToOptimize)` throws on every RECURSIVE_OPTIMIZE_IMAGES_BY_PRODUCT run, 48 of 48 times in 24h.

**Mechanism.** Cause (b), the one that is code: reTriggerBulkOperation re-dispatches `recursive` with action RECURSIVE_OPTIMIZE_IMAGES_BY_PRODUCT for any shop whose history has isOptimizeByProduct (bulkOperationService.js:684-688), driven by the */30 reTriggerOptimizePublisher cron. mainHandler's RECURSIVE_OPTIMIZE_IMAGES_BY_PRODUCT case destructures `[currentShop, settings, {products, pageInfo}]` out of Promise.all (subscribeRecursive.js:424-428) and immediately calls `products.map(formatProductToOptimize)` (subscribeRecursive.js:429). When the Shopify Admin GraphQL call inside getProductsToOptimizeImage throws, its catch logs at logger.debug — silenced in prod, which is why no upstream line appears in the logs — and returns `[]` (getProductsToOptimizeImage.js:31-34). Destructuring `{products, pageInfo}` off an array gives undefined for both, so line 429 throws `TypeError: Cannot read properties of undefined (reading 'map')`. Line mapping is exact, not guessed: compiling this src file with packages/functions' own babel config puts `products.map(_getProductsToOptimizeImage.formatProductToOptimize)` at output line 413 col 44 and the `await mainHandler(` call at output line 112 — both frames of the prod stack `/workspace/lib/handlers/cron/subscribeRecursive.js:413:44` … `at async handle (…:112:5)`. The throw aborts the handler before the self-chaining dispatch at :460, so the shop's optimize job never advances, stays selected by getShopToReTriggerOptimize, and the cron reproduces the identical failure every ~30 minutes — 48 occurrences from 2026-08-13T05:00:17Z to 2026-08-14T05:01:32Z at 30-minute spacing, zero successes on that path. Cause (a) is unrelated: it landed on a different revision (-00141-fef, the deploy rollout) than every application log line in the window (-00140-naj), emitted no application log at all, and 267 identical probe failures hit authgen2 (37), apigen2 (27), handleproderroralertgen2 (24), proxygen2 (12) and 16 other services in the same 35 minutes with unchanged code.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/product/getProductsToOptimizeImage.js:33` — catch returns `[]` instead of `{products: [], pageInfo}` — the array destructures to undefined at the call site; this is the defect
- `packages/functions/src/helpers/graphql/product/getProductsToOptimizeImage.js:32` — the swallowed Shopify error is logged at logger.debug, silenced in prod — why no upstream cause line exists in the stderr read
- `packages/functions/src/handlers/cron/subscribeRecursive.js:424` — `const [currentShop, settings, {products, pageInfo}] = await Promise.all(...)` — destructures object fields off the returned array
- `packages/functions/src/handlers/cron/subscribeRecursive.js:429` — `products.map(formatProductToOptimize)` — the throwing line; compiles to lib line 413 col 44, matching the prod stack exactly
- `packages/functions/src/handlers/cron/subscribeRecursive.js:460` — the self-chaining dispatch never reached, so the shop stays stuck and the cron replays the same failure every 30 min
- `packages/functions/src/services/optimize/bulkOperationService.js:684` — reTriggerBulkOperation re-dispatches RECURSIVE_OPTIMIZE_IMAGES_BY_PRODUCT for the stuck shop — the 30-minute cadence source
- `packages/functions/src/handlers/cron/reTriggerOptimize.js:18` — the */30 cron that calls reTriggerBulkOperation for every shop returned by getShopToReTriggerOptimize

## Evidence
- 48 matching entries: `resource.labels.service_name="recursivesubscribergen2" AND timestamp>="2026-08-13T05:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"subscribeRecursive.js:413:44"`
- 48 matching entries: `resource.labels.service_name="recursivesubscribergen2" AND timestamp>="2026-08-13T05:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"Cannot read properties of undefined"`
- 1 matching entries: `resource.labels.service_name="recursivesubscribergen2" AND timestamp>="2026-08-14T04:32:55Z" AND timestamp<="2026-08-14T05:02:56Z" AND textPayload:"STARTUP TCP probe failed"`
- 267 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:30:00Z" AND timestamp<="2026-08-14T05:05:00Z" AND textPayload:"STARTUP TCP probe failed"`

## Job
- analyze rounds: 1
- cost: $2.65

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
