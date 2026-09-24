# 03 — IMG-OPT security fix (high)

Repo: `projects/Falcon/avada-image-optimizer`. Base: `origin/master` @ `709f11f6`. Luật chung: `README.md`.
Verify: `verify/IMG-OPT.md` — 68 row → **32 real**, 28 dup, 8 already-fixed (G6 `/api/dev` đã có
gate `canAccessDevZone`), 0 refuted.

**Trạng thái: CHỜ TUAN DUYỆT danh sách nhóm dưới đây.** Chưa task nào được dispatch.

## Tuan làm tay trước (ROTATE)

- G1 npm registry token — `.npmrc`, `.yarnrc.yml`, `packages/functions/.npmrc` (token dùng chung fleet)
- G2 Crisp + Google Translate key — `crisp.js`, `autoTranslateV2.js`
- G3 **token Shopify prod + script giải mã** — `getAT.js`. Cân nhắc scrub git history
- G5 integration key merchant đọc/mint được → rotate các key đã lộ

**Token merchant nằm trong log (G13).** `shopifyService.initShopify()` log token **đã giải mã**
của mọi shop ở mỗi lần gọi Shopify API. Log hiện có = token đã lộ ra ai đọc được log. Sau khi vá:
xoá/rút retention log cũ, liệt kê ai có quyền đọc log project `app-plaza-image-optimizer`.
Token offline Shopify không tự rotate được hàng loạt — đây là điểm cần mày quyết.

## Tasks (sau khi duyệt)

| # | Nhóm | Agent / Model | Loại | Ghi chú |
|---|---|---|---|---|
| 1 | G13 ngừng log token/password/shop doc (`shopifyService.js`, `lightHouseService`, `uninstallationService`) | general-purpose / sonnet | code | **làm đầu tiên** — mỗi giờ chưa vá là thêm token vào log |
| 2 | G1–G3 gỡ credential → env, xoá `getAT.js` | cavecrew-builder / haiku | code | sau khi Tuan báo đã rotate |
| 3 | G11 ghi shop không allow-list → `isDevZone` vượt `blockFields` → SSRF/lấy token qua `makeGraphQlApi` | general-purpose / opus | auth | nặng nhất; code tự nhận là known (FAL-573) |
| 4 | G12 webhook HMAC so sánh không constant-time + env bypass toàn cục | general-purpose / opus | auth | `timingSafeEqual`, bỏ bypass ở prod |
| 5 | G8 route `/public` revert + jsonl-export không auth | general-purpose / opus | auth | agent đã kiểm: không có caller public hợp lệ |
| 6 | G7 IDOR: tin doc id từ client, 9 call site (revert/optimize-store/historyOptimize/feature-req) | general-purpose / opus | auth | 1 helper `assertOwned(shopId, doc)` rồi áp 9 chỗ |
| 7 | G5 integration key đọc/mint được (`integrationKeyController.js`, `PartnerKey.js`) | general-purpose / opus | auth | phần bind-shop = FAL-720 → tách nếu cần migration |
| 8 | G10 response trả `accessTokenHash` của chính shop (`seoController` error path, `shopRepository` reload) | cavecrew-builder / haiku | code | field mask |
| 9 | G9 shop doc nguyên con vào Pub/Sub (`revertController`, `seoController`) | general-purpose / sonnet | code | chỉ gửi `shopId`; kiểm consumer |
| 10 | G4 `firestore.rules` (7+2 collection) + `storage.rules` mở, không scope shop | general-purpose / opus | rules | file cấm §8 → **được phép rõ ràng**. Kiểm custom claim `shopId` có tồn tại không; không có → tách migration |

## Test

Mỗi task: test hồi quy đúng exploit, rồi test suite `packages/functions`. Task 1: grep log call
còn in `accessToken`/`password` = 0. Security check §8.

## Progress

Worktree `projects/Falcon/avada-image-optimizer-wt-security-high`, branch `fix/security-high-2026-09`
từ `origin/master` 709f11f6. Deps: `yarn install --immutable` (yarn 4.13.0 của repo).

