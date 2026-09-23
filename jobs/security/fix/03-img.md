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
| 3 | G11 isDevZone / shop write | ✅ 7da77d6a | 1 | clean | allow-list đầy đủ KHÔNG làm (FE ghi ~25 field khác nhau) — giữ blockFields + strip identity; `aiController.js:1591` ghi `isDevZone:true` lên doc shop merchant qua AI API → follow-up |
| 4 | G12 webhook HMAC | ✅ c87fe85b | 1 | clean |  |
| 5 | G8 `/public` revert + jsonl | ✅ 19bbcdd4 | 1 | clean | xoá hẳn thay vì chuyển sang /api — 0 caller |
| 6 | G7 IDOR | ⏳ | | | |
| 7 | G5 integration key | ⏳ | | | |
| 8 | G10 accessTokenHash trong response | ⏳ | | | |
| 9 | G9 shop doc vào Pub/Sub | ⏳ | | | |
| 10 | G4 firestore/storage rules | ⏳ | | | |

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
