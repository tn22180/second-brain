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
| 3 | G14 idempotency key langGraph do client quyết → gen AI miễn phí vô hạn | general-purpose / opus | billing | key sinh server-side |
| 4 | G22 `validateAccessToken` không bind `integration.shopId` với `X-SEO-Shop-Domain` | general-purpose / opus | auth | mirror FAL-757; exploit được qua BFCM downgrade |
| 5 | G15+G16+G19 shop lấy từ request: `?domain=` ở `/api/settings`, body `shopId` spread vào settings, `getBlogCustomer` shopId từ body | general-purpose / opus | auth | 1 luật: shopId chỉ từ session |
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
| 3 | G14 langGraph idempotency | ✅ db205fc2c + 8426db561 + 459f51871 + 31a7297f2 | 5 | fixed | r4: replay trước check balance; run chết (quá 10 phút) được chiếm lại; add-on APC: checked, n/a |
| 4 | G22 validateAccessToken bind shop | ⛔ BLOCKED | 0 | — | SEO gọi bằng 1 key dùng chung mọi shop |
| 5 | G15+G16+G19 shop từ request | ✅ 9a5326d56 | 1 | clean | G19 gate bằng canAccessDevZone (caller duy nhất là DevZone clone) |
| 6 | G9+G10+G13+G7 IDOR doc id | ✅ 0c6b8f9bc | 2 | clean | helper `isOwnedByShop`; G10 không cần migration |
| 7 | G6 isTeamAvada + G11 competitors | ✅ 0ef86964d + c4f75c690 | 2 | fixed | review: `shopOwner` body giả "Avada team" → resolve server-side |
| 8 | G18 POST /api/shop allowlist | ✅ 6f04c7962 + 50dd3e788 | 2 | fixed | review r2: `/shop/field-number` increment field tuỳ ý → chỉ `isYoutubeSlotActive`; internal key cần `devZone` |
| 9 | G17 /proxy/ai-summary/blogs | ✅ 4eb437a92 | 1 | clean | 0 caller → xoá route + handler + route map |
| 10 | G4 OAuth Google popup | ✅ 2fbff2606 + c4f75c690 | 3 | fixed | review: receiver check tách helper + test mutation 3 điều kiện |
| 11 | G3+G5 log header/shop | ✅ 076a0a1ad + c4f75c690 | 3 | fixed | review: depth>6 từng trả raw → `[truncated]` |
| 12 | G2 rules articles, blog-media | ◐ 4779e18de (blog-media) · ⛔ articles | 1 | clean | Storage đóng write; Firestore `articles` BLOCKED — embed app đọc/sửa/xoá qua client SDK không có Firebase Auth |
| 13 | langGraph regenerate featured-image/metadata không check/trừ credit — **added 2026-09-23 from review** | ✅ b8c2eb715 + 241bf849a | 2 | fixed | r2: metadata body ≤60k/title ≤500 → 413; rate limit như featured-image; MCP để nguyên (cố ý free) |
| 14 | `POST /api/shopInfos` ghi raw body (đổi `shopId` → trỏ sang shop khác) — **added 2026-09-23 from raw-body hunt** | ✅ 393c5f07c | 1 | fixed | allowlist `[planName]` (caller duy nhất DevZone); repo luôn bỏ `shopId/idShopInfo/id` + key có dấu chấm |

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
- Add-on (coordinator, pattern APC fail review) — **checked, n/a**, không commit thêm:
  (a) không route nào tính giá theo count trừ id client: `selectAll/deselectedIds` chỉ có ở export CSV (`articleController.js:1546`,
  `subscribeExportAllArticles.js`) — không trừ credit. Mọi 14 call site `reduceTokens` tính sau khi chạy, theo `usage`/output thật.
  (b) không có count helper nuốt lỗi trả 0; `textTokenCost` (`helpers/tokenCost.js`) chỉ ra 0 khi provider không trả usage **và** output rỗng.
  Lưu ý (không phải pattern (b), để Tuan quyết): mọi caller bọc `reduceTokens(...).catch(() => null)` → Firestore lỗi lúc trừ = việc đã giao,
  không trừ (fail-open có chủ ý kiểu charge-after, đã có pre-check `hasEnoughTokens`/`isOutOfTokens`).
  (c) worker không đọc model: `subscribeHandleBatchArticleSummary`/`SummaryNewPublished`/`processLocaleSummary` dùng model mặc định
  `GPT_4_1_MINI`, không re-read theo batch.
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