| # | Task | Status | Rounds | Sec | Notes |
|---|---|---|---|---|---|
| 1 | G13 log leak | ✅ 7c3416f5 | 1 | clean | `shopifyService.js:39` KHÔNG sửa ở đây — đã xoá trên hotfix `hotfix/stop-logging-access-token` (1ecbd824); để nguyên tránh conflict; test `logRedaction.test.js` fail trước fix, pass sau |
| 2 | G1–G3 credential | ⏭ skip | — | — | chờ Tuan rotate |
| 3 | G11 isDevZone / shop write | ✅ 7da77d6a + c2e02550 + 694f3d8a | 3 | fixed (review 🔴1 🔴2 + billing) | allow-list đầy đủ KHÔNG làm (FE ghi ~25 field khác nhau) — giữ blockFields + strip identity; aiController:1591 bỏ isDevZone ở round 2 |
| 4 | G12 webhook HMAC | ✅ c87fe85b | 1 | clean |  |
| 5 | G8 `/public` revert + jsonl | ✅ 19bbcdd4 | 1 | clean | xoá hẳn thay vì chuyển sang /api — 0 caller |
| 6 | G7 IDOR | ✅ faed2cd1 + 15cc6138 + 2e76ff82 | 3 | fixed (review 🔴3 + progress regression) |  |
| 7 | G5 integration key | ✅ 235c57c5 | 1 | clean | bind-shop (FAL-720) tách ticket — migration; key đã lộ cần rotate |
| 8 | G10 accessTokenHash trong response | ✅ 37055c80 | 1 | clean |  |
| 9 | G9 shop doc vào Pub/Sub | ✅ 182a64b0 | 1 | clean | chỉ topic `scanSpeedScoreV2`; còn ~13 publishTopic mang `{shop}` (recursive, createPreviewImages, OPTIMIZER_PUB_SUB_V2…) → follow-up theo từng consumer |
| 10 | G4 firestore/storage rules | 🚫 BLOCKED | 0 | — | Firestore: embed không đăng nhập Firebase Auth → scope theo claim làm gãy progress bar/vote; storage.rules không được deploy (firebase.json không có key `storage`) → cần migration + sửa firebase.json, tách ticket |
| 11 | Quota check-then-deduct race (added 2026-09-23 from billing review) | ✅ eece3ba4 + 87b03289 (image path) | 2 | clean (re-review hardening) | speedAudit/multi chưa sửa — cần transaction/lock, follow-up |

### Log

#### Task 1 — G13
- Goal: không log call nào in token/password/shop doc.
- Files allowed: `services/lightHouseService.js`, `services/uninstallationService.js`, 1 test mới.
- Approach: `lightHouseService.js:117` log `urlWithParams` (query có `passwordStore`) → log `shopId,url,device`; `:322` log `passwordStore` rõ → log câu cố định; `uninstallationService.js:15` `JSON.stringify(shop)` (có `accessTokenHash`) → `shop.id, shopifyDomain`. Grep còn lại: `handlers/{api,apiV2,apiSa,apiSaV2,public}.js` log `ctx.state.user.shop` — embed session không có key `shop` (`avada-core verifyToken.ts:79` set `{shopID, shopifyDomain, shopData}`), không phải shop doc → để nguyên. `commands/getAT.js:9` thuộc task 2.
- Test: `yarn workspace @avada/functions test` + `__tests__/services/logRedaction.test.js`.
- Risk: thấp — chỉ đổi nội dung log.
- Rollback: revert commit.
- Kết quả: commit 7c3416f5. Suite: baseline origin/master 11 suite / 25 test fail (có sẵn, env: Firestore/Firebase app không init, flaky `sendReviewNotification`); sau task 11/24 fail, cùng tập, +3 pass. Chạy test phải `env -u GOOGLE_APPLICATION_CREDENTIALS` (shell trỏ file SA không tồn tại → mọi suite import `@avada/core` chết). Grep `console.*(accessToken|password)` còn lại: chỉ `shopifyService.js:39` (hotfix) + `getAT.js:9` (task 2).

