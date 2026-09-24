# Security fix — theo từng app

Tiếp `jobs/security/security.md` + `audit-jira.md`. Quyết định 2026-09-23 (Tuan).

## Phạm vi — đã chốt (A)

- Chỉ finding **security, severity high**, đã verify tay trên code hiện tại. Medium/low và
  hygiene (≈10.8k eslint) **không** nằm trong job này.
- Input: ledger `~/.cache/prod-autofix/state.db`, gộp mọi run, distinct `file:line` →
  `findings/<APP>.tsv`. SEO 83 · IMG-OPT 68 · BLOG 60 · APC 45 · AEO 34 = 290 row
  (có trùng root cause — verify gộp lại).

## Vì sao tool phải sửa trước (brief 00)

Ledger đang nói sai. `classify()` (`src/audit/ledger.ts:65-69`) resolve mọi row open không có
trong `found`; khi lane security fail, `job.ts:326-351` truyền `found` rỗng phần security →
toàn bộ finding security của app bị lật `resolved`. Run 2026-09-21 fail ở 4 app → ledger còn
**0** security open cho SEO/BLOG/AEO/IMG-OPT. Bật Jira lúc này = comment "đã hết" lên ticket.

Thêm: `findingFp` băm `title` do LLM viết (`findingFp.ts:18`) → cùng lỗi khác chữ = fp mới.
504 vị trí distinct nhưng 1276 fp.

## Thứ tự

| Brief | Repo | Ref lúc verify | Trạng thái |
|---|---|---|---|
| `00-tool.md` | `tools/prod-error-autofix` | — | chờ `/init` (repo chưa có `CLAUDE.md`) |
| `01-apc.md` | `ai-product-copy` | `origin/master` b216428 | verify |
| `02-seo.md` | `seo` | `origin/master` 0547925a9cb | verify |
| `03-img.md` | `avada-image-optimizer` | `origin/master` 709f11f6 | verify |
| `04-aeo.md` | `llm-ai-search-seo` | `origin/main` 7cab2d5 | verify |
| `05-blog.md` | `blogs` | `origin/master` d1c15544a | verify |

AEO default branch là **`main`**, không phải master. Local AEO đang ở feature branch — mọi
worktree tạo từ ref remote.

## Luật cho mọi brief app

1. **Verify trước, dừng cho Tuan duyệt.** Kết quả ở `verify/<APP>.md`. Không task fix nào
   dispatch khi danh sách chưa duyệt.
2. **Đơn vị sửa = nhóm root cause**, không phải từng finding. 1 nhóm = 1 task tony-wf.
   Chạm ranh giới auth → `general-purpose / opus`. Còn lại sonnet.
3. **Route public: kiểm caller trước khi đóng.** Scripttag/storefront, webhook Shopify,
   cron có thể phụ thuộc — đóng nhầm là outage.
4. **Credential bị commit: ROTATE — Tuan.** Brief chỉ liệt kê loại + `file:line`, không bao
   giờ ghi giá trị. Gỡ khỏi code chỉ SAU khi Tuan xác nhận đã rotate.
5. **Đổi schema/data** (kiểu FAL-720 `integrationKey`) → tách ticket riêng, không nhét MR.
6. 1 app = 1 branch từ ref remote = 1 MR. Deploy tay theo tag. Không `firebase deploy`.
7. Jira lane của tool **tắt** tới khi brief 00 xanh 2 sáng liên tiếp.

## Kết quả verify — 2026-09-23

| App | Row | Real | Dup | Already-fixed | Refuted | Task |
|---|---|---|---|---|---|---|
| APC | 45 | 23 | 22 | 0 | 0 | 13 |
| SEO | 83 | 47 | 29 | 6 | 1 | 13 |
| IMG-OPT | 68 | 32 | 28 | 8 | 0 | 10 |
| AEO | 34 | 13 | 19 | 2 | 0 | 7 |
| BLOG | 60 | 33 | 20 | 7 | 0 | 12 |
| **Tổng** | 290 | **148** | 118 | 23 | 1 | 55 |