**Task 10 — G4** — ✅ `2fbff2606`
- Goal: token GA chỉ tới đúng opener của app; opener chỉ nhận message từ popup mình mở.
- Files allowed: `controllers/googleController.js`, `assets/src/pages/Analytics/GoogleAnalyticsConfig.jsx`, test.
- Approach: `state = {nonce, origin}` do FE sinh (`crypto.getRandomValues`). Callback (`googleController.js:117-131` cũ) postMessage tới
  `origin` nếu thuộc allowlist {origin redirect URI, `APP_BASE_URL`, twin `.web.app`↔`.firebaseapp.com`}, không thì origin chính callback;
  bỏ `"*"`. FE `handleMessage` (`GoogleAnalyticsConfig.jsx:159` cũ) check `event.source === popup`, `event.origin === origin(redirect_uri)`,
  `data.nonce === nonce`. Không cần session/secret: allowlist chặn người nhận, nonce chặn message giả.
- Test command: jest functions + `controllers/__tests__/googleOauthCallback.test.js`; assets build `vite build` (embed, prod) — `✓ built in 15.66s`.
- Risk: FE chạy trên origin ngoài allowlist → message rơi, GA connect không xong. Kiểm env (chỉ host, không giá trị bí mật):
  `.env.prod` `APP_BASE_URL` và `GOOGLE_ANALYTICS_REDIRECT_URI` cùng host `avada-blog-app.web.app`; hosting 1 site. FE mới + BE cũ
  → FE bỏ message không có nonce → phải deploy functions + hosting cùng tag (tag blog deploy cả hai).
- Rollback: revert commit.
- Sec: **fixed** — tự phát hiện `state` (attacker kiểm soát, Google echo nguyên) được nhét thẳng vào `<script>` → reflected XSS trên origin app;
  vá bằng escape `<`, U+2028/2029 (có test).
- Rounds 2: build vòng 1 fail do chạy `vite` ngoài `packages/assets` (config dùng path tương đối) → chạy qua node với cwd assets.
  `yarn workspace @avada/assets run production:embed` chết `cross-env: command not found` (bin chỉ khai ở root) — lỗi môi trường, không do code.
- Test: bỏ fix → 5/5 đỏ; có fix → 5/5. Suite 96 / 2 fail baseline, 624/625.

**Task 11 — G3+G5** — ✅ `076a0a1ad`
- Goal: không token session / secret shop nào ra console hay Sentry.
- Files allowed: `assets/src/helpers/clientFetchSSE.js`, `assets/src/helpers/utils/debugHelper.js`, `ModalImport.js`, test mới.
- Approach: `clientFetchSSE.js:42` `requestInfo.headers` → chỉ `Object.keys(...)`; `debugHelper.js` thêm `redactSensitive` (key khớp
  authorization|cookie|token|secret|password|api-key|service-account → `[redacted]`, deep, không mutate) áp cho cả console lẫn
  `Sentry.captureException`; xoá `console.log('shop', shop)` `ModalImport.js:189`.
- Test command: `jest --ci packages/assets/src/helpers/utils/__tests__` (chạy từ root repo, docblock `@jest-environment jsdom`) + jest functions;
  build `vite build` embed prod `✓ built in 13.13s`.
- Risk: log debug SSE mất giá trị header — chủ ý.
- Rollback: revert commit.
- Rounds 2: vòng 1 chạy jest bằng config `packages/assets` → `Cannot use import statement` (babel config ở root) rồi treo; chạy từ root thì xanh.
- Test: bỏ fix → 2/2 đỏ; có fix → 2/2. Suite 97 / 2 fail baseline, 626/627.
- Sec: clean.