#### Task 3 — G11 isDevZone / shop write
- Goal: merchant không tự bật `isDevZone` qua `POST /api/shop` để vượt `blockFields`, không ghi được `shopifyDomain` (host nhận token của `makeGraphQlApi`, `helpers/api.js:92-103`).
- Files allowed: `controllers/shopController.js`, `config/pickFields.js`, 1 test.
- Approach: `shopController.set` (`:184-192`) copy body, xoá `requestImmutableFields` (`id, shopifyDomain, accessToken, accessTokenHash, scope, uid, isCrmLogin`), xoá `isDevZone` trừ khi `canAccessDevZone({user})` (`helpers/devZoneAccess.js`, claim `isCrmLogin === true`). `updateShopData` (`shopRepository.js:201-206`) giữ nguyên cho caller nội bộ.
- Caller check: `isDevZone:'true'` chỉ gửi từ DevZone (`assets/.../DevZone/DevZone.js:144`, `hooks/api/useEditShop.js:31` `handleShopApi` — chỉ DevZone dùng; `ImproveSpeed.js` dùng `updateShop`, không kèm cờ). DevZone chỉ render cho CRM session (`canRenderDevZone`) → không gãy. Không FE nào ghi `shopifyDomain`/`accessTokenHash` qua `/shop`.
- Test: `__tests__/controllers/shopControllerSetDevZoneGate.test.js` (3 case: merchant, claim `'true'` string, CRM) — fail 3/3 trước fix, pass sau. Full suite 11/24 fail = baseline.
- Risk: DevZone mở bằng session không phải CRM login-as (vd staff magic-link) mất quyền bypass — đúng chủ đích gate hiện có.
- Rollback: revert commit.

#### Task 4 — G12 webhook HMAC
- Goal: HMAC so sánh constant-time, không bypass trên function đã deploy.
- Files allowed: `middleware/webhook/webhookMiddleware.js`, 1 test.
- Approach: `webhookMiddleware.js:19` `!==` → `crypto.timingSafeEqual` sau check độ dài Buffer; bypass `!app.isLocal` (`config/app.js:10` = chuỗi env thô) → chỉ khi `isLocal` VÀ `FUNCTIONS_EMULATOR==='true'`.
- Caller check: chỉ `handlers/webhook/bulkOperationHook.js:72` + `appSubscriptionUpdate.js:21` — Shopify gọi, có header HMAC hợp lệ. Local emulator vẫn bypass.
- Test: `__tests__/middleware/webhookHmac.test.js` 6 case — pre-fix 4 fail (secret sai/thiếu header lọt vì bypass), post-fix pass. Full 11/24 fail = baseline.
- Risk: env deploy nào đang dựa vào APP_IS_LOCAL để nhận webhook không ký → giờ bị từ chối (đúng chủ đích). Webhook khác (uninstall, GDPR) đi qua avada-core, không thuộc file này.
- Rollback: revert commit.

#### Task 5 — G8 `/public` revert + jsonl
- Goal: không ai ẩn danh revert/xuất dữ liệu shop khác.
- Files allowed: `routes/public.js`, `controllers/revertController.js`, `.claude/skills/security/SKILL.md`, 1 test.
- Approach: `routes/public.js:26-27` xoá 2 route; xoá `revertImage` + `getJsonlOptimizeHistory` (`revertController.js:55-97`) và import chỉ chúng dùng. `revertAltProduct` giữ (DevZone `devController.js:495` dùng).
- Caller check: grep `revert-product`/`get-jsonl-data` toàn `projects/Falcon` (trừ node_modules/lib/build) + second-brain: chỉ route def IMG + route RIÊNG của seo (`seo/.../routes/proxy.js:99,101`, controller của seo, không gọi IMG). 0 caller trong assets/scripttag/extensions/static. Route thêm 2025-04-26 (cb69d83f) không có client.
- Test: `__tests__/routes/publicRoutesNoShopActions.test.js` — pre-fix 2 fail, post-fix pass; route public hợp lệ (unsubscribe, speed-audit) vẫn mount. Full 11/24 = baseline. `yarn docs-gate` PASS; skill security cập nhật.
- Risk: công cụ nội bộ ngoài repo (không thấy) gọi 2 URL này sẽ nhận 404.
- Rollback: revert commit.

