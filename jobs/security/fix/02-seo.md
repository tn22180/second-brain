# 02 — SEO security fix (high)

Repo: `projects/Falcon/seo`. Base: `origin/master` @ `0547925a9cb`. Prod deploy theo tag. Luật chung: `README.md`.
Verify: `verify/SEO.md` — 83 row → **47 real**, 29 dup, 6 already-fixed (FAL-748 `appIntegationKeys`,
FAL-746 integrationKey getOne + swaggerAuth bind, `chatbotController.js` đã xoá 2026-09-21,
gate isDevZone `updateShopData`), 1 refuted (`shopifyController.js:664` debug log — tắt ở prod).
23 nhóm → 13 task.

**Trạng thái: CHỜ TUAN DUYỆT danh sách nhóm dưới đây.** Chưa task nào được dispatch.
Repo có skill `security` — §8 áp thêm threat model của nó.

## Tuan làm tay trước (ROTATE)

- G1 npm registry token ×3 file (chung fleet), **Google OAuth client secret**, Trello key + token
  (`helpers/trello/addCardToTrello.js`)
- Ngoài verify, còn treo từ memory: `SHOPIFY_ACCESS_TOKEN_KEY` prod trong `fixProBackToFree.js:95`,
  `MCP_OAUTH_SECRET` 5 ký tự.

## Tasks (sau khi duyệt)

| # | Nhóm | Agent / Model | Loại | Ghi chú |
|---|---|---|---|---|
| 1 | G8 4 route `/proxy/*` không middleware: `GET /republish/:shopId` (`proxy.js:43`, ghi theme live), `GET /updateObfucate/:shopId` (`:80`, gọi Admin API bằng token shop), `GET /get-jsonl-data/:id` (`:99`, signed URL backup), `POST /revert-product/:id` (`:101`) | general-purpose / opus | auth | **đầu tiên**. Đã kiểm tay: route có trên master. Agent không thấy caller public hợp lệ — vẫn grep scripttag/worker trước khi đóng |
| 2 | G14 `resetGen2` public, phá dữ liệu theo `?domain=` (`handlers/reset.js:6`) | general-purpose / opus | auth | đã kiểm tay. Gỡ khỏi prod hoặc đặt sau IAM |
| 3 | G15 `/lighthouse/auditNew` headless Chrome fetch URL bất kỳ, public (SSRF) + G16 `internalTools` redis cache chỉ có shared secret, không ingress restriction | general-purpose / opus | auth | chặn IP nội bộ/metadata; G16 → ingress internal |
| 4 | G5 credit AI: `reduce-credit` nhận số âm, `AICreditQuota` ngoài blockFields, + G22 `creditCartController.activateCart` không verify đã charge | general-purpose / opus | billing | tự cấp credit = mất tiền thật |
| 5 | G6 integration key không bind shop (`validateAccessToken.js`, `imageController.js`) + G7 tạo key / `GET /api/integration/blogApp/keys` trả `accessToken` thô | general-purpose / opus | auth | phần đổi schema = FAL-720 → tách nếu cần migration |
| 6 | G9 `?shopId=` override (`seoController.get`, `subscriptionController.getSubscription`) + G13 Pub/Sub tin shop trong payload | general-purpose / opus | auth | shopId chỉ từ session / từ doc |
| 7 | G11 `analysis` thiếu ownership (dùng lại `isAnalysisOwnedByShop()`) + G12 doc theo id (`historyOptimize`, `history`, `sitemap`) + G17 `blockUser` | general-purpose / sonnet | auth | helper có sẵn → áp đúng chỗ |
| 8 | G10 settings không redact (`getShopProxy`, `subscriptionController`) — dùng lại `redactSettings()` + G19 `avadaService` upgrade/downgrade trả shop doc + G21 `reload` echo field | general-purpose / sonnet | code | |
| 9 | G4 `commands/getAccessToken.js` in token rõ + G18 secret trong querystring (`swaggerAuth` accessToken, `lightHouseService` password storefront) | cavecrew-builder / haiku | code | |
| 10 | G20 cache Redis giữ credential (`integrationRepository`, `shopRepository.getShopById`) | general-purpose / sonnet | code | cache bỏ field bí mật; flush key cũ lúc deploy |
| 11 | G1 gỡ credential → env | cavecrew-builder / haiku | code | sau khi Tuan báo đã rotate |
| 12 | G3 `firestore.rules` `generateBulk` mở | general-purpose / opus | rules | file cấm §8 → **được phép rõ ràng**; kiểm client SDK |
| 13 | G23 `triggerCron` dispatch không giới hạn (chỉ trong shop mình) | cavecrew-builder / haiku | code | rate limit / chỉ DevZone |

Plan gate chỉ ở FE (robots.txt pro, Speed-Up pro) là **medium** → ngoài phạm vi A.

## Tách ticket riêng (migration)

- **G2** extension `firestore-bigquery-export` export `shops` không lọc field → BigQuery
  `avada-seo` đang giữ token. Sửa config + xoá/rewrite bảng. Ghi GCP → xác nhận project id.

## Test

Mỗi task: test hồi quy đúng exploit, `yarn test` `packages/functions`. Security check §8 + skill
`security` của repo. `updateShopData` gate đã tái phát nhiều lần trong git log → task 8 chạy lại
test hồi quy của nó.

## Progress

Worktree `projects/Falcon/seo-wt-security-high`, branch `fix/security-high-2026-09` từ `origin/master` @ `0547925a9cb`.
Test: `npx jest packages/functions/src` từ root worktree.

| # | Task | Status | Rounds | Sec | Notes |
|---|---|---|---|---|---|
| 1 | G8 4 route `/proxy/*` không auth | ✅ partial / 🚧 BLOCKED | 1+r2 | fixed | `952e9ea55a5` republish+updateObfucate → internal key; r2 `fd368211b9f` key phải devZone (403), 3 script dừng khi thiếu SEO_INTERNAL_KEY + đếm non-2xx. get-jsonl-data + revert-product BLOCKED: caller = revert image extension ngoài repo |
| 2 | G14 `resetGen2` public | ✅ | 1+r2 | fixed | `8bdca8a0d63` internal key trong handler; r2 `0f7a52135e4` key phải devZone (403). Export + rewrite giữ nguyên |
| 3 | G15 lighthouse SSRF + G16 internalTools | ✅ G15 / 🚧 G16 BLOCKED | 1+r2+r3 | fixed | `85a84aa0b9b`; r2 `3f0ae2d8b62` interception + page cho LH, lookup all, dải mới; r3 `5a26663764b` cache verdict theo host trong 1 audit + gộp lookup + timeout 2s, tắt WebSocket + SW. Rebinding/iframe about:blank/SW install/WebRTC → ticket egress firewall. G16 BLOCKED (speed-up-report + hosting rewrite) |
| 4 | G5 credit AI + G22 activateCart | ✅ | 2+1+r2+r3+r4 | fixed | `fac0a6104bb`, `06e229ce684`; r2 `5079d89c3ec`; r3 `d91a09845e7` reduceCredits transaction, gói credit = increment, generateAgain prompt = giá; r4 `0853fda2ac0` 2 charge path xoá cache shop, before-downgrade/afterDowngrade/afterUpgrade ghi AIUsage theo field path. Còn spread ở 2 cron + 3 DevZone (liệt kê log). Ticket riêng: reduce-credit do FE tự khai |
| 5 | G6/G7 integration key | ✅ G7 / 🚧 G6 BLOCKED | 2 | clean | `ef80d721c89` blogApp keys → DevZone only, createOne shopId từ session. G6 cần key per-shop (FAL-720) |
| 6 | G9 `?shopId=` + G13 Pub/Sub | ✅ | 1 | clean | `e11720d9080` bỏ ?shopId= override ×2; bulk apply check job.shopID. exportBrokenUrls giữ nguyên (email do merchant nhập) |
| 7 | G11/G12/G17 ownership | ✅ | 2 | clean | `52c409dbd63` 3 handler analysis + saveBulkAnalysis + historyOptimize + revert + sitemap bulk + blockUser |
| 8 | G10/G19/G21 redact | ✅ | 1 | clean | `9f7290e554d` redactSettings ×2, avadaService bỏ shopData, reload giới hạn pickFields |
| 9 | G4/G18 token log + secret in URL | ✅ / 🚧 gỡ ?accessToken= BLOCKED | 2+r2 | clean | `8bc9e774212` getAccessToken → stdout; swagger-token nhận Bearer (query fallback); lighthouse password qua header. r2 `ea8f8c75879` bỏ password khỏi debug log performAudit |
| 10 | G20 Redis cache credential | ✅ integration / 🚧 shop cache BLOCKED | 1+1 | fixed | `251725788df` integration cache sha256, không token. r2 `7add1e16db8` gỡ strip token ở cache shop (regression bug 4) |
| 11 | G1 credential → env | ⏭ SKIP | — | — | chờ Tuan rotate |
| 12 | G3 `firestore.rules` generateBulk | ✅ | 1 | clean | `6b7650ade9f` job doc read-only; items chỉ update 4 field ModalEditFaq. Emulator 10/10 |
| 13 | G23 `triggerCron` | ✅ | 1 | clean | `90806c8acb9` whitelist recursive/build_sitemap, chỉ forward action, rate limit 10/phút/shop |
| 14 | Merchant shop-write gaps (dotted blockFields/privilegedFields, imageOptimizeFreeUsage re-merge, image quota fields) — added 2026-09-23 from blocklist audit | ✅ | 1 | fixed | `4fc38f2d5c6` blockFields/privilegedFields khớp theo first segment (dùng chung predicate clientCreditGuard), bỏ re-merge imageOptimizeFreeUsage, 4 field quota ảnh → privilegedFields (DevZone), /shop/status chỉ appStatus (trước: ghi nguyên body thẳng doc), /shop/unlockSpeed strip credit |

