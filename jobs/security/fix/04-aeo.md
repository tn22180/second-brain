# 04 — AEO security fix (high)

Repo: `projects/Falcon/llm-ai-search-seo`. Base: **`origin/main`** @ `7cab2d5` (không phải master;
local đang ở feature branch — worktree mới từ `origin/main`). Luật chung: `README.md`.
Verify: `verify/AEO.md` — 34 row → **13 real**, 19 dup, 2 already-fixed, 0 refuted.

**Trạng thái: CHỜ TUAN DUYỆT danh sách nhóm dưới đây.** Chưa task nào được dispatch.

## Tuan làm tay trước (ROTATE)

G9 — credential commit trong repo, rotate rồi mới gỡ khỏi code:
- `.npmrc:1` + `.yarnrc.yml:8` — token registry `registry.avada.io` (1 token, 2 bản)
- `packages/functions/src/const/appIntegationKeys.js:1` — token tích hợp 3 app anh em
- `crisp.js:6` — Crisp key
- `autoTranslateV2.js:8`, `codegen.js:7` — already-fixed (FAL-763), không làm.

Registry token dùng chung cả fleet → rotate xong phải cập nhật CI của mọi repo dùng nó.

## Tasks (sau khi duyệt)

| # | Nhóm | Agent / Model | Loại | Ghi chú |
|---|---|---|---|---|
| 1 | G9 gỡ credential khỏi code → env | cavecrew-builder / haiku | code | **chỉ sau khi Tuan báo đã rotate** |
| 2 | G3 webhook HMAC bị comment out (`webhookMiddleware.js`, `bulkOperationWebhook.js`) | general-purpose / opus | auth | route vẫn public cho Shopify, nhưng verify chữ ký. Ưu tiên cao nhất: forge webhook `app/uninstalled`/GDPR |
| 3 | G7 `PUT/POST /api/shop` ghi được `shopifyDomain` → chiếm token OAuth sau này (`pickFields.js` blockFields) | general-purpose / opus | auth | thêm vào blockFields + test |
| 4 | G6 `competitors` add/list/remove không scope shop | general-purpose / opus | auth | lọc theo shopId từ session. Kiểm doc cũ có `shopId` chưa → nếu thiếu thì tách migration |
| 5 | G2 `GET /proxy/shop` lộ `passwordStore`/`crispSessionToken` | general-purpose / opus | auth | field mask ở `getShopProxy` |
| 6 | G5 publish cả shop doc (có `accessTokenHash`) lên topic `syncLinks` | general-purpose / sonnet | code | chỉ gửi `shopId`, consumer tự đọc |
| 7 | G8 `firebase.storage.rules` cho đọc+ghi không auth ở `blog-media`, `featureReq` | general-purpose / opus | rules | file rules nằm trong danh sách cấm của §8 → task này **được phép rõ ràng**. Kiểm uploader client trước khi siết |

## Tách ticket riêng (có migration — không nằm trong MR)

- **G1** integration key không bind shop (`validateAccessToken.js`, `swaggerAuth.js`, `proxy.js`,
  `shopController.js`, `linksController.js`) — cùng root cause FAL-720/746 fleet-wide. Đổi
  schema `integrationKey` + migrate key đang có.
- **G4** `changelog.js` mirror nguyên collection `shops` sang BigQuery, gồm `accessTokenHash`/
  `passwordStore`. Sửa field mask là code; **dữ liệu cũ trong BigQuery đã chứa secret** → cần
  xoá/rewrite bảng. Việc có ghi lên GCP → xác nhận project id trước.

## Test

Mỗi task: test hồi quy cho đúng exploit (request cross-shop / chữ ký sai → 401/403), rồi test
suite của `packages/functions`. Security check §8 trên diff.

## Progress

Worktree `projects/Falcon/llm-ai-search-seo-wt-security-high`, branch `fix/security-high-2026-09`
from `origin/main` @ `7cab2d5`. Test cmd: `env -u GOOGLE_APPLICATION_CREDENTIALS npx jest packages/functions`
(shell's ADC var points at a missing `~/.openclaw/firebase-sa.json`, which fails 3 suites at import;
unset → baseline 30 suites / 300 tests pass).

| # | Task | Status | Rounds | Sec | Notes |
|---|---|---|---|---|---|
| 1 | G9 credentials → env | ⏸ skipped | – | – | waits for rotate |
| 2 | G3 webhook HMAC | ✅ `6221653` | 1 | clean | 401 on bad/missing HMAC, local bypass dropped |
| 3 | G7 shopifyDomain / blockFields | ✅ `94ce2fa` | 2 | clean | + isDevZone bypass + dotted-path bypass closed |
| 4 | G6 competitors scoping | 🛑 BLOCKED | 0 | – | global blocklist, no shopId; scoping = blocklist off. Needs Tuan: gate writes with canAccessDevZone instead |
| 5 | G2 /proxy/shop field mask | ✅ `89b2fab` | 1 | clean | |
| 6 | G5 syncLinks payload | ✅ `6bb069d` | 1 | clean | legacy `{shop}` msgs still handled |
| 7 | G8 storage rules | ✅ `1926339` | 1 | clean | **not deployed: firebase.json has no storage key** |