#### Task 6 — G7 IDOR
- Goal: id doc từ client phải thuộc shop của session trước khi đọc/ghi.
- Files allowed: `helpers/isOwnedByShop.js` (mới), `controllers/{historyController,revertController,optimizeStoreController,seoController}.js`, `repositories/historyRepository.js`, `featureReq/featureReq.controller.js`, 2 test.
- Approach: helper `isOwnedByShop(doc, shopId)` (pattern có sẵn ở `cancelRevert` `revertController.js:466-469`, `speedAuditMultiController.js:441-450`). Áp: `historyController.js:58`, `historyRepository.js:216` (revertList), `revertController.js:73,292` (file-alt / file-image version), `:44` updateRevert, `optimizeStoreController.js:58`, `seoController.js:683`, `historyRepository.js:529` getHistoryByLogId (logId lạ → history mới), `featureReq.controller.js:273` blockUser (bỏ `blockId`, dùng session shop). Body update bỏ `shopId`/`id`.
- Caller check: FE gửi id của chính shop — `RevertProgressBar/index.js:45` (`revertId`), `ImageManager/.../ProgressBar/index.js:32` + `ImageSEO/ProgressBar/index.js:35` (`shop.historyId`), `SiteSpeedUp.js:411`, `UserComment.jsx:84` (`blockId: shop.id` = chính mình). Caller nội bộ (`cloudRunWorker`, pubsub, webhook) dùng id từ server, không đổi. Sweep thêm: `historyOptimizeController.update` cùng lỗi nhưng KHÔNG có route → bỏ qua; `featureReqExcludeEmail` đã check.
- Test: `__tests__/controllers/crossShopDocIdGuard.test.js` + `__tests__/repositories/historyRepositoryOwnership.test.js` — pre-fix 7 fail, post-fix 16 pass. Full 11/24 = baseline.
- Risk: doc cũ thiếu field `shopId` → giờ trả not-found. Mọi create path đọc được đều ghi `shopId` (`createRevertProcess`, `createHistoryOptimize`, `createProgress` qua `handleAutoOptimize.js:76`, history qua `getHistoryByLogId`).
- Rollback: revert commit.

#### Task 7 — G5 integration key
- Goal: merchant không đọc/mint được partner integration key.
- Files allowed: `controllers/integrationKeyController.js`, 1 test.
- Approach: `getOne`/`createOne` (`integrationKeyController.js:11-37`, route `api.js:180-181`) gọi `canAccessDevZone({user})` + `logAdminAudit` (pattern `devController.testOnly:118-127`), deny → `denyDevZone` 403. Bind key vào shop = FAL-720 → tách ticket (cần migration `integrationKeys`).
- Caller check: chỉ `assets/src/pages/PartnerKey/PartnerKey.js:14,23-24,44`. Route FE `/partner/key` (`routes.js:57`) KHÔNG gate — staff phải mở qua CRM login-as, session merchant/staff magic-link giờ nhận 403. `validateAccessToken.js:42` (dùng key) không đổi.
- Test: `__tests__/controllers/integrationKeyGate.test.js` — pre-fix 3 fail, post-fix 4 pass. Full 11/24 = baseline.
- Risk: staff đang dùng trang Partner key ngoài CRM session mất quyền — đúng chủ đích.
- Rollback: revert commit.