LLM audit: 1/290 sai hẳn. Nhiễu nằm ở trùng lặp (41%) và độ nặng (BLOG G21 bị thổi phồng — key GA
của chính merchant, không cross-tenant).

## Pattern lặp cả fleet — sửa 1 chỗ nghĩ cho 5 app

| Pattern | APC | SEO | IMG | AEO | BLOG |
|---|---|---|---|---|---|
| npm registry token commit (1 token chung) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Integration key không bind shop (FAL-720 class) | vá | ✓ | ✓ | ✓ | ✓ |
| Shop doc (có token) vào Pub/Sub / BigQuery | ✓ | ✓ BQ | ✓ | ✓ cả 2 | ✓ BQ |
| Webhook HMAC tắt/yếu | ✓ | — | ✓ | ✓ | — |
| Firestore/Storage rules mở | ✓ | ✓ | ✓ | ✓ | ✓ |
| Crisp/Translate key commit | ✓ | — | ✓ | ✓ | vá |
| Tự cấp credit/plan qua body | ✓ | ✓ | ✓ | ✓ | ✓ |

Rotate npm registry token **1 lần**, cập nhật CI cả 5 repo cùng lúc — rotate lẻ từng app là làm
gãy install của 4 app còn lại.

## Khẩn — không chờ duyệt cả brief

1. IMG-OPT `shopifyService.js:39` `console.log(shopifyDomain, accessToken)` — token rõ mọi shop vào
   Cloud Logging mỗi lần gọi API. Đã kiểm tay trên `origin/master`.
2. SEO `proxy.js:43/80/99/101` + `handlers/reset.js` — ghi theme / gọi Admin API / xoá data của
   shop bất kỳ, không auth. Đã kiểm tay.
3. **`avada-components-seoon` (public npm, maintainers tunglv/truongnn/lamln/tnam) export cứng
   5 proxy token**: `SEO_/BLOG_/IMAGE_/AI_/AEO_PROXY_ACCESS_TOKEN` —
   `avada-components/src/config/constants.ts:18-22`. Package public từ 2025-06-06, bản mới nhất
   2.2.0 (2026-09-22). Được bundle vào assets của SEO/BLOG/APC/AEO/IMG-OPT → token còn nằm cả
   trong JS mọi merchant tải. Mọi version cũ trên npm vĩnh viễn giữ token → **rotate cả 5 là bắt
   buộc**; sửa lib (token → gọi qua backend của app) trước, rồi rotate, rồi bump lib ở 5 app.
   Rotate G1 lẻ từng app trước khi lib sửa = vô nghĩa. Phát hiện bởi agent APC task 2.

## Kết quả fix — 2026-09-24

Mỗi app: worktree `projects/Falcon/<repo>-wt-security-high`, branch `fix/security-high-2026-09`,
commit local, **chưa push**. Mỗi branch qua reviewer opus độc lập tới khi 0 🔴; test so với baseline
master (fail còn lại = fail có sẵn trên master).

| App | Commit | Test cuối | Còn BLOCKED |
|---|---|---|---|
| APC | 18 (`215c37a`) | 485/490, 5 fail `devZone` có sẵn | rules read-scope (cần Firebase Auth embed); `VITE_RELEASE_API_TOKEN` cần sửa CI |
| SEO | 24 (`9f5115c88fd`) | 2037/2040, 2 fail có sẵn + flaky | `/proxy` jsonl/revert-product (extension ngoài repo, hỏi Lâm); ingress internalGen2; G6 FAL-720; `?accessToken=` fallback |
| IMG-OPT | 14 (`87b03289`) | 2236/2260, 24 fail = baseline | rules (Firebase Auth embed + `storage` thiếu trong `firebase.json`); 2 race speed-audit |
| AEO | 8 (`7cb93b8`) | 327/327 | competitors (chờ Tuan); storage rules chưa deploy (`firebase.json`) |
| BLOG | 17 (`393c5f07c`) | 657/658, 2 suite fail có sẵn | task 1 GA key (FE đọc key); task 4 bind key (SEO gọi bằng key chung); `articles` rules |

Hotfix riêng IMG-OPT: `hotfix/stop-logging-access-token` @ `1ecbd824` — phải vào cùng tag.