### Log

#### Task 1 — plan
- **Goal:** 4 route `/proxy` không middleware không còn gọi được bởi người lạ.
- **Files allowed:** `routes/proxy.js`, `middleware/requireInternalKey.js` (mới), `controllers/seoController.js` (`republishClient` :687), `controllers/devController.js` (`updateObfucate` :2047), 3 ops script `commands/{republishRecentShops,updateCdnExtensions,checkObfucatedSnippet}.js`, test mới.
- **Approach:** caller grep: `republish/:shopId` chỉ gọi từ 3 ops script (`commands/*.js`, chạy tay bằng SA prod) + `devController.updateObfucate:2056` (self-fetch); `updateObfucate` không caller. → gate cả 2 bằng internal key (`Authorization: Bearer`, `internalKeyRepository.getActiveInternalKey`, collection `internalKeys` đã có, hash-only, revoke được), `updateObfucate` gọi thẳng hàm republish thay vì fetch; script gửi header từ env `SEO_INTERNAL_KEY`. `get-jsonl-data/:id` + `revert-product/:id` (:99/:101): caller = "revert image extension v2" (commit `017c5bf4fe3`, `196e8ddbd5b`), source không có trong workspace → không biết nó auth được gì → **BLOCKED** phần này.
- **Test command:** `npx jest packages/functions/src/middleware/__tests__/requireInternalKey.test.js` + full `npx jest packages/functions/src`.
- **Risk:** ops script chạy tay sẽ 401 tới khi có internal key trong env (chấp nhận, không phải caller live). Nếu còn caller ngoài repo gọi `/proxy/republish` → 401.
- **Rollback:** revert commit task 1.
- **Result:** `952e9ea55a5`. 1 round. Test mới `middleware/__tests__/requireInternalKey.test.js` 5/5. Full suite 216/219 suite pass; 2 fail baseline trên master (`shopify2026Client`, `workListStore`), `shopifyController.themeFiles` flaky khi chạy full (pass lẻ). Sec: clean — không secret, key chỉ đọc từ env ở script.
- **BLOCKED:** `GET /proxy/get-jsonl-data/:id`, `POST /proxy/revert-product/:id` (và `GET /proxy/file-id/:id` cùng nhóm) — caller hợp lệ là "revert image extension v2" (commit `017c5bf4fe3` 2025-04-09, `196e8ddbd5b` 2025-12-22, Lai Ngoc Lam), source không có trong workspace → không biết extension gửi được header gì. Cần Lâm xác nhận extension chạy ở đâu (Chrome ext cho CS? app proxy?) rồi mới chọn cơ chế (internal key hoặc `verifyProxySignature`).
- **Deploy note:** trước khi chạy lại `commands/{republishRecentShops,updateCdnExtensions,checkObfucatedSnippet}.js` phải export `SEO_INTERNAL_KEY` = 1 internal key còn hiệu lực.
- Ngoài scope, cũng không middleware trong `proxy.js`: `/test/rum`, `/test/updateActive`, `/test/crawlProxy` (script `updateCdnExtensions` dùng), `/optimize/start`, `/temp/seo-tool/image`.

#### Task 2 — plan
- **Goal:** `resetGen2` (`handlers/reset.js:5-29`, export `httpFunctions.js:117`, rewrite `/reset` `firebase.json:133`) không còn chạy `revert-all`/`reset-history` cho người lạ.
- **Files allowed:** `handlers/reset.js`, test mới `handlers/__tests__/reset.auth.test.js`. Không đụng `firebase.json`.
- **Approach:** caller grep (seo, speed-up-report, fleet-control, falcon-fix-bot, 4 app kia): 0 caller code; tạo 2020-06-17 `4bb4eca1a59` "manually reset optimize by shopify domain" = tool tay. DevZone đã có `/api/reset-history` có session. Không gỡ export (gỡ mà giữ rewrite hosting = deploy hosting lỗi, `firebase.json` cấm sửa) → gate trong handler bằng internal key (`Authorization: Bearer`, `getActiveInternalKey`) như task 1; shop không tồn tại → 404 thay vì crash.
- **Test command:** `npx jest packages/functions/src/handlers/__tests__/reset.auth.test.js` + full suite.
- **Risk:** ai còn gọi tay `/reset?domain=` không header → 401. Chấp nhận.
- **Rollback:** revert commit task 2.
- **Result:** `8bdca8a0d63`. 1 round. `handlers/__tests__/reset.auth.test.js` 4/4 (anonymous → 401, không gọi repo). Full suite: fail còn lại = baseline + flaky (`metaPromptCommerceTone`, `jobRegistryService` pass khi chạy lẻ). Sec: clean.
- **Fleet:** `firebase.devmacos.json` của IMG-OPT, AEO, APC cũng rewrite `/reset` → kiểm handler cùng tên ở 3 app đó.

#### Task 3 — plan
- **Goal:** G15 `/lighthouse/auditNew` (`handlers/lightHouseAuditHandler.js:14`, `invoker:'public'` `httpFunctions.js:71-80`) không còn điều headless Chrome tới IP nội bộ/metadata. G16 ingress internal cho `internalGen2`.
- **Files allowed:** `controllers/lightHouseController.js` (`performAudit` :101), test mới `controllers/__tests__/lightHouseController.ssrf.test.js`.
- **Approach:** caller grep: `auditNew` chỉ gọi từ chính backend (`services/lightHouseService.js:63` `fetchLightHouse`, qua `appConfig.baseUrl`, chạy cả GCF lẫn worker fleet) — IMG-OPT có bản riêng gọi baseUrl của chính nó. Không thêm auth (cần secret mới ở GCF + box worker = outage nếu thiếu env). Theo brief: `assertSafeUrl()` (`helpers/security/ssrfGuard.js:101`, đã dùng ở `seoSpeed.js`, `devController.js`) chạy trước `launchBrowser()` → 400. **G16 BLOCKED:** caller hợp lệ `speed-up-report` `/seo/db` (`apps/functions/src/seo-db/redis.ts:143`, project `plaza-staging-3`, khác project) + rewrite hosting `/internal/**` (`firebase.json:97`) — `ALLOW_INTERNAL_ONLY` chặn cả 2.
- **Test command:** `npx jest packages/functions/src/controllers/__tests__/lightHouseController.ssrf.test.js` + full suite.
- **Risk:** URL shop có DNS trả IP private (hiếm, shop Shopify public) → audit trả lỗi. Còn hở: redirect/subresource trong Chrome tới IP private (guard chỉ ở URL đầu).
- **Rollback:** revert commit task 3.
- **Result:** `85a84aa0b9b`. 1 round. `controllers/__tests__/lightHouseController.ssrf.test.js` 6/6 (metadata IP, `metadata.google.internal`, 10.x, localhost, `file://` → 400, Chrome không launch). Full suite: 2 test fail baseline; 5 suite "Cannot find module 'node:stream'" (cheerio) flaky, pass khi chạy lẻ. Sec: clean.
- **G16 BLOCKED:** `ingressSettings: ALLOW_INTERNAL_ONLY` trên `internalGen2` cắt `speed-up-report` `/seo/db` (`apps/functions/src/seo-db/redis.ts:143`, project `plaza-staging-3`) và rewrite hosting `/internal/**` (`firebase.json:97-98`, chưa được sửa file này). Giảm thiệt hại thay thế: task 10 bỏ credential khỏi cache Redis → `/redis-cache/dump` hết thứ đáng lấy. Muốn đóng hẳn: chuyển speed-up-report sang gọi bằng IAM (invoker SA) thay cho token chung — việc riêng.

