# 01 — APC security fix (high)

Repo: `projects/Falcon/ai-product-copy`. Base: `origin/master` @ `b216428`. Luật chung: `README.md`.
Verify: `verify/APC.md` — 45 row → **23 real**, 22 dup, 0 refuted, 0 already-fixed. Line number
gần như không trôi.

**Trạng thái: CHỜ TUAN DUYỆT danh sách nhóm dưới đây.** Chưa task nào được dispatch.

## Tuan làm tay trước (ROTATE)

G1 — 5 loại credential commit: npm registry token (2 file), `AVADA_SEO_PRO` token, Shopify
`shpua_` token, Google Translate key, Crisp creds. `file:line` ở `verify/APC.md`.

G2 là rotate luôn: `VITE_RELEASE_API_TOKEN` + `AVADA_SEO_PRO_ACCESS_TOKEN` bị import vào
**bundle frontend** qua alias `@functions` → đã public với mọi merchant mở app. Không chỉ gỡ
khỏi git.

## Tasks (sau khi duyệt)

| # | Nhóm | Agent / Model | Loại | Ghi chú |
|---|---|---|---|---|
| 1 | G1 gỡ credential → env | cavecrew-builder / haiku | code | **sau khi Tuan báo đã rotate** |
| 2 | G2 chặn `assets` import từ `@functions` chứa secret | general-purpose / opus | boundary | build `assets` rồi grep bundle ra 0 hit tên biến |
| 3 | G11 webhook HMAC bị comment out (`verifyWebhook.js`) | general-purpose / opus | auth | ưu tiên cao: forge `app/uninstalled`/GDPR |
| 4 | G6 `creditGuardMiddleware` tin `creditCost` + `model` từ body để gate và trừ credit | general-purpose / opus | billing | giá tính server-side từ bảng model; test body gửi `creditCost: 0` |
| 5 | G8 `PUT /shop` pick có `noLimit`/`enablePro`/`enableGpt41` → tự cấp quyền | cavecrew-builder / haiku | code | bỏ khỏi pick + test |
| 6 | G7 body spread ghi được `shopId`/`id` (`settingsController`, `bulkGenerateProcessRepository.createProcess`, `templateRepository`) | general-purpose / sonnet | code | ép `shopId` từ session sau spread |
| 7 | G5 `updateRegenerateProcess` không check shopId (hàm anh em đã có) | cavecrew-builder / haiku | code | mirror hàm anh em |
| 8 | G9 `GET /syncData/:shopifyDomain` lấy shop từ URL | general-purpose / opus | auth | lấy từ session, so khớp hoặc bỏ param |
| 9 | G4 route extension `flowController` generate/generateProductSeoDesc chỉ có `cors()` | general-purpose / opus | auth | Flow gọi có ký → verify chữ ký Flow. Kiểm caller trước |
| 10 | G10 `/proxy/swagger-token` nhận key qua `?accessToken=` | cavecrew-builder / haiku | code | chỉ header. Nửa cross-tenant đã vá ở FAL-720 |
| 11 | G12 log axios error thô kèm header auth (`errorService.handleError`, `seoService.checkInstallSEO`) | general-purpose / sonnet | code | redact ở `logger.js` — 1 chỗ, phủ mọi call site |
| 12 | G13 publish cả shop doc (có `accessToken`) lên Pub/Sub mỗi trang (`startBulkProductExport`, `subscribeSyncProducts`) | general-purpose / sonnet | code | chỉ gửi `shopId`; kiểm mọi consumer trước |
| 13 | G3 `firestore.rules`: 6 collection đọc được, 3 ghi được không auth | general-purpose / opus | rules | file cấm §8 → **được phép rõ ràng**. Grep client SDK đọc trực tiếp trước — siết mù = vỡ FE |

Thứ tự trong bảng = thứ tự làm: credential + webhook + tiền trước, rules cuối vì rủi ro vỡ FE cao nhất.

## Test