## Việc tay — Tuan

1. **Rotate:** npm registry token (1 lần, cập nhật CI 5 repo); 5 `*_PROXY_ACCESS_TOKEN` **sau khi**
   sửa `avada-components`; Google OAuth secret + Trello (SEO); `shpua_`/Translate/Crisp (APC, AEO,
   IMG); `getAT.js` + script giải mã (IMG); `SHOPIFY_ACCESS_TOKEN_KEY` (fixProBackToFree.js),
   `MCP_OAUTH_SECRET`. Rotate xong → chạy task gỡ credential khỏi code.
2. **Dọn dữ liệu prod trước deploy** (xác nhận project id):
   - IMG `app-plaza-image-optimizer`: shop có `isDevZone`, `isLimitImage==false`, founder code không
     có charge, `isTestDiscount`, `bypassSpeedAuditUrl`, `speedAuditQuotaLimit` lạ, `historyId`
     trỏ shop khác; đếm doc history/revert/optimizeStore thiếu `shopId`.
   - Cloud Logging IMG: log cũ chứa token merchant (retention/xoá + ai đọc được).
   - BigQuery: AEO `changelog.js`, SEO `firestore-bigquery-export`, BLOG `avada-crm` đang giữ token.
3. **Deploy order:**
   - SEO: mint internal key `devZone:true` trước (republish/updateObfucate/reset 403 nếu thiếu);
     `lighthouseauditrunnerGen2` trước `[deploy-worker]`; `firestore.rules` deploy riêng; audit 3
     store thật so PSI trước khi cắt tag (interception có thể đội TTFB/LCP).
   - BLOG: task OAuth popup — functions + hosting cùng tag.
   - IMG: hotfix `1ecbd824` cùng tag.
4. **Quyết:** AEO competitors (gate `canAccessDevZone`); thêm `storage` vào `firebase.json`
   (AEO, IMG); chuẩn key giữa app = `Authorization: Bearer`; BLOG MCP free cho Pro; legacy
   GPT-4.1-mini metadata free; TS AI có ghi shop qua `POST /api/shop`; `@avada.io` email có
   verify không (test charge SEO); `validateDiscount` có bind founder code với shop không (IMG).
5. `/init` trong `tools/prod-error-autofix` → mở brief 00.

## Ticket fleet-wide đề xuất

1. **`avada-components` lib:** bỏ 5 proxy token khỏi bundle → rotate → bump 5 app. (Khẩn #3)
2. **FAL-720 mở rộng:** key tích hợp theo shop + key service-to-service riêng (SEO↔BLOG BFCM,
   CS bot `/proxy/shop/update`, TS AI). Chặn BLOG task 4, SEO G6, AEO G1, IMG G5.
3. **Credit atomic:** reserve-in-transaction cho mọi check-then-deduct (APC guard race, BLOG
   featured-image/generate, IMG speed-audit ×2, IMG bulk 1-job-per-shop), charge phần đã tiêu khi
   pipeline throw muộn, activate plan idempotent theo `chargeId` (SEO), SCAN cache → cacheDel đúng key;
   IMG: release chunk ≤400/transaction, validate `page` trước reserve, TTL `quotaReleases`.
   Founder code IMG: `validateDiscount` chỉ bind shop nếu rule doc bật `isLimitShop`/`usageLimit` —
   đọc rule của mã `founderOffer.js:23` trên prod.
4. **Firebase Auth cho embed:** custom token có claim `shopId` → siết rules theo shop (APC
   `bulkGenerateProcesses`, BLOG `articles`, IMG, rules mở ngoài brief ở BLOG), thêm `storage` vào
   `firebase.json`.
5. **`POST /shop` → allowlist** ở SEO/AEO/IMG (APC/BLOG đã allowlist); 3/5 app từng lọt field
   quota/plan/feature qua blocklist.
6. **Egress firewall** cho runtime lighthouse (SEO) — DNS rebinding/WebSocket/worker không đóng được bằng code.
7. **Migration dữ liệu lộ:** BigQuery mirror chứa token (AEO/SEO/BLOG); integration key plaintext (BLOG G23).