### Log

**Task 2 — plan**
- Goal: `/webhook/bulk-operation` rejects any POST whose `X-Shopify-Hmac-Sha256` ≠ HMAC-SHA256(rawBody, SHOPIFY_SECRET).
- Files allowed: `packages/functions/src/middleware/webhook/webhookMiddleware.js` (check commented out :15-24, unconditional `next()` :26), new test `packages/functions/src/__tests__/webhookHmac.test.js`.
- Approach: restore the check with `crypto.timingSafeEqual`, fail closed (401) on missing secret/rawBody/header; drop the `!app.isLocal` bypass — Shopify signs dev-store webhooks too.
- Test: `env -u GOOGLE_APPLICATION_CREDENTIALS npx jest packages/functions`.
- Risk: only caller is Shopify delivery of the subscription made by `createBulkOperationWebhook` (`shopifyService.js:285`, rewrite `firebase.json:102`), created with this app's token → signed with this app's secret. If prod `SHOPIFY_SECRET` were wrong, bulk-op completion (links/llms/markdown/checklist sync) would stall — the same secret already backs OAuth, so it is right.
- Rollback: revert the commit.

**Task 2 — done** · commit `6221653` · 1 round · test 4 new (3 fail on old code, pass now); suite 31/304 pass · Sec: clean (only a dummy test secret in diff; no forbidden file).

**Task 3 — plan**
- Goal: no client body on `PUT/POST /api/shop` or `/proxy/shop/update` can write `shopifyDomain`, `plan`, `installedAt`, `isDevZone`.
- Files allowed: `packages/functions/src/config/pickFields.js` (`blockFields` :57), `packages/functions/src/repositories/shopRepository.js` (`updateShopData` :93-97), new test `src/__tests__/updateShopDataBlockFields.test.js`.
- Approach: add `shopifyDomain` to `blockFields`; drop the `isDevZone ? ['isDevZone']` branch (:94) so the strip is unconditional; also strip dotted keys whose first segment is blocked (`update()` reads `'plan.x'` as a field path, bypassing a top-level strip).
- Test: `env -u GOOGLE_APPLICATION_CREDENTIALS npx jest packages/functions`.
- Risk: callers `shopController.js:104,135,169,265,332`, `markdownController.js:323`, `uuidHelper.js:13`, `shopRepository.js:120`. `isDevZone` sent by nothing (0 hits in `packages/assets`, `devController`, scripts); FE never writes `shopifyDomain`; `clearDismissBanner` spreads the shop's own doc so dropping its unchanged `shopifyDomain` is a no-op.
- Rollback: revert the commit.

**Task 3 — done** · commit `94ce2fa` · 2 rounds (round 1: Jest 24 sandbox lacks `structuredClone` used by `removeFields` → v8 polyfill in the test file only) · test 3 new (all fail on old code); suite 32/307 pass · Sec: clean.

**Task 4 — plan**
- Goal: `competitors` add/list/remove scoped to the session shop.
- Files allowed: `controllers/competitorsController.js`, `repositories/competitorsRepository.js`.
- Approach: stamp `shopId` on add, `where('shopId')` on list, ownership check on remove.
- Test: suite.
- Risk: caller check (step 2) — see below.
- Rollback: n/a.

**Task 4 — 🛑 BLOCKED (needs-migration + wrong premise).** `competitors` is not per-shop data: it is a
**global competitor blocklist**. Staff add email domains from DevZone (`packages/assets/src/pages/DevZone/DevZone.js:90-97,534`
`handleCreateCompetitor({domain})`), and **every** shop's `MainLayout` reads the whole list to decide whether to
show `BlockCompetitors` instead of the app (`packages/assets/src/layouts/MainLayout.js:30-47`). Docs carry no
`shopId` (`competitorsRepository.js:15-19` writes `{...data, createdAt, updatedAt}`), so shop scoping hides the
whole list from every merchant = blocklist silently off fleet-wide. Real hole is on **write**: `POST`/`DELETE /api/competitors`
(`routes/api.js:55-57`) have no gate, so any installed merchant can delete its own entry (unblock itself) or add
a domain like `gmail.com` and lock out every shop whose email contains it. Recommended fix (needs Tuan's
call, changes the approved approach): gate `add`/`remove` with `canAccessDevZone({user})` (same gate as
`devController.js:61`, `devLlmsController.js:70`); keep `list` open (FE needs it; leak is only a domain list).

