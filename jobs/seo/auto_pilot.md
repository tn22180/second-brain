xem xét tính năng auto pilot trên app Booster SEO này đánh giá và lên plan làm cho SEO Suite app của mình, b có link tới claude code không?

FEEDBACK: speedup, content audit và bulk fix chưa có, cần rõ ràng plan từng phần và làm liền mạch tránh hỏi nhiều

Used Claude in Chrome (11 actions)

Mình không có kết nối tới Claude Code. Phiên này chạy trong Chrome side panel, không liên kết với repo hay máy của bạn, nên mình không đọc được source code của SEO Suite. Nếu bạn muốn Claude Code làm luôn, bạn copy plan bên dưới vào Claude Code đang mở trong repo SEO Suite, hoặc mở task này trong Claude desktop app và chọn liên kết với máy tính.

Mình đã xem trang AutoPilot của Booster SEO và mở thử vài trang của Avada SEO Suite (Search optimization, Meta tags) để so sánh. Mình không bật hay tắt cài đặt nào.

Booster SEO AutoPilot có gì

Mọi thứ nằm trên một trang, mỗi mục có một nút bật hoặc chọn chế độ:

Mục Tuỳ chọn Gói
Image Alt Text Off / AI / Template mặc định / Template tuỳ chỉnh Free
Meta Title, Meta Description Như trên, thêm "Shopify defaults" Free
Protect manually edited fields Mặc định bật; sản phẩm sửa tay có icon khoá ở trang audit Free
Target Keywords Lấy tên sản phẩm làm keyword Trả phí
Broken Links Tự redirect về trang chủ hoặc một đường dẫn tự chọn Trả phí
Image Compression, Image Rename Tự làm khi có ảnh mới Premium
URL Optimization Đổi URL khi tên sản phẩm đổi Premium

Cách chạy: sản phẩm mới hoặc vừa sửa được tối ưu tự động. Sản phẩm có sẵn thì merchant phải bấm "Run Optimizer" ở dashboard.

Đánh giá

Điểm mạnh:

Dễ hiểu: một trang, bật lên là xong.
Mỗi mục có nhiều chế độ (AI, template, Shopify).
Bảo vệ nội dung sửa tay, điểm này tạo được niềm tin.
Chia tính năng theo gói rất rõ, dễ bán gói cao hơn.

Điểm yếu (đây là chỗ mình có thể làm tốt hơn):

Không có xem trước hay chạy thử trước khi áp dụng cho cả cửa hàng.
Mình không thấy lịch sử thay đổi hay nút hoàn tác.
Không giới hạn được phạm vi (theo collection, tag hay vendor). Cũng không rõ có áp dụng cho Collection, Blog, Page hay chỉ cho Product.
Không thấy hỗ trợ nhiều ngôn ngữ, cũng không thấy trước chi phí AI credit.
Đổi URL mà không nói rõ có tạo redirect 301 hay không, nên dễ mất traffic.
Redirect link hỏng về trang chủ là cách xử lý SEO kém.
Người dùng dễ nhầm: sản phẩm mới chạy tự động, còn sản phẩm cũ phải bấm tay.

Avada SEO Suite hiện có: Meta tags có template riêng cho Product, Collection và Blog, có lựa chọn chỉ áp dụng cho sản phẩm còn trống, có custom rules, có AI (5 credits) và chọn được ngôn ngữ. Ngoài ra có Image alt, Broken links, Internal links, Structured data, Indexing và MCP. Nói cách khác, phần lõi đã có sẵn. Cái còn thiếu là một trang AutoPilot gom các module lại và tự chạy khi có sự kiện, ví dụ khi thêm hoặc sửa sản phẩm. Mình chưa kiểm tra được template hiện tại được áp dụng lúc hiển thị trang (render trong theme) hay được ghi thẳng vào dữ liệu Shopify. Điểm này ảnh hưởng đến kiến trúc, bạn cần xác nhận trong code.

Plan AutoPilot cho SEO Suite

Phase 1: MVP, khoảng 2–3 sprint