#### Task 4 — plan
- **Goal:** merchant không tự cấp credit: (a) `POST /api/shop` + `/proxy/shop/update` ghi `AICreditQuota`/`AIUsage` từ body; (b) `reduce-credit`/`incrementAIUsage` nhận số âm; (c) `numberOfFaqs` âm; (d) `activateCart` cấp credit không hỏi Shopify charge đã ACTIVE.
- **Files allowed:** `config/pickFields.js`, `controllers/shopController.js` (`set` :259, `updateShopProxy` :151), `repositories/shopRepository.js` (`incrementAIUsage` :988), `controllers/aiChatController.js` (:29), `controllers/creditCartController.js` (`activateCart` :100), test.
- **Approach:** KHÔNG nhét vào `blockFields`/`privilegedFields` của `updateShopData` — server tự ghi credit qua chính hàm đó không có `privileged` (`creditCartController.js:133`, `subscriptionService.js:571`, `devController.js:1512`) → sẽ vỡ nạp credit. Lọc ở 2 cửa client: bỏ `AICreditQuota`, `AIUsage`, key `AIUsage.*` trừ khi session DevZone (`CAContainer.js:168` ghi `'AIUsage.metaExtraLimit'` qua `POST /shop` = caller hợp lệ, vẫn chạy). `incrementAIUsage` throw khi amount âm/NaN. `numberOfFaqs` → số nguyên ≥1. `activateCart`: query `node(id: gid://shopify/AppPurchaseOneTime/<id>)` bằng token shop của bundle, chỉ cộng khi `status === 'ACTIVE'`.
- **Test command:** test mới `controllers/__tests__/credit.selfGrant.test.js` + full suite.
- **Risk:** Shopify trả chậm trạng thái ACTIVE ngay sau approve → khách không được cộng (redirect về subscription, không đánh dấu active → vào lại link vẫn cộng được). Race 2 request activate song song vẫn có thể cộng 2 lần (có sẵn, ngoài scope).
- **Rollback:** revert commit task 4.
- **Result:** `fac0a6104bb`. 2 round (round 1 prettier fail ở pre-commit hook). `controllers/__tests__/credit.selfGrant.test.js` 18/18 + `aiChatController.getMetaSuggestion` vẫn xanh. Full suite: 2 test fail baseline, suite "node:stream" flaky. Sec: clean.
- **Còn hở (ngoài scope, ghi lại):** `updateShopData` ghi thẳng `postData.imageOptimizeFreeUsage` (`shopRepository.js` ngay sau `prepareUpdateData`) — quota ảnh free, client ghi được qua `POST /api/shop`. Race 2 request `activate` song song cộng 2 lần.
- **Add-on check (pattern từ review APC), 3 mẫu:**
  - (a) trừ id bỏ chọn phía client không dedupe → cost 0: `generateBulkService.createGenFaqBulk:121` có `totalCount - deselectedIds.length` (client total, không dedupe) nhưng chỉ dùng cho progress/job registry; credit trừ theo từng resource trong worker (`subscribeGenFaq.js` `chargeCredits`), còn `countFilteredResources:309` dùng Set. → **n/a cho giá**, chỉ số progress sai.
  - (b) fail-open → giá 0: **có**. `subscribeGenFaq.js:310` `creditPerResource = Number(number_of_output) || 0`; `number_of_output` 0/âm/rác → 0 credit, bỏ luôn check số dư (`creditPerResource > 0`), FAQ vẫn sinh. Sửa ở `06e229ce684` (`faqCreditCost`, ≥1) + `generateAgain` không dùng số âm. Test `handlers/pubsub/__tests__/subscribeGenFaq.pricing.test.js` 4/4, fail 4/4 trước fix. `isAiUsageAvailable` lỗi → `availableCredits: 0` = fail-closed, OK. Worker chạy GCF (`handleGenFaqs` không có trong `worker.config.yml`).
  - (c) worker đọc lại settings mỗi batch: `dataInputForm` đọc lại từ doc `generateBulk` mỗi batch — doc đó client ghi được qua `firestore.rules` mở (task 12) → giá đổi giữa chừng được; sau fix (b) giá luôn ≥1 và khớp số FAQ sinh, task 12 đóng đường ghi. Model: không có lựa chọn model theo request ở luồng credit; lưu ý riêng `altTextModel` (DevZone-only UI) ghi được qua `POST /api/shop` vì không nằm trong `privilegedFields` — cost của Avada, không phải credit merchant; đề xuất thêm vào `privilegedFields`, chưa làm.

#### Task 5 — plan
- **Goal:** G6 key không bind shop (`middleware/validateAccessToken.js:11-44`, `handlers/proxy/controllers/imageController.js:16`); G7 `createOne` nhận `shopId` từ body (`integrationKeyController.js:39-47`), `GET /api/integration/blogApp/keys` trả `accessToken` thô (`blogAppIntegrationController.js:12-21`).
- **Files allowed:** `controllers/integrationKeyController.js`, `controllers/blogAppIntegrationController.js`, `controllers/__tests__/integrationKeyController.test.js`, test mới `controllers/__tests__/blogAppIntegrationController.test.js`.
- **Approach:** **G6 BLOCKED** — key hiện là key cấp *app*, dùng cho mọi shop: `avada-components/src/helpers/getProxyEndPoint.js:61-69` (`SEO/BLOG/AI_PROXY_ACCESS_TOKEN` trong bundle FE), APC `SeoLegacyPlanModal.jsx:56` (`AVADA_SEO_PRO_ACCESS_TOKEN`), APC `services/seoService.js:19,62`. So `integration.shopId` với header = cắt toàn bộ cross-app → cần key per-shop = FAL-720 (migration, tách ticket). G7: caller duy nhất là trang staff ẩn `/partner/key` (`assets/src/pages/PartnerKey/PartnerKey.js`, gửi `{name}`; cố ý hiển thị token để copy sang app khác). → `blogApp/keys` GET+POST chỉ cho session DevZone (`canAccessDevZone`: CRM login-as ở prod), merchant thường 403; `integration/keys` POST lấy `shopId` từ session, bỏ body.
- **Test command:** 2 file test trên + full suite.
- **Risk:** staff mở `/partner/key` trên prod không qua CRM login-as sẽ 403 ở phần App Action tokens — đi qua CRM login-as là đường thay thế.
- **Rollback:** revert commit task 5.
- **Result:** `ef80d721c89`. 2 round (prettier). Test 7/7 (merchant → 403, không lộ token; body `shopId: victim` bị bỏ). Full suite: 2 test fail baseline, node:stream flaky. Sec: clean.
- **G6 BLOCKED (migration):** bind key↔shop trong `validateAccessToken` cắt mọi call cross-app vì key là key cấp app dùng cho mọi shop (`avada-components/src/helpers/getProxyEndPoint.js:61-69`, APC `SeoLegacyPlanModal.jsx:56`, APC `services/seoService.js:19,62`). Token cấp app còn nằm trong bundle FE (avada-components, APC) → coi như public. Cần FAL-720: key per-shop + cập nhật 3 caller, rồi mới bật check `integration.shopId`.

#### Task 6 — plan
- **Goal:** G9 `?shopId=` thắng session (`seoController.js:138-142` `get`, `subscriptionController.js:37-38` `getSubscription`); G13 consumer Pub/Sub tin shop trong payload (`subscribeBulkAuditFixApplyProduct.js:30-35`, `subscribeExportBrokenUrls.js:21-58`).
- **Files allowed:** 2 controller + `handlers/pubsub/subscribeBulkAuditFixApplyProduct.js` + test (`seoController.settingsSecrets.test.js` thêm case, mới `subscriptionController.shopScope.test.js`, mới `handlers/pubsub/__tests__/subscribeBulkAuditFixApplyProduct.owner.test.js`).
- **Approach:** caller grep (assets, scripttag, extensions, speed-up-report, avada-components, blogs, APC, AEO, falcon-fix-bot): 0 caller gửi `shopId` query cho `/api/settings` hay `/api/subscription`; nội bộ không ai gọi 2 hàm với ctx giả → bỏ override, luôn `getCurrentShop`. Bulk apply: so `job.shopID !== shopID` → log + return (giống `services/bulkAuditFix/dispatcher.js:17`), handler chạy chung GCF + fleet. `exportBrokenUrls`: KHÔNG đổi — publisher duy nhất (`redirectController.js:480-485`) lấy `shopID` từ session; `email` là ô merchant tự nhập (`assets/.../CustomRedirect/Export.js`, prefill `shop.email`, sửa được) → khoá về email shop = gãy tính năng.
- **Test command:** 3 test trên + full suite.
- **Risk:** job cũ có `shopID` lệch payload (không nên tồn tại) sẽ dừng chain ở product đó.
- **Rollback:** revert commit task 6.
- **Result:** `e11720d9080`. 1 round. 7/7 test (settings + subscription với `?shopId=victim` → đọc shop session; job shop-a + payload shop-b → không apply). Full suite: 2 test fail baseline, node:stream flaky. Sec: clean.
- **Không đổi:** `subscribeExportBrokenUrls` — publisher duy nhất đã lấy `shopID` từ session; email người nhận là tính năng (merchant nhập), khoá về `shop.email` là gãy UX. Chỉ còn rủi ro khi ai đó publish thẳng lên topic = đã có quyền IAM.