#### Task 8 — G10 accessTokenHash trong response
- Goal: response HTTP không chứa `accessTokenHash`.
- Files allowed: `controllers/seoController.js`, `repositories/shopRepository.js`, 1 test.
- Approach: `shopRepository.js:254-256` lọc `reload` theo `pickFields`; `seoController.js:290-292` catch của `optimizeFileImages` → `prepareShop(shop)`. `optimizeImages` catch (`:358`) để nguyên — chỉ caller nội bộ (`subscribeAutoOptimizeImages`, `productService`), không ra response.
- Caller check: 0 FE/BE nào gửi `reload` (grep assets + functions); `optimizeFileImages` còn `aiController.js:1116` bỏ qua giá trị trả về.
- Test: `__tests__/controllers/shopResponseNoTokenHash.test.js` — pre-fix 2 fail, post-fix pass. Full 11/24 = baseline.
- Risk: thấp.
- Rollback: revert commit.

#### Task 9 — G9 shop doc vào Pub/Sub
- Goal: 2 site trong brief không gửi shop doc (có `accessTokenHash`, `passwordStore`) vào Pub/Sub.
- Files allowed: `controllers/seoController.js`, `services/installationService.js`, `handlers/pubsub/subscribeScanSpeedScore.js`, 1 test.
- Approach: `revertController.js:66` đã xoá cùng route ở task 5. `seoController.getSpeedScore` (`:760`) + `installationService.js:80` (cùng topic) publish `{shopId}`; consumer `subscribeScanSpeedScore.js` tự `getShopById`, vẫn nhận `{shop}` cũ để drain message đang bay.
- Caller check: publisher `scanSpeedScoreV2` trong IMG = đúng 2 chỗ trên; seo có topic cùng tên nhưng ở project khác, không liên quan.
- Test: `__tests__/handlers/pubsub/scanSpeedScorePayload.test.js` — pre-fix 3 fail, post-fix pass. Full 11/24 = baseline.
- Risk: +1 Firestore read/message. Không sửa ~13 publishTopic `{shop}` khác (mỗi consumer dùng field khác nhau — cần rà riêng từng cái; brief chỉ định 2 site).
- Rollback: revert commit. Message `{shopId}` còn trong hàng đợi lúc rollback sẽ làm consumer cũ lỗi (`shop` undefined, bị catch + log) — mất 1 lần scan điểm, không hỏng data.

#### Task 10 — G4 firestore/storage rules — BLOCKED
- Goal: scope 9 collection + Storage theo shop.
- Files allowed: `firestore.rules`, `storage.rules`.
- Evidence (không sửa gì, không commit):
  - Claim có: token standalone mint ở `avada-core/src/services/authService.ts:207-211,255-259` mang `shopID` (chữ D hoa) + `shop` + `type`. Nên rule `request.auth.token.shopID == resource.data.shopId` viết được — CHO STANDALONE.
  - Embed (mode chính) KHÔNG đăng nhập Firebase Auth: 0 `signInWithCustomToken` trong `packages/assets/src`; `embed.js` chỉ `getAuth(app)`. Client SDK đọc thẳng `historyOptimize` (`hooks/optimize/useOptimizingState.js:21-22`), `revertProcess`, `optimizeStore`, `analysis`, `localStorage`, `statsSpeedReq`, `featureReq`/`commentFeatureReq` (`feature-request/services/liveVoteFeatureReq.js:105` vote = `updateDoc` từ embed). Với `request.auth == null`, mọi rule scope theo claim → progress bar optimize/revert, analysis, vote feature request trong embed chết = outage.
  - `storage.rules` KHÔNG được deploy: `firebase.json` chỉ có `firestore/functions/emulators/hosting`, không có `storage` → sửa file không đổi gì trên bucket; rule live nằm trên console (chưa đọc). Wire nó vào `firebase.json` = file cấm §8. Client không dùng Storage SDK (`storage` export ở `helpers.js:29` không ai import) nên catch-all `if false` sẽ an toàn KHI được wire.
- Việc cần (ticket riêng, migration): (1) embed mint Firebase custom token (claim `shopID`) sau session App Bridge, `signInWithCustomToken` trước khi mở listener; (2) rồi scope `firestore.rules` theo `request.auth.token.shopID`, featureReq write chỉ cho field vote; (3) thêm `"storage": {"rules": "storage.rules"}` vào `firebase.json`, catch-all `if false`, giữ `pageSpeed/**` read. Kiểm rule Storage live trên console `app-plaza-image-optimizer` trước.

