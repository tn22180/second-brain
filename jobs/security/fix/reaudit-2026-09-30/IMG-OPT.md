# IMG-OPT security re-audit — 2026-09-30

Read-only. Repo: `avada-image-optimizer` (main checkout, since the worktree
`avada-image-optimizer-wt-security-high` dropped out from under this session mid-run —
its objects are all still present in the main repo's store, so every ref below was read
from there).

Refs:
- **prod = `v1.7.83` = `origin/master`** — both resolve to `6c626204e61526adbbdf8f0c27e3658c50da170d` (2026-09-30). **They are the identical commit right now**, not two points to diff — collapsed into one column below.
- **!261** = `origin/fix/security-audit-avada` @ `47f8341d` (branched from `807658c1`, commits back to 2026-06-08; diffstat vs `origin/master`: **78 files, +3851/-370**)
- **ours** = `87b03289` (worktree branch `fix/security-high-2026-09`, 14 commits + unpushed hotfix `1ecbd824`; base `709f11f6`, merge-base with current `origin/master` unchanged; diffstat vs `origin/master`: **37 files, +1680/-285**)
- Master moved 7 commits past the original verify ref (`709f11f6` → `6c626204`) since 2026-09-22, all unrelated to these findings (loading-screen XSS/format fixes, GDPR webhook wiring) — doesn't change any row below.

## Priority 1 — token log (`services/shopifyService.js` `initShopify`)

**`console.log(shopifyDomain, accessToken)` at line 39 is LIVE IN PROD right now** (confirmed
directly in `v1.7.83`/`origin/master`, both = `6c626204`). It fires on every Shopify API call,
every shop, decrypted token.

| ref | status |
|---|---|
| v1.7.83 / origin/master (6c626204) | **LIVE** — line present |
| ours, pushed tip `87b03289` | **LIVE** — line present, deliberately left (progress log: "để nguyên tránh conflict") |
| !261 (`47f8341d`) | **LIVE** — file untouched, line present |
| hotfix `1ecbd824` | **fixed** — line removed. **Not pushed, not merged into `87b03289`, not on !261.** |

**Nobody's pushed branch fixes this.** The only fix that exists is sitting unpushed on a
local hotfix commit. This is the single most urgent item in the whole re-audit — push
`1ecbd824` (or cherry-pick it) ahead of everything else here.

## 32-finding matrix

Status legend: **open** = still exploitable exactly as found · **fixed** = closed ·
**partial** = closed on the reachable path today but the underlying trust is still coded
in a shared function, latent for the next caller · **fixed (different approach)** = both
close the gap, materially different code.