#### Task 7 — plan
- **Goal:** G11 doc `analysis` đọc/ghi không kiểm chủ (`analysisController.js` `getOne` :406, `publishResource` :569, `getMultiLanguageMetaTags` :761; `bulkEditRepository.saveBulkAnalysis` :77 ← `bulkEditService.processChunk` :657). G12 doc theo id (`historyOptimizeController.getOne` :119, `historyRepository.revertByListImageLogId` :334, `sitemapRepository.bulkUpdateSitemap` :372). G17 `blockUser` xoá comment của `blockId` bất kỳ (`featureReq.controller.js:204-222`).
- **Files allowed:** 7 file trên + `controllers/sitemapController.js` (:216 truyền shopID) + test mới.
- **Approach:** analysis: `isAnalysisOwnedByShop(id, shopID)` (`analysisRepository.js:149`, helper có sẵn, giữ ngữ nghĩa doc chưa có/chưa có chủ = cho qua) ở đầu 3 handler → 403; `saveBulkAnalysis(items, shopID)` dùng lại `canShopOwnAnalysisDoc` trên snapshot đã đọc sẵn (0 read thêm) → item lạ vào `errors`. historyOptimize: so `data.shopId` (field `shopId`, `historyOptimizeRepository.js:33`) → 403. revert: chép guard `data.shopID !== shop.id` của `revertByHistoryId` (:375). sitemap: chỉ ghi doc `exists && shopId === shopID` (giống `updateSitemap` :332). blockUser: caller duy nhất (`assets/src/feature-request/Components/UserComment.jsx:81-86`) luôn gửi `blockId: shop.id` (shop session) → bỏ `blockId` body, xoá theo shop session.
- **Test command:** `controllers/__tests__/ownership.idor.test.js` (mới) + full suite.
- **Risk:** doc analysis legacy có `shopID` sai → merchant thật bị 403 (helper đã dùng ở `updateAnalysis` nên đã được kiểm ngoài prod). Thêm 1 Firestore read/request ở 3 handler analysis.
- **Rollback:** revert commit task 7.
- **Result:** `52c409dbd63`. 2 round (round 1 test mock Firestore bị jest-hoist chặn). Test mới 7/7: `analysisController.ownership` (3 route → 403, không đọc shop), `repositories/__tests__/ownership.bulkWrites` (doc shop khác → Forbidden, doc mình + doc mới vẫn ghi; sitemap chỉ ghi doc mình), `featureReq/__tests__/blockUser` (body `blockId: victim` bị bỏ). `historyOptimizeController.getOne` + `revertByListImageLogId` không có test (import graph nặng) — guard chép y hệt `revertByHistoryId`. Full suite: 2 test fail baseline, node:stream flaky. Sec: clean.
- **Ghi lại:** `blockUserReq` vẫn lấy từ body → shop bị block tự gửi `blockUserReq:false` là tự gỡ block. Đúng ra là hành động moderation của staff → nên gate DevZone; chưa làm vì không rõ staff dùng session gì (magic-link sẽ gãy).

#### Task 8 — plan
- **Goal:** G10 settings thô (Search Console OAuth token, SA JSON, key Bing) ra client ở `GET /proxy/shop` (`shopController.getShopProxy` :135-146) và `GET /api/subscription` (`subscriptionController.js` `settings` trong body); G19 `avadaService.upgradePlan/downgradePlan` (:91-128) re-spread `...params` → gửi cả shop doc sang avada.io; G21 `updateShopData` `reload` (:495-497) echo field bất kỳ (kể cả token).
- **Files allowed:** `controllers/shopController.js`, `controllers/subscriptionController.js`, `services/avadaService.js`, `repositories/shopRepository.js`, test.
- **Approach:** caller: `/proxy/shop` = extension `optimize-product-images` chỉ đọc `settings.image` (`ActionExtension.js:45`); `/api/subscription` FE không đọc `settings.google/instantIndexing` → bọc `redactSettings()` (`presenters/seoPresenter.js:100`, đã dùng ở seoController ×3). avadaService: thay `...params` cuối bằng `...triggerData` (giữ thứ tự override, bỏ `shopData`). `reload`: 0 caller FE/extension → giới hạn `reload` về `pickFields` (danh sách field shop đã trả FE, không có token).
- **Test command:** `repositories/__tests__/shopRepository.updateShopData.privileged.test.js` (thêm case reload + chạy lại toàn file theo yêu cầu brief), mới `services/__tests__/avadaService.payload.test.js`, mới `controllers/__tests__/shopController.getShopProxy.redact.test.js` + full suite.
- **Risk:** thấp — chỉ bớt field trả về / gửi đi.
- **Rollback:** revert commit task 8.
- **Result:** `9f7290e554d`. 1 round. Test: `shopController.getShopProxy.redact` 1/1, `avadaService.payload` 2/2, `shopRepository.updateShopData.privileged` 4/4 (3 case cũ của gate `isDevZone` vẫn xanh + case reload `accessToken` không echo). Full suite: 2 test fail baseline, node:stream flaky. Sec: clean.

#### Task 9 — plan
- **Goal:** G4 `commands/getAccessToken.js:7` `logger.debug(accessToken)` (token rõ vào log sink); G18 `swaggerAuth.exchangeToken` chỉ nhận key qua `?accessToken=` (`middleware/swaggerAuth.js:13`), `lightHouseService.fetchLightHouse` ghép `passwordStore`/`passwordQuery` vào URL (`services/lightHouseService.js:48-60`) rồi `logger.info` cả URL (:64).
- **Files allowed:** 3 file trên + `controllers/lightHouseController.js` (`extractAuditParams` :69) + test.
- **Approach:** getAccessToken: in ra stdout của người chạy script (`process.stdout.write`), không qua logger. swagger-token: caller ngoài repo (TS AI support client, integration của merchant theo `docs/auth.yaml`) đang gửi query → đọc `Authorization: Bearer` trước, giữ `?accessToken=` làm fallback (bỏ hẳn = outage cho client ngoài; ghi BLOCKED phần gỡ query). Lighthouse: gửi mật khẩu storefront qua header `X-Avada-Store-Password` / `X-Avada-Password-Query`; controller đọc header trước, query sau (worker fleet cũ vẫn gửi query → vẫn chạy); log bỏ URL đầy đủ.
- **Test command:** mới `middleware/__tests__/swaggerAuth.headerToken.test.js`, thêm case vào `controllers/__tests__/lightHouseController.ssrf.test.js`, mới `services/__tests__/lightHouseService.passwordHeader.test.js` + full suite.
- **Risk:** deploy worker mới trước GCF `lighthouseauditrunnerGen2` → controller cũ không đọc header → audit store có mật khẩu lỗi. Deploy GCF trước worker.
- **Rollback:** revert commit task 9.
- **Result:** `8bc9e774212`. 2 round (round 1: `AbortSignal` không có trong env jest 24 — stub trong test). Test: `swaggerAuth.headerToken` 3/3, `swaggerAuth.exchangeToken` cũ vẫn xanh, `lightHouseService.passwordHeader` 1/1, `lightHouseController.ssrf` +1 case header/query. Full suite: 2 test fail baseline, node:stream flaky. Sec: clean (grep diff không có secret).
- **BLOCKED (một phần):** gỡ hẳn `?accessToken=` khỏi `/proxy/swagger-token` — client ngoài repo (TS AI support client, integration merchant theo `src/docs/auth.yaml`) còn gửi query. Cần báo họ chuyển sang `Authorization: Bearer` rồi mới bỏ fallback. Cập nhật `auth.yaml` cùng lúc.
- **Deploy order:** GCF `lighthouseauditrunnerGen2` trước `[deploy-worker]`.