Trang AutoPilot: mỗi module (Meta title, Meta description, Image alt) có các chế độ Off / AI / Template / Shopify default. Chọn được phạm vi Product / Collection / Blog / Page, và chọn "Chỉ điền chỗ trống" hoặc "Ghi đè".
Chạy tự động theo sự kiện:
Nghe webhook products/create, products/update và collections/*, đưa vào hàng đợi, rồi ghi seo.title, seo.description và alt ảnh.
Tránh vòng lặp: bản cập nhật do chính app ghi cũng sẽ bắn webhook, nên lưu một hash của giá trị app đã ghi vào metafield để bỏ qua.
Bảo vệ nội dung sửa tay: nếu giá trị hiện tại khác hash app đã ghi thì coi là merchant sửa tay, khoá lại và hiện icon khoá ở SEO Audit.
Chạy cho sản phẩm có sẵn: ngay khi bật AutoPilot, hiện "Sẽ cập nhật X sản phẩm, tốn khoảng Y credits" rồi chạy bằng Bulk Operations. Không bắt merchant tự bấm như Booster.

Phase 2: Tạo khác biệt

Xem trước: hiện kết quả mẫu cho khoảng 5–10 sản phẩm trước khi bật.
Nhật ký thay đổi: lưu giá trị trước và sau, có nút hoàn tác từng sản phẩm hoặc cả lượt chạy.
Lọc phạm vi theo collection, tag, vendor hoặc product type.
Giới hạn AI credit theo tháng, gửi cảnh báo khi sắp hết.
Nhiều ngôn ngữ: tự tạo meta cho từng locale qua Translations API, tận dụng bộ chọn ngôn ngữ đã có.

Phase 3: Tính năng nâng cao, dùng để chia gói trả phí

Tự redirect link hỏng một cách thông minh: gợi ý URL gần nhất (cùng handle, cùng collection) thay vì đưa về trang chủ, kết nối với module Broken links sẵn có.
Tự tối ưu URL: đổi handle và luôn tạo urlRedirectCreate 301.
Đổi tên và nén ảnh, gắn với module Performance.
Target keyword kết hợp dữ liệu Search Console.
Báo cáo: email tổng kết hằng tuần kiểu "AutoPilot đã tối ưu N trang", và cho agent bật/tắt hay cấu hình AutoPilot qua MCP.

Rủi ro kỹ thuật cần lưu ý:

Giới hạn tốc độ và chi phí truy vấn GraphQL của Shopify khi cửa hàng có nhiều sản phẩm.
Đảm bảo xử lý mỗi webhook một lần duy nhất (idempotency).
Đổi tên ảnh có thể phải upload lại ảnh, tuỳ phiên bản API.
Cần đồng bộ với custom rules hiện có, và quy định rõ cái nào được ưu tiên.

Bạn có muốn mình viết plan này thành một tài liệu spec (gồm user story và tiêu chí nghiệm thu) để chia sẻ với team hoặc đưa thẳng cho Claude Code không?

---

## Đánh giá vs code — 2026-09-23 (seo master `0547925a9cb`)

**Kết luận:** research đúng về UX, sai về kiến trúc lõi. ~70% tính năng Phase 1–3 đã có trong code.
AutoPilot nên là **control plane gom module có sẵn**, không phải engine mới.

### Research nói vs code thật

| Hạng mục                                   | Code thật                                                                                                                                                                                                | Evidence                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Meta template tự áp cho sp mới             | **Có sẵn, render-time Liquid** — không ghi Shopify, không cần webhook, không loop                                                                                                                        | `helpers/afterInstall/updateAssets.js:310-378`                                        |
| Bảo vệ meta sửa tay                        | Có: `ovrProductIds/…` từ `global.title_tag` không rỗng                                                                                                                                                   | `services/bulkMetaService.js:44-76`, `updateAssets.js:317-346`                        |
| Bảo vệ alt sửa tay                         | Một phần: `alt_ovr=MISSING` bỏ qua mọi ảnh đã có alt, không phân biệt app/merchant                                                                                                                       | `helpers/utils/isAltOptimized.js:49-61`                                               |
| Alt + nén ảnh cho sp mới                   | Code có, **trigger nghi chết**: subscription `products/create` gỡ ở `6663e0891bf` (2025-03-23), `imageHook.js:8` còn chủ động xoá; code chỉ đăng ký `BULK_OPERATIONS_FINISH`, `APP_SUBSCRIPTIONS_UPDATE` | `webhook/bulkOperationHook.js:132`, `services/shopifyService.js:176,259`              |
| products/update, collections/_, articles/_ | Không có handler sống                                                                                                                                                                                    | `imageHook.js:8` (chỉ xoá)                                                            |
| Preview / lịch sử / undo                   | Có trong bulk-fix: generate → review → apply → revert, snapshot before/after                                                                                                                             | `services/bulkAuditFix/applier.js:106-150`, `routes/api.js:488-496`                   |
| Bulk cho sp có sẵn                         | Có, **cap 50 sp/job**                                                                                                                                                                                    | `bulkAuditFix/resolver.js:22-47`                                                      |
| Ước tính credit                            | Có (`~{credits}`); low-credit alert: **không**                                                                                                                                                           | `bulkAuditFix/estimator.js:1-28`                                                      |
| Lọc phạm vi                                | product_type/vendor/status có; collection/tag cho product: **không**; only-empty cho bulk: **không**                                                                                                     | `helpers/graphQLConvert.js:152-174`                                                   |
| Đa ngôn ngữ                                | Có `translationsRegister`                                                                                                                                                                                | `services/shopifyGraphQlService.js:3701-3732`                                         |
| Đổi URL + 301                              | Có khi app đổi handle; merchant tự đổi handle: không bắt                                                                                                                                                 | `repositories/analysisRepository.js:1071-1122`                                        |
| Redirect 404 tự động                       | Có (weekly Pro+, daily Enterprise); target = 1 URL cố định/loại, default `/`                                                                                                                             | `pubsub/subscribeHandleWeeklyBrokenLinks.js:110,250-348`, `helpers/getTarget.js:7-32` |
| Đổi tên ảnh                                | Có, qua `fileUpdate` — **không cần re-upload** (rủi ro research nêu không áp dụng)                                                                                                                       | `services/shopifyGraphQlService.js:1797-1832`                                         |
| Target keyword                             | Có `focus_keyword` + GSC insights                                                                                                                                                                        | `repositories/analysisRepository.js:89`, `helpers/gscInsights.js`                     |
| MCP bật/tắt AutoPilot                      | 6 write tool, không có tool autopilot. **Sidekick không được thêm write** (luật Shopify)                                                                                                                 | `services/mcp/writeTools.js`, `modules/sidekick/sidekick.module.js:15-24`             |
| Email "đã tối ưu N trang"                  | Không; chỉ có weekly 404 report                                                                                                                                                                          | `cron/publicHandleWeeklyBrokenLinksReport.js`                                         |
| Trang AutoPilot                            | **Không có** — nhưng "Autopilot optimization" đã quảng cáo trong bảng gói                                                                                                                                | `assets/src/components/PlanFeatures/PlanFeatures.json:137-140`                        |

### Research sai / thiếu

1. Phase 1 "webhook → ghi `seo.title` + hash metafield chống loop" sai cho template mode — template đã render động. Chỉ AI mode cần ghi từng sp.
2. Trigger `products/create` là của Shopify, self-write của app không bắn lại create → không cần hash chống loop ở v1. Chỉ cần khi thêm `products/update`.
3. Bỏ sót chi phí `products/update`: bắn theo mọi đổi giá/tồn kho. Nếu dùng phải có `filter` / `include_fields` ở webhook declarative.
4. Rủi ro "đổi tên ảnh phải re-upload" không đúng với code hiện tại.
5. "Target keyword = tên sp" kém hơn cái đã có (focus_keyword + GSC) — bỏ.

### Verify prod

- 2026-09-23: `webhookcreateproductgen2` (avada-seo) **0 request trong 30 ngày**, chỉ log deploy/system. Alt + nén ảnh cho sp mới **chết ở prod**.

### Gói & tần suất auto (verify 2026-09-23)

Pro vs Enterprise (marketing `PlanFeatures.json`): Enterprise = Pro + Rocket speed (vs Turbo), 10.000 credit (vs 1.000), Advanced structured data, 1-1 consult, support 24/7. Không khác biệt tính năng auto nào được quảng cáo; "Autopilot optimization" chỉ ghi ở Pro.

| Auto                                                | Tần suất                              | Gói                                                  | Thực tế                                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meta template                                       | realtime (render Liquid)              | mọi gói; rules = Pro+                                | chạy                                                                                                                                                                       |
| Alt + nén ảnh sp mới                                | realtime `products/create`            | Free giới hạn `LIMIT_PRODUCT_IMAGES`, Pro+ unlimited | **chết** — 0 request/30 ngày                                                                                                                                               |
| Re-optimize ảnh định kỳ `autoSchedule.autoOptimize` | week / month                          | —                                                    | **chết**: `handleAutoOptimize` default export không cron nào gọi; UI `SpeedUp/Settings/Settings.js:101` `return null`                                                      |
| Redirect 404                                        | weekly T2 00:00 UTC / daily 00:00 UTC | weekly Pro+, daily Enterprise                        | **chỉ shop có `permanentlyRedirect.isDevZoneEnabled=true`** — bật từ DevZone nội bộ (`DevZone/containers/404Container.js:123`), default false → merchant không tự bật được |
| Email báo 404                                       | weekly T2 00:00 UTC                   | opt-in                                               | chạy                                                                                                                                                                       |

---

## Progress

Started: 2026-09-24 · Worktree `projects/Falcon/seo-wt-autopilot` (node_modules symlink từ `seo`) · Branch `feat/autopilot` · Spec `docs/superpowers/specs/2026-09-23-autopilot-design.md` · Plan `docs/superpowers/plans/2026-09-24-autopilot.md` (commit `e32d05e4b12`; `ff1a10f7703` rơi nhầm local master, đã gỡ)

| #   | Task                                                                | Agent / Model            | Status | Rounds | Sec   | Notes                         |
| --- | ------------------------------------------------------------------- | ------------------------ | ------ | ------ | ----- | ----------------------------- |
| 1   | `createProductCreateWebhook` + bỏ xoá `products/create` ở imageHook | general-purpose / sonnet | ✅     | 1/5    | fixed | `391c9f1149b` + `ca16d29a8cd` |
| 2   | Mapper thuần: allow-list + plan gate + `autopilot` grant key        | general-purpose / opus   | ✅     | 0/5    | clean | `1d58123dd83`                 |
| 3   | Gate realtime `products/create` + dedup webhook                     | general-purpose / sonnet | ✅     | 0/5    | clean | `48628160064`                 |
| 4   | `GET/PUT /autopilot` controller + route                             | general-purpose / opus   | ✅     | 0/5    | clean | `e69cc66e265`                 |
| 5   | Command `registerProductCreateWebhook` (dry-run default)            | general-purpose / sonnet | ✅     | 0/5    | clean | `a34e6c690b5`                 |
| 6   | FE page + route + menu + tracking + i18n + tooltip                  | general-purpose / sonnet | ✅     | 1/5    | clean | `5e2efbf60c0` + `8bbd8744ce2` |
| 7   | Sidekick allow-list + `docs/features/autopilot.md`                  | cavecrew-builder / haiku | ✅     | 0/5    | clean | `9c5a1e74df4`                 |

Thứ tự: 1 → 2 → 3 → 4 → 5 → 6 → 7 (4 cần 1+2; 3 cần 2; 5 cần 1).

### Log

#### ✅ Task 1: createProductCreateWebhook + imageHook

- Agent: general-purpose (sonnet)
- Plan:
  - Goal: `createProductCreateWebhook(shopify)` idempotent đăng ký PRODUCTS_CREATE → `${hookUrl}/webhook/create-product`, không throw; imageHook không xoá `products/create` nữa
  - Files allowed: `services/shopifyService.js` (thêm sau `ensureAppSubscriptionWebhook`), `handlers/webhook/imageHook.js:8`, 2 test mới (plan Task 1)
  - Approach: copy shape `createBulkOperationWebhook` (`shopifyService.js:118`), list theo topic filter; bỏ: toml declarative (không có toml chung)
  - Test command: `npx jest packages/functions/src/services/__tests__/shopifyService.productCreateWebhook.test.js packages/functions/src/handlers/webhook/__tests__/imageHook.test.js` → PASS
  - Risk: xoá nhầm subscription — chỉ xoá PRODUCTS_CREATE của chính app với callback khác; imageHook là endpoint legacy
  - Rollback: revert commit
- Rounds used: 1/5 (round 1 = security fix)
- Security check: **fixed** — `logger.error(..., e.message, e)` log nguyên error object → got HTTPError mang request options có `X-Shopify-Access-Token`; đổi chỉ log `e.message`. Diff 4 file, +221/-1; không secret literal, không đụng .env/lock/CI/rules, không dep mới. Ngoài scope (báo, không sửa): `createBulkOperationWebhook` `shopifyService.js:198` có cùng pattern.
- Tests: 7/7 pass (tự chạy lại), eslint pass
- Started: 2026-09-24 · Completed: 2026-09-24

#### ✅ Task 2: AutoPilot settings mapper (pure)

- Agent: general-purpose (opus)
- Plan:
  - Goal: `buildAutopilotUpdate({card,values,shop})` trả dotted update + `registerWebhook`, ném `AutopilotError` 400 (field lạ/kiểu sai/path ngoài store) / 403 (gói); `presentAutopilot` đọc flag `autopilot.*`; grant key `autopilot`
  - Files allowed: create `const/autopilot.js`, `services/autopilot/autopilotSettings.js`, 2 test; modify `config/subscription/grantedFeatures.js` (+ test của nó)
  - Approach: hàm thuần, allow-list theo card, dotted path vì `saveSettings` dùng update(); bỏ: dùng lại `image.alt_enabled` làm switch (default true)
  - Test command: `npx jest packages/functions/src/services/autopilot/__tests__/autopilotSettings.test.js packages/functions/src/config/subscription/__tests__/grantedFeatures.test.js` → PASS
  - Risk: gate sai → Free bật được auto tốn tài nguyên / Enterprise bị khoá; `proPlans` gồm Enterprise (`plans.js:131-139`) nên weekly đúng
  - Rollback: additive, revert commit
- Rounds used: 0/5
- Security check: **clean** — 5 file +373/-1; không secret/console, không đụng file cấm, plan lấy từ `shop` server-side, card `__proto__`/`constructor` → 400, `redirectTo` chặn `//host`/`javascript:`/absolute URL
- Tests: 67/67 (autopilot + config/subscription, tự chạy lại); impl khớp plan từng dòng
- Started: 2026-09-24 · Completed: 2026-09-24

#### ✅ Task 3: Gate realtime products/create + dedup

- Agent: general-purpose (sonnet)
- Plan:
  - Goal: `products/create` chỉ chạy khi `autopilot.*` bật + gói hợp lệ; chạy alt (/alt_filename/filename) rồi compression với `optimizingType` lấy từ settings; bỏ compression khi hết quota free, bỏ AI alt khi hết credit; webhook redelivery không dispatch lần 2
  - Files allowed: create `services/autopilot/productCreateService.js` + test, modify `handlers/webhook/bulkOperationHook.js` (import + nhánh products/create), `handlers/webhook/createProductHook.js` + test mới
  - Approach: service gate trước `processOneProduct`, truyền `settings.image` như bulk path (`subscribeRecursive.js:452`); dedup `createWebhookLogIfNotExist` (`webhookLogRepository.js:52`) → `{created}`
  - Test command: `npx jest packages/functions/src/services/autopilot packages/functions/src/handlers/webhook` → PASS (cả suite cũ)
  - Risk: prod path — nhánh này hiện chết (0 req/30d) nên đổi không ảnh hưởng merchant tới khi đăng ký webhook; sai gate → tốn credit/quota
  - Rollback: revert commit
- Rounds used: 0/5
- Security check: **clean** — 5 file +223/-8; shop từ header đã verify HMAC, không log error object, không file cấm/dep mới
- Review note: dedup ghi log trước `dispatchWork` → dispatch throw thì redelivery bị bỏ (mất 1 sp). Chấp nhận: dispatchWork fallback Pub/Sub, cùng thứ tự `bulkOperationHook.js:102`
- Tests: 52/52 (autopilot + handlers/webhook, tự chạy lại)
- Started: 2026-09-24 · Completed: 2026-09-24

#### ✅ Task 4: GET/PUT /autopilot

- Agent: general-purpose (opus)
- Plan:
  - Goal: `GET /api/autopilot` trả view; `PUT /api/autopilot {card, values}` lưu qua mapper, bật alt/nén → đăng ký webhook, fail → `warning: webhook_failed` mà vẫn lưu; `AutopilotError` → đúng HTTP status; shop chỉ từ session
  - Files allowed: create `services/autopilot/autopilotService.js`, `controllers/autopilotController.js` + 2 test; modify `routes/api.js` (import + 2 route)
  - Approach: theo plan; lệch plan có chủ đích: controller chỉ log `e.message` (không log error object — bài học Task 1)
  - Test command: `npx jest packages/functions/src/services/autopilot packages/functions/src/controllers/__tests__/autopilotController.test.js` → PASS
  - Risk: IDOR nếu lấy shop từ body; ghi dotted key thành field literal nếu doc `seo` chưa có (chặn 409)
  - Rollback: additive, revert commit
- Rounds used: 0/5
- Security check: **clean** — 5 file +206; shop chỉ từ `getCurrentShop`; auth: `/api` qua `createAuthMiddleware` (`handlers/api.js:64` → `middleware/auth.js:25-35`), `/apiV2` `verifyEmbedRequest`, `/apiSa(V2)` `verifyRequest`; chỉ log `e.message`; không file cấm/dep mới
- Tests: 101/101 (autopilot + controller + webhook + subscription, tự chạy lại)
- Started: 2026-09-24 · Completed: 2026-09-24

#### ✅ Task 5: command registerProductCreateWebhook

- Agent: general-purpose (sonnet)
- Plan:
  - Goal: command gom shop có `autopilot.altOnCreate|optimizeOnCreate == true`, bỏ shop gỡ app / hết gói, mặc định chỉ log; `--apply` mới đăng ký, throttle 500ms
  - Files allowed: create `commands/registerProductCreateWebhook.js` + test
  - Approach: theo plan; lệch có chủ đích: (a) catch cuối chỉ log `e.message`; (b) in project id ngay khi start (luật confirm project id); (c) verify tên field gỡ app + collection `seo`/`shops`
  - Test command: `npx jest packages/functions/src/commands/__tests__/registerProductCreateWebhook.test.js` → PASS
  - Risk: chạy nhầm prod với `--apply` → bật realtime cho shop đã opt-in (đúng ý) nhưng dồn tải; dry-run default + in project id giảm rủi ro
  - Rollback: additive; command không tự chạy
- Rounds used: 0/5
- Security check: **clean** — 2 file +181; không credential (chỉ placeholder `<sa.json>` trong usage), chỉ log `e.message`, in project id + mode trước khi chạy; collection `seo`/`shops` + field `uninstalled` verify (`seoRepository.js:29`, `shopRepository.js:38,178`)
- Tests: 2/2 (tự chạy lại)
- Started: 2026-09-24 · Completed: 2026-09-24

#### ✅ Task 6: FE page + route + menu + tracking + i18n

- Agent: general-purpose (sonnet)
- Plan:
  - Goal: trang `/autopilot` 4 card gọi `GET/PUT /autopilot`, menu cấp 1 sau Home, `MENU_AUTOPILOT` + `resolveScreen`, `feature_applied` khi lưu, 14 locale sinh bằng `yarn update-label`, tooltip PlanFeatures
  - Files allowed: theo plan Task 6 (pages/AutoPilot/_, loadables/AutoPilot.js, routes.js, config/appMenu.js, config/AppMenu.json, const/productAnalytics.js, helpers/screenTracker.js + test, PlanFeatures.json, locale/translations/_ sinh ra)
  - Approach: theo plan; chỉnh: verify `DETAILS_URL` với route thật, menu sau Home (spec), key dịch nạp từ `seo/.env` trong 1 lệnh không echo, không commit build output
  - Test command: `npx jest packages/assets/src/helpers/__tests__/screenTracker.test.js` + eslint + `yarn workspace @avada/assets run production` (build embed + standalone)
  - Risk: FE-only; gate FE chỉ là UX, server gate ở Task 2/4; link sai → 404 trong app
  - Rollback: revert commit
- Rounds used: 1/5 — round 1: build fail `react-hook-form` (dep thêm ở `7b7ba8f9d16`, node_modules checkout chính chưa cài) → bỏ symlink, `yarn install --immutable` trong worktree; i18n: không có `GOOGLE_TRANSLATE_API_KEY` → dùng script có sẵn `update-label-claude-cli` (`autoTranslateClaude.js`), 14 locale × 37 key, placeholder giữ nguyên
- Security check: **clean** — 11 file +369/-3 + 14 locale +714/-14; trackEvent chỉ gửi `enabled` (không log text merchant gõ); gate FE chỉ UX, server gate Task 2/4; không secret; build output `static/` gitignored
- Tests: screenTracker 2/2, eslint pass, build embed + standalone pass (19.8s / 18.9s)
- Menu: đầu list trước `/mcp` (nav không có entry Home)
- Started: 2026-09-24 · Completed: 2026-09-24

#### ✅ Task 7: Sidekick allow-list + feature doc

- Agent: cavecrew-builder (haiku)
- Plan:
  - Goal: label trang AutoPilot trong allow-list `extensions/seo-tools/instructions.md` (≤ 8 KB), feature doc `docs/features/autopilot.md` ghi nghĩa mới của `isDevZoneEnabled`
  - Files allowed: 2 file đó
  - Approach: nội dung nguyên văn từ plan Task 7
  - Test command: `node scripts/checkExtensionFileSize.js` exit 0 + `yarn docs-gate` không lỗi cho doc mới
  - Risk: Sidekick bịa label nếu thiếu; file > 8 KB thì extension fail
  - Rollback: revert commit
- Rounds used: 0/5
- Security check: **clean** — 2 file docs; không secret/URL nội bộ
- Tests: `checkExtensionFileSize` exit 0; `yarn docs-gate` PASS (558 anchored citation, feature-doc gate xanh sau commit)
- Started: 2026-09-24 · Completed: 2026-09-24

### ✅ COMPLETE — 2026-09-24

- Branch `feat/autopilot` (worktree `seo-wt-autopilot`), 11 commit `bc604182eb2..9c5a1e74df4`, 50 file +4686/-27. **Chưa push, chưa deploy.**
- Rounds: 2/35 tổng (Task 1: security fix log error object; Task 6: env build + i18n).
- Security toàn branch (diff vs `0547925a9cb`): **clean** — không file cấm, không secret literal, không `console`/log error object, host lạ chỉ trong test fixture.
- Verify:
  - Test autopilot/webhook/controller/subscription/command: 101 + 2 + 2 pass.
  - Full `npx jest packages/functions packages/assets`: 3651/3656 pass; 73 suite fail = 64 ở `packages/functions/lib/` (build output babel, gitignored, jest quét lẫn) + 9 ở src. Chạy lại 9 suite trên base `0547925a9cb`: 4 fail sẵn (onPageListQuery, overviewCardScore, shopify2026Client, workListStore). Khác biệt duy nhất `detect-changed-functions` → `git merge-base HEAD origin/feat/autopilot` fail vì branch chưa push (env, không phải code).
  - Build `@avada/assets production` embed + standalone pass; `yarn docs-gate` PASS; `checkExtensionFileSize` pass.
- Findings ngoài scope (chưa sửa):
  - `shopifyService.js:198` `createBulkOperationWebhook` log nguyên error object → có thể lộ access token (cùng lớp `prod-logs-leak-credentials`).
  - `node_modules` checkout chính `seo` thiếu `react-hook-form` (dep thêm `7b7ba8f9d16`) → build master local fail tới khi `yarn install`.
  - Jest root quét cả `packages/functions/lib/` → 64 suite fail ảo.
- Việc tay còn lại (theo spec Rollout): push + MR, deploy staging, E2E tạo sp có ảnh → `webhookcreateproductgen2` nhận POST + alt được ghi, regression trang ImageSEO/Redirect404, rồi `registerProductCreateWebhook` dry-run → `--apply` (confirm project id).
- 2026-09-24: push `origin/feat/autopilot` (git.avada.net) · MR !2312 Draft → master: https://git.avada.net/avada/seo/-/merge_requests/2312
- Staging chưa deploy: staging 1–4 đang bị branch khác chiếm (deploy trong 10 ngày), `staging_6` CI hỏng (`SA key CI variable for env 'staging_6' is EMPTY`, job 356310), staging 5/7/8 chưa từng deploy thành công → chờ Tuan chọn.
- 2026-09-24 11:17 UTC: **deploy staging (1) `avad-seo-staging` OK** — pipeline 221675, job 370364 `deploy_staging` (pin `51fb98d297f`): 117 functions "Successful update", 0 failed, hosting release complete, "Deploy complete!". Traffic = latest revision (`apigen2-00087-dit` 11:15Z, `webhookcreateproductgen2-00087-nup` 11:12Z) → không silent-freeze. `/api/autopilot` không auth → 401 (auth chặn trước router, chưa chứng minh route — cần test trong app).
- Còn lại (tay): E2E trong app staging (bật card → tạo sp có ảnh → alt được ghi), regression ImageSEO/Redirect404, revert pin CI trước merge.

---

## v2 — Speed / Content audit / Bulk fix (2026-09-30, theo FEEDBACK)

Spec: amendment 2026-09-30 trong `docs/superpowers/specs/2026-09-23-autopilot-design.md` · Plan: `docs/superpowers/plans/2026-09-30-autopilot-v2.md`

| Phần | Làm gì | Tái dùng | Không làm & vì sao |
|---|---|---|---|
| **Content audit** | Card `auditContent`: sp mới → chấm điểm SEO ngay trong `handleProductCreate`, 0 credit | `updateAnalysisResource(withIssues:true)` → ghi ES, list audit hiện điểm | Không re-score sau khi alt chạy xong (v2 limit) |
| **Speed monitor** | Card `speedMonitor`: cron T2 02:00 UTC, PSI homepage mobile+desktop, lưu `autopilot.speedLast`, mail SMTP khi tụt ≥10 | `getGooglePageSpeedScore`, pattern `notify404Report` | Không hồi sinh `handleWeeklyJobs` (Lighthouse tự host 4GiB, AEM dev id, chỉ upsell). Scan fail = bỏ, không so |
| **Bulk fix (chạy sp có sẵn)** | Nút "Run for existing" ở card Alt + Nén ảnh → `POST /autopilot/run` | `startOptimizeImage` với **nguyên map `seo.image`** (không wipe key); gate y `runStartOptimize` + AI credit | Không dùng `bulkAuditFix` (không làm alt/nén, 27 credit/sp). Meta + 404 vốn đã áp toàn store |

Gate cả 3: `canUseAutopilot`.

| # | Task | Status | Notes |
|---|---|---|---|
| 8 | Mapper + presenter 2 card mới, MAX_CHANGES | ✅ | `37289d5c6c7` |
| 9 | Audit trong products/create | ✅ | `7ea53a70e04`; id REST (formatProductToOptimize đã convert) |
| 10 | Speed cron + subscriber + mail | ✅ | `7ea53a70e04`; fix review: owner fallback nhận link unsubscribe merchant (link list không chặn được) |
| 11 | `POST /autopilot/run` | ✅ | `7ea53a70e04`; thiếu alt_mode = coi là AI khi check credit |
| 12 | FE 2 card + nút Run + i18n | ✅ | `3a4787196c1`; +19 key × 14 locale; `usePostApi` standalone đọc `error` body như embed |
| 13 | Docs | ✅ | `3a4787196c1`; docs-gate PASS |

Verify 2026-09-30: autopilot + webhook + commands 13 suite / 134 test pass · full src 332 suite: 4 fail có sẵn (giống `e93924104d2`: shopify2026Client, overviewCardScore, onPageListQuery.helpers, workListStore) · eslint ok · assets build embed+standalone exit 0 · docs-gate PASS.
Regression đã vá: import `updateAnalysisResource` kéo ES client (`node:events`) làm vỡ 2 suite bulkOperationHook trong jest → mock trong test (runtime Node 20 không ảnh hưởng).

Còn lại trước merge: E2E staging 1 (bật 2 card mới, tạo sp → có điểm audit; bấm Run for existing; speed cần đợi cron T2 hoặc gọi tay `runSpeedMonitor`) · revert CI pin `51fb98d297f` · PO quyết AutoPilot trong bảng giá (master FAL-440 đã gỡ).

#### PO decision 2026-09-30: AutoPilot vào bảng giá, tần suất theo gói
- Bảng giá: `PlanFeatures.Pro.AutoPilot` "auto-optimize new products, weekly speed & 404 checks"; `Enterprise.AutoPilot` "daily speed & 404 checks" (14 locale).
- Speed monitor: cron đổi sang hằng ngày 02:00 UTC; `runSpeedMonitor` bỏ qua shop chưa tới hạn — Pro ≥6,5 ngày, Enterprise/`noLimit` ≥20h kể từ lần scan tốt cuối; scan fail → ngày sau thử lại. Card hiện tần suất theo gói (`plan.speedFrequency`).
- 404 vốn đã weekly Pro / daily Enterprise. Alt/nén/audit realtime → không có tần suất.
- Verify: 12 suite / 132 test pass, eslint ok, build exit 0, docs-gate PASS.

#### Overview dashboard (2026-09-30, PO request "dashboard tổng hợp trước, rồi mới tới menu")
- Không có dữ liệu cũ tách được việc AutoPilot khỏi bulk run → counter riêng `autopilotStats/{shopId}.months.{YYYY-MM}` (increment, không TTL, purge cùng shop). Đơn vị = **sản phẩm**, không phải ảnh (đếm ảnh phải đụng handler dùng chung với bulk).
- Hook: products/create (alt / nén / audit), cron 404 (redirect tạo thật, mỗi chunk 1 lần), speed (scan / alert), run-for-existing (lượt chạy). Speed lưu thêm `speedPrevious` để hiện chênh lệch.
- UI: Overview (banner N/6, 5 ô số tháng này + tháng trước, ô speed mobile/desktop + delta + lần check kế) → heading Settings → card như cũ. Component `AutoPilotOverview.js`.
- Commits `a10bd6cf4d7` (BE) + FE commit sau đó. Verify: 29 suite / 287 test, eslint, build exit 0, docs-gate PASS. Counter tính từ lúc deploy, không backfill.

---

## Review & improve (tony-wf, 2026-10-01)

Scope: toàn branch `feat/autopilot` (`git diff origin/master...HEAD`, 76 file, 25 commit), MR !2312.

### Decisions
- Review chia 4 hướng song song (BE correctness · FE · security · cost/ops/tests) thay vì 1 reviewer — diff 8k dòng, 1 reviewer sẽ đọc lướt.
- Chạy in-session, không graph mode — các fix dồn vào cùng vài file autopilot, mỗi fix cần đọc diff fix trước.
- Giữ CI pin `deploy_staging: feat/autopilot` tới khi E2E staging xong; revert là bước trước merge, không phải việc của run này.
- Không merge master mới (origin/master đã đi thêm) — không có conflict với file autopilot (đã check 3bf5841b5bd); merge sau khi review MR.

### Progress
| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| R | Review 4 hướng | general-purpose ×4 (opus/sonnet) | ✅ | — | — | BE 1 high/4 med/5 low · FE 1 high/3 med · Sec 0 high, 4 low · Ops 1 blocker (CI pin) |
| F1 | Tách realtime products/create khỏi bulk run + early exit + dedup | general-purpose / opus | ✅ | 1/5 | clean | `802479a9f5e`; realtime skip trả `{skipped:true}`, không đóng run; early-exit trước GraphQL; dedup log xoá khi dispatch fail |
| F2 | Vòng đời webhook (reinstall, legacy imageHook, already-taken) | general-purpose / sonnet | ✅ | 1/5 | clean | `802479a9f5e`; afterInstall re-register; imageHook xoá products/create legacy; already-taken → ok |
| F3 | Speed monitor hardening + test publisher/subscriber | general-purpose / sonnet | ✅ | 1/5 | clean | `802479a9f5e`; maxInstances 10; speedAlerts chỉ khi gửi được; log mã lỗi SMTP; `store_name \| escape` |
| F4 | FE: warnings, banner, tracking, dọn i18n | general-purpose / sonnet | ✅ | 1/5 | clean | `802479a9f5e`; WEBHOOK_CARDS + merge; banner từ data; feature_started/completed/failed. Bỏ xoá 6 key chết: generator chỉ prune en.json → lệch origin.json (invariant en≡origin) |
| F5 | Controller GET status + test inject now | general-purpose / sonnet | ✅ | 1/5 | clean | `802479a9f5e`; get → status thật; test cố định clock (jest 24 không có setSystemTime → stub Date) |

- Không sửa (low / có sẵn): race `doneOptimize` khi bấm Run đồng thời (FE đã khoá nút, giống manual start); Redis cache 10' có thể giữ setting cũ ngay sau save; Pub/Sub giao trùng → mail 2 lần (hiếm); save đọc ~5 doc (không đáng); `subscribeHandleHook` nuốt lỗi (có sẵn, rethrow có thể chạy lại việc tốn credit).
- Giữ `speedScans` dù chưa hiển thị: ≤1 write/shop/ngày, là data cho trend sau.
- Harness verify: 1 contract gộp cho F1–F5 thay vì mỗi task 1 cái — 5 task chạy song song cùng worktree, diff của task này nằm ngoài allow của task kia.
- Out-of-scope (báo, không sửa): `/proxy/unsubscribe/:identifier` không xác thực (Base64 JSON, ai biết shopID unsubscribe được); `/api/autopilot*` mở qua swagger JWT → kế thừa lỗ `integrationKeys` không bind shop (đã có memory); `webhookLogRepository.js:70` log full error; `webhookMiddleware.js:26` bỏ HMAC khi `APP_IS_LOCAL="false"` (chuỗi).

#### Task plans
- **F1** Goal: realtime products/create không đóng/không cộng vào bulk run; hết credit/quota chỉ skip ảnh; shop tắt AutoPilot không tốn GraphQL; dispatch lỗi không mất event. Files: `services/autopilot/productCreateService.js`, `services/optimize/productService.js` (chỉ nhánh hết credit/quota), `handlers/webhook/bulkOperationHook.js` (nhánh products/create), `handlers/webhook/createProductHook.js`, tests. Approach: cờ `autopilotRealtime` + `historyId:null, lastHistoryIds:{}` (rejected: chỉ null id — `updateShopData doneOptimize:true` vẫn mở khoá run). Test: `npx jest packages/functions/src/services/autopilot packages/functions/src/handlers/webhook packages/functions/src/services/optimize`. Risk: handler dùng chung bulk run — nhánh không cờ phải giữ nguyên. Rollback: revert commit.
- **F2** Goal: reinstall đăng ký lại webhook khi còn flag; legacy `products/create`→`/webhook/image` bị xoá; userError "already taken" → ok. Files: `handlers/webhook/imageHook.js`, `services/installationService.js` (afterInstall), `services/shopifyService.js` (`createProductCreateWebhook`), tests. Test: jest các file đó. Risk: afterInstall chạy mọi install — phải never-throw. Rollback: revert.
- **F3** Goal: subscriber có `maxInstances`; `speedAlerts` chỉ khi gửi được ≥1 mail; log mail không lộ email; `store_name` escape; test publisher/subscriber + `shop.isMerchantUnsubscribe`. Files: `handlers/exports/pubsubFunctions.js` (1 dòng), `services/autopilot/speedMonitorService.js`, `templates/notifySpeedDropTemplate.html`, `handlers/cron/publishAutopilotSpeedMonitor.js`, `handlers/pubsub/subscribeAutopilotSpeedMonitor.js`, tests, `docs/features/autopilot.md`. Test: `npx jest packages/functions/src/services/autopilot packages/functions/src/handlers`. Risk: thấp. Rollback: revert.
- **F4** Goal: warning chỉ card dùng webhook + merge; banner từ data đã lưu; tracking Run theo spec (started/completed/failed + error_reason); xoá key chết. Files: `packages/assets/src/pages/AutoPilot/*`, `const/productAnalytics.js` nếu cần, locales (regen). Test: build embed+standalone exit 0, eslint. Risk: tracking schema sai. Rollback: revert.
- **F5** Goal: `GET /autopilot` lỗi trả status thật + test; test dùng đồng hồ thật inject `now`. Files: `controllers/autopilotController.js` + test, `repositories/__tests__/autopilotStatsRepository.test.js`, `services/autopilot/__tests__/autopilotService.test.js` (+ chỗ nhận `now` nếu cần trong service). Test: jest các file. Rollback: revert.

### Verify (2026-10-01)
- `harness verify` contract `contracts/autopilot-review-fixes.json`: **pass 8/8** (base, scope 27 file, jest-autopilot, eslint, assets-build, docs-gate, security, stable).
- Full `src` jest: 340 suite, 6 fail — 4 có sẵn (shopify2026Client, overviewCardScore, onPageListQuery.helpers, workListStore) + 2 flaky chỉ khi chạy full (jobRegistryService, openrouter/truncation: pass riêng lẻ cả trên base `13e67ee9ee5` lẫn HEAD).
- Security toàn branch: 0 high/critical; 4 low → 2 fixed (escape, log PII), 2 kept (race doneOptimize có sẵn; dedup fixed ở F1).

**COMPLETE (review round)** — commit `802479a9f5e`, pushed, MR !2312 vẫn Draft. Rounds: 1/5 mỗi task. Trước merge: revert CI pin `51fb98d297f`, E2E staging 1.
