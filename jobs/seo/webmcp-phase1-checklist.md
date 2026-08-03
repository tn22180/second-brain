# WebMCP Phase 1 — Checklist + kết quả verify PSI API

> Brief gốc: `jobs/seo/webmcp.md`. Ngày verify: 2026-08-03.
> Tất cả số dưới đây là **chạy thật**, không phải đoán.

## 1. PSI API có sẵn field này không? → CÓ

**Discovery doc** `pagespeedonline.googleapis.com/$discovery/rest?version=v5`, revision `20260729`:

```
category enum: CATEGORY_UNSPECIFIED, ACCESSIBILITY, BEST_PRACTICES,
               PERFORMANCE, PWA, SEO, AGENTIC_BROWSING
```

`AGENTIC_BROWSING` — "category pertaining to a website's ability to be rendered by an agentic
browsing system."

**Call thật** (`category=PERFORMANCE&category=AGENTIC_BROWSING`, strategy=mobile):

| Site | HTTP | Lighthouse | agentic-browsing score |
|---|---|---|---|
| gymshark.com | 200 | 13.4.1 | **0.09** |
| anthropic.com | 200 | 13.4.1 | **0.50** |
| cursor.com | 200 | 13.4.1 | **0.33** |

→ **Không cần Puppeteer + CDP cho Phase 1.** Task 1.2 trong plan cũ (service Puppeteer 4GiB) bỏ
được. Chỉ cần thêm 1 param vào PSI call đang có ở `packages/functions/src/helpers/google.js:85`.

## 2. Category này gồm 6 audit

| Audit id | Group | Mode | Ý nghĩa |
|---|---|---|---|
| `agent-accessibility-tree` | agent-accessibility | binary | Cây a11y hợp lệ cho agent |
| `cumulative-layout-shift` | — | numeric | CLS, chấm lại dưới góc nhìn agent |
| `llms-txt` | agent-accessibility | binary | `/llms.txt` đúng chuẩn |
| `webmcp-registered-tools` | webmcp | binary | Có tool WebMCP đăng ký |
| `webmcp-schema-validity` | webmcp | binary | inputSchema hợp lệ |
| `webmcp-form-coverage` | webmcp | binary | Form có annotation `toolname` |

Plan cũ ghi 8 audit với tên `webmcpTools`, `a11yNamesLabels`, `a11yTreeIntegrity`,
`a11yVisibility`... — **sai hết**. Dùng đúng 6 id ở trên.

## 3. Cách tính điểm — chỗ này quan trọng nhất

**Điểm = trung bình các audit ĐANG ÁP DỤNG.** Audit `notApplicable` bị loại khỏi mẫu số
(API trả `weight: 0`).

Kiểm chứng bằng số thật:

| Site | a11y-tree | CLS | llms-txt | webmcp×3 | Điểm | Phép tính |
|---|---|---|---|---|---|---|
| gymshark | 0 | 0.18 | n/a | n/a | 0.09 | (0+0.18)/2 |
| anthropic | 0 | 0.99 | n/a | n/a | 0.50 | (0+0.99)/2 |
| cursor | 0 | 1.00 | **0** | n/a | 0.33 | (0+1+0)/3 |

cursor.com **có** `/llms.txt` → audit chuyển từ `notApplicable` sang `binary`, weight 1, chấm 0
vì `"File does not appear to contain any links."` → **điểm tụt từ 0.50 xuống 0.33**.

### Hệ quả cho sản phẩm

1. **Thêm llms.txt sai chuẩn = làm điểm merchant TỆ ĐI.** Phải validate (Markdown, ≥1 H1, có
   link) trước khi serve. Đây là rủi ro số 1 của feature.
2. **Suy ra tương tự cho WebMCP**: inject tool → 3 audit webmcp bật lên, thành 3 mẫu số mới.
   Schema sai hoặc form chưa annotate → điểm tụt. *(Chưa verify trực tiếp được vì chưa tìm ra
   site public nào đã đăng ký WebMCP tool — phải test trên staging sau khi inject.)*
3. Hôm nay store nào cũng chỉ bị chấm trên 2 audit: **a11y tree + CLS**. Muốn điểm lên ngay mà
   không rủi ro thì sửa 2 cái này trước, WebMCP/llms.txt là bước sau và phải làm cho đúng.

## 4. Checklist issue — fix được từ trong app hay không

### `agent-accessibility-tree` (binary — sai 1 element là 0 điểm)

gymshark.com fail 5 element, mỗi cái 1 rule axe khác nhau:

