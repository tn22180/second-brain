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
| 4 | G6 creditCost từ body | ✅ | 1 | clean | `4e13a4f` |
| 5 | G8 `PUT /shop` self-grant | … | | | |
| 6 | G7 body spread `shopId`/`id` | … | | | |
| 7 | G5 `updateRegenerateProcess` | … | | | |
| 8 | G9 `/syncData/:shopifyDomain` | … | | | |
| 9 | G4 Flow extension routes | … | | | |
| 10 | G10 swagger-token query | … | | | |
| 11 | G12 log redact | … | | | |
| 12 | G13 shop doc vào Pub/Sub | … | | | |
| 13 | G3 firestore.rules | … | | | |

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