Mỗi task: test hồi quy đúng exploit (cross-shop, chữ ký sai, body giả giá → 401/403/422), rồi
test suite `packages/functions`. Task 2 + 13 thêm build `packages/assets`. Security check §8.

## Progress

Worktree `projects/Falcon/ai-product-copy-wt-security-high`, branch `fix/security-high-2026-09`
từ `origin/master` @ `b216428`. Test: `env -u GOOGLE_APPLICATION_CREDENTIALS npx jest` ở root
worktree (shell có `GOOGLE_APPLICATION_CREDENTIALS` trỏ file không tồn tại → 2 suite chết lúc load,
không liên quan). Baseline: 25 suite / 431 test, **5 fail có sẵn** ở `devZone.test.js`.

| # | Task | Status | Rounds | Sec | Notes |
|---|---|---|---|---|---|
| 1 | G1 credential → env | ⏸ skip | – | – | chờ Tuan rotate |
| 2 | G2 secret trong bundle assets | ✅ code / BLOCKED 0-hit | 2 | clean | `53a7a81` + `1606623` (swagger, docs-gate route-coverage). Bundle vẫn chứa key qua `avada-components-seoon` (public npm) — xem log |
| 3 | G11 webhook HMAC | ✅ | 1 | clean | `11f7a76` |
| 4 | G6 creditCost từ body | ✅ | 4 | fixed | `4e13a4f` + `8d708c8` + `a8f2b4b` + `94c31ad` (round 4: 1 refund/charge, đảo usage mọi đường refund) |
| 5 | G8 `PUT /shop` self-grant | ✅ | 1 | clean | `cb01971`. Không bỏ hẳn: DevZone cần → gate `canAccessDevZone` |
| 6 | G7 body spread `shopId`/`id` | ✅ | 1 | clean | `3a2381a` |
| 7 | G5 `updateRegenerateProcess` | ✅ | 1 | clean | `8c71d4e` |
| 8 | G9 `/syncData/:shopifyDomain` | ✅ | 1 | clean | `bdf03fa` |
| 9 | G4 Flow extension routes | ✅ | 1 | clean | `2aab864` |
| 10 | G10 swagger-token query | ✅ | 2 | clean | `4b10c2e` + `761cc63` (caller trong repo). Breaking cho client ngoài dùng `?accessToken=` — xem log |
| 11 | G12 log redact | ✅ | 1 | clean | `ba734e5` |
| 12 | G13 shop doc vào Pub/Sub | ✅ | 1 | clean | `43e0d0b` |
| 13 | G3 firestore.rules | ✅ write+list / BLOCKED read-scope | 1 | clean | `c80328a`. Scope read theo shop cần Firebase Auth ở embed — xem log |

### Log

#### Task 2 — G2 secret trong bundle assets
- **Goal:** `packages/assets` không import secret từ `@functions`; SEO install check đi qua backend.
- **Files allowed:** `SeoLegacyPlanModal.jsx:6-8,51-63`, `shopController.js`, `routes/api.js:37`, `packages/assets/.eslintrc.js`, test mới.
- **Approach:** `GET /api/shop/seo-installed` (session shop → `checkInstallSEO({app:'blog'})` → chỉ trả boolean); FE gọi `api()`; eslint `no-restricted-imports` chặn `@functions/const/appIntegationKeys`.
- **Test command:** `env -u GOOGLE_APPLICATION_CREDENTIALS npx jest` + `yarn workspace @avada/assets run production` + scan `static/` theo giá trị token (chỉ đếm, không in).
- **Risk:** route mới sai prefix embed/standalone → modal không hiện (chỉ UX, không outage).
- **Rollback:** revert `53a7a81`.

