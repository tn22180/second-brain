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
