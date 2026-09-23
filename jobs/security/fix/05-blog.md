# 05 — BLOG security fix (high)

Repo: `projects/Falcon/blogs`. Base: `origin/master` @ `d1c15544a` (MR blogs base từ `master`).
Prod deploy theo tag — master đi trước tag rất xa, fix chỉ tới prod khi cắt tag. Luật chung: `README.md`.
Verify: `verify/BLOG.md` — 60 row → **33 real**, 20 dup, 7 already-fixed (FAL-759, FAL-757,
`dcdd6a27c` dev zone), 0 refuted. 24 nhóm → gộp còn 12 task.

**Trạng thái: CHỜ TUAN DUYỆT danh sách nhóm dưới đây.** Chưa task nào được dispatch.
Repo **không có** skill `security` — §8 dùng checklist sàn.

## Tuan làm tay trước (ROTATE)

- G1 npm registry token — `.npmrc` ×3, `.yarnrc.yml` (token chung fleet)
- G20 Shopify Admin token dạng thật trong `codegen.js`
- G24 `YOUTUBE_API_KEY` lộ qua `*url.Error` của Go (phòng ngừa)

## Tasks (sau khi duyệt)

| # | Nhóm | Agent / Model | Loại | Ghi chú |
|---|---|---|---|---|
| 1 | G21 bỏ `serviceAccountKey` khỏi response `prepareShop()` (`helpers.js:26`) | cavecrew-builder / haiku | code | key GA **merchant tự upload**, trả về đúng shop đó — không cross-tenant, không rotate. Lý do sửa: private key không cần ra browser (XSS/log). FE chỉ cần `isConfigured` |
| 2 | G1/G20/G24 gỡ credential → env; bọc lỗi Go không in URL | cavecrew-builder / haiku | code | sau khi rotate |
| 3 | G14 langGraph idempotency | ✅ db205fc2c | 2 | clean | key `langgraph_<shopId>_<uuid>`; test đỏ trước fix, xanh sau |
| 4 | G22 `validateAccessToken` không bind `integration.shopId` với `X-SEO-Shop-Domain` | general-purpose / opus | auth | mirror FAL-757; exploit được qua BFCM downgrade |
| 5 | G15+G16+G19 shop từ request | ✅ 9a5326d56 | 1 | clean | G19 gate bằng canAccessDevZone (caller duy nhất là DevZone clone) thay vì ép session shop |
| 6 | G9+G10+G13+G7 IDOR theo doc id (`authorController`/`componentsController`/`sidebarAdsController`, `blogAssist` theo blogId, `genAIBlogController` historyId, `blockUser`) | general-purpose / opus | auth | helper ownership chung. G10 doc thiếu field shop → tách migration nếu cần |
| 7 | G6 `isTeamAvada` do client tự khai + G11 competitor list global ghi/xoá được từ router merchant | general-purpose / sonnet | auth | chuyển sang router DevZone |
| 8 | G18 `POST /api/shop` blocklist → allowlist | general-purpose / sonnet | code | liệt kê field FE thật sự ghi |
| 9 | G17 `GET /proxy/ai-summary/blogs` không auth, không plan gate | cavecrew-builder / haiku | code | route test sót → kiểm caller rồi xoá |
| 10 | G4 OAuth Google popup: không `state`, `postMessage("*")`, không check origin | general-purpose / opus | auth | |
| 11 | G3+G5 log header/shop object ra console + Sentry (`clientFetchSSE.js`, `debugHelper.js`, `ModalImport.js`) | cavecrew-builder / haiku | code | |
| 12 | G2 rules mở: `articles`, `blog-media/{shopId}` | general-purpose / opus | rules | file cấm §8 → **được phép rõ ràng**; kiểm client SDK trước |

G12 (DevZone redis không scope theo shop impersonate) chỉ staff CRM chạm được → **medium thực tế**, để ngoài.

## Tách ticket riêng (migration)

- **G8** shop secrets (`accessToken`, GA key) stream thô sang BigQuery `avada-crm` — sửa mask là
  code, nhưng **bảng đã có row lộ** → xoá/rewrite. Ghi GCP → xác nhận project id trước.