Kết quả: 27 suite / 434 test, 5 fail = baseline devZone. Build assets OK. Caller: chỉ `Home.js:22` lazy-load modal.
**BLOCKED phần "0 hit trong bundle":** scan `static/` vẫn thấy giá trị key SEO trong 2 chunk. Nguồn:
`node_modules/avada-components-seoon/dist/config/constants.js` (v1.0.36, resolve `npm:` = **public npm**)
export cứng `SEO_/BLOG_/IMAGE_/AI_/AEO_PROXY_ACCESS_TOKEN` — `SEO_PROXY_ACCESS_TOKEN` trùng giá trị
`AVADA_SEO_PRO_ACCESS_TOKEN`. Import ở `Home.js:20`, `Template.js:37`, `BulkGenerator.js:31` (`CrossAppBanner`).
→ key proxy của **cả 5 app** đang public trên npm; rotate G1 vô nghĩa tới khi lib bỏ key và publish bản mới. Việc của repo lib, không phải APC.
`VITE_RELEASE_API_TOKEN`: chỉ inject ở block staging `.gitlab-ci.yml:35`, không ở prod. Chuyển server-side cần sửa CI (file cấm) → để lại.
Lưu ý transcript: 1 lệnh grep lúc khảo sát in ra giá trị `AVADA_SEO_PRO_ACCESS_TOKEN` vào transcript session này — key đó đã nằm trong G1 rotate.

#### Task 3 — G11 webhook HMAC
- **Goal:** `webhookCreateProduct`/`webhookBulkOperation` chỉ nhận request Shopify ký bằng app secret.
- **Files allowed:** `middleware/webhook/verifyWebhook.js:12-23`, test mới cạnh đó.
- **Approach:** HMAC-SHA256(`SHOPIFY_SECRET`, `req.rawBody`) so `X-Shopify-Hmac-Sha256` bằng `timingSafeEqual`, sai → 401. Bỏ `app.isLocal` (không tồn tại trong `config/app.js`).
- **Test command:** `env -u GOOGLE_APPLICATION_CREDENTIALS npx jest`
- **Risk:** `SHOPIFY_SECRET` sai ở env → mọi webhook products/create 401. Cùng secret OAuth dùng nên thấp.
- **Rollback:** revert `11f7a76`.

Caller: chỉ Shopify — `shopifyService.js:524,569` đăng ký `PRODUCTS_CREATE` → `/webhook/create-product` (`firebase.json:85-90`). `bulk-operation` không có chỗ nào đăng ký trong code. `app/uninstalled`/GDPR không đi qua middleware này (brief ghi nhầm scope) — thiệt hại thật của lỗ là ghi metafield vào shop bất kỳ qua `handleHook` (`handlePubSub.js:65-86`).
Kết quả: 28 suite / 438 test, 5 fail = baseline. Test mới: không chữ ký / ký sai secret / rác → 401.

#### Task 4 — G6 creditCost/model từ body
- **Goal:** gate + trừ credit + trần refund (`process.creditCost`) đều tính server-side.
- **Files allowed:** `middleware/creditGuardMiddleware.js:16-65`, `routes/api.js:41-48,106-111`, `controllers/generatorController.js:78-143,387-440`, service mới `services/creditQuoteService.js`, test.
- **Approach:** guard thành factory `creditGuardMiddleware(quote)`; quote theo route: generate = `settings.model` × (1 | `itemIds.length` | selectAll đếm server), re-optimize = `settings.model` × `process.totalCount` (có owner check), translate = items × locales (flat 1, giữ đúng giá UI). Quote vào `ctx.state.creditQuote`; controller ghi `model`/`creditCost` từ quote lên process (reOptimize cũng ghi vì nó reset `refunded:false`).
- **Test command:** `env -u GOOGLE_APPLICATION_CREDENTIALS npx jest`
- **Risk:** giá server lệch giá FE hiển thị → 402 bất ngờ. Đã khớp công thức `ModelPicker/index.js:40` (`computeCreditCost(settings model, n)`) và `TranslateTable.js:291`. Lệch duy nhất: re-optimize FE tính `data.length`, server tính `totalCount` (đúng lượng việc worker làm).
- **Rollback:** revert `4e13a4f`.