#### Round 2 — review độc lập (3 🔴)
- **Task 3 → c2e02550.** 🔴1: key có dấu chấm (`isDevZone.x`, `plan.x`, `additionalImageQuota.x`, `shopifyDomain.x`, `accessTokenHash.x`) lọt qua strip tên chính xác + `removeFields`, Firestore `update()` đọc thành field path. `shopController.set` giờ trả 400 nếu key có `.` mà gốc là `isDevZone` / `requestImmutableFields` / (session không phải staff) `blockFields`. Check đặt ở `set`, không trong `updateShopData` → `onboardingController.js:141,207` (`speedChecklist.*`) không ảnh hưởng. 🔴2: `featureReq.controller.sync` (`GET /api/sync-featureReq`, FE `DevZone.js:283`, `dev-test-tool.helper.js:39`) thêm `canAccessDevZone({user})` trước check `shop.isDevZone`. 🟡: `aiController.shopNoLimit` bỏ `isDevZone: true` (`isLimitImage` không nằm trong `blockFields`). Test: `shopControllerSetDevZoneGate.test.js` (+7 case), `featureReq/syncDevZoneGate.test.js`, `aiShopNoLimitNoDevZoneFlag.test.js` — 8 fail trước fix, 12/12 pass sau.
- **Task 6 → 15cc6138.** 🔴3: `getHistoryByLogId` fallback history mới vẫn để `optimizeFileImage` chuyển `logId` sang `handleOneHistory` → `updateOneHistory` ghi đè doc nạn nhân. Giờ logId lạ/không tồn tại → throw `History not found`, handler `handleManualOptimizeImage` log + ack, bỏ item. Nguồn logId = input request: `POST /api/optimize/images` `dataLog[].logId` (`seoController.js:476`) → Pub/Sub `handleOptimizeImage` → `handleManualOptimizeImage.js:80` → `fileImageService.js:295`. Nhánh product/collection/blog không dùng `logId` để ghi (history lấy theo query shopId+objectId). Test `historyRepositoryOwnership.test.js` — 2 fail trước fix, 5/5 pass sau.
- Suite sau round 2: 24 fail / 11 suite, đúng tập baseline (so từng test theo tên), 2207 pass.

### Deploy notes (Tuan — không chạy gì từ agent)
- **Cờ `isDevZone` đã lưu:** shop đã có `isDevZone` trên doc vẫn qua gate đọc doc (`devController.patch` còn yêu cầu CRM session; `featureReq.sync` giờ cũng vậy). Vẫn cần cleanup 1 lần: đếm `shops where isDevZone != null` trên `app-plaza-image-optimizer`, rồi unset với shop không phải của team (bao gồm các shop bị AI API `shopNoLimit` gắn cờ).
- **Doc cũ thiếu `shopId`:** `history`, `historyOptimize`, `revertProcess`, `optimizeStore` không có `shopId` giờ trả not-found ở các route task 6. Đếm trước khi deploy.
- **Hotfix 1ecbd824** (`initShopify` log token) phải lên cùng tag.
- Integration key đã lộ: rotate. Task 10 cần ticket migration riêng (xem trên).

