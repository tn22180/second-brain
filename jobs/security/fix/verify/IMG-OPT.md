# IMG-OPT security findings — verification

Ref: `origin/master` @ `709f11f661b9174cae4d6944add4bcf3d280b797` (2026-09-22)
Repo: avada-image-optimizer

**Counts:** 68 input rows → **32 real** (distinct anchors) · **0 refuted** · **8 already-fixed** · **28 dup**

All line numbers below are read-only `git show 709f11f6:<path>` at the ref above; no repo files were modified.

---

## Row-by-row verdicts

| # | file:line (input) | verdict | anchor | group | evidence |
|---|---|---|---|---|---|
| 1 | .npmrc:1 | real | repo root `.npmrc` | G1 secret | `.npmrc:1` `_authToken` in cleartext |
| 2 | .yarnrc.yml:9 | dup of #1 | — | G1 | same token, `.yarnrc.yml:9` `npmAuthToken` |
| 3 | firestore.rules:5 | real | `firestore.rules` (7 read-open collections) | G4 rules | historyOptimize/optimizeStore/localStorage/analysis/revertProcess/onboardingProgress/statsSpeedReq all `allow read: if true`, lines 7-32 |
| 4 | firestore.rules:7 | dup of #3 | — | G4 | same file, broader wording (also touches G4b) |
| 5 | firestore.rules:8 | dup of #3 | — | G4 | same |
| 6 | firestore.rules:25 | real | `firestore.rules` featureReq/commentFeatureReq | G4b rules | lines 25-30: `allow read, write: if true` |
| 7 | firestore.rules:26 | dup of #6 | — | G4b | same |
| 8 | PartnerKey.js:53 | dup of #20 | — | G5 | FE caller of the same open endpoint, `PartnerKey.js:14-24` |
| 9 | packages/functions/.npmrc:1 | dup of #1 | — | G1 | identical token duplicated in `packages/functions/.npmrc:1` |
| 10 | autoTranslateV2.js:7 | real | `translate = new Translate({key:...})` | G2 secret | `autoTranslateV2.js:7` Google Cloud Translate API key literal |
| 11 | getAT.js:4 | real | top-level script | G3 secret | `getAT.js:3-4` ciphertext + `AES.decrypt` using `SHOPIFY_ACCESS_TOKEN_KEY_PROD` |
| 12 | devController.js:86 | **already-fixed** | `testOnly` | G6 | `devController.js:118-127`: `canAccessDevZone({user})` gate at function entry, `denyDevZone` on fail |
| 13 | devController.js:115 | already-fixed (dup-of-fix #12) | `batch_create_reviews` case | G6 | same switch, inside the gated `testOnly` (case at line 151) |
| 14 | devController.js:436 | already-fixed (dup-of-fix #12) | `download_log` case | G6 | inside gated `testOnly` |
| 15 | devController.js:437 | already-fixed (dup-of-fix #12) | `download_log`/`preview_log` | G6 | same |
| 16 | devController.js:439 | already-fixed (dup-of-fix #12) | `download_log`/`preview_log` | G6 | same |
| 17 | devController.js:497 | already-fixed (dup-of-fix #12) | switchboard entry | G6 | same gate at line 120 covers whole switch |
| 18 | devController.js:498 | already-fixed (dup-of-fix #12) | `toggle_plan` case | G6 | case at line 539, inside gated `testOnly` |
| 19 | historyController.js:58 | real | `revertAllV2` — `POST /api/revert/all` | G7 IDOR | `historyController.js:52-58`: `getHistoryOptimizeById(historyId)` from `ctx.req.body`, no shopId check |
| 20 | integrationKeyController.js:13 | real | `getOne` — `GET /api/integration/keys` | G5 | `integrationKeyController.js:11-16`, route `api.js:180`, app-wide `verifyEmbedRequest` is the ONLY gate |
| 21 | integrationKeyController.js:15 | dup of #20 | — | G5 | same function |
| 22 | integrationKeyController.js:16 | dup of #20 | — | G5 | same function |
| 23 | optimizeStoreController.js:22 | real | `handleOptimizeStore`→`handleOptimizeSpeed` — `POST /api/optimize-store` | G-SPEED | `optimizeStoreController.js:20-27` forwards raw `ctx.req.body` as `actionData`; `handleAutoOptimize.js:94` `freeRun: Boolean(actionData?.freeRun)` |
| 24 | optimizeStoreController.js:25 | dup of #46 | — | G-SPEED | same bug, precise evidence is the commented-out filter in `subscribeOptimizeStore.js:71` |
| 25 | optimizeStoreController.js:58 | real | `handleUpdateOptimizeStore` — `PUT /api/optimize-store/:id` | G7 IDOR | `optimizeStoreController.js:56-70`: `updateProgress(ctx.params.id, ctx.req.body)`, no shop check |
| 26 | optimizeStoreController.js:59 | dup of #25 | — | G7 | same |
| 27 | optimizeStoreController.js:62 | dup of #25 | — | G7 | same |
| 28 | revertController.js:46 | real | `updateRevert` — `PUT /api/revert-process/:id` | G7 IDOR | `revertController.js:44-52`: `updateRevertProcess(ctx.params.id, ctx.req.body)`, no shop check |
| 29 | revertController.js:47 | dup of #28 | — | G7 | same |
| 30 | revertController.js:48 | dup of #28 | — | G7 | same |
| 31 | revertController.js:55 | real | `revertImage` — `POST /public/revert-product/:id` | G8 public | `revertController.js:55-70`; `handlers/public.js` mounts no auth middleware at all |
| 32 | revertController.js:63 | dup of #31 | — | G8 | same |
| 33 | revertController.js:64 | real | `revertImage` — shop doc into Pub/Sub | G9 pubsub | `revertController.js:64,66`: `publishTopic('handleRevertProductByLog', {shop})`, `shop` from `getShopById` (has `accessTokenHash`) |
| 34 | revertController.js:66 | dup of #33 | — | G9 | same line, "accessTokenHash" wording is the accurate one (no plaintext `accessToken` field exists on shop docs, see helpers.md below) |
| 35 | revertController.js:77 | real | `getJsonlOptimizeHistory` — `GET /public/get-jsonl-data/:id` | G8 public | `revertController.js:73-97`, same no-auth mount |
| 36 | revertController.js:87 | dup of #35 | — | G8 | same |
| 37 | revertController.js:126 | real | `revertFileAltToVersion` — `POST /api/revert/file-alt` | G7 IDOR | `revertController.js:112-125`: `getHistoryOptimizeById(historyOptimizeId)` from body, no ownership check |
| 38 | revertController.js:345 | real | `revertFileImageToVersion` — `POST /api/revert/file-image/to-version` | G7 IDOR | `revertController.js:309-325`, same pattern |
| 39 | seoController.js:286 | real | `optimizeFileImages` — `startOptimize` `POST /api/optimize/start` | G10 self-leak | `seoController.js:201-290`: happy path returns `prepareShop(updatedShop)`, **catch block returns raw `shop`** (line 290) straight into `ctx.body` at `startOptimize:188` |
| 40 | seoController.js:681 | real | `updateHistoryOptimizeData` — `PUT /api/optimize/historyOptimize` | G7 IDOR | `seoController.js:681-689`: `updateHistoryOptimize(historyId, data)` from body, no shop check |
| 41 | seoController.js:685 | dup of #40 | — | G7 | same |
| 42 | seoController.js:760 | real | `getSpeedScore` — `GET /api/speed-score` | G9 pubsub | `seoController.js:760-770`: `publishTopic('scanSpeedScoreV2', {shop})`, own shop but same wholesale-doc pattern |
| 43 | shopController.js:191 | real | `set` — `POST /api/shop` | G11 no-allowlist | `shopController.js:184-192`: `updateShopData(shopId, ctx.req.body)`, no field allow-list at controller level |
| 44 | featureReq.controller.js:253 | real | `blockUser` — `POST /api/block-user-req` | G7 IDOR | `featureReq.controller.js:270-281`: `deleteFeatureReqsByShopId(blockId)` from body, `blockId` unchecked |
| 45 | handleManualOptimizeImage.js:80 | real | `optimizeFileImage`→`getHistoryByLogId` (reached via `POST /api/optimize/images`) | G7 IDOR | sink is one hop downstream of the cited line: `fileImageService.js:295` calls `getHistoryByLogId({..., logId})`; `historyRepository.js:518-531` does `if (logId) history = await getHistory(logId)` — same unscoped-doc-get as the others |
| 46 | subscribeOptimizeStore.js:71 | real | `subscribeOptimizeStore` pubsub handler | G-SPEED | `subscribeOptimizeStore.js:69-71`: `const actionListFilter = actionList;` with the `isAdvancedPlan` filter commented out |
| 47 | helpers/api.js:98 | real | `makeGraphQlApi` | G11 SSRF/exfil | `helpers/api.js:92-103`: builds request URL + sends decrypted `X-Shopify-Access-Token` to `shop.shopifyDomain`; chains with #43 (no allow-list lets a merchant set `shopifyDomain` to an attacker host) |
| 48 | webhookMiddleware.js:19 | real | `verifyWebhook` | G12 webhook | `webhookMiddleware.js:16-19`: `!==` (non-constant-time) and `&& !app.isLocal` (env-flag global bypass) |
| 49 | historyRepository.js:214 | real | `revertByListImageLogId` — `POST /api/revert` | G7 IDOR | `historyRepository.js:142-152` `getHistory(id)` no shop filter; `212-291` writes it back |
| 50 | historyRepository.js:215 | dup of #49 | — | G7 | same function |
| 51 | historyRepository.js:271 | dup of #49 | — | G7 | same function |
| 52 | shopRepository.js:177 | real | `updateShopData` | G11 no-allowlist | `shopRepository.js:201-206`: `if (!postData.isDevZone) prepareData = removeFields(...)` — client body flag disables the whole `blockFields` deny-list |
| 53 | shopRepository.js:204 | dup of #52 | — | G11 | same lines |
| 54 | shopRepository.js:256 | real | `updateShopData` reload projection | G10 self-leak | `shopRepository.js:242,254-256`: `pick(doc.data(), reload)`, `reload` is client-controlled and not in `blockFields` |
| 55 | routes/api.js:162 | **already-fixed** | `/api/dev` route wiring | G6 | `routes/api.js:208-209` wires straight to `devController.testOnly`, which is gated internally (see #12) |
| 56 | routes/public.js:12 | dup of #35 | — | G8 | route declaration for `getJsonlOptimizeHistory` |
| 57 | routes/public.js:13 | dup of #31 | — | G8 | route declaration for `revertImage` |
| 58 | routes/public.js:18 | dup of #35 | — | G8 | same |
| 59 | routes/public.js:19 | dup of #31 | — | G8 | same |
| 60 | routes/public.js:26 | dup of #35 | — | G8 | same |
| 61 | routes/public.js:27 | dup of #31 | — | G8 | same |
| 62 | crisp.js:5 | real | config object | G2 secret | `crisp.js:5-6` `identifier`/`key` hardcoded |
| 63 | crisp.js:6 | dup of #62 | — | G2 | same |
| 64 | lightHouseService.js:117 | real | `fetchLightHouse` | G13 log | `lightHouseService.js:100-117`: `passwordStore` in `URLSearchParams`, full URL `console.log`'d |
| 65 | shopifyService.js:39 | real | `initShopify` | G13 log | `shopifyService.js:37-39`: `console.log(shopifyDomain, accessToken)` — decrypted token, fires on every Shopify API call app-wide |
| 66 | uninstallationService.js:14 | real | `uninstallApp` | G13 log | `uninstallationService.js:12-14`: `console.log('uninstallApp', JSON.stringify(shop))` |
| 67 | uninstallationService.js:15 | dup of #66 | — | G13 | same line |
| 68 | storage.rules:5 | real | `storage.rules` `match /{allPaths=**}` | G4c rules | `storage.rules:4-6`: `allow read, write: if request.auth != null`, no shop scoping; app does mint real Firebase Auth sessions (`standalone.js:20-33`) |

---

## Committed credentials — ROTATE

Type only, never the value.

| file:line | credential type |
|---|---|
| `.npmrc:1`, `.yarnrc.yml:9`, `packages/functions/.npmrc:1` | private npm registry (`registry.avada.io`) auth token — **same token in all 3 files**, check whether other Avada repos share it |
| `packages/functions/src/commands/autoTranslateV2.js:7` | Google Cloud Translate API key |
| `packages/functions/src/commands/getAT.js:3-4` | Shopify Admin API access token, AES ciphertext (decryptable with `SHOPIFY_ACCESS_TOKEN_KEY_PROD`) for a named prod shop |
| `packages/functions/src/services/config/crisp.js:5-6` | Crisp website identifier + API key |

**ROTATE** all four. `getAT.js` additionally needs the file removed and prod shop's token treated as compromised (git history keeps it even after deletion — needs a history scrub if this ever goes further).

---

## ROOT-CAUSE GROUPS (real findings only)

### G1 — Committed npm registry token
- Files: `.npmrc:1`, `.yarnrc.yml:9`, `packages/functions/.npmrc:1`
- Fix: rotate the `registry.avada.io` token, move to CI secret / env, remove from tracked files.
- Auth boundary: no. Migration: no.

### G2 — Hardcoded third-party secrets
- Files: `crisp.js:5-6`, `autoTranslateV2.js:7`
- Fix: env vars / secret manager, rotate both.
- Auth boundary: no. Migration: no.

### G3 — Committed prod credential + decrypt script
- Files: `getAT.js`
- Fix: delete file, rotate the shop's Shopify token, consider scrubbing git history.
- Auth boundary: no. Migration: no (but treat as incident, not just cleanup).

### G4 — Firestore/Storage rules default-open, no shopId scoping
- Files: `firestore.rules` (7 collections `read:true`; `featureReq`/`commentFeatureReq` `read,write:true`), `storage.rules` (`match /{allPaths=**}: allow read, write: if request.auth != null`)
- Any internet client with the (non-secret) Firebase web config can read every doc in 7 collections and read/write the ENTIRE Storage bucket for any Firebase-authenticated user — cross-tenant by design of the rules, independent of any API bug.
- Fix: scope rules to a `shopId` Firebase custom claim (`request.auth.token.shopId == resource.data.shopId`) — **first verify the app actually mints a `shopId` custom claim** (`standalone.js` confirms custom claims exist for `type`/`isCrmLogin`, shopId claim not yet confirmed — check before writing rules).
- Auth boundary: **yes**. `needs-opus` (rules design + verifying no legitimate direct-read caller breaks). Borderline `needs-migration` if a `shopId` claim doesn't already exist on issued tokens.

### G5 — Integration keys readable/mintable by any merchant
- Files: `integrationKeyController.js` (`getOne`/`createOne`), `PartnerKey.js` (FE caller), `routes/api.js:180-181`
- `GET /api/integration/keys?name=` sits only behind the app-wide `verifyEmbedRequest` (any installed merchant session) — no additional authorization. Returns the named partner's plaintext `accessToken`.
- Fix: gate both routes behind `canAccessDevZone`/internal-only auth (pattern already exists in `devZoneAccess.js`), or move to a machine-to-machine key. Rotate every integration key already exposed (open since 2026-09-01 per finding history).
- Auth boundary: yes. Migration: no.

### G6 — devController.js `/api/dev` switchboard — ALREADY FIXED
- `canAccessDevZone({user})` gate exists at `testOnly` entry (line 120) and covers the entire switch (`batch_create_reviews`, `download_log`, `preview_log`, `toggle_plan`), audit-logged via `logAdminAudit`. `patch` has its own gate at line 885. No action needed on these 8 rows.

### G7 — IDOR: client-supplied document id trusted without shop-ownership check
- Files/anchors (9 distinct call sites, same shape each time — fetch-by-id then write with no `shopId` filter/comparison):
  - `historyController.revertAllV2` — `POST /api/revert/all`
  - `historyRepository.revertByListImageLogId` (via `historyController.revertList`) — `POST /api/revert`
  - `revertController.revertFileAltToVersion` — `POST /api/revert/file-alt`
  - `revertController.revertFileImageToVersion` — `POST /api/revert/file-image/to-version`
  - `revertController.updateRevert` — `PUT /api/revert-process/:id`
  - `optimizeStoreController.handleUpdateOptimizeStore` — `PUT /api/optimize-store/:id`
  - `seoController.updateHistoryOptimizeData` — `PUT /api/optimize/historyOptimize`
  - `fileImageService.optimizeFileImage` → `historyRepository.getHistoryByLogId` — reached via `POST /api/optimize/images` (`dataLog[].logId`)
  - `featureReq.controller.blockUser` — `POST /api/block-user-req`
- This is the single largest, most-repeated pattern in the app: any authenticated merchant can read, overwrite, or delete another shop's history/revert/optimize/feature-request documents by guessing or enumerating Firestore doc ids (auto-generated, not secret) and passing them as the id/historyId/blockId body or path param.
- Fix: one shared guard (`assertOwnedByShop(doc, shopId)` or refactor to `.where('shopId','==',shopId)` queries) applied at all 9 sites.
- Auth boundary: **yes**. Migration: no. `needs-opus`: yes — recommend a systematic grep sweep for every `getHistory*`/`getOptimizeStoreById`/`updateProgress` call fed by a client-supplied id, since this pattern likely repeats beyond the 9 already found.

### G8 — Unauthenticated `/public` revert/export routes
- Files: `revertController.revertImage` (`POST /public/revert-product/:id`), `revertController.getJsonlOptimizeHistory` (`GET /public/get-jsonl-data/:id`), `routes/public.js`
- `handlers/public.js` mounts **zero** auth middleware (confirmed — no `verifyEmbedRequest`, nothing). These 2 routes resolve the target shop from a caller-supplied numeric id + `?shop=` domain with no verification.
- **Public-caller check**: the same `routes/public.js` also has genuinely-public routes — `unsubscribe/:identifier` and `unsubscribe-winback/:identifier` (signed identifier, cross-service, email unsubscribe) and `speed-audit` (deliberately anonymous marketing tool, rate-limited). `revert-product/:id` and `get-jsonl-data/:id` fit neither pattern — no signed token, no CORS-scoped anonymous use case, no webhook/cron caller. They look misplaced under `/public` rather than intentionally public.
- Fix: move both routes under `/api` (session-gated), or adopt the existing signed-identifier scheme (`unsubscribe-winback` already shows the pattern) if a legitimate unauthenticated caller is later identified.
- Auth boundary: yes. Migration: no.

### G9 — Shop doc (incl. `accessTokenHash`) published wholesale into Pub/Sub payloads
- Files: `revertController.revertImage:66` (compounds G8 — reachable unauthenticated), `seoController.getSpeedScore:760` (self-triggered)
- Same `{shop, ...}` shape recurs elsewhere in the codebase (`revertAllV2`, `handleOptimizeSpeed`, several `publishTopic('recursive', {shop,...})` calls) — not separately flagged in the tsv but same root cause.
- No plaintext `accessToken` field exists on shop docs (only `accessTokenHash`, confirmed via `shopRepository.js:459` and absence of any `.accessToken` write elsewhere) — so exposure is of the **encrypted** token, decryptable only with `SHOPIFY_ACCESS_TOKEN_KEY_PROD`. Severity still real: Pub/Sub payloads land in Cloud Logging/DLQ with broader read access than Firestore, and the decrypt key is an app-wide env var.
- Fix: shared `toPubSubShop(shop)` sanitizer stripping `accessTokenHash` before any `publishTopic` call carrying `shop`.
- Auth boundary: no. Migration: no.

### G10 — Self-service response/projection paths leak the caller's own `accessTokenHash`
- Files: `seoController.optimizeFileImages` (catch path returns raw `shop`, not `prepareShop(shop)`, straight into the HTTP response at `startOptimize`), `shopRepository.updateShopData` (`reload` field is client-controlled and not in `blockFields`, so `POST /api/shop {reload:['accessTokenHash']}` returns it in the response)
- Fix: (a) catch block should call `prepareShop` like the happy path; (b) validate `reload` against an allow-list before `pick(doc.data(), reload)`.
- Auth boundary: no (same-shop, but token material shouldn't reach the browser/response-body loggers at all). Migration: no.

### G11 — No field allow-list on shop profile writes → self-service privilege escalation → SSRF/token-exfil chain
- Files: `shopController.set` (`POST /api/shop`, forwards raw body, no allow-list), `shopRepository.updateShopData` (client `isDevZone:true` flag disables the entire `blockFields` deny-list), `helpers/api.js makeGraphQlApi` (sends the decrypted Shopify offline token to whatever host is in `shop.shopifyDomain`)
- **Code already documents this as a known, deliberately-unpatched gap** — `pickFields.js:82-127` has explicit Vietnamese comments citing ticket **FAL-573** as out of scope, confirming `{isDevZone:'true', multiAuditBonusPages:999999}` (or `plan`, quota fields, etc.) passes through `removeFields` untouched, and pointing at the correct pattern (`canAccessDevZone` reading a verified Firestore/session flag, already used in `devController`/`optimizeStoreController`) as the real fix.
- Chained severity: since `shopifyDomain` is not blocked either, a merchant (or anyone who can hit this endpoint for a shop) can point `shopifyDomain` at an attacker host; the next internal `makeGraphQlApi` call for that shop then sends the plaintext decrypted Admin API token to the attacker — persistent exfiltration surviving session/API-key revocation.
- Fix: (1) never trust `isDevZone` from the request body — only from a verified server-side flag; (2) allow-list writable fields on `POST /api/shop`; (3) validate/pin `shopifyDomain` server-side (only settable via the verified OAuth callback).
- Auth boundary: **yes** — the most severe authorization gap found. `needs-opus`: yes. Migration: no, but confirm no legitimate caller currently relies on client-supplied `isDevZone` (code comments say there is none — the valid path is `devController.patch` after a Firestore-read gate).

### G12 — Shopify webhook HMAC verification weaknesses
- Files: `webhookMiddleware.js:16-19`
- Non-constant-time `!==` comparison (timing side-channel) and a global bypass gated only by an env var (`app.isLocal`) that a prod misconfiguration could silently flip on.
- **Public-caller check**: this route legitimately needs to be callable without a Shopify session — Shopify itself calls it — so the fix must keep it reachable, just make the HMAC check itself sound (`crypto.timingSafeEqual`) and remove/restrict the bypass to non-prod builds only.
- Auth boundary: yes. Migration: no.

### G13 — Secrets/PII printed to Cloud Logging
- Files: `shopifyService.js:39` (`initShopify` logs every shop's **decrypted** Shopify Admin token — fires on every Shopify API call app-wide, highest-frequency leak found), `lightHouseService.js:117` (merchant storefront password in URL, logged in full), `uninstallationService.js:14` (whole shop doc incl. `accessTokenHash` stringified on every uninstall webhook)
- Fix: delete/guard all three `console.log` calls; redact password before logging; log only `shop.id`/`shop.shopifyDomain` on uninstall.
- Auth boundary: no. Migration: no. `shopifyService.js:39` in particular should be treated as an active incident — recommend Cloud Logging retention/IAM review and raising token-rotation as a fleet decision, since this has likely been running for a long time across every shop.