Vì sao `settings.model`: AI thật chạy bằng `settings.model` (`generatorController.js` single, `subscribeHandleBulkGenerate.js:324`); `model` trong body chỉ dùng để tính giá → lỗ kép (trả 0 + refund theo model đắt khi cancel).
Test: `creditCost: 0` → vẫn trừ 15 (claude×3); thiếu credit → 402; selectAll đếm server; bulk thiếu `itemIds` → 400; re-optimize process shop khác → 403; translate items×locales; controller lưu quote thay body. 30 suite / 445 test, 5 fail = baseline. docs-gate: citations OK, route-coverage còn 1 finding có sẵn (`GET /api/credit/grants`).
Chưa làm (ngoài scope): FE vẫn gửi `creditCost`/`model` — vô hại, server bỏ qua.

#### Task 5 — G8 `PUT /shop` self-grant
- **Goal:** merchant không tự bật `noLimit`/`enablePro`/`enableGpt41`.
- **Files allowed:** `controllers/shopController.js:55-68`, test mới.
- **Approach:** brief bảo "bỏ khỏi pick" — nhưng caller hợp lệ là `DevZone.js:239,247,272` (qua `storeActions.js:108` `PUT /shop`). Bỏ thẳng = vỡ DevZone. Thay bằng: 3 flag chỉ vào `pick` khi `canAccessDevZone({user, isProduction})` (cùng cổng với `requireDevZone`).
- **Test command:** `env -u GOOGLE_APPLICATION_CREDENTIALS npx jest`
- **Risk:** staff trên prod không có CRM claim → không toggle được (đúng chủ ý của `requireDevZone`).
- **Rollback:** revert `cb01971`.

Test: session merchant gửi 3 flag → chỉ `setupDone` được ghi; session dev-zone → ghi đủ. 31 suite / 447 test, 5 fail = baseline.

#### Task 6 — G7 body spread `shopId`/`id`
- **Goal:** body không đổi được owner của settings / process / template.
- **Files allowed:** `settingsRepository.js:20-33`, `bulkGenerateProcessRepository.js:13-15`, `templateRepository.js:32-53`, test.
- **Approach:** sửa ở repository (phủ mọi caller, kể cả `flowController.js:220`): settings bỏ `shopId` khỏi data; `createProcess` đặt `shopId`/`isDone` sau spread; template có `id` → đi qua `updateById` (đã có owner check FAL-720).
- **Test command:** `env -u GOOGLE_APPLICATION_CREDENTIALS npx jest`
- **Risk:** POST `/templates` kèm `id` của template hệ thống/không tồn tại — trước đó `update()` cũng ném NOT_FOUND nên hành vi như cũ. FE create/edit tách route (`TemplateEditor.js:60-66`).
- **Rollback:** revert `3a2381a`.

Test: settings update/create với body `shopId` lạ; `createProcess` body `shopId`+`isDone`; POST template với `id` shop khác → "Template not found", không `update`. 32 suite / 451 test, 5 fail = baseline.

#### Task 7 — G5 `updateRegenerateProcess`
- **Goal:** regenerate chỉ chạm process của chính shop.
- **Files allowed:** `bulkGenerateProcessRepository.js:115-121`, `generatorController.js:86,178-181`, test.
- **Approach:** thêm tham số `shopId`, `doc.shopId !== shopId` → throw `{status:403}` (giống `cancelProcess`/`reOptimize`); controller truyền `shopID`, catch giữ `error.status`.
- **Test command:** `env -u GOOGLE_APPLICATION_CREDENTIALS npx jest`
- **Risk:** caller duy nhất `generatorController.js:86` (grep) — không vỡ gì khác.
- **Rollback:** revert `8c71d4e`.

Test: process shop khác → 403, không `update`/`deleteResultsByItemIds`; thiếu shopId → 403; owner OK. 33 suite / 454 test, 5 fail = baseline.

#### Task 8 — G9 `/syncData/:shopifyDomain`
- **Goal:** sync chỉ chạy cho shop của session.
- **Files allowed:** `controllers/shopifyController.js:115-121`, test.
- **Approach:** `syncShop(shopify, shop.shopifyDomain)` — bỏ qua param URL (không 403 vì FE có fallback `shop.domain`, `ContentManager.js:24`; so khớp có thể vỡ shop hiếm). Giữ route để `BannerUpdateContentManager.js:54` không đổi.
- **Test command:** `env -u GOOGLE_APPLICATION_CREDENTIALS npx jest`
- **Risk:** không có — caller duy nhất đã gửi domain của chính mình.
- **Rollback:** revert `bdf03fa`.