**Task 12 — G2** — ◐ một phần: `4779e18de` (Storage) · ⛔ BLOCKED (Firestore `articles`)
- Goal: đóng rule mở `articles` (Firestore) và `blog-media/{shopId}` (Storage).
- Files allowed: `firestore.rules`, `firebase.storage.rules` (brief cho phép rõ).
- Approach: kiểm client SDK trước. Storage — `storage` export ở `assets/src/helpers.js:51` nhưng **0** chỗ dùng (`uploadBytes`/`ref(storage` = 0),
  `blog-media` chỉ xuất hiện trong rules; backend ghi qua Admin SDK (bỏ qua rules) → `allow write: if false`, giữ `allow read`
  (URL media có thể đã nằm trong article đã publish; không kiểm được bucket prod vì cấm đọc GCP).
- **BLOCKED `articles`:** `assets/src/helpers/firestore/articles.js:28-106` query/`updateDoc`/`deleteDoc` thẳng collection `articles` từ client
  (version history: `VersionOptionsByDate/index.js:22`, `GenAIBlog/LeftBar/History/HistoryOption.jsx:20`, `GenAIBlog/index.jsx:19`,
  `useArticleVersions.js:2`). App embed **không** có Firebase Auth (`getAuth` chỉ dùng ở `standalone.js:51`) → `request.auth == null`;
  mọi rule dựa auth/claim làm chết version history ở embed. Hướng gỡ: chuyển 4 thao tác đó sang `/api` (đã có `articleRepository`
  `getLastVersion`/`deleteOtherVersions`) rồi đặt `allow read, write: if false`. Là task riêng (FE+BE).
- Test command: không có harness rules-unit-testing trong repo; diff 1 block. Suite functions không đổi (97 / 2 fail baseline).
- Risk: nếu tool ngoài repo upload vào `blog-media` bằng client SDK sẽ 403 — grep seo/aeo/apc/img/cdn/components = 0.
- Rollback: revert commit (rules chỉ có hiệu lực khi deploy tay).
- Sec: clean. Ngoài brief, cùng lớp: Storage `featureReq/{document}` `read, write: if true`; Firestore `TokenUser`, `historyOptimize`,
  `historyImport`, `support`, `aiSummary` `read: if true` (đọc chéo shop qua client SDK) — đề xuất ticket riêng.

### Ghi chú quy ước key (theo yêu cầu coordinator)
Không task nào chuyển key vào POST body. Hiện trạng BLOG: `POST /proxy/swagger-token` (`middleware/swaggerAuth.js:11`) nhận
`accessToken` trong **body**; `validateAccessToken` nhận `X-SEO-Access-Token` **header**. APC đã chuẩn hoá `Authorization: Bearer`.
→ 3 kiểu khác nhau trong fleet; Tuan chọn 1 quy ước, chưa đổi gì ở đây.

**Review độc lập — FAIL, round 2 (tasks 3, 8 + 4 risk)** — ✅ `50dd3e788`, `8426db561`, `c4f75c690`
- Bug 1 (task 8): `POST /api/shop/field-number` (`shopController.js:184`) `FieldValue.increment` field tuỳ ý → `isLegacyPlan`=1 →
  `isLegacyMiniUnlimited` (`checkTimeShopInstall.js:29`) → langGraph bỏ check token (`langGraphController.js:68`). Fix: allowlist
  `['isYoutubeSlotActive']` (caller duy nhất `SettingGenAiYouTube.jsx:180`). Test 4 field bị từ chối + 1 control. → `50dd3e788`
- Risk 3 (task 8): internal key không có capability dev-zone từng được blocklist path → giờ cần `ctx.state.internal?.devZone === true`. → `50dd3e788`
- Bug 2 (task 3): client đóng kết nối sau `blog_complete` → `return` trước `reduceTokens` → không trừ credit. Fix: abort chỉ bỏ
  `saveGeneratedArticle` + event cuối; luôn trừ khi có `result`. Test mô phỏng `close` trong pipeline. → `8426db561`
- Risk 4 (task 7): `shopOwner` từ body không bị ghi đè ở nhánh merchant (comment **và** feature request `create`) → resolve từ
  `shopInfo.shopOwner` (fallback name/domain), ép `isTeamAvada:false`. → `c4f75c690`