**Task 5 — plan**
- Goal: `GET /proxy/shop` (shared integration token, `routes/proxy.js:52`) never returns `passwordStore` / `crispSessionToken`.
- Files allowed: `packages/functions/src/controllers/shopController.js` (`getShopProxy` :185-213, response :209; existing mask `HIDDEN_FROM_INTERNAL_KEY` :74 used only by `getShop` :84-90), test `src/__tests__/shopControllerGetShop.test.js`.
- Approach: apply the same field filter to `getShopProxy`'s `prepareShop` output. `pickFields` untouched — the embedded admin needs both fields (`assets/src/embed.js:67`, `components/Issue/BannerPassword.js:42-53`, `DevZone.js:77`).
- Test: suite.
- Risk: the only documented proxy consumer is the CS bot reading toggles (`.claude/skills/avada-aeo-api/references/proxy.md:41`); no doc or code shows it reading either field. SEO's `seoOnService.js:22` calls `/proxy/shop/${app}`, a different route.
- Rollback: revert the commit.

**Task 5 — done** · commit `89b2fab` · 1 round · test 2 new (the proxy one fails on old code); suite 32/309 pass · Sec: clean. Note: `updateShopProxy` can still *write* both fields for any shop — that is G1 (token not shop-bound), separate ticket.

**Task 6 — plan**
- Goal: `syncLinks` messages carry `{shopId}` only; no `accessTokenHash`/`passwordStore` on the topic.
- Files allowed: `controllers/linksController.js` (publish :24 `sync`, :75 `startSyncProxy` v1), `handlers/pubsub/subscribeSyncLinks.js` (parses `{shop}` :11), new test `src/__tests__/syncLinksPayload.test.js`.
- Approach: publish `{shopId: shop.id}`; subscriber re-reads via `getShopById` from `@avada/core` (same pattern as `subscribeAeoAuditRescan.js:23`, `subscribeLlmsTxtSync.js:31`). Subscriber also accepts legacy `{shop}` messages by taking `shop.id` and re-reading — so messages in flight at deploy still run.
- Test: suite.
- Risk: only 2 publishers (grep `syncLinks` = the 2 controller lines + `index.js:59`); `cronJobType` has no publisher today, kept passthrough. Extra Firestore read per v1 sync (manual/bot trigger only).
- Rollback: revert the commit.

**Task 6 — done** · commit `6bb069d` · 1 round · test 5 new (4 fail on old code); suite 33/314 pass · Sec: clean. Docs (`docs/features/links-sync.md:18,33`, links-sync SKILL :42) don't state the payload shape → no doc change.

**Task 7 — plan**
- Goal: no unauthenticated write to `/blog-media/{shopId}/{image}` (`firebase.storage.rules:4-6` `allow read, write;`) or read/write to `/featureReq/{document}` (:7-9 `if true`).
- Files allowed: `firebase.storage.rules` only (explicitly allowed for this task).
- Approach: `blog-media` keeps public read (storefront images act as CDN), write only when `request.auth.token.shopID == shopId` (claim set by `@avada/core` `createCustomToken(uid, {shopID})`, `authService.js:257,319`); `featureReq` → deny all.
- Test: no rules-test tooling in repo (`@firebase/rules-unit-testing` absent) → no automated regression test; suite run for sanity.
- Risk / caller check: 0 uploaders. `packages/assets` defines `storage = getStorage(app)` (`helpers.js:87`) but nothing imports it; `blog-media`/`featureReq` appear nowhere in code; the feature-request widget (`featureRequestHelper.js:10`, lib `avada-feature-request`) uses no Firebase Storage. **But `firebase.json` has no top-level `storage` key** — neither `firebase.storage.rules` nor `storage.rules` is wired, so CI's `--only ...storage` deploys no rules from this repo. This edit cannot reach prod by itself; live bucket rules must be checked in console.
- Rollback: revert the commit.

**Task 7 — done** · commit `1926339` · 1 round · no rules-test tooling → no automated test, rules syntax not emulator-checked; suite 33/314 pass · Sec: clean (only the file named by the task).

**Wrap-up** — 5 commits on `fix/security-high-2026-09`, not pushed. Final suite: 33 suites / 314 tests pass (baseline 30/300; +14 regression tests).
docs-gate: `FAIL (3)` both before and after — all 3 are pre-existing on `origin/main` (`.claude/skills/links-sync/SKILL.md:54,79,92` cite `linksSyncService.js` lines past EOF); none added.
Follow-ups for Tuan:
1. Task 4 decision (see above).
2. Task 7: wire `"storage": {"rules": "firebase.storage.rules"}` into `firebase.json` (forbidden file for this job) and check live bucket rules in console — until then the committed rules are dead text.
3. `.claude/skills/security/SKILL.md:56-72` still describes the `isDevZone` bypass as open → refresh after merge.
4. `updateShopProxy` can still write `passwordStore`/`crispSessionToken`/anything for any shop → G1 ticket.