Test: URL `victim` → `syncShop` nhận domain session. 34 suite / 455 test, 5 fail = baseline.

#### Task 9 — G4 Flow extension routes
- **Goal:** 2 route Flow chỉ nhận request Shopify Flow ký.
- **Files allowed:** `routes/extension.js:6-7`, `middleware/extension/verifyRequest.js` (viết lại), test.
- **Approach:** Flow ký `x-shopify-hmac-sha256` bằng app secret trên raw body → dùng lại `isValidShopifyHmac` (task 3), sai → 401. File cũ kiểu Express (`res.status().json`) và không được mount (0 import) → viết lại kiểu Koa rồi mount.
- **Test command:** `env -u GOOGLE_APPLICATION_CREDENTIALS npx jest`
- **Risk:** nếu Flow action được đăng ký dưới app khác (secret khác) → 401. Kiểm: `extensions/action-optimize-description/shopify.extension.toml` và `-seo-description` nằm trong repo app này, `runtime_url` trỏ đúng 2 route. Không caller nào khác (grep assets/scripttag/theme-extension).
- **Rollback:** revert `2aab864`.

Chưa làm (ngoài scope): `rateLimit.js` vẫn chưa mount; Flow route vẫn không trừ credit. 35 suite / 458 test, 5 fail = baseline.

#### Task 10 — G10 `/proxy/swagger-token` nhận key qua query
- **Goal:** integration key chỉ đi qua header.
- **Files allowed:** `middleware/swaggerAuth.js:25-41`, `swaggerAuth.test.js`, `docs/swagger-token.yaml`.
- **Approach:** `Authorization: Bearer <key>` (cùng dạng `internalAuth` AEO / `internalSupportKey` SEO); query key → 400 kèm hướng dẫn header.
- **Test command:** `env -u GOOGLE_APPLICATION_CREDENTIALS npx jest`
- **Risk:** client ngoài repo đang gọi `?accessToken=` sẽ nhận 400. Grep cả `projects/Falcon/*`: 0 caller ngoài APC (các hit là swagger-token riêng của SEO/Blog). Caller trong repo — `test/api/xss-api.mjs:74-77`, `test/api/README.md:59,68`, skill `avada-apc-api` (SKILL.md:13 thiếu key hẳn, hỏng từ FAL-720) — chuyển sang header ở `761cc63`. FE APC (`PartnerKey.js`) chỉ hiện key, không hướng dẫn query. Consumer đã biết là tool TS AI — theo memory đã chết từ FAL-720 bind-shop và đang chuyển sang `/proxy/internal-token`. Nếu Tuan cần grace period: thêm lại query làm fallback có log warn.
- **Rollback:** revert `4b10c2e`.

Test: 4 test cũ chuyển sang header; test mới `?accessToken=` → 400, không lookup key. 35 suite / 459 test, 5 fail = baseline.
Lệch fleet: Blog security worktree (`blogs-wt-security-high/.../swaggerAuth.js:11`) chuyển key sang **POST body** — 2 app 2 kiểu, nên chốt 1 kiểu trước khi merge.

#### Task 11 — G12 log axios error thô
- **Goal:** không header auth nào vào Cloud Logging qua `logger`.
- **Files allowed:** `helpers/logger.js:22-35`, test mới.
- **Approach:** `redact()` ở logger (1 chỗ, phủ 78 file import logger): axios error hoặc `Error` có `config`/`request` (got của shopify-api-node) → `{name, message, code, method, url bỏ query, status, response data, stack}`. Còn lại giữ nguyên.
- **Test command:** `env -u GOOGLE_APPLICATION_CREDENTIALS npx jest`
- **Risk:** mất chi tiết debug trong log (header, request body gửi đi). Response body vẫn giữ.
- **Rollback:** revert `ba734e5`.