- **G23** integration key lưu plaintext → hash (cùng hướng TS AI internal-token).

## Test

Mỗi task: test hồi quy đúng exploit, test suite `packages/functions`; task FE (10, 11) thêm build
`packages/assets`. Security check §8.

## Progress

Worktree `projects/Falcon/blogs-wt-security-high`, branch `fix/security-high-2026-09` từ `origin/master` @ `d1c15544a`.
Install: `corepack yarn@4.9.1 --cwd <wt> install --immutable` (lần đầu `corepack yarn` ngoài cwd repo rơi về yarn 1.22 và viết lại `yarn.lock` → đã `git checkout -- yarn.lock`, cài lại bằng 4.9.1, tree sạch).
Test: `env -u GOOGLE_APPLICATION_CREDENTIALS ./node_modules/.bin/jest packages/functions` (shell có `GOOGLE_APPLICATION_CREDENTIALS` trỏ file không tồn tại → 8 suite chết vì firebase-admin init).
Baseline trước khi sửa: 89 suite, 2 fail sẵn (`redis.service.test.js` thiếu `REDIS_HOST`, `removeRecipeMetafields.test.js` thiếu shim `fetch` cho openai) — 1 test fail / 585. Không liên quan task nào.

| # | Task | Status | Rounds | Sec | Notes |
|---|---|---|---|---|---|
| 1 | G21 serviceAccountKey khỏi prepareShop | ⛔ BLOCKED | 0 | — | FE đọc chính key (Analytics/index.jsx:220-224) |
| 2 | G1/G20/G24 credential | ⏭ SKIP | — | — | chờ Tuan rotate |
| 3 | G14 langGraph idempotency | … | | | |
| 4 | G22 validateAccessToken bind shop | ⛔ BLOCKED | 0 | — | SEO gọi bằng 1 key dùng chung mọi shop |
| 5 | G15+G16+G19 shop từ request | … | | | |
| 6 | G9+G10+G13+G7 IDOR doc id | … | | | |
| 7 | G6 isTeamAvada + G11 competitors | … | | | |
| 8 | G18 POST /api/shop allowlist | … | | | |
| 9 | G17 /proxy/ai-summary/blogs | … | | | |
| 10 | G4 OAuth Google popup | … | | | |
| 11 | G3+G5 log header/shop | … | | | |
| 12 | G2 rules articles, blog-media | … | | | |

### Log

**Task 1 — G21** — ⛔ BLOCKED
- Goal: `prepareShop()` không trả `googleAnalytics.serviceAccountKey`.
- Files allowed: `packages/functions/src/helpers/helpers.js`.
- Approach: xoá field khỏi `preparedData.googleAnalytics` (`helpers.js:23-28`).
- Test command: jest functions.
- Risk: FE đang đọc key.
- Rollback: revert commit.
- **BLOCKED — caller hợp lệ đọc chính key:** `packages/assets/src/pages/Analytics/index.jsx:220-224`
  `JSON.parse(shop.googleAnalytics.serviceAccountKey).client_email` để hiện "GA4 Connected: <email>";
  `index.jsx:53-57` dùng `serviceAccountKey` làm fallback cho `isConfigured`. Xoá field → dòng
  "Connected" thành "Not connected". Hướng gỡ (cần FE, ngoài phạm vi brief duyệt): server trả
  `googleAnalytics.clientEmail` thay cho key, FE đọc `clientEmail`, rồi mới xoá key.

**Task 2 — G1/G20/G24** — ⏭ SKIP theo lệnh (chờ rotate).

