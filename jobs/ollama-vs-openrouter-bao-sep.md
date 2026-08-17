# Báo sếp — đề xuất chuyển OpenRouter sang Ollama Cloud

Ngày: 2026-08-17 · App: SEO (`avada-seo`) · Dữ liệu: đo thật, 30 sản phẩm merchant + API usage thật

---

## Phần gửi sếp (copy nguyên khối này)

Em đã test thật cả OpenRouter và Ollama Cloud trên 30 sản phẩm của merchant, không phải đọc tài liệu. Báo anh 3 điểm:

**1. Gói Max $100 hiện KHÔNG mua được.** Trang pricing của Ollama ghi "New sign-ups paused", Ollama xác nhận do quá tải. Mua được ngay chỉ có Pro $20 (3 model đồng thời) hoặc Team tối thiểu 5 seat = $125/tháng. Nên con số $100 chưa khả thi ở thời điểm này.

**2. Ollama đã khai tử đúng 2 model app mình đang chạy.** `gemini-3-flash` (15/07) và `qwen3-vl-235b` (16/06) đều bị bỏ khỏi Ollama Cloud, trong khi OpenRouter vẫn phục vụ bình thường. Tổng cộng Ollama bỏ 27 model trong 6 tuần và không cam kết thời gian báo trước. Chuyển sang Ollama không phải đổi nhà cung cấp cùng model, mà là đổi luôn model cho 15 điểm gọi trong code.

**3. Em tìm được cách giảm $187/tháng mà không cần đổi provider.** App SEO đang tiêu $331/tháng, chia làm hai phần: $217 cho sinh nội dung (text + meta) và $114 cho alt text ảnh. Chỉ cần đổi model của phần sinh nội dung sang `gemma-4-31b` trên chính OpenRouter là phần đó xuống còn $29.75 — **tiết kiệm $187/tháng, giảm 56% tổng chi phí app**. Con số này tính trực tiếp từ 112.6 triệu input token và 54.4 triệu output token thật của 31 ngày qua, không phải ước lượng.

Đổi lại là model mới chậm hơn 2-3 lần, nên em chỉ áp cho các job chạy nền, giữ model hiện tại cho thao tác merchant chờ trực tiếp và cho alt text ảnh. Không cần viết lớp fallback, không rủi ro điều khoản dịch vụ, không phụ thuộc gói đang khoá.

So sánh trực diện: Ollama Max $100/tháng — nếu mua được — tiết kiệm $231 nhưng kèm toàn bộ rủi ro ở mục 1 và 2. Đổi model trên OpenRouter tiết kiệm $187, gần bằng, và gần như không rủi ro.

**Việc gấp:** tài khoản OpenRouter còn **$79.51**, cả 5 key (SEO, APC, BLOG_NEW, BLOCKO, ADS) dùng chung ví này và đang tiêu **$18.88/ngày**, tức khoảng **4 ngày** nữa hết. Cần nạp ngay.

**Một khoản bất thường:** model `openai/gpt-5.6-sol` tiêu **$127.87 chỉ với 1,011 lần gọi** — chiếm 19% chi phí toàn account nhưng chỉ 0.2% số request, và không thuộc app SEO. Em sẽ rà xem của app nào và có còn cần không.

**Đề xuất:** giữ OpenRouter, đổi model cho các job chạy nền, và nạp thêm credit trong tuần này. Nếu anh vẫn muốn thử Ollama, em test được với Pro $20 một tháng — không cần cam kết $100.

---

## Đạn dự phòng — chỉ dùng khi sếp hỏi lại

Ba điểm dưới đây **cố tình không** đưa vào bản gửi, để bản đó ngắn và không thành tranh luận.
Để dành trả lời khi bị đẩy lại.

### Nếu sếp nói "fallback thì dễ mà"

- `services/openAI/index.js` **không còn gọi OpenAI** — mọi export trong đó đã đi qua
  `chatSendWithRetry` của OpenRouter. Tên chỉ là di tích. Nên hiện tại thực chất có **một**
  provider, đấu dây ở hai nơi với hai mức gián tiếp khác nhau.
- **8 structured call site không qua dispatcher nào** — gọi thẳng
  `generateOpenRouterStructuredText`. Muốn switch phải sửa trong lòng `openrouter/index.js`
  hoặc chạm cả 8 chỗ.