Không phủ: `console.*` gọi thẳng (còn vài chỗ nợ, vd `translateController.js:62`, `installationService.js` `console.error(... e.message)` — chỉ message). Test: token không xuất hiện trong `util.inspect` output; `logger.error` không in token; object thường (`{config:{model}}`) không bị đụng. 36 suite / 462 test, 5 fail = baseline.

#### Task 12 — G13 shop doc vào Pub/Sub
- **Goal:** topic `syncProducts` không mang shop doc/token.
- **Files allowed:** `services/shopifyService.js:733-735`, `pubsub/subscribeSyncProducts.js:10-42`, test.
- **Approach:** publish `{shopId, historyId}`; subscriber `getShopById(shopId)` rồi mới `fetchResourcesPaginated`; re-publish trang sau chỉ `shopId`. Message cũ `{shop}` đang bay lúc deploy: chỉ đọc `shop.id`, không dùng token trong payload.
- **Test command:** `env -u GOOGLE_APPLICATION_CREDENTIALS npx jest`
- **Risk:** thêm 1 read Firestore/trang (có `shopCache` in-memory).
- **Rollback:** revert `43e0d0b`.

Consumer: duy nhất `index.js:146` → `subscribeSyncProducts` (grep `syncProducts`). Publisher shop doc khác: 0 (grep `publishTopic(` với `shop`). Test: payload re-publish = `{shopId,cursor,historyId}`, không chứa token; message legacy vẫn chạy. 37 suite / 464 test, 5 fail = baseline.

#### Task 13 — G3 `firestore.rules`
- **Goal:** không client nào ghi được; không liệt kê chéo shop; không vỡ listener FE.
- **Files allowed:** `firestore.rules` (brief cho phép rõ).
- **Approach:** grep client SDK trước. Kết quả: FE **0** `setDoc/updateDoc/addDoc/deleteDoc/writeBatch` → đóng write cả 6 collection. `resultGen`: 0 reader → đóng hẳn. `credits` (`creditService.js:18`), `historySyncData` (`BannerUpdateContentManager.js:21`), `translateProcesses` (`TranslateTable.js:216`) chỉ đọc theo id → `get` only, chặn `list`. `bulkGenerateProcesses` (`useProcess.js:24,32` list theo shopId) và `analytics` (`useAnalytics.js:16`) giữ `read`.
- **Test command:** emulator local `firebase emulators:exec --only firestore --project demo-apc-rules` + REST không auth (script scratchpad) + `yarn workspace @avada/assets run production` + jest.
- **Risk:** listener FE bị deny → màn hình tiến trình đứng. Đã loại: mọi read FE đang dùng vẫn 200 trên emulator.
- **Rollback:** revert `c80328a` (rules chỉ có hiệu lực khi deploy tay `firestore:rules`).

Emulator, request không auth (get/list/write):
| collection | trước | sau |
|---|---|---|
| bulkGenerateProcesses | 200/200/200 | 200/200/**403** |
| resultGen | 200/200/200 | **403/403/403** |
| analytics | 200/200/200 | 200/200/**403** |
| credits | 200/200/403 | 200/**403**/403 |
| historySyncData | 200/200/403 | 200/**403**/403 |
| translateProcesses | 200/200/403 | 200/**403**/403 |

**BLOCKED phần scope read theo shop:** embedded app không đăng nhập Firebase Auth (`embed.js` chỉ gọi `/api/shops`; `onAuthStateChanged` chỉ ở `standalone.js:15`) → `request.auth == null`, rules không có gì để so `shopId`. `bulkGenerateProcesses`/`analytics` vẫn list được chéo shop; `credits`/... vẫn get được nếu biết doc id (id shop là auto-id Firestore, không đoán được nhưng không phải bí mật). Đóng hẳn cần: mint custom token có claim `shopId` ở backend + `signInWithCustomToken` ở embed, hoặc bỏ client SDK sang `/api`. Là đổi auth → ticket riêng.
Còn: client đọc `downgrade`, `localStorage`, `analysis` (`helpers/firebase/*`) nhưng rules đã deny từ trước → các hook đó đang chết sẵn, không liên quan task này.