#### Round 3 — billing review + re-review (2026-09-24)
- **Task 3 → 694f3d8a.** List mới `merchantProtectedFields` (`config/pickFields.js`): quota (`imageQuotaUsage`, `altQuotaUsage`, `isLimitImage`, `noLimitAt`, `latestNoLimitAt`, `quotaCycleStartedAt`, `imageQuotaHitAt`, `altQuotaHitAt`), discount/plan (`planDiscountCode`, `planDiscountCycle`, `subscriptionDate`, `promoType`, `isTestDiscount`), speed audit (`speedAuditQuotaLimit`, `speedAuditQuotaResetAt`, `bypassSpeedAuditUrl`), `historyId`. Chỉ áp ở `shopController.set`: session không phải staff → strip; key có dấu chấm → 400. KHÔNG cho vào `blockFields` vì `updateShopData` áp nó cho mọi caller, trong khi code server ghi hợp lệ các field này (reset quota `shopRepository.js:563`, `subscriptionController.js:81,105`, `aiController.shopNoLimit`) → `shopNoLimit` không cần setter riêng.
  - Caller check: FE merchant chỉ ghi `planDiscountCode` qua `/shop` ở `UserChargeInfo.jsx:65-79` (nhánh Free), và chỉ gọi SAU `GET /subscription/discount/:code` — endpoint đó đã `validateDiscount` + lưu code (`subscriptionController.js:73-82`) → strip ở `/shop` không làm gãy gì. `promoType` FE gửi qua `subscribeShopify` (endpoint subscription), không qua `/shop`. Quota/speed-audit/isLimitImage: chỉ DevZone (session CRM, vẫn được ghi).
  - `historyId` guard defense-in-depth: `handleManualOptimizeImage.js` (tăng completion), `bulkOperationHook.hookOptimizeImage` (return sớm), `subscribeRecursive` RECURSIVE_OPTIMIZE_IMAGES_BY_PRODUCT (bỏ ghi `lastProduct`). Các reader khác của `shop.historyId` (`doneOptimize.js:19`, `cloudRunWorker`, `fileImageService.js:446`) dựa vào việc chặn ghi ở gốc + cleanup pointer đã bị sửa (xem deploy notes).
  - Test: `shopControllerSetBillingFields.test.js` (5 nhóm × strip/dotted/CRM) + `handleManualOptimizeImageHistoryGuard.test.js` — 11 fail trước fix, 17 pass sau.
- **Task 6 → 2e76ff82.** Regression từ 15cc6138: logId bị từ chối → throw → bỏ qua tăng `completedTasks` → run kẹt. Giờ `resolveOwnedLogId` chỉ throw (code `HISTORY_NOT_OWNED`) khi doc TỒN TẠI và thuộc shop khác; doc thiếu hoặc legacy không có `shopId` → trả null, `optimizeFileImage` tạo history mới. `handleManualOptimizeImage` bắt lỗi từng item nên completion luôn được đếm. Test: logId missing/legacy chạy xong, logId lạ bị chặn nhưng progress vẫn done — 4 fail trước fix, 10 pass sau.
- **Task 11 → eece3ba4** (added 2026-09-23 from billing review).
  - Plan: Goal = check + reserve quota trong 1 transaction. Files = `repositories/shopRepository.js` (`reserveQuota`, `releaseQuota`), `controllers/seoController.js` (`startOptimizeImages`), `handlers/pubsub/handleManualOptimizeImage.js`, `repositories/historyRepository.js`, 1 test. Test = `__tests__/quota/manualOptimizeQuotaRace.test.js` (Firestore in-memory, transaction tuần tự, read có yield). Risk = release làm usage âm nếu cycle reset xen giữa → clamp tại 0. Rollback = revert commit.
  - Exploit tái hiện: 10 request song song, Free 100 → **1000 ảnh publish trước fix, 100 sau**. Publish lỗi → reservation của log chưa publish được trả lại (test: usage về 0). Item bị từ chối vì logId lạ → trả reservation (`quotaReserved` đi trong payload Pub/Sub).
  - Chưa sửa (không nhỏ): `speedAuditController.js:79` (đếm rồi create — cần query count trong transaction hoặc lock per-shop) và `speedAuditMultiController.js:262` (claim slot run-active trước khi mint runId). Mỗi burst song song = N lần PSI/vCPU. Follow-up.
  - `startOptimize` bulk (`seoController.js:161-164`) cũng đọc quota ngoài transaction — chưa rà, follow-up.
- Suite sau round 3: 24 fail / 11 suite, đúng tập baseline (so từng test theo tên), 2231 pass.