- `chatSendWithRetry:68` phân loại retry theo `error.statusCode` **của OpenRouter SDK**. Lỗi
  Ollama không mang shape đó → cổng retry im lặng thành "không bao giờ retry".
- **Hai ngữ nghĩa lỗi khác nhau trong cùng một file**: 8 chỗ structured dùng `schema.parse`
  (throw cứng), còn `parseAltSafely:253-267` dùng `safeParse` và trả `''`. Wrapper kiểu
  `try{ollama}catch{openrouter}` sẽ **không fallback** ở nhánh thứ hai — nó lặng lẽ ghi alt rỗng.
- Ước tính **6-10 file** phải sửa. Repo này **CI không chạy test nào** (`.gitlab-ci.yml` không có
  test job) — đúng loại bug chỉ lộ trên traffic prod thật.
- Trần latency thật không phải GCF 540s mà là **axios FE 60s**
  (`packages/assets/src/helpers.js:68`). Riêng ladder retry 3×10s của Ollama đã ăn 30s trước khi
  kịp chạm OpenRouter.

### Nếu sếp nói "vol lớn thì mua 2-3 tài khoản"

- ToS của Ollama (bản May 2026) **không có điều khoản nào** về multiple accounts, one-account-per-entity,
  hay commercial/production use. Im lặng — không phải cho phép.
- Nhưng có mục 4 cấm "interfere with or disrupt our services", mục 10 cho quyền
  **terminate tuỳ ý có notice**, mục 11 "AS IS, no warranty of uninterrupted service", mục 12
  **liability cap $100**.
- Nghĩa là: mua 2-3 account cá nhân để nhân throughput cho production là đặt cược vào thiện chí,
  không phải quyền hợp đồng. Rủi ro là bị đóng cả 2-3 account cùng lúc.
- Ollama có gói **Team** đúng cho nhu cầu đó — $25/seat, tối thiểu 5 seat.

### Nếu sếp nói "cứ đổi sang gemma-4 cho hết đi"

Không được. Đo trên 30 sản phẩm thật:

| | gemini-3-flash (hiện tại) | gemma-4-31b-it |
|---|---|---|
| $/1000 call (`generate_description`) | $1.83 | **$0.23** |
| latency p50 / p95 | **4492 / 10463 ms** | 15395 / 28492 ms |
| `meta_tags` p95 | **5363 ms** | 44363 ms |
| rò rỉ markdown fence | **4%** | 24% |
| khi URL ảnh trả 404 | **báo lỗi đúng** | **bịa "Please provide the image…"** |

- p95 44 giây ở `meta_tags` chạy **inline** trong `auditAgentController.js:61-166`, dưới trần
  axios 60s. Quá gần.