### Tổng — 2026-09-23
14 commit trên `fix/security-high-2026-09` (chưa push, chưa MR, chưa deploy). Test cuối: 37 suite / 464 test,
459 pass, 5 fail = đúng 5 fail có sẵn ở `devZone.test.js`. Assets build OK. docs-gate: 1 finding có sẵn
(`GET /api/credit/grants` thiếu spec). Không chạm `.env*`, lockfile, CI, `firebase.json`, `.firebaserc`.

Follow-up ngoài branch:
1. **`avada-components-seoon` (public npm) chứa proxy key của cả 5 app** — chặn G2 "0 hit" và làm rotate G1 vô nghĩa tới khi lib bỏ key.
2. Scope read `firestore.rules` theo shop cần Firebase Auth ở embed (ticket riêng).
3. `.claude/skills/security/SKILL.md` + `packages/functions/CLAUDE.md` còn mô tả guard đọc body, Flow mở, rules mở — cập nhật khi merge.
4. Chốt 1 kiểu truyền integration key cho cả fleet (APC header, Blog body).

#### Task 4 — round 2 (review FAIL → sửa)
Review độc lập bắt 7 điểm, sửa hết trong `8d708c8`:
1. selectAll trừ `deselectedIds` không kiểm → 10k id rác/trùng = giá 0, worker vẫn chạy cả catalog. Giờ tính giá trên **toàn bộ tập lọc**, `handleDoneProcess` refund phần không generate; `deselectedIds` chỉ còn dùng cho mẫu số progress (`totalCount`, đã dedupe).
2. Đếm fail-open: `productCount.js`/`collectionCount.js:16-18` nuốt lỗi trả 0. Quote tự đếm, lỗi → **503**, count 0 → **400**.
3. `productsCount`/`collectionsCount` mặc định `limit: 10000` (API `2026-07`, schema có `limit: Int = 10000`, `null` = không giới hạn) → truyền `limit: null`.
4. Worker đọc `settings.model` mỗi batch (`subscribeHandleBulkGenerate.js:324`) → giờ `processDetail.model || settings.model`. Regenerate định giá theo `process.model` + owner check ngay ở guard. Re-optimize: controller đã ghi model mới lên process trước khi publish → nhất quán.
5. `creditGuardMiddleware` catch → `e.status || 500` (403/400 của controller không còn thành 500).
6. Test mới (fail trên code cũ trước khi sửa: 10 test): deselected rác / trùng, count ném lỗi, count 0, `limit: null`, status 403 xuyên guard, regenerate theo model process + từ chối process shop khác, worker dùng model process, redact lồng.
7. `logger.redact` đệ quy 2 tầng vào object thường/array.

Test: 39 suite / 474 test, 469 pass, 5 fail = baseline devZone. docs-gate như cũ (1 finding có sẵn).
Rủi ro mới: shop có credit nằm giữa (tổng − bỏ chọn) và tổng sẽ bị 402 khi selectAll có bỏ chọn — FE (`BulkSelection.js:124`) vẫn check theo `generateCount` sau bỏ chọn. Chấp nhận vì refund trả lại phần dư.

Follow-up KHÔNG làm ở branch này (ticket riêng):
- Gate + trừ credit không atomic (đọc số dư → `next()` → `reduceCredits` `void`): race có sẵn từ trước, cần transaction.
- `firestore.rules` `bulkGenerateProcesses` vẫn list chéo shop — đã BLOCKED ở task 13.

