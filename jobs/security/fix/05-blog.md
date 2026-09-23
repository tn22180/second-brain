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
✅ G15 / 🚧 G16 BLOCKED
✅
✅ G7 / 🚧 G6 BLOCKED
✅
| 7 | G6 isTeamAvada + G11 competitors | ✅ 0ef86964d | 1 | clean | gate tại chỗ bằng middleware `requireDevZone` thay vì dời route (0 đổi FE) |
| 8 | G18 POST /api/shop allowlist | ✅ 6f04c7962 | 1 | clean | 9 field merchant; dev zone + internal session giữ blocklist |
| 9 | G17 /proxy/ai-summary/blogs | ✅ 4eb437a92 | 1 | clean | 0 caller → xoá route + handler + route map |
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

**Task 6 — G9+G10+G13+G7** — ✅ `0c6b8f9bc`
- Goal: mọi route mutate/đọc doc theo id client phải kiểm doc thuộc session shop.
- Files allowed: `authorController.js`, `authorRepository.js`, `componentsController.js`, `componentsRepository.js`,
  `sidebarAdsController.js`, `genAIBlogController.js`, `FeatureReq/featureReq.controller.js`, `blogAssist.{controller,service,repository}.js`,
  helper mới `helpers/ownership.js`, test.
- Approach: helper chung `isOwnedByShop(doc, shopId)` (fail-closed). G9 `authorController.js:199` dùng `getAuthorById(id, shopId)` sẵn có;
  `updateDefaultAuthor` cùng lỗi → vá luôn; `componentsRepository.updateComponent(shopId,id,data)`; `sidebarAdsController.js:113,143`
  `findOne` + check, ép `shopId` khi update. G13 `genAIBlogController.js:67,165` check `history.shopId` (history luôn tạo kèm shopId,
  `createHistoryGenAIBlog :413`). G7 `featureReq.controller.js:158` — caller duy nhất `UserComment.jsx:86` gửi `blockId: shop.shopId` của
  chính session → khác session = 403. G10 — doc mới stamp `shopId`; lookup chọn doc của shop; doc cũ không có shopId chỉ được nhận khi
  `getShopifyArticleById({isReadOnly})` thấy article trong shop gọi (article id Shopify là global → chứng minh sở hữu), rồi stamp.
  → **không cần ticket migration** cho G10.
- Test command: jest functions + `controllers/__tests__/docOwnership.test.js`, `services/__tests__/blogAssist.shopScope.test.js`.
- Risk: G10 gọi Shopify 1 lần/legacy doc (lần sau có shopId). Nếu Shopify lỗi → history cũ tạm ẩn, doc mới được tạo; không mất dữ liệu.
- Rollback: revert commit.
- Rounds 2: vòng 1 `babel-plugin-jest-hoist` cấm biến ngoài scope trong `jest.mock` → đổi tên `mockDocs`.
- Test: bỏ fix → 12/14 đỏ (2 control xanh); có fix → 14/14. Sửa 2 test cũ theo API mới (`blogAssist.missingField`, history mock thêm `shopId`).
  Suite 93 / 2 fail baseline, 606/607.
- Sec: clean. Lưu ý vận hành: `git stash` dùng chung giữa các worktree của repo (30 stash của người khác) — từ task 7 kiểm "đỏ khi bỏ fix"
  bằng `git diff > patch` thay vì stash.

**Task 7 — G6+G11** — ✅ `0ef86964d`
- Goal: badge "Avada team" và ghi competitor list chỉ từ phiên dev zone.
- Files allowed: `FeatureReq/featureReq.controller.js`, `routes/api.js`, middleware mới `middleware/requireDevZone.js`, test.
- Approach: G6 `featureReq.controller.js:88` — `isTeamAvada = body.isTeamAvada === true && canAccessDevZone(...)`; nhánh merchant ép
  `shopId` session sau spread body. G11 — `requireDevZone` trên `POST/DELETE /competitors` (`api.js:294-295`); GET giữ mở.
  Không dời sang `/dev_zone` như brief gợi ý: cùng hiệu quả, không phải sửa FE `DevZone/components/Competitor/Competitor.js`.
