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
| 1 | G8 4 route `/proxy/*` không auth | ✅ partial / 🚧 BLOCKED | 1 | clean | `952e9ea55a5` republish+updateObfucate → internal key. get-jsonl-data + revert-product BLOCKED: caller = revert image extension ngoài repo |
| 2 | G14 `resetGen2` public | ✅ | 1 | clean | `8bdca8a0d63` internal key trong handler; export + rewrite giữ nguyên |
| 3 | G15 lighthouse SSRF + G16 internalTools | ⏳ | | | |
| 4 | G5 credit AI + G22 activateCart | ⏳ | | | |
| 5 | G6/G7 integration key | ⏳ | | | |
| 6 | G9 `?shopId=` + G13 Pub/Sub | ⏳ | | | |
| 7 | G11/G12/G17 ownership | ⏳ | | | |
| 8 | G10/G19/G21 redact | ⏳ | | | |
| 9 | G4/G18 token log + secret in URL | ⏳ | | | |
| 10 | G20 Redis cache credential | ⏳ | | | |
| 11 | G1 credential → env | ⏭ SKIP | — | — | chờ Tuan rotate |
| 12 | G3 `firestore.rules` generateBulk | ⏳ | | | |
| 13 | G23 `triggerCron` | ⏳ | | | |

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