#### Task 4 — round 3 (re-review FAIL → sửa, `a8f2b4b`)
- 🔴 Chuỗi miễn phí: selectAll + `deselectedIds` rác → `totalCount` 0 → `handleDoneProcess` không sửa (`totalCount && …`) → re-optimize coi là "complete", giá `totalCount || 0` = 0, regenerate mọi result doc, lặp vô hạn. Sửa: `totalCount = creditQuote.count` (không trừ id chưa kiểm); `quoteReOptimize` tính theo đúng nhánh controller sẽ chạy (`isReoptimizeComplete` dùng chung): xong → `countResults(processId)`, chưa xong → cả selection (selectAll đếm lại / `selectedIds.length`); 0 → 400.
- `reduceCredits` giờ trả `{charged}` (số thực sự bị trừ; noLimit = 0). Guard **await trừ trước `next()`**, trả lại nếu controller throw hoặc `isSkipDown`; trừ lỗi → dừng request (500). Process lưu `creditCharged`; `finalizeProcess` refund ≤ `min(creditCost, creditCharged)` (doc cũ không có field → giữ `creditCost`).
- Worker give-up sau `MAX_RESUME_RETRIES` gọi `handleDoneProcess` → refund phần chưa generate.
- 402 bất ngờ: chọn cách nhỏ hơn — **FE gate theo số server sẽ trừ** (`BulkSelection.js` `chargedCount = selectAll ? resourceCount : generateCount`, 2 chỗ `isOutOfCredits`). Con số hiển thị trong modal xác nhận giữ nguyên (chi phí cuối sau refund). Không làm hold-not-deduct phía server (đụng nhiều hơn).
- Test mới fail trên code cũ trước khi sửa: chuỗi selectAll+rác → `totalCount` 10; re-optimize totalCount 0 → giá theo result docs, 0 result → 400, process dở → giá cả selection; trừ trước `next()` + `charged` lộ ra; controller throw / `isSkipDown` → trả lại; trừ lỗi → 500 (code cũ: unhandled rejection làm sập jest); cap refund 0 / 30 / legacy 90; worker give-up → `finalizeProcess`.
- Kết quả: 41 suite / 486 test, 481 pass, 5 fail = baseline devZone. Assets build OK. docs-gate như cũ.
- Còn lại (ticket riêng, không làm ở đây): gate + trừ vẫn là 2 bước (đọc snapshot số dư rồi decrement) → 2 request song song cùng qua gate có thể đẩy số dư âm; cần transaction.

#### Task 4 — round 4 (re-review: 2 🟡 do trừ trước, `94c31ad`)
- **Refund kép:** controller đã arm process (`createProcess` / reOptimize đặt `refunded:false`) rồi `publishTopic` ném lỗi → guard trả lại toàn bộ `charged`, process vẫn refund được → cancel trả thêm lần nữa. Sửa: controller ghi `ctx.state.armedProcessId` ngay sau khi arm; guard trả lại cho process đã arm **qua `finalizeProcess(id, {creditUsed: 0})`** (transaction đặt `refunded:true`) → đúng 1 lần refund.
- **Lệch usage:** `reduceCredits` ghi `upsertCreditUsage(+cost)` trước, không đường refund nào đảo lại → báo cáo AI-credit thổi phồng. Sửa: helper `refundCredits({shopId, amount, action})` (`helpers/reduceCredits.js`) cộng lại credit, trừ `creditsUsed`, ghi `upsertCreditUsage({[action]: -amount})`. Guard, `cancelProcess`, `handleDoneProcess` đều đi qua nó. Action lấy từ `process.creditAction` (mới lưu) hoặc `aiCreditAction` (doc cũ, vốn đã được spread từ body).
- Refund rơi sang ngày UTC khác thì ghi âm vào doc ngày đó → tổng theo kỳ đúng, số từng ngày có thể lệch. Ghi nhận, không sửa.
- Test mới (fail trên code cũ): `isSkipDown` → net credit 0, net usage 0; lỗi sau khi arm → `finalizeProcess(id,{creditUsed:0})`, đúng 1 lần refund, net 0; cancel sau khi làm dở → usage `-refund` (usage ròng = phần đã dùng); `finalizeProcess` lần 2 sau refund của guard → 0.
- Kết quả: 43 suite / 490 test, 485 pass, 5 fail = baseline devZone. docs-gate như cũ. Không có secret trong diff.
- Vẫn là follow-up (ticket riêng): gate + trừ không atomic.