- Rò fence 24%: `generateOpenRouterText` **không strip fence** (chỉ bản structured có, tại
  `openrouter/index.js:177-183`). Cứ 4 mô tả thì 1 cái mang ``` vào HTML merchant.
- Vision fail-silent là lỗi tệ nhất: câu bịa đó **là string hợp lệ nên qua schema**, ghi thẳng
  vào thuộc tính alt.

→ Nên: sửa strip fence trước, giữ `qwen3-vl` cho image alt, và chỉ thí điểm gemma-4 ở đường
async/bulk (`bulkAuditFix`, `fixMainContentAsync`) nơi p50 15s không ai thấy.

---

## Việc cần làm, không liên quan tới chọn provider

| Việc | Bằng chứng | Mức |
|---|---|---|
| Nạp credit OpenRouter | còn $79.51, cả account $18.88/ngày → **~4 ngày** | **gấp** |
| Rà `openai/gpt-5.6-sol` | $127.87 / 1,011 req = $126.5 per 1000 call; 19% chi phí account, 0.2% request; không thuộc SEO | **gấp** |
| Đo tỉ lệ URL ảnh 404 trước khi gọi model | image alt: 207,437 call, **515M input token**, $114.24/tháng; mẫu 9 ảnh có 6 cái 404 | cao |
| Rà $348.04 không thuộc key nào | `total_usage` $1,920.49 − tổng 5 key $1,572.45; key đã xoá hoặc dùng web chat | trung bình |
| 6/9 URL ảnh prod trả 404 | collection `analysis`, alt text đang gọi model lên ảnh chết | cao |
| Sửa strip fence cho `generateOpenRouterText` | `openrouter/index.js:177-183` chỉ áp cho structured | trung bình |
| `modelPricing.js` trả $0 cho model prod | không có giá `gemini-3-flash` lẫn `qwen3-vl` → `computeCost()` = $0 | trung bình |
| `OPENROUTER_QWEN3_235B_INSTRUCT_MODEL` là model chết | `openrouter/index.js:27`, không còn trên catalog, vẫn nằm trong `OPENROUTER_TEXT_MODELS` | thấp |
| 2 subscriber nuốt lỗi (FAL-206) | `subscribeBulkAuditFixProduct.js:23-34`, `subscribeFixAuditContent.js:48-61` | tồn đọng |

---

## Ghi chú độ tin cậy của số liệu

- **Chi tiêu SEO $331.28 / 31 ngày** — từ `GET /api/v1/activity` với management key
  `OPENROUTER_REPORT_KEY` (`jobs/.env`, gitignored). Đây là số dùng, có token thật kèm theo:

  | Model | requests | input tok | output tok | $ |
  |---|---|---|---|---|
  | `gemini-3-flash-preview` | 111,663 | 112.6M | 54.4M | $217.04 |
  | `qwen3-vl-235b-a22b-instruct` | 207,437 | 515.5M | 6.8M | $114.24 |

  Đổi phần `gemini-3-flash` sang `gemma-4-31b-it` ($0.100/$0.340): $217.04 → **$29.75**,
  tiết kiệm **$187.29/tháng**. Tính trực tiếp từ token thật.
  Dashboard filter 1 tháng cho key SEO cho $342.96 — chênh nhẹ vì khác cửa sổ ngày, cùng bậc.

- **Toàn account, 31 ngày: $669.33 / 509,851 request.** 5 key: SEO $190.38, APC $77.66,
  BLOG_NEW $51.78, BLOCKO $1.13, ADS $0 (số month-to-date 1→17/8).
- Field `usage_monthly` của `GET /api/v1/key` trả **$189.58**, nhưng đó là **month-to-date (1/8→17/8)**,
  không phải trailing 30 ngày. $189.58 / 17 ngày = $11.15/ngày × 30 ≈ $335, khớp với $342.96.
  Đọc field này như "tháng" là sai — đã sửa.
- Số dư $84.16 lấy từ `/api/v1/credits` ($2,000 nạp − $1,915.84 đã dùng).
- **Ước tính $106/tháng dựng từ `creditHistories` trong lần phân tích đầu là sai 3.1×.** Credit ≠ số
  lần gọi LLM (`CREDIT_COSTS` trong `productWorker.js:41-48` gán 1–14 credit cho một call, và
  `generateFaqsInBulk` tính credit theo số FAQ trả về chứ không theo call). Riêng image alt bị ước
  thấp 4× ($28.5 vs $114.24 thật) vì giả định 18 output token/call, thực tế input là 2,485 token/call
  do ảnh bị token hoá. **Không dùng lại phương pháp này** — chỉ lấy số từ `/api/v1/activity`.
- "**~$689 từ một key lạ**" trong bản nháp trước là **sai**. Không có key lạ: $345 là APC +
  BLOG_NEW + BLOCKO, còn $348.04 không thuộc key nào đang tồn tại (key đã xoá hoặc web chat).
- Eval 30 sản phẩm: hoàn thành **156/198 job** (~23-25 fixture mỗi task). Runner rớt một số job do
  `TypeError: terminated` của undici. Đủ để kết luận, chưa phải mẫu sạch.
- Số Ollama đo trên **Free plan** — chỉ chạy được 2 model Low tier; `qwen3.5` và `deepseek-v4-flash`
  trả 403 `requires a subscription`. Model Ollama tier cao được đo **qua OpenRouter**, nên phản ánh
  chất lượng và giá của model, **không** phản ánh latency hạ tầng Ollama.
- Eval chạy khi cây ở branch `feat/cs-grants-features`. Cây hiện đang ở `master` và có conflict
  chưa giải quyết ở `packages/functions/src/controllers/devController.js` (không do việc này gây ra).
- Harness chạy lại được, nằm ở scratchpad của session: `probe-ollama-harness/`
  (`probe.js`, `cases.js`, `ollamaClient.js`, `evalProducts.js`, `evalScore.js`).