| # | file:line (anchor) | group | prod = v1.7.83/master (6c626204) | !261 (`47f8341d`) | ours (`87b03289`) |
|---|---|---|---|---|---|
| 1 | `.npmrc:1` (+`.yarnrc.yml:9`, `packages/functions/.npmrc:1`) | G1 secret | open | open — untouched | open — untouched, explicit skip pending Tuan rotate |
| 2 | `firestore.rules:5-32` (7 collections `read:true`) | G4 rules | open | **partial** — left open on purpose, documented as a known cross-tenant read gap (embed has no Firebase Auth identity yet; closing needs a `shopId` custom-claim migration first) | open — task 10 BLOCKED, 0 changes |
| 3 | `firestore.rules:25-30` (`featureReq`/`commentFeatureReq` `write:true`) | G4b rules | open | **fixed** — `allow write: if false`, read stays open (all writes now go through session-authed `/api` routes) | open — same BLOCKED task 10 |
| 4 | `commands/autoTranslateV2.js:7` | G2 secret | open | open — untouched | open — explicit skip pending Tuan rotate |
| 5 | `commands/getAT.js:3-4` | G3 secret | open (file + ciphertext still committed) | open — untouched | open — explicit skip pending Tuan rotate + history scrub |
| 6 | `historyController.js:58` `revertAllV2` | G7 IDOR | open | **fixed** — `getHistoryOptimizeById(historyId, shopId)` + not-found guard | **fixed** — `isOwnedByShop` pattern (task 6) |
| 7 | `integrationKeyController.js:11-16` `getOne`/`createOne` | G5 | open (only app-wide `verifyEmbedRequest`) | **fixed (different)** — gates on `shop.isDevZone` Firestore flag; `getOne` response now strips `accessToken` entirely (returns id/name/type only) | **fixed (different)** — gates on `canAccessDevZone`/CRM-login-as claim; response still returns full `accessToken`, `console.log('name:', name)` still present |
| 8 | `optimizeStoreController.js:20-27` `handleOptimizeStore`→`handleOptimizeSpeed` (raw body → `actionData`, freeRun bypass) | G-SPEED | open | **open — untouched** | **open — untouched, gap in ours too** |
| 9 | `optimizeStoreController.js:56-70` `handleUpdateOptimizeStore` | G7 IDOR | open | **fixed** — shop-ownership check + `OPTIMIZE_STORE_WRITABLE_FIELDS=['optimizing']` field allow-list | **fixed** — `isOwnedByShop` + strips `shopId`/`id` from body (no field allow-list beyond that) |
| 10 | `revertController.js:44-52` `updateRevert` | G7 IDOR | open | **fixed** — ownership check + `REVERT_PROCESS_WRITABLE_FIELDS=['canceled','sendEmail']` allow-list | **fixed** — `isOwnedByShop` pattern (task 6) |
| 11 | `revertController.js:55-70` `revertImage` (`POST /public/revert-product/:id`) | G8 public | open — unauthenticated, resolves shop from `:id`/`?shop=` | **fixed (different)** — route kept, now requires `verifyEmbedRequest` session, shop derived from session only, plus plan/doneOptimize/doneRevert guards + 5/min rate limit | **fixed (different)** — route + function **deleted outright** (task 5, 0 legit callers found) |
| 12 | `revertController.js:64,66` (shop doc → `publishTopic('handleRevertProductByLog', {shop})`) | G9 pubsub | open | **open** — even inside !261's now-gated `revertImage`, the call is unchanged: still publishes the full `{shop}` doc | **fixed** — moot, function deleted with the route (task 5) |
| 13 | `revertController.js:73-97` `getJsonlOptimizeHistory` (`GET /public/get-jsonl-data/:id`) | G8 public | open | **fixed (different)** — route kept, `verifyEmbedRequest` + session-derived `shopId` | **fixed (different)** — deleted (task 5) |
| 14 | `revertController.js:112-125` `revertFileAltToVersion` | G7 IDOR | open | **fixed** — `getHistoryOptimizeById(id, shopId)` + not-found guard | **fixed** — `isOwnedByShop` (task 6) |
| 15 | `revertController.js:309-325` `revertFileImageToVersion` | G7 IDOR | open | **fixed** — same pattern | **fixed** — same (task 6) |
| 16 | `seoController.js:286-290` `optimizeFileImages` catch returns raw `shop` | G10 self-leak | open | **fixed** — catch now returns `prepareShop(shop)` | **fixed** — same (task 8) |
| 17 | `seoController.js:681-689` `updateHistoryOptimizeData` | G7 IDOR | open | **fixed** — `history.shopId !== shopId` guard + `HISTORY_OPTIMIZE_WRITABLE_FIELDS=['sendEmail']` allow-list | **fixed** — `isOwnedByShop` (task 6) |
| 18 | `seoController.js:760-770` `getSpeedScore` (shop doc → `publishTopic('scanSpeedScoreV2', {shop})`) | G9 pubsub | open | **open — untouched**, still `{shop}` | **fixed** — publishes `{shopId}` (task 9) |
| 19 | `shopController.js:184-192` `set` (no field allow-list) | G11 | open — forwards raw body | **fixed (stronger)** — real allow-list `merchantWritableFields` (7 fields), everything else silently dropped before `updateShopData` | **fixed (weaker)** — kept `blockFields` deny-list + stripped `requestImmutableFields`/`isDevZone`/dotted-keys at the controller; **not** a full allow-list — progress log admits FE writes ~25 other fields through untouched |
| 20 | `featureReq.controller.js:270-281` `blockUser` (`blockId` from body) | G7 IDOR | open | **open — NOT fixed.** `deleteFeatureReqsByShopId(blockId)` still takes raw body `blockId`, unchanged, despite !261 touching this same file (191 lines) for the unrelated `sync` gate | **fixed** — drops `blockId` from body, uses session shop |
| 21 | `handleManualOptimizeImage.js:80` → `historyRepository.getHistoryByLogId` (`POST /api/optimize/images` `dataLog[].logId`) | G7 IDOR | open | **open** — file untouched (not in !261's diffstat at all) | **fixed** — `resolveOwnedLogId` (task 6, 2 hardening rounds for a completion-count regression it introduced then fixed) |
| 22 | `handlers/pubsub/subscribeOptimizeStore.js:69-71` (`isAdvancedPlan` filter commented out) | G-SPEED | open | **open — untouched** | **open — untouched, gap in ours too** |
| 23 | `helpers/api.js:92-103` `makeGraphQlApi` (decrypted token → `shop.shopifyDomain`) | G11 SSRF chain | open (root file untouched) | file untouched, but **entry point closed** (row 19 blocks writing `shopifyDomain`) | file untouched, but **entry point closed** (row 19's `requestImmutableFields` includes `shopifyDomain`) |
| 24 | `middleware/webhook/webhookMiddleware.js:16-19` | G12 | open — `!==` + `!app.isLocal` global bypass | **fixed** — `timingSafeEqual`, bypass needs `isLocal && !isProduction`; also adds an unused `isWebhookTooOld` replay helper and changes response codes 200→401/405/500 | **fixed** — `timingSafeEqual`, bypass needs `isLocal && FUNCTIONS_EMULATOR==='true'`; keeps existing 200 status codes |
| 25 | `historyRepository.js:142-152,212-291` `revertByListImageLogId` | G7 IDOR | open | **fixed** — `getHistory(id, shop.id)` tenant guard, plus explicit ownership recheck before the write | **fixed** — same shape (task 6) |
| 26 | `shopRepository.js:201-206` `updateShopData` (`postData.isDevZone` disables entire `blockFields`) | G11 | open | **fixed at the root** — function signature changed to `updateShopData(shopId, postData, {allowProtectedFields=false})`; body `isDevZone` is never read anymore, only an explicit server-side opt-in | **partial** — repo function still trusts `postData.isDevZone` verbatim; closed only because `shopController.set` now strips `isDevZone` before calling it — any other/future caller that forwards a body containing `isDevZone` is still exposed |
| 27 | `shopRepository.js:242,254-256` `reload` projection (`pick(doc.data(), reload)`) | G10 self-leak | open — `POST /shop {reload:['accessTokenHash']}` returns it | **partial** — repository code unchanged, `reload` still unchecked; closed only indirectly because `reload` isn't in `merchantWritableFields` so it never reaches `updateShopData` via `/shop` anymore | **fixed at the root** — `shopRepository.js:254-256` filters `reload` through `pickFields` inside the repository itself (task 8) |
| 28 | `services/config/crisp.js:5-6` | G2 secret | open — literal `identifier`/`key` (same value the original 09-22 audit flagged) | **fixed** — moved to `CRISP_IDENTIFIER`/`CRISP_KEY` env, no literal fallback for the secret fields, loud warn if unset; non-secret `website_id`/`session_id` keep literal fallback | open — explicit skip pending Tuan rotate |
| 29 | `services/lightHouseService.js:117` (password in URL, logged in full) | G13 log | open | **open** — file has diffs at !261, but they're unrelated divergence (reverts/strips later master multi-audit/UA-bot-detection work); line 117's `console.log(shopId, urlWithParams)` incl. `passwordStore` is unchanged | **fixed** — logs `shopId, url, device` only (task 1, `7c3416f5`) |
| 30 | `services/shopifyService.js:37-39` `initShopify` | G13 log — **see Priority 1** | **LIVE** | **LIVE** — untouched | **LIVE** — untouched on pushed tip; fixed only on unpushed `1ecbd824` |
| 31 | `services/uninstallationService.js:12-14` (`JSON.stringify(shop)` incl. `accessTokenHash`) | G13 log | open | **open — untouched** (confirmed absent from diffstat) | **fixed** — logs `shop.id, shopifyDomain` only (task 1) |
| 32 | `storage.rules:4-6` (`match /{allPaths=**}: allow read,write: if request.auth != null`) | G4c rules | open — and **never actually enforced**, `firebase.json` has no `storage` key so this file was never deployed | **fixed** — deny-all `if false` **and** wires `"storage": {"rules": "storage.rules"}` into `firebase.json` — the first real enforcement of any storage rule on the live bucket | open — task 10 BLOCKED, found the same `firebase.json` gap but didn't act |

**Counts**: prod/master 32/32 open (0 fixed). !261: **17 fixed, 3 partial, 12 open**. Ours: **17 fixed, 2 partial, 13 open** (one of ours' "open" is the live token-log Priority-1 item, deliberately deferred to the unpushed hotfix).

## !261 vs ours — top gaps

**What !261 fixes that ours doesn't:**
- G4c `storage.rules` — real deny-all fix, *and* wires it into `firebase.json` for the first time ever (ours: fully blocked, 0 changes, needs a migration ticket).
- G4b `firestore.rules` featureReq/commentFeatureReq unauthenticated write — closed (ours: blocked, same task).
- G2 `crisp.js` — moved off literals to env vars (ours: explicit skip, pending manual rotate).
- G11 root cause — real 7-field allow-list on `POST /shop`, and removes `isDevZone` body-trust from `updateShopData`'s own signature, not just at one call site (ours only fixed the call site, see row 26).
- G5 `integrationKeyController.getOne` — strips `accessToken` from the response entirely; ours still returns it to any DevZone/CRM caller.

**What ours fixes that !261 doesn't:**
- G13 `lightHouseService.js:117` (password-in-URL log) and `uninstallationService.js:14` (shop-doc log) — both open at !261, `shopifyService.js:39` token log open at **both** (see Priority 1).
- G9 pubsub shop-doc payload — both `getSpeedScore` and `revertImage`'s `{shop}` publish are still open at !261 even in its rewritten, session-gated version; ours closes both.
- G7 `featureReq.controller.blockUser` — confirmed still IDOR-open at !261 despite them editing the same file for something else. Ours fixes it.
- G7 `handleManualOptimizeImage.js`/`getHistoryByLogId` (logId IDOR via pubsub) — file untouched at !261; ours fixes it (with two follow-up hardening rounds for a completion-count regression it caused and then fixed).
- Quota check-then-deduct race (task 11, not in the original 32) — ours added transactional reserve/release; not part of !261's scope at all.

**Same files, different approach (verify before merging either):**
- G8 public routes — ours deletes `revertImage`/`getJsonlOptimizeHistory` outright; !261 keeps the routes and session-gates them (plus rate-limiting + business guards ours doesn't add). Both close the auth hole; pick one, don't take both (would conflict on `routes/public.js` and `revertController.js`).
- G11 `shopController`/`pickFields` — ours = broadened deny-list; !261 = true allow-list. !261's is architecturally sounder but progress notes say we deliberately avoided a full allow-list because FE writes ~25 fields it didn't cover — worth confirming !261 actually tested those paths before trusting their 7-field list.
- G5 `integrationKeyController` — different gate (shop `isDevZone` flag vs CRM-login-as claim) and different response shape (strip vs full). Ours' gate is arguably the stronger identity check; !261's response minimization is the stronger data-exposure fix. Neither branch has both.
- G12 webhook — both add `timingSafeEqual`; !261 also changes HTTP status codes 200→401/405/500, which changes Shopify's retry/delivery-health behavior — a bigger blast radius than the ask.
- G11 `updateShopData`/`reload` (rows 26/27) — each branch fixed one of the two symmetric latent-trust bugs at the repository root and left the other only closed at the call-site edge.

**Regressions found in !261 (new problems, not just unfixed ones):**
- `optimizeStoreController.js` `startFreeRun` (`POST /speed-up/free-run`) — !261 **removes** the existing `canAccessDevZone` gate with no replacement. Confirmed present on current `origin/master`. Merging !261 as-is reopens a DevZone-only endpoint to any authenticated merchant.
- `publicSpeedAuditController.js` + its repository + pubsub handler + test are **entirely absent** from !261's tree (present on master). This is the anonymous marketing-landing-page speed-audit tool our own verify doc explicitly flagged as legitimately public — looks deleted, not fixed. Needs confirmation before merge or it's a functional break, not a security win.

## Scale context

!261 is a much bigger effort: 410 unique commits back to 2026-06-08, 78 files, claims "61 fixes" and covers a lot entirely outside IMG-OPT's G1–G13 scope (SDK auth/rate-limit middleware, email-unsubscribe rewrite, growth-gift, AI controller, analysis, DOMPurify, loading-snippet XSS already separately fixed on master). Ours is scoped tightly to the 32 verify findings plus the quota-race follow-up, 21 commits, 37 files. Neither is a superset of the other — expect a real merge/reconcile pass, not a fast-forward either way.