- Risk 5 (task 11): `redactSensitive` depth>6 trả raw → `'[truncated]'`. → `c4f75c690`
- Risk 6 (task 10): check receiver tách `assets/src/helpers/oauth/isTrustedOauthMessage.js`; mutation test: gỡ từng check
  (source / origin / nonce) → đúng 1 test đỏ mỗi lần. → `c4f75c690`
- Red check: gỡ fix nguồn, giữ test → 8/27 đỏ; có fix → xanh. Test cũ "internal session giữ blocklist" bỏ vì hành vi đổi có chủ ý.
- Suite: 98 suite, 640/641 (2 suite fail baseline). Assets build embed prod xanh. Sec: không secret, không file cấm.

**Re-review — round 3** — ✅ `459f51871` (task 3), `b8c2eb715` (task 13)
- Task 3 r3 (hồi quy từ `8426db561`): rớt mạng → bị trừ mà không có article; `ClientFetchSSE` retry cùng generationId → chạy lại + trừ lần 2.
  Fix: sau khi có `result` luôn `saveGeneratedArticle` + trừ, abort chỉ bỏ writeEvent. Run record `blogGenerationClaims/run_<generationId>`
  (cùng TTL `expireAt`) tạo trước pipeline; request trùng id → replay `result` đã lưu (đợi nếu còn chạy, tối đa 8'), không chạy, không trừ;
  run của shop khác → lỗi; run fail → xoá để lần sau chạy bình thường. `generationId` phải khớp `[A-Za-z0-9_-]{8,128}` (FE gửi UUID).
  Vá luôn ghi chú cũ "claim global theo id client". Test: bỏ fix → 4/7 đỏ; có fix 7/7 + 2 test repo.
  Test cũ "replay cùng id → key mới, trừ lần 2" thay bằng "replay không chạy pipeline, mỗi lần chạy thật 1 key riêng" (hành vi đổi có chủ ý).
- **Task 13 (mới, ngoài brief gốc)**: `regenerateFeaturedImage` (`langGraphController.js:209`, FE `RightBar.jsx:113`) và `regenerateMetadata`
  (`:239`, FE `RightBar.jsx:233`) gọi Recraft/LLM không check, không trừ. Fix: featured-image cần balance ≥ `TOKENS_PER_IMAGE` rồi trừ
  `images:1`; metadata `isOutOfTokens` rồi trừ theo output (node không trả usage); key `langgraph_{featured|metadata}_<shop>_<uuid>`;
  trừ lỗi → 500, không trả kết quả. Feature label `LANGGRAPH_FEATURED_IMAGE`/`LANGGRAPH_METADATA` đã có sẵn trong `featureApi.js` mà
  chưa từng dùng. Test: bỏ fix 6/6 đỏ, có fix 6/6.
  `langgraph/index.js`: chỉ 3 entry được gọi — 2 ở trên + `streamBlogWithLangGraph` (task 3). `mcp/tools/generateMetadata.js` và
  `mcp.writeArticle.service.js` **không trừ credit — cố ý**: `src/mcp` token-free + gate plan Pro, khoá bằng
  `mcp/tools/__tests__/mcpFreeTokens.test.js` ("has no token-deducting code left anywhere under src/mcp") → không đổi, **câu hỏi cho Tuan**.
- Ghi nhận, không sửa (theo lệnh):
  - Pipeline throw giữa chừng sau khi đã tốn model → không trừ (`langGraphController.js` catch của `generate`) → follow-up.
  - Internal key không có `devZone` gửi field ngoài allowlist `POST /api/shop` → 200 im lặng, field bị bỏ (`shopController.js:141`) → hỏi Tuan (nên 400?).
- Suite: 100 suite (functions + 2 assets), 652/653; 2 suite fail = baseline. Sec: không secret, không `.catch(() => null)` mới, không file cấm.

**Round 4 (risk rẻ)** — ✅ `31a7297f2` (task 3), `241bf849a` (task 13)
- Task 3 r4: (1) check balance chạy trước lookup run → merchant tiêu credit cuối cho article, rớt mạng, retry cùng id → 400. Giờ `getRun`
  trước; run cùng shop còn sống/đã xong → bỏ check, replay; run mới vẫn bị check. (2) `failRun` chỉ ở catch → function bị kill ở timeout
  540s để record `running` cả TTL 24h. Giờ lưu `startedAt`; `running` quá `RUN_STALE_MS` = 10 phút là chết: `startRun` chiếm lại (update
  precondition `updateTime`, retry tranh nhau chỉ 1 thắng), `waitForRun` thôi đợi; shop khác không chiếm được. Test: bỏ fix 3/15 đỏ.
- Task 13 r2: `/langgraph/metadata` body không giới hạn (`blogPostSchema` chỉ `min(1)`) + không có trong `config/rateLimit.js`. Giờ title >500
  hoặc body >60.000 ký tự → 413 trước LLM/trừ credit (bài dài nhất app sinh là 1500–2000 từ ≈14k ký tự, `assets/src/const/genAIBlog.js:49`);
  rate limit giống featured-image (3/300s). Không sửa `blogPostSchema` vì `formatResponseNode` của generator dùng chung. Test: bỏ fix 2/9 đỏ.
- Suite: 100 suite, 661/662 (2 suite fail baseline). Sec: không secret, không file cấm.
- **Ghi nhận cho ticket credit toàn fleet (không sửa):** check-rồi-trừ, số dư kẹp về 0, không atomic (featured image / blog generate) → cần giữ
  chỗ (reserve) trong transaction; throw muộn sau khi đã stream body → bỏ qua trừ; request trùng id đang đợi chiếm slot concurrency của `api`.
- **Câu hỏi cho Tuan:** shop legacy GPT-4.1-mini (`isLegacyMiniUnlimited`) được metadata free (chỉ text) — có chủ ý không?

**Task 14 — raw body `POST /api/shopInfos`** — ✅ `393c5f07c` (added 2026-09-23 from raw-body hunt)
- Goal: session không ghi được field tuỳ ý (nhất là `shopId`) lên doc shopInfo.
- Files: `controllers/shopInfosController.js`, `repositories/shopInfoRepository.js`, `docs/shops.yaml`, test mới.
- Approach: `shopInfosController.js:12` ghi nguyên `ctx.req.body` → `WRITABLE_SHOP_INFO_FIELDS = ['planName']` (caller duy nhất
  `assets/src/pages/DevZone/index.jsx:189` → toggle "Open test store read"; grep seo/aeo/apc/img/components không repo nào gọi `/shopInfos` của blog);
  body không có field hợp lệ → 400. `updateShopInfosData` (`shopInfoRepository.js:32`) bỏ `shopId/idShopInfo/id` và key có dấu chấm cho **mọi**
  caller (caller nội bộ `shop.service.js:117` ghi `domain/passwordEnabled`, không bị ảnh hưởng). `shops.yaml` bỏ "no field whitelist".
- Exploit đã chặn: body `shopId` của shop khác → `getShopInfoByShopId/ByShopName` trỏ sai → `handleReviewUpdates.js:208-226`
  `updateShopData(shopInfo.shopId, {hasReview:true})` lên shop không sở hữu.
- Test: bỏ fix 3/4 đỏ (control planName xanh); có fix 4/4. Suite 101 suite, 665/666 (2 fail baseline). Swagger coverage 0 lệch, yaml parse ok.
- Sec: clean. Ghi chú: `planName` vẫn ghi được từ phiên merchant (route không gate dev zone); server không dùng `shopInfo.planName` cho quyền
  (chỉ `isShopifyPlanTest` ở FE) → để nguyên, nếu muốn chặt thì gate `requireDevZone`.

### Tổng kết
Tổng 17 commit = 9 lần đầu + 3 review r2 (50dd3e788, 8426db561, c4f75c690) + 2 r3 (459f51871, b8c2eb715) + 2 r4 (31a7297f2, 241bf849a) + task 14 (393c5f07c). Lần đầu, trên `fix/security-high-2026-09`: db205fc2c (3), 9a5326d56 (5), 0c6b8f9bc (6), 0ef86964d (7), 6f04c7962 (8), 4eb437a92 (9),
2fbff2606 (10), 076a0a1ad (11), 4779e18de (12 phần Storage). BLOCKED: 1, 4, 12-articles. SKIP: 2. Suite cuối: 101 suite, 665/666 test
xanh; 2 suite fail = baseline có sẵn trên master. Assets build embed prod xanh.