**Task 4 — G22** — ⛔ BLOCKED
- Goal: `validateAccessToken` từ chối khi `integration.shopId` ≠ shop của `X-SEO-Shop-Domain`.
- Files allowed: `packages/functions/src/middleware/validateAccessToken.js` + test.
- Approach: mirror `swaggerAuth.js:40-47` (resolve shop theo domain, so `integration.shopId`).
- Test command: jest functions.
- Risk: caller máy-với-máy dùng key không bind shop.
- Rollback: revert commit.
- **BLOCKED — caller hợp lệ sẽ gãy:** app SEO gọi `/proxy/shop/blog`, `/proxy/blog/bfcm-sale`,
  `/proxy/blog/bfcm-sale/deactivate` bằng **một** key dùng chung cho mọi shop:
  `seo@origin/master packages/functions/src/services/seoOnService.js:15,53,114`
  (`accessToken = AVADA_SEO_ON_BLOG_PRO_ACCESS_TOKEN`, `X-SEO-Shop-Domain: shopifyDomain` của shop đang xử lý),
  dùng ở `seo shopController.js:554`, `shopifyController.js:969`, `subscriptionService.js:281,301,633,736`.
  Bind shop = mọi call BFCM activate/deactivate + check-install từ SEO trả 403 (trừ đúng 1 shop sở hữu key).
  Cần quyết định thiết kế trước: tách key service-to-service (collection riêng, cờ `service: true`,
  kiểu `/proxy/internal-token` FAL-757) rồi mới bind key merchant. Ghi nhận cả fleet: pattern
  `integration-key-unbound-fleetwide` ở SEO/IMG/AEO chắc chắn có caller dùng key chung tương tự.

**Task 3 — G14** — ✅ `db205fc2c`
- Goal: body `generationId` không còn quyết định có trừ token hay không.
- Files allowed: `controllers/langGraphController.js`, test mới.
- Approach: `langGraphController.js:168` `idempotencyKey: generationId` → key server mint mỗi request
  `langgraph_${shop.id}_${randomUUID()}`. Pipeline trả tiền chạy mỗi request (`:107`), nên mỗi request trừ 1 lần là đúng.
  `generationId` vẫn dùng cho dedup article (`saveGeneratedArticle`, `blogGenerationClaimRepository`) — không đụng.
- Test command: `jest packages/functions` + `controllers/__tests__/langGraphController.idempotency.test.js`.
- Risk: client retry cùng generationId giờ bị trừ lần 2 — đúng, vì pipeline chạy lại thật.
- Rollback: revert commit.
- Caller: FE duy nhất `GenerateBlogPost.jsx:438` gửi `generationId` — không đổi hành vi FE.
- Rounds 2: vòng 1 test lỗi `AbortController is not defined` (jest 24 env) → stub trong test.
- Test: fix gỡ ra → 2/2 đỏ; có fix → 2/2 xanh. Suite: 90 suite / 2 fail baseline, 586/587.
- Sec: không secret, không file cấm, shop từ session. Ghi chú còn lại: claim doc `blogGenerationClaims/{generationId}`
  vẫn global theo id client (shop A replay id của B → nhận `articleId` của B, chỉ là id) — low, để ngoài.

**Task 5 — G15+G16+G19** — ✅ `9a5326d56`
- Goal: shopId chỉ từ session trên `/api/settings` (GET/PUT) và `/api/get-article-customer`.
- Files allowed: `controllers/settingsController.js`, `repositories/settingsRepository.js`, `controllers/shopController.js`, test mới.
- Approach: G15 `settingsController.js:34-37` — `?domain=` chỉ dùng khi không có `ctx.state.user` (path `/proxy/settings`
  mount ở `handlers/proxy/clientApi.js`, không có session). G16 `settingsRepository.js:8-17` — bỏ `shopId` khỏi body,
  `add({...fields, shopId})`. G19 `shopController.js:323` — caller duy nhất là DevZone clone
  (`assets/src/pages/DevZone/index.jsx:168`, cố ý đọc shop khác) → ép session shop sẽ giết tính năng; gate bằng
  `canAccessDevZone` giống `devZoneController.update`.
- Test command: jest functions + `controllers/__tests__/shopFromSession.test.js`.
- Risk: storefront `/proxy/settings?domain=` (theme `sidebar-ads-script.js:7`) — giữ nguyên, có test control.
- Rollback: revert commit.
- Caller check: FE không gửi `?domain=` cho `/api/settings`; không repo nào khác gọi `get-article-customer`
  (grep seo/aeo/apc/img/cdn/components = 0).
- Test: không fix → 4/6 đỏ (2 control xanh); có fix → 6/6. Suite 91 / 2 fail baseline, 592/593.
- Sec: clean — không secret, không file cấm.