### Ghi nhận cho ticket credit fleet / câu hỏi (chưa sửa)
- Rò chỉ khi infra lỗi: `consumeBonus.js:95` nuốt lỗi → run miễn phí; `fileImageService.js:777`, `persistImageResult.js:49`, `buildImageDiff.js:220` làm xong việc mà không increment quota.
- Câu hỏi: `oldPlanId` trong avada-core `shopifyCharge` lấy từ đâu — replay callback có reset quota không (`subscriptionService.js:171`)? Giá charge có đi qua `getDiscountRule` với `isTestDiscount` (giờ đã chặn ghi từ merchant, nhưng giá trị cũ còn trên doc) không (`subscriptionService.js:292`)? Cần lock 1-job-per-shop cho `cloudRunWorker.js:403` / `processFileImagesV3.js:237`.
- Deploy notes bổ sung: đếm shop có `isLimitImage == false`, `planDiscountCode` = mã founder mà không có charge tương ứng, `isTestDiscount == true`, `bypassSpeedAuditUrl == true`, `speedAuditQuotaLimit` bất thường, và shop có `historyId` trỏ tới doc `historyOptimize` của shop khác — giá trị merchant đã tự ghi trước branch này vẫn còn hiệu lực tới khi cleanup.

#### Task 11 round 2 — hardening reservation (87b03289)
- Plan: Goal = release trả đúng bucket, idempotent, không giữ quota khi lỗi sau reserve, pendingTasks khớp số đã publish. Files = `repositories/shopRepository.js`, `controllers/seoController.js`, `handlers/pubsub/handleManualOptimizeImage.js`, 2 test. Test = `manualOptimizeQuotaRace.test.js` + `handleManualOptimizeImageHistoryGuard.test.js`. Risk = collection mới `quotaReleases` (1 doc/log bị release; server-only, rules default-deny) — cân nhắc TTL. Rollback = revert commit.
- (1) `reserveQuota` trả `{fromMonthly, fromAdditional}` + `cycle` (quotaCycleStartedAt ms). Controller chia phần reservation theo từng log (monthly trước), gửi `quotaReservation {id, action, monthly, additional, cycle}` trong payload. `releaseQuota(shopId, portions[])` trả monthly về usage CHỈ khi cycle không đổi, additional về ví additional.
- (2) Idempotent: marker `quotaReleases/{shopId}_{historyId:action:index}` đọc + ghi trong cùng transaction → release lần 2 (redelivery) là no-op.
- (3) Mọi việc sau reserve (`markQuotaHit`, `updateHistoryOptimize`, publish) nằm trong try; lỗi → release phần của mọi log chưa publish.
- (4) Publish lỗi một phần → `pendingTasks = số log đã publish`, rồi chạy lại completion check (log đã publish có thể đã xong trước khi hạ pendingTasks). `handleDoneOptimize` require lazy vì chain import của nó gọi `firebase.storage()` lúc load (import top-level làm vỡ 2 suite có sẵn).
- Test: reset cycle giữa reserve/release (usage giữ 5, additional về 50), release trùng (usage giữ 60, không phải 20), throw sau reserve (usage về 0, không publish), publish lỗi một phần (pendingTasks=1, usage=50), partial + đã xong → done. 6 fail trước fix, 12 pass sau. Full: 24 fail / 11 suite = baseline (so theo tên), 2236 pass.
- Ghi nhận (chưa sửa):
  - Item lỗi SAU khi đã làm việc (Shopify/sharp lỗi giữa chừng) không refund — có từ trước, chủ ý: không biết phần nào đã tốn.
  - Bulk `startOptimize` (`seoController.js:161`) chưa có lock 1-job-per-shop và đọc quota ngoài transaction.
  - Race speed audit (`speedAuditController.js:79`, `speedAuditMultiController.js:262`) vẫn mở.
  - Edge: publish trả lỗi nhưng message thực ra đã được giao → quota đã release mà việc vẫn chạy (miễn phí 1 lần). Pub/Sub client không phân biệt được; chấp nhận.
- **Câu hỏi cho Tuan:** avada-core `validateDiscount` có bind mã founder cố định (`founderOffer.js:23`) vào shop cụ thể không, hay shop Basic nào cũng áp được qua `GET /subscription/discount/:code` rồi hưởng unlimited image+alt (`isFounderUnlimitedActive`)?