#### Task 10 — plan
- **Goal:** G20 Redis giữ credential: `integrationRepository.getIntegrationKey` (:15-36) dùng token thô làm tên key `integration:<token>` + value chứa lại `accessToken`; cache shop (`getShopById` :309-351, `getShopByShopifyDomain` :136, `getShopByDomainCached` :603) giữ nguyên doc shop.
- **Files allowed:** `repositories/integrationRepository.js`, `repositories/shopRepository.js`, test.
- **Approach:** integration: key = `integration:<sha256(token)>`, value bỏ `accessToken` (consumer `validateAccessToken`, `swaggerAuth`, `requireGhReadKey` chỉ dùng `id`/`shopId`/tồn tại). Shop: `accessTokenHash` là ciphertext và `initShopify` → `prepareShopData` (`@avada/core`) cần nó ở mọi cache hit → giữ (khoá AES không nằm trong Redis; bỏ = thêm 1 Firestore read mỗi hot path). Chỉ bỏ `accessToken` plaintext (legacy) khỏi value cache **khi có `accessTokenHash`** — `prepareShopData` ưu tiên hash nên không đổi hành vi. Key cũ `integration:<token>` tự hết hạn sau ≤1h (TTL 3600) — không ghi Redis từ đây.
- **Test command:** mới `repositories/__tests__/credentialCache.test.js` + full suite.
- **Risk:** sau deploy, 1h đầu cache integration miss toàn bộ → thêm Firestore query/request `/proxy/*` (1 lần/token).
- **Rollback:** revert commit task 10.
- **Result:** `251725788df`. 1 round. `repositories/__tests__/credentialCache` 1/1, `shopRepository.withoutPlaintextToken` 2/2. Full suite: 2 test fail baseline, node:stream flaky. Sec: clean.
- **Không làm (lý do):** `accessTokenHash` vẫn ở cache shop — ciphertext, `initShopify` cần ở mọi hit, khoá AES (`SHOPIFY_ACCESS_TOKEN_KEY`) không nằm trong Redis. `blogappkey:<name>` (`blogAppIntegrationRepository.js:40`) vẫn giữ key cấp app vì trang staff `/partner/key` đọc qua cùng hàm; key đó đã public trong bundle `avada-components` (README "Khẩn" #3) → xử lý khi rotate.
- **Phát hiện phụ:** `middleware/validateAppAction.js` chỉ kiểm tên app tồn tại, không kiểm secret — hiện không route nào import (dead), đừng gắn lại vào route.

#### Task 12 — plan
- **Goal:** G3 `firestore.rules:7-12` `generateBulk` + `items` `allow read, write: if true` — ai cũng sửa/xoá job của shop khác, sửa `dataInputForm.number_of_output` giữa chừng (giá worker đọc lại mỗi batch), `creditsUsed`, `statusAll`.
- **Files allowed:** `firestore.rules` (được phép rõ cho task này).
- **Approach:** client SDK check: FE không đăng nhập Firebase Auth (chỉ affiliate dùng custom token) → rules không biết shop nào → không scope theo shop được. Client chỉ **đọc** doc cha (`liveGenerateBulk.js` listen; `updateGenerateBulkById` không ai gọi) và chỉ **sửa** item đã có (`ModalEditFaq.jsx:112,187` `setDoc merge` với `metaValue|faqs|publishStatus|updatedAt`). Backend dùng Admin SDK (bỏ qua rules). → doc cha: `read` giữ, `write: false`; items: `read` giữ, chỉ `update` và chỉ 4 field đó (`diff().affectedKeys().hasOnly`), không create/delete.
- **Test command:** Firestore emulator jar cache (`~/.cache/firebase/emulators/cloud-firestore-emulator-v1.19.8.jar`) + REST không auth: ghi doc cha / tạo item / xoá item / sửa `status` item → 403; sửa `faqs` item có sẵn → 200. Script ở scratchpad (repo không có layer test rules, không thêm dep). + full jest suite (không đổi).
- **Risk:** client nào khác ghi `generateBulk` mà grep sót → lỗi quyền. Còn hở: đọc mở + sửa nội dung item của shop khác (đoán được id) vẫn được — cần Firebase Auth custom token cho admin FE (việc riêng).
- **Rollback:** revert commit task 12 + deploy rules.
- **Result:** `6b7650ade9f`. 1 round. Emulator local (jar cache, project `demo-rules`, REST không auth): 10/10 PASS — đọc job/item 200; sửa giá job giữa chừng, tạo/xoá job, tạo/xoá item, sửa `status` item → 403; 2 thao tác của `ModalEditFaq` → 200. Rules cũ: 6/10 FAIL (xác nhận test bắt được lỗi). Script: scratchpad `rules_test.sh` (repo không có layer test rules). Không đổi JS → jest như task 10. Sec: clean, chỉ `firestore.rules`.
- **Deploy:** rules chỉ lên khi deploy `firestore:rules` — không đi theo tag functions.
- **Còn hở:** đọc mở toàn collection + sửa `faqs/metaValue` item shop khác (đoán id) → nội dung bị chèn vào storefront khi merchant bấm publish. Cần FE đăng nhập Firebase Auth (custom token như `useAffiliateRealtime.js:19`) rồi rule `request.auth.token.shopId == resource.data.shopId`. Cùng pattern: `featureReq`, `commentFeatureReq` vẫn `read, write: if true` (`firestore.rules:34-39`).

#### Task 13 — plan
- **Goal:** G23 `POST /api/triggerCron` (`seoController.js:731-742`, route `api.js:158`) dispatch `topic` + `data` tuỳ ý từ body (`dispatchWork(topic, {...data, shop})`), không whitelist, không rate limit.
- **Files allowed:** `controllers/seoController.js`, `routes/api.js`, test.
- **Approach:** caller grep (assets, extensions, scripttag, 4 app kia, speed-up-report, fix-bot): duy nhất Wizard `pages/Wizard/Steps/Configuration.js:43` gửi `{topic:'recursive', data:{action:'build_sitemap'}}`; DevZone dùng `/dev?x=trigger_cron`, không dùng route này. → whitelist `{recursive: ['build_sitemap']}`, chỉ forward `action` (bỏ spread `data`), ngoài whitelist → 400; thêm `redisRateLimit` theo shop (10/phút, `prefix: 'triggerCron'`). Ghi chú: `build_sitemap` không có handler nào trong `src` → call của Wizard hiện là no-op, giữ để không đổi hành vi.
- **Test command:** mới `controllers/__tests__/seoController.triggerCron.test.js` + full suite.
- **Risk:** thấp. Redis down → limiter fail-open (thiết kế sẵn).
- **Rollback:** revert commit task 13.
- **Result:** `90806c8acb9`. 1 round. `controllers/__tests__/seoController.triggerCron` 4/4 (topic lạ / action lạ / rỗng → 400, không dispatch; call của Wizard vẫn dispatch và bỏ field thừa). Full suite: 2 test fail baseline, node:stream flaky. Sec: clean.

### Tổng kết (2026-09-23)
- Branch `fix/security-high-2026-09`: 13 commit trên `origin/master` @ `0547925a9cb`, chưa push. Full suite cuối: 2 test fail = baseline master (`shopify2026Client`, `workListStore`); 4–14 suite "Cannot find module 'node:stream'" (cheerio) lỗi ngẫu nhiên khi chạy song song, pass khi chạy lẻ — không liên quan.
- **BLOCKED:** T1 `get-jsonl-data`/`revert-product` (caller extension ngoài repo); T3 G16 ingress internal (speed-up-report + hosting rewrite); T5 G6 bind key↔shop (FAL-720 migration, key cấp app public trên npm); T9 gỡ `?accessToken=` (client ngoài).
- **Deploy notes:** `SEO_INTERNAL_KEY` cho 3 ops script (T1); GCF lighthouse trước `[deploy-worker]` (T9); `firestore:rules` deploy riêng (T12).
- **Deploy notes (round 3):**
  - Lighthouse interception mọi request (+ DNS lookup mỗi request, service worker tắt) có thể đẩy TTFB/LCP lên so với PSI → audit 3 store thật trước/sau, so với PSI, rồi mới cắt tag.
  - Repo không mint key `internalKeys` nào có `devZone:true` → `/proxy/republish`, `/proxy/updateObfucate`, `/reset` trả 403 cho tới khi mint 1 key devZone (và đặt vào `SEO_INTERNAL_KEY`).
  - **Hỏi Tuan:** cho phép test charge dựa vào `shop.email` (sync từ Shopify) kết thúc bằng `@avada.io`/`@mageplaza.com`/... — merchant có tự đặt email store thành đuôi đó mà không cần verify được không? Nếu được → test charge = credit miễn phí; cần đổi sang allowlist shopId/domain.

## Round 2 — review độc lập FAIL (4 bug + 7 risk), 2026-09-23

#### Task 10 r2 — plan (bug 4)
- **Goal:** gỡ regression `withoutPlaintextToken` ở cache shop (`shopRepository.js` getShopById/getShopByShopifyDomain/getShopByDomainCached).
- **Approach:** caller đọc `shop.accessToken` thô từ `getShopById`: `subscribeSendEmailPendingCharge.js:37`, `uninstallationService.js:61`, `shopProbe/classifyToken.js:20`, `commands/checkObfucatedSnippet.js:47`, `commands/testBulkOpWebhook.js:59`; `prepareShopData` chỉ ưu tiên hash khi có `accessTokenKey` (box worker không có env đó → cần plaintext). Đề xuất "chỉ strip ở value ghi cache" không đủ: cache HIT trả chính value đã strip → vẫn vỡ. → **gỡ hẳn** strip ở cache shop; phần integration cache (sha256 key, không token) giữ nguyên. G20 phần shop → BLOCKED tới khi mọi caller giải mã từ hash và mọi runtime có key.
- **Test:** thay `shopRepository.withoutPlaintextToken.test.js` bằng `shopRepository.cacheKeepsToken.test.js`: cache miss rồi hit đều trả `accessToken` (fail trên HEAD hiện tại).
- **Rollback:** revert commit.
- **Result r2:** `7add1e16db8`. Test `shopRepository.cacheKeepsToken` fail 1/1 trước, pass sau; `credentialCache` vẫn xanh. Suite 1960 pass / 2 fail baseline. Sec: clean. `shopRepository.js` về đúng bản trước task 10.

#### Task 4 r2 — plan (bug 1, 2, 3 + risk 5, 7, 8)
- **Goal:** (1) `activateCart` chạy song song N lần → cộng credit N lần (read-modify-write); (5) charge `test:true` vẫn ACTIVE → shop thường tự mua bằng test charge; (3) `getMetaSuggestion` chỉ gate `isLimitOrOutOfCredit` rồi `reduceCredits` kẹp về 0 không transaction → 1 credit mua 1000 FAQ; (2) giá dùng `faqCreditCost` nhưng prompt nhận `numberOfFaqs` thô; (8) worker `chargeCredits()` exceeded vẫn lưu FAQ; (7) `reduce-credit` nhận 0 / 0.001.
- **Files allowed:** `controllers/creditCartController.js`, `repositories/creditBundleRepository.js`, `repositories/shopRepository.js` (thêm `incrementCreditQuota`, `refundAIUsage`), `controllers/aiChatController.js`, `handlers/pubsub/subscribeGenFaq.js`, `controllers/shopController.js`, `helpers/aiCredit/clientCreditGuard.js`, test.
- **Approach:** (1) `activateCreditBundle(chargeId)` transaction pending→active, chỉ bên thắng cộng `FieldValue.increment(totalCredits)`; (5) query `{status test}`, `test:true` chỉ nhận khi email shop thuộc `TEST_EMAIL_DOMAINS` (giống checkout); (3) `incrementAIUsage(shopID, creditsUsed)` trước handler, exceeded → 402, handler lỗi → `refundAIUsage` (transaction, trả metaCount trước rồi quota); log usage chỉ khi thành công; (2) chuẩn hoá `numberOfFaqs` 1 lần (số nguyên ≥1), dùng chung cho giá + prompt, cả route lẫn worker; (8) exceeded → `markError('Not enough credits')`, không lưu nội dung; (7) `amount` phải số nguyên ≥1 → 400. Ghi lại: FE tự báo `amount` cho `reduce-credit` sau khi đã gọi AI = thiết kế sai, chuyển trừ credit về server là ticket riêng.
- **Test:** mở rộng `controllers/__tests__/credit.selfGrant.test.js` + mới `aiChatController.creditGate.test.js` + `subscribeGenFaq.pricing.test.js`; mỗi case chạy fail trên HEAD trước.
- **Risk:** Wizard/màn hình gửi `amount: 0` cho reduce-credit nhận 400 thay vì no-op (không trừ gì, giống trước).
- **Rollback:** revert commit.
- **Result r2:** `5079d89c3ec`. Test mới/mở rộng fail trên HEAD trước (selfGrant+activate 6 fail, aiChat+genFaq pricing 14 fail, reduceCredit.amount 6 fail), pass sau: 52/52. Suite 1966 pass / 2 fail baseline (`shopify2026Client`, `workListStore`) + flake `node:stream`. Sec: fixed.
  - `activateCreditBundle` (transaction) thay `updateShopData`+`updateCreditBundleStatus`; test 5 call song song → 1 true, quota +5000 đúng 1 lần. Chỉ bên thắng update charge doc.
  - aiChat giữ `isLimitOrOutOfCredit` làm fast-path, charge thật là `incrementAIUsage`; `reduceCredits` bỏ khỏi controller.
  - Grep caller `incrementAIUsage` sau khi siết số nguyên: `generateBulkPreview` (`Number(x)||5`, 2.5 giờ throw thay vì trừ 2.5 — fail closed, giá = prompt sẵn), `generateAgain` → `Math.floor` requestedFaqs, anchor text = 1. FE `useAiCredit` gửi `aiFixableCount` trong `finally`, 400 bị catch → không vỡ UI.
- **Ticket riêng (ghi nhận, không làm):** `POST /shop/reduce-credit` để browser tự khai số credit sau khi AI đã chạy (audit Fix-all) → merchant gửi `amount:1` hoặc không gọi = dùng miễn phí. Phải chuyển trừ credit về server trong luồng fix-all.

#### Task 9 r2 — plan (risk 6)
- **Goal:** `performAudit` log `params` nguyên cục ở debug → từ khi password chuyển sang header, `passwordStore`/`passwordQuery` rơi vào log.
- **Files allowed:** `controllers/lightHouseController.js`, test.
- **Approach:** bỏ 2 field khỏi object trước `logger.debug`. Grep `lightHouseService`: các log còn lại chỉ url/shopId/viewOption, `auditUrl` không chứa password.
- **Test:** `controllers/__tests__/lightHouseController.logRedact.test.js`, header password không xuất hiện trong mọi mức log; fail trên HEAD (log chứa `store-secret-1`).
- **Risk:** không, chỉ đổi log.
- **Rollback:** revert commit.
- **Result r2:** `ea8f8c75879`. Test 1 fail → pass; lighthouse tests 8/8. Suite 1957 pass / 2 fail baseline + flake `node:stream`. Sec: clean.

#### Task 3 r2 — plan (risk 10)
- **Goal:** `assertSafeUrl` chỉ check URL đầu + `lookup` 1 địa chỉ; Chrome tự resolve lại (rebinding), theo redirect và tải subresource/iframe tới IP nội bộ tuỳ ý. `isPrivateIp` thiếu `::`, 100.64/10 (CGNAT), 198.18/15, 224/4 trở lên.
- **Files allowed:** `helpers/security/ssrfGuard.js`, `services/lightHouseService.js`, test.
- **Approach:** thêm dải chặn; `assertSafeUrl` dùng `lookup(host, {all:true})`, chặn nếu bất kỳ địa chỉ nào private. Thêm `guardPageRequests(page)`: `page.setRequestInterception(true)`, mỗi request http(s) (document, redirect hop, subresource, iframe) qua `assertSafeUrl` (cache verdict theo host trong 1 audit), private → `abort('blockedbyclient')`; `data:`/`blob:` cho qua, scheme khác abort. `auditLightHouse` bật guard trên page trước `goto` password và **truyền `page` cho lighthouse** (tham số thứ 4, LH 12.8.2 + ag-lighthouse 12.2.1 đều có) — nếu không LH tự mở tab mới ngoài guard. LH không dùng domain `Fetch` (grep 0) nên không xung đột; throttling `simulate` nên độ trễ interception không lệch điểm.
- **Test:** `ssrfGuard.test.js` thêm case dải mới + `assertSafeUrl` với lookup all (1 public + 1 private → chặn) + `guardPageRequests` (abort private/metadata/file:, continue public/data:); `lightHouseService.requestGuard.test.js` kiểm auditLightHouse bật interception trước goto và truyền page cho lighthouse. Fail trên HEAD trước.
- **Risk:** còn TOCTOU giữa lookup của guard và resolve của Chrome (TTL 0 rebinding) + request từ service worker không qua interception → chặn triệt để phải ở mạng (egress firewall/VPC deny RFC1918 + metadata cho service lighthouse) — ghi ticket hạ tầng. Storefront dùng CDN IP 198.18/15 hay 100.64/10: không phải IP public hợp lệ, không ảnh hưởng.
- **Rollback:** revert commit.
- **Result r2:** `3f0ae2d8b62`. Test fail trên HEAD trước: 13/22 (8 dải mới, 2 assertSafeUrl all, 2 guardPageRequests, 1 auditLightHouse truyền page). Sau: 31/31 (security + lighthouse). Suite 1970 pass / 2 fail baseline; 6 suite fail thêm đều `node:stream` flake, chạy lại `-i` 56/56. Sec: fixed (còn TOCTOU rebinding + service worker).
- **Ticket hạ tầng (ghi nhận, không làm):** egress firewall / VPC deny 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10 cho Cloud Run lighthouse và box worker chạy lighthouse — đóng rebinding mà code không đóng được. `ssrfGuard` dùng chung với `seoSpeed.js` + `devController.js` → dải mới áp luôn cho 2 chỗ đó.

#### Task 1 r2 — plan (risk 9 + 11)
- **Goal:** (9) `requireInternalKey` nhận mọi internal key đang active, kể cả key support thường (`devZone:false`) → key cấp cho TS AI đọc dữ liệu cũng republish được theme bất kỳ shop. (11) `republishRecentShops.js` gửi `Bearer undefined` khi thiếu env, không check `resp.ok` → chạy "xong" mà 0 shop được republish, không ai biết.
- **Files allowed:** `middleware/requireInternalKey.js`, `commands/republishRecentShops.js`, `commands/checkObfucatedSnippet.js`, `commands/updateCdnExtensions.js`, mới `helpers/ops/internalRepublish.js`, test.
- **Approach:** middleware: key hợp lệ nhưng `devZone !== true` → 403. Script: helper `internalAuthHeader()` throw khi `SEO_INTERNAL_KEY` rỗng (gọi trước mọi fetch/Firestore read ở cả 3 script); `republishShops(ids, {fetchImpl, key})` đếm non-2xx, script log số lỗi + status.
- **Test:** `requireInternalKey.test.js` thêm case key không devZone → 403 + case devZone → next; mới `helpers/ops/__tests__/internalRepublish.test.js` (env rỗng → throw trước fetch; 1/3 non-2xx → `failed` = 1 kèm status). Fail trên HEAD.
- **Risk:** `SEO_INTERNAL_KEY` đang dùng phải là key `devZone:true`, nếu không republish trả 403 — ghi deploy note.
- **Rollback:** revert commit.
- **Result r2:** `fd368211b9f`. Test fail trên HEAD: requireInternalKey 1 fail (key không devZone lọt qua), `internalRepublish` suite không load được. Sau: 35/35 (middleware + ops). 3 script parse OK bằng babel (không chạy — cần serviceAccount prod). Suite 1993 pass / 2 fail baseline + flake `node:stream`. Sec: fixed.
- **Deploy note:** `SEO_INTERNAL_KEY` dùng cho 3 script phải là key `devZone:true`, không thì republish/updateObfucate trả 403. Script giờ dừng trước mọi read nếu env rỗng.

#### Task 2 r2 — plan (risk 9)
- **Goal:** `resetGen2` (revert-all / xoá history) nhận mọi internal key active, kể cả key support read-only.
- **Files allowed:** `handlers/reset.js`, test.
- **Approach:** key hợp lệ nhưng `devZone !== true` → 403, trước khi đọc shop.
- **Test:** `handlers/__tests__/reset.auth.test.js` thêm case key `devZone:false` + key cũ không có field → 403, không gọi `getShopByField`; case DevZone key vẫn chạy. Fail trên HEAD.
- **Risk:** support đang dùng key không devZone cho `/reset` sẽ bị 403 → cấp key devZone.
- **Rollback:** revert commit.
- **Result r2:** `0f7a52135e4`. Test 2 fail trên HEAD → 6/6 pass. Suite 1985 pass / 2 fail baseline + flake `node:stream`. Sec: fixed.

### Tổng kết Round 2 (2026-09-23)
- 6 commit: `7add1e16db8` (T10), `5079d89c3ec` (T4), `ea8f8c75879` (T9), `3f0ae2d8b62` (T3), `fd368211b9f` (T1), `0f7a52135e4` (T2). Không push/deploy.
- 4 bug + 7 risk: đã xử lý hết. Bug 4 (T10 shop cache) xử lý bằng cách revert → G20 phần shop BLOCKED.
- Ticket mới cần mở: (a) chuyển trừ credit của `reduce-credit` về server (FE tự khai amount); (b) egress firewall cho runtime lighthouse (rebinding).
- Deploy note thêm: `SEO_INTERNAL_KEY` + key support dùng `/reset` phải là `devZone:true`.

## Round 3 — re-review (11/11 round-1 đóng; 1 bug + 3 risk), 2026-09-23

#### Task 4 r3 — plan
- **Goal:** (bug) `reduceCredits` (`shopRepository.js:1139`, caller duy nhất `bulkAuditFix/productWorker.js:537`) đọc shop qua `getShopById` (cache 5 phút, `incrementAIUsage` không invalidate) rồi ghi tuyệt đối `AICreditQuota`/`AIUsage` → cache cũ hồi sinh credit đã tiêu; đọc trước `activateCreditBundle` + ghi sau → xoá bundle đã trả tiền. (risk) `afterUpgrade` ghi `AICreditQuota` tuyệt đối từ shop đọc trước → lost update với bundle/charge. (risk) `generateAgain` giá dùng `Math.floor`, prompt nhận `number_of_output` thô qua `...dataInputForm`. (risk) `guardPageRequests` cache verdict theo origin vĩnh viễn → rebinding sau lần check đầu lọt; service worker không qua interception.
- **Files allowed:** `repositories/shopRepository.js`, `services/subscriptionService.js`, `controllers/generateBulkController.js`, `helpers/security/ssrfGuard.js`, `services/lightHouseService.js`, test.
- **Approach:** `reduceCredits` → `runTransaction`: đọc doc live, clamp trong transaction, ghi dotted `AIUsage.metaCount` + `AICreditQuota`, rồi invalidate cache. `afterUpgrade`: bỏ `AICreditQuota` khỏi payload ghi shop; gói credit → `incrementCreditQuota(shopId, credits)` (`FieldValue.increment`, tách riêng vì `updateShopData`/`handleWizardFinish` chạy qua `formatDateFields`). `generateAgain`: `faqCreditCost(number_of_output)` 1 lần cho cả `requestedFaqs` và `aiReq.numberOfFaqs` (đặt sau spread). ssrfGuard: bỏ cache theo origin (lookup mỗi request); chặn service worker bằng `browser` target filter không có trong API puppeteer 24 launch đã chạy → dùng CDP `ServiceWorker.disable`? → xem khả thi, không thì ghi lại.
- **Test:** mới `shopRepository.reduceCredits.atomic.test.js` (fake Firestore + cache cũ: cache cao không hồi sinh credit; activate xen giữa không mất bundle); `subscriptionService.enterpriseAlert.test.js` thêm case gói credit/không gói; `generateBulkController` generateAgain prompt = giá; `ssrfGuard.test.js` host đổi IP giữa 2 request → request 2 bị chặn. Fail trên HEAD trước.
- **Risk:** lookup DNS mỗi request lighthouse → thêm độ trễ (OS cache DNS; throttling simulate). `afterUpgrade` gọi 2 lần cho cùng charge vẫn cộng 2 lần (trước đây cũng vậy khi đọc cache) — ghi nhận.
- **Rollback:** revert commit.
- **Result r3:** `d91a09845e7`. Test mới fail trên HEAD: reduceCredits 2 (cache cũ → quota 490 thay vì 0; bundle 5010 → 5), afterCharge 2 (ghi `AICreditQuota: 10` tuyệt đối, không increment), generateAgain 3 (prompt nhận `'1, then 40 more'`/`'0'`/2.9 thô), ssrfGuard 2 (rebind request 2 lọt; không chặn SW). Sau: 97/97 (repositories + subscriptionService), 65/65 (generateBulk + security + lighthouse + bulkAuditFix). Suite 2001 pass / 2 fail baseline; 5 suite `node:stream` flake chạy lại `-i` 25/25. Sec: fixed.
  - `reduceCredits`: transaction trên doc live, clamp trong transaction, ghi dotted `AIUsage.metaCount` (giữ field khác của AIUsage), invalidate cache.
  - `afterUpgrade`: bỏ `AICreditQuota` khỏi payload; gói credit → `incrementCreditQuota` (`FieldValue.increment`), plan thường không đụng quota. Còn: `afterUpgrade` chạy 2 lần cho cùng charge vẫn cộng 2 lần (không idempotent theo chargeId) — ghi nhận, không làm.
  - `generateAgain`: `faqCreditCost` 1 lần → giá + `aiReq.numberOfFaqs` (đặt sau spread). Thay đổi: thiếu `number_of_output` giờ hỏi 1 FAQ, giá 1 (trước: prompt mặc định, giá = số FAQ sinh ra) — khớp worker bulk từ r2.
  - ssrfGuard: bỏ cache verdict, lookup mỗi request. Service worker: `setBypassServiceWorker(true)` + `evaluateOnNewDocument` cho `register` reject. Không dùng `targetFilter` của puppeteer: nó chỉ quyết định puppeteer attach target nào, không chặn SW đăng ký. Còn hở: iframe realm mới có thể chưa bị patch trước script chạy → đóng hẳn = egress firewall (ticket đã ghi).

## Round 4 — re-review d91a09845e7 (1 đường credit free + SSRF perf), 2026-09-23

#### Task 4 r4 — plan
- **Goal:** `incrementAIUsage` + `incrementImageOptimizeAIUsage` charge trong transaction nhưng không xoá cache `shop:${id}*` → `getShopById` giữ `AIUsage.metaCount` cũ 5 phút. `POST /api/subscription/before-downgrade` (merchant gọi lặp được) ghi `AIUsage: {...shop.AIUsage, subscriptionEndsAt}` từ shop cache → metaCount cũ ghi đè → credit plan đã tiêu quay lại, lặp vô hạn. `afterDowngrade` (4 nhánh) + `afterUpgrade` trial-from-free spread cùng kiểu.
- **Files allowed:** `repositories/shopRepository.js`, `controllers/subscriptionController.js`, `services/subscriptionService.js`, test.
- **Approach:** thêm `cacheDelByPattern(`shop:${shopId}*`)` sau 2 transaction khi charge thành công. Đổi mọi ghi `AIUsage: {...shop.AIUsage, x}` ở đường merchant chạm được sang field path `'AIUsage.x'` (`updateShopData` đưa key có dấu chấm thẳng vào `update()`). `afterUpgrade` trial-from-free: không ghi `metaCount` (giữ giá trị live) thay vì ghi lại số đọc từ đầu `afterCharge`.
- **Không đổi (chỉ liệt kê):** cron `subscribeUpdateNewSubscriberCredits.js:119`, `subscribeUpdateShopsWithAIUsageSubscriptionExpiredToday.js:27`; DevZone-only `devController.js:1524` (grant credit), `:1837` (sửa subscriptionEndsAt), `:2242` (reset credit) — staff CRM login-as, merchant không gọi được.
- **Test:** mới `shopRepository.creditCache.test.js` (repo thật + fake Firestore + fake Redis có xoá thật): charge rồi before-downgrade trong TTL → metaCount không quay lại; doc live đổi bởi writer khác rồi before-downgrade → không ghi đè; image-optimize charge xoá cache. `subscriptionService.enterpriseAlert.test.js`: afterDowngrade/afterUpgrade không ghi object `AIUsage`. Fail trên HEAD trước.
- **Risk:** nhánh chọn trong `afterDowngrade` vẫn dựa trên shop đọc trước (chỉ phần ghi thành field-level).
- **Rollback:** revert commit.
- **Result r4:** `0853fda2ac0`. Test fail trên HEAD: `shopRepository.creditCache` 4/4 (metaCount về 10 sau charge 60 + before-downgrade; ghi đè 90 → 10; cache không xoá sau 2 loại charge), afterCharge field-path 3/3 (chạy test với bản HEAD của `subscriptionService.js`). Sau: 4/4 + 13/13. Suite 2015 pass / 2 fail baseline + `jobRegistryService` lệch 1ms timestamp (flake, chạy lại `-i` pass) + `node:stream` flake. Sec: fixed.
- **Spread `...shop.AIUsage` còn lại, không đổi:** cron `handlers/pubsub/subscribeUpdateNewSubscriberCredits.js:119`, `handlers/pubsub/subscribeUpdateShopsWithAIUsageSubscriptionExpiredToday.js:27`; DevZone-only `controllers/devController.js:1524` (grant credit), `:1837` (sửa subscriptionEndsAt), `:2242` (reset credit). Cùng lớp lỗi (ghi lại metaCount cũ), merchant không gọi trực tiếp; nên đổi sang field path ở ticket riêng.

#### Task 3 r3 — plan (SSRF perf + WebSocket)
- **Goal:** r2 bỏ cache → `dns.lookup` mỗi request, không timeout, trên libuv pool 4 thread; 150–300 request/store → metric phình / audit timeout, mà vẫn không đóng được rebinding. `ws:`/`wss:` không đi qua Fetch interception.
- **Files allowed:** `helpers/security/ssrfGuard.js`, test.
- **Approach:** verdict cache theo hostname **trong 1 audit** (Map tạo trong mỗi lần `guardPageRequests`, không dùng chung giữa audit); lookup đang chạy được gộp (lưu promise); timeout ~2s → chặn. WebSocket: check host đồng bộ trong trang không làm được (constructor sync, DNS async; đóng sau `Network.webSocketCreated` là đã gửi handshake) → `evaluateOnNewDocument` thay `WebSocket` bằng constructor throw, chặn hết ws/wss trong audit (audit performance không cần).
- **Test:** `ssrfGuard.test.js`: thay test "re-check mọi request" bằng: 1 lookup/host trong 1 audit, audit mới lookup lại; 3 request song song cùng host → 1 lookup; lookup treo → chặn sau timeout; `new WebSocket('ws://10.0.0.1')` throw, constructor gốc không được gọi. Fail trên HEAD.
- **Risk:** store dùng WebSocket (live chat) mất request đó trong audit → điểm có thể lệch nhẹ so với PSI (nằm trong bước audit 3 store trước khi cắt tag). Còn hở: iframe `about:blank` realm mới, fetch lúc SW install, WebRTC/STUN (UDP) → ticket egress firewall.
- **Rollback:** revert commit.
- **Result r3:** `5a26663764b`. Test fail trên HEAD 4/26 (lookup mỗi request, không gộp, không timeout — 2 test treo tới 5s jest timeout, WebSocket không bị chặn). Sau: 26/26 ssrfGuard, 36/36 cùng lighthouse. Suite 2001 pass / 2 fail baseline + `node:stream` flake (chạy lại `-i` 53/53). Sec: fixed trong phạm vi code; rebinding + iframe `about:blank` + fetch lúc SW install + WebRTC/STUN còn hở → ticket egress firewall.

#### Task 14 — plan (added 2026-09-23 from blocklist audit)
- **Goal:** merchant ghi field bị chặn qua `POST /shop` / `POST /proxy/shop/update` → `updateShopData`: (1) `removeFields(postData, blockFields)` không bỏ key có dấu chấm → `{"plan.name": ...}` ghi vào `plan`; (2) gate `privilegedFields` so key chính xác → `{"noLimit.x": true}`, `{"grantedFeatures.0": ...}` lọt; (3) `imageOptimizeFreeUsage` gộp lại từ `postData` thô sau khi strip → merchant tự reset bộ đếm; (4) `isShopLimit100Image`, `imageOptimizeExtendLimit` merchant ghi được → quota x15 / tuỳ ý; (5) `excludeOptimizeImageLimit` (hiện `isExcludeLimit` chết, để lâu là mìn).
- **Grep thêm cùng lớp:** `POST /api/shop/status` (`shopController.setStatus`) đưa **nguyên body** vào `updateAppStatus` → `collection.doc().update(postData)` trực tiếp, không qua blockFields/privileged/credit strip → merchant tự set `plan`, `noLimit`, `AICreditQuota`, `email`. FE chỉ gửi `{appStatus}` (`BannerEnable.js:29`, `Settings/General.js:32`). `POST /api/shop/unlockSpeed` (`setSpeed`) ghi nguyên body qua `updateShopData` không `stripCreditFields`; không có caller FE.
- **Files allowed:** `helpers/aiCredit/clientCreditGuard.js`, `repositories/shopRepository.js`, `config/pickFields.js`, `controllers/shopController.js`, `controllers/devController.js`, test.
- **Approach:** tách predicate first-segment trong `clientCreditGuard` thành `stripFieldPaths(obj, fields)` export, `stripCreditFields` dùng lại nó; `updateShopData` áp nó cho `blockFields` (sau `removeFields`) và `privilegedFields` (phát hiện + strip theo first segment). Bỏ re-merge `imageOptimizeFreeUsage`. 4 field ảnh vào **`privilegedFields`**, không phải `blockFields`: writer FE duy nhất là DevZone (`PHSContainer`, `TSToolsContainer`, `OptimizeImageContainer`) mà `blockFields` strip cả DevZone; install ghi `isShopLimit100Image` qua `updateAppStatus` (không qua `updateShopData`) nên không ảnh hưởng; writer server duy nhất `devController` `reset_product_count_image` → truyền `{privileged: true}`; tăng bộ đếm đi `incrementImageOptimizeFreeUsage` (transaction riêng). `setStatus` chỉ chuyển `{appStatus}`; `setSpeed` qua `stripCreditFields`.
- **Test:** `shopRepository.updateShopData.privileged.test.js` thêm: mọi dạng key (thường + chấm) của `plan`/`email`/`noLimit`/`grantedFeatures`/4 field ảnh bị strip cho merchant; `imageOptimizeFreeUsage: 0`/`5` không ghi; DevZone (`privileged`) vẫn ghi được 4 field ảnh. Mới `shopController.setStatus.test.js`: body `{appStatus, plan, AICreditQuota, noLimit}` → `updateAppStatus` chỉ nhận `{appStatus}`. Fail trên HEAD.
- **Risk:** DevZone ghi 4 field ảnh cần session login-as thật (như noLimit) — đúng như PHS/TS tools đang dùng.
- **Rollback:** revert commit.
- **Result:** `4fc38f2d5c6`. Test fail trên HEAD: updateShopData 13 (mọi dạng dotted + 4 field ảnh + counter), shopController 2 (`/shop/status` ghi nguyên body gồm `plan`/`noLimit`/`AICreditQuota`/`email`; `/shop/unlockSpeed` đưa `AICreditQuota`). Sau: 144/144 (repositories + shopController + selfGrant + aiCredit). Suite 2022 pass / 2 fail baseline + `node:stream` flake (chạy lại `-i` 36/36). Sec: fixed.
- **Nặng nhất:** `POST /api/shop/status` — mọi merchant ghi được bất kỳ field shop nào (plan Enterprise, noLimit, credit tuỳ ý) vì `updateAppStatus` update thẳng doc. Có trên master → cần check 4 app kia có pattern `updateAppStatus(shopify, shop, ctx.req.body)` không.
- **Còn lại (ghi nhận):** `setSpeed` vẫn truyền `{...shop, ...ctx.req.body}` vào `updateAssets` (chỉ ảnh hưởng asset render, không ghi doc); route không có caller FE → nên gỡ.