| Lỗi | App fix được? | Bằng cách nào |
|---|---|---|
| Buttons must have discernible text | ✅ được | scripttag gắn `aria-label` runtime cho button rỗng |
| ARIA input fields must have an accessible name | ✅ được | scripttag gắn `aria-label` từ placeholder/name |
| ARIA dialog/alertdialog nodes should have an accessible name | ✅ được | scripttag gắn `aria-label` cho `[role=dialog]` |
| ARIA role should be appropriate for the element | ⚠️ khó | phải sửa theme, không patch runtime an toàn được |
| Certain ARIA roles must be contained by particular parents | ⚠️ khó | lỗi cấu trúc DOM của theme |

→ **Fix được 3/5 loại.** Nhưng audit là binary: còn 1 lỗi là vẫn 0 điểm. Nên UI phải nói rõ
"còn N lỗi phải sửa trong theme", không hứa điểm lên.

### `cumulative-layout-shift`

| Việc | App fix được? | Đã có sẵn chưa |
|---|---|---|
| Preload critical resource | ✅ | có — Speed Up settings (`preload`) |
| Lazy load / defer script | ✅ | có — Script Manager |
| Nén ảnh, đặt width/height | ✅ | có — Image Compression |
| Critical CSS / HyperSpeed | ✅ | có — Speed Up |

→ **Không cần code mới.** Chỉ cần link từ card agentic sang các trang đang có.

### `llms-txt`

| Việc | App fix được? |
|---|---|
| Sinh nội dung từ collections/pages của shop | ✅ full |
| Serve qua App Proxy `/apps/avada-seo/llms.txt` | ✅ full |
| Đưa lên **domain root** `/llms.txt` (chỗ Lighthouse đọc) | ⚠️ Shopify không cho ghi file root — phải dùng URL Redirect của Shopify, app đã có module redirect nên tự set được |
| Validate ≥1 H1 + có link trước khi bật | ✅ **bắt buộc làm**, xem mục 3 |

### `webmcp-registered-tools` / `webmcp-schema-validity`

| Việc | App fix được? |
|---|---|
| Inject snippet đăng ký tool vào theme | ✅ full — dùng lại pattern HyperSpeed |
| Schema hợp lệ | ✅ full — schema do mình viết |
| Revert khi tắt / gỡ app | ✅ full — pattern `ALL_REMOVABLE_ASSETS` |

### `webmcp-form-coverage`

| Việc | App fix được? |
|---|---|
| Annotate form chuẩn Shopify (search, newsletter, contact, add-to-cart) | ✅ được qua scripttag |
| Form custom của theme/app khác | ❌ không — báo cho merchant tự sửa |

## 5. Tóm tắt: fix được bao nhiêu

| Audit | Mức tự fix |
|---|---|
| `llms-txt` | 🟢 100% |
| `webmcp-registered-tools` | 🟢 100% |
| `webmcp-schema-validity` | 🟢 100% |
| `webmcp-form-coverage` | 🟡 form chuẩn Shopify thôi |
| `cumulative-layout-shift` | 🟡 dùng feature đã có, không lên 100% được |
| `agent-accessibility-tree` | 🔴 3/5 loại lỗi, binary nên dễ vẫn 0 điểm |

## 6. Nơi gắn menu

- `packages/assets/src/config/appMenu.js:224-244` — mục `Performance`, thêm path vào `includeUrls`
- `packages/assets/src/routes.js:189` — `PerformanceRoutes()`, thêm `<Route>`
- `packages/assets/src/pages/Performance/Performance.js:52` — mảng `cards`, chèn **vị trí đầu**
  (hiện là image-compression → speed-up → speed-request)
- `packages/assets/src/loadables/` — file loadable phẳng cho page mới
- i18n: `Performance.json` + JSON riêng của component, chạy `yarn update-label`
- Analytics: bắt buộc `trackEvent()` theo `docs/features/product-analytics-tracking.md`

## 7. Ghi chú kỹ thuật

- Branch hiện tại `chore/comment-shorten` đang **13 commit sau `origin/master`** → phải
  `git fetch` + cắt nhánh mới từ master trước khi code.
- `PAGESPEED_API_KEY` trong `packages/functions/.env` (len 136) không phải API key hợp lệ, gọi
  trả `400 API key not valid`. Key dùng được nằm ở `.env.default` (len 39). Cần xác nhận prod
  đang dùng key nào trước khi bật scan diện rộng.
- PSI không key bị `429 Quota exceeded` ngay — mọi call phải kèm key.
- Giá trị `category` phải viết HOA: `AGENTIC_BROWSING`, không phải `agentic-browsing`.
  Key trong response thì là `categories['agentic-browsing']`.