- Test command: jest functions + `controllers/__tests__/devZoneOnlyWrites.test.js`.
- Risk: staff comment từ phiên **không** phải CRM login-as ở prod mất badge (hiện như comment của shop đó). Lib
  `avada-feature-request` (dist) tự tính `isTeamAvada` theo email shop `@avadagroup.com` — email shop do merchant tự khai, chính là vector
  spoof, nên mất badge ở đường đó là chủ ý.
- Rollback: revert commit.
- Caller: `GET /competitors` ← `layouts/MainLayout.jsx:54` (mọi merchant, giữ); POST/DELETE ← chỉ DevZone Competitor.js. Không repo khác gọi.
- Test: bỏ fix → 2 exploit test đỏ; có fix → 5/5. Suite 94 / 2 fail baseline, 611/612.
- Sec: clean.

**Task 8 — G18** — ✅ `6f04c7962`
- Goal: merchant session chỉ ghi được field UI thật sự ghi.
- Files allowed: `config/pickFields.js`, `helpers/stripBlockedShopFields.js`, `controllers/shopController.js`, `docs/shops.yaml`, test.
- Approach: `merchantWritableShopFields` = `isEvaluate, rateReview, adminLocale, isCloseModalUpgrade, recentOpenedArticles, translatedBlogs,
  analyticsBlogs, planDiscountCode, dismissedBanners` — lấy từ mọi caller `POST /shop` trong assets: `GrowthHacking.jsx:32,56`,
  `appLocaleContext.js:34`, `maxModalContext.js:60`, `Blog/Edit.jsx:167`, `NavigationContainer.jsx:230`, `AutoTranslateBtn.js:64`,
  `UserChargeInfo.jsx:64`, `useDisplayBanner.js:87`. `shopController.js:129` → allowlist cho merchant; dev zone
  (`DevZone/index.jsx:149` ghi `[field]` tuỳ ý) + internal support session (`ctx.state.internal`, có audit) giữ blocklist cũ.
- Test command: jest functions + `shopFromSession.test.js` (G18 block), `stripBlockedShopFields.test.js`.
- Risk: field nào FE ghi mà sót → bị bỏ im lặng. Đã grep `/shop` ở assets/editor/avadaseo + lib `avada-feature-request`,
  `avada-components-seoon` (0 hit). Swagger `shops.yaml` từng ghi "free-form" — đã sửa.
- Rollback: revert commit.
- Test: bỏ fix → exploit test đỏ; có fix → 13/13. Suite 94 / 2 fail baseline, 616/617.
- Sec: clean. Còn lại (không trong brief): `analyticsBlogs`/`translatedBlogs` giới hạn 10 chỉ ở FE → merchant gửi mảng dài vẫn qua;
  `planDiscountCode` do merchant tự đặt — cần kiểm ở chỗ charge đọc nó.

**Task 9 — G17** — ✅ `4eb437a92`
- Goal: không còn endpoint public trả danh sách article AI-summary của shop bất kỳ.
- Files allowed: `routes/proxy.js`, `controllers/settingsController.js`, `config/eventTrackerProxyRouteMap.js`, test.
- Approach: caller check trước — `ai-summary/blogs` chỉ xuất hiện ở `proxy.js:45-46` (`// test`), handler `settingsController.getBlogs:250`,
  route map `eventTrackerProxyRouteMap.js:20` và 2 file docs superpowers. Theme extension (`ai-summary.liquid:245`) chỉ gọi `/vote`;
  `services/proxy-go` không có; grep seo/aeo/apc/img/cdn/components = 0. → xoá route + handler + entry route map.
- Test command: jest functions + `routes/__tests__/proxyRoutes.aiSummaryBlogs.test.js`; `node scripts/check-swagger-coverage.js` (0 lệch).
- Risk: cache storefront cũ gọi route → 404 thay vì data; không caller nào tồn tại.
- Rollback: revert commit.
- Test: bỏ fix → 2/3 đỏ; có fix → 3/3. Suite 95 / 2 fail baseline, 619/620.
- Sec: clean.
