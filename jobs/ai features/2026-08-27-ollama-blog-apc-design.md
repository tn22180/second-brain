# Design — Ollama Cloud cho BLOG + APC, và model ảnh cho BLOG

Ngày: 2026-08-27
Brief: `ai-feature-models-and-workflow.md`
Trạng thái: đã duyệt thiết kế, chưa thực thi

Mọi số trong tài liệu này là **đo thật**, không lấy từ bảng giá. Nguồn đo ghi kèm từng bảng.

---

## 0. Tree đã pin

| Repo | Local HEAD lúc audit | origin/master | Lệch |
|---|---|---|---|
| `blogs` | `9953ba1c6` (2026-08-07) | `64f7f35a2` (2026-08-27) | **176 commit sau** |
| `ai-product-copy` | `9589df3` nhánh `fix/apc-dev-zone-process-id` | `ae87304` (2026-08-25) | **15 commit sau** |
| `seo` | nhánh `feat/gsc-v2-ui` | — | 332 commit sau |

Toàn bộ audit đọc từ `origin/master`, không đọc working tree. `blogs` còn
`packages/functions/src/commands/autoTranslateV2.js` sửa chưa commit — không đụng tới.

**Mọi task sửa code phải cắt nhánh từ `origin/master`, không làm trên tree hiện tại.**

---

## 1. Audit — model đang dùng

### BLOG (`packages/functions/src/const/aiModels.js`)

| Vai trò | Model thật (OpenRouter) |
|---|---|
| text default | `google/gemini-2.5-flash-lite` |
| text pro | `google/gemini-2.5-flash` |
| image gen | `google/gemini-2.5-flash-image` ("banana") |
| vision | `google/gemini-2.5-flash` |
| `/genClaude` riêng | `anthropic/claude-haiku-4.5` |

Tên `gpt-4.1` / `gpt-5.2` / `claude-3-7-sonnet-latest` mà FE hiển thị là **dispatch fake** —
`openAi.service.js:27-34` `LEGACY_MODEL_MAP` map hết về hai model Gemini. Đổi provider chỉ cần
một điểm rẽ dưới `resolveModel()` (`openAi.service.js:39`); không đụng FE, không migrate DB.

`RECRAFT_AI_MODEL` / `FLUX_1_1_PRO_MODEL` (`aiModels.js:24-26`) là nhãn FE legacy, comment ghi rõ
BE bỏ qua khi routing. UI hiện Recraft/Flux cho merchant chọn nhưng backend không bao giờ gọi.
Ngoài scope brief — ghi lại như một finding.

### APC (`packages/functions/src/services/aiService.gateway.js`)

| Điều kiện | Model |
|---|---|
| text-only, `shop.enableGpt41` off | `google/gemini-2.5-flash-lite` |
| có ảnh, alias `gpt54`/`gpt54Mini`/`claude35Sonnet` | `openai/gpt-4.1-mini` |
| `shop.enableGpt41` on | `openai/gpt-4.1` |

`gemini-3.1-flash-lite` và `deepseek-v4-flash` đã comment out (`:13,16`).

### Trạng thái Ollama

`git grep -i ollama origin/master` → **0 file** ở cả `blogs` và `ai-product-copy`.
OpenRouter key ba app tách riêng: `seo`=`7908aaf7`, `blogs`=`3e665019`, `apc`=`12837ef4`.
Port không đụng nhau.

---

## 2. Ollama Cloud — năng lực và hạn mức

### Catalog

`GET https://ollama.com/api/tags` → 18 model, **toàn LLM/VLM, không có text-to-image**:

```
deepseek-v4-flash:0731  deepseek-v4-pro:0813  gemma4:31b  glm-5.1  glm-5.2
glm-5.3-flash  gpt-oss:120b  gpt-oss:20b  kimi-k2.6  kimi-k2.7-code  kimi-k3
minimax-m2.7  minimax-m3  mistral-large-3:675b  nemotron-3-nano:30b
nemotron-3-super  nemotron-3-ultra  qwen3.5:397b
```

→ Yêu cầu "BLOG thay banana bằng model Ollama" **không khả thi**. Ảnh ở lại OpenRouter.
Phần *đọc* ảnh (vision) thì được: `gemma4:31b` đã chạy vision thật ở prod SEO.

### Hạn mức — ràng buộc quyết định

Trần weekly một account ≈ **76.100 req** (suy từ đo 08-27: 66.285 req = 87,1%) ≈ 10.870/ngày.
Đang có 2 key → **~21.700 req/ngày**.

```
SEO                                       6.847/ngày   (đo 08-26)
workload lạ (glm-5.2 + deepseek-v4-pro + kimi)  ~2.280/ngày
staging (dùng chung key cũ 755509cb)            chưa đo
──────────────────────────────────────────────────────
dư cho BLOG + APC                         ~12.600/ngày
```

Task 1 phải đo volume thật của BLOG/APC trước khi cam kết. Vượt → mua key thứ 3 và tách
staging khỏi key prod.

---

## 3. Model ảnh cho BLOG

### Phát hiện: OpenRouter có hai API ảnh riêng

`GET /api/v1/models` trả 417 model, chỉ 11 cái xuất ảnh — **không phải catalog đầy đủ**.
`GET /api/v1/models?output_modalities=image` trả **50**.

Hai nhóm, giao thức khác nhau:

| Nhóm | Endpoint | Ghi chú |
|---|---|---|
| Google | `chat/completions` + `modalities:['image','text']` **hoặc** `/api/v1/images` | đi được cả hai |
| Meta, ByteDance, Qwen, Krea, Sourceful, Recraft, BFL, Microsoft | **chỉ** `/api/v1/images` | `chat/completions` trả 404 |

```
404 "<model> is an image generation model and cannot be used with the
     chat/completions endpoint. Use the /api/v1/images endpoint"
```

Shape `/api/v1/images`: `POST {model, prompt, n}` → `data[0].b64_json` + `usage.cost`.

Cùng một model, hai endpoint cho kết quả khác nhau — `sourceful/riverflow-v2.5-fast`:
`chat/completions` 44,65s/$0,0285 · `/api/v1/images` 22,06s/**$0,0163**. Nhanh gấp đôi, rẻ 43%.

`recraft/*` có `supported_parameters: []` — không nhận `temperature`/`max_tokens`/`seed`.

### Bake-off — 12 model, cùng prompt, 16:9

Prompt: featured image cho bài *"5 Ways to Style a Linen Summer Dress"*, editorial fashion, no text.
Cost đọc từ `usage.cost` / `/api/v1/generation`. Đo 2026-08-27, key `3e665019`.

| model | latency | $/ảnh | kích thước | 16:9 |
|---|---|---|---|---|
| **`meta/muse-image`** | 28,95s | **$0,0100** | 2048×1152 | ✅ |
| `sourceful/riverflow-v2.5-fast` | 22,06s | $0,0163 | 1024×576 | ✅ |
| `krea/krea-2-medium-turbo` | **8,89s** | $0,0150 | 1024×1024 | ❌ |
| `qwen/qwen-image-3` | 90,19s ⛔ | $0,0300 | 2752×1536 | ✅ |
| **`google/gemini-3.1-flash-lite-image`** | **5,09s** | $0,0333 | 1376×768 | ✅ |
| `recraft/recraft-v4.1` | 9,70s | $0,0350 | 1344×768 | ✅ |
| `bytedance-seed/seedream-5-0-lite` | 29,35s | $0,0350 | 2048×2048 | ❌ |
| `google/gemini-2.5-flash-image` (banana, hiện tại) | 6,92s | $0,0384 | 1024×1024 | ❌ |
| `krea/krea-2-large` | 27,73s | $0,0600 | 1024×1024 | ❌ |
| `x-ai/grok-imagine-image-2.0` | 113,45s ⛔ | $0,0600 | 1280×720 | ✅ |
| `bytedance-seed/seedream-5-0-pro` | 47,93s | $0,0900 | 2048×2048 | ❌ |
| `sourceful/riverflow-v2.5-pro` | 144,59s ⛔ | $0,1341 | 1280×720 | ✅ |

⛔ vượt `IMAGE_TIMEOUT_MS = 60000` (`services/openrouter/image.js:5`) — loại vì timeout, không vì
chất lượng. Qwen ra ảnh đẹp nhất bảng nhưng code hiện tại cắt ở 60s.

Banana, Seedream và Krea **trả ảnh vuông**, phớt lờ 16:9 — featured image phải crop, mất bố cục.

Tổng chi phí bake-off: **$0,828**. Credit key `3e665019` còn **$31,58**.

### Đường gọi ảnh — tất cả đồng bộ

```
POST /ai-image                  → genImageAIController.genImage
                                → await generateAndUploadImages(...)   [sync, merchant chờ]
POST /langgraph/blog            → streamBlogWithLangGraph
                                → createFeaturedImageNode              [trong pipeline gen bài]
POST /langgraph/featured-image  → regenerateFeaturedImage              [sync]
```

Không có đường nền. `generateOpenRouterImage` fan-out `p-limit(4)`.

### Quyết định: tách model theo đường

| Đường | Model | Lý do |
|---|---|---|
| `/ai-image` | `google/gemini-3.1-flash-lite-image` | merchant chờ trực tiếp, `totalImages` có thể >1. Muse 29s × 2 đợt fan-out ≈ 58s, sát `IMAGE_TIMEOUT_MS`. Vẫn hơn banana: nhanh hơn 26%, rẻ 13%, đúng 16:9 |
| `createFeaturedImageNode` | `meta/muse-image` | 1 ảnh, nằm trong pipeline đã dài 60–120s; +24s là tỉ lệ nhỏ. Ăn trọn mức giảm 74% |

Banana $0,0384 → Muse $0,0100 = **−74%**, tức **$28,4 tiết kiệm/1.000 ảnh**.
Tỉ trọng ảnh giữa hai đường chưa biết — Task 1 đo luôn để tính tiền tiết kiệm thật.

**Độ tin cậy: 1 sample/model.** Đủ để loại (timeout, sai tỉ lệ, giá), chưa đủ chốt chất lượng
giữa Muse và Gemini. Task 4 chạy 5–10 prompt thật lấy từ bài merchant.

---

## 4. Model text — Muse không thắng

Prompt dạng APC (product description, 120–250 từ, HTML). Đo 2026-08-27.

| model | latency | in/out tok | reasoning tok | $/call | chars ra |
|---|---|---|---|---|---|
| `google/gemini-2.5-flash-lite` | **2,35s** | 88/282 | 0 | **$0,000120** | 1441 |
| `openai/gpt-4.1-mini` (APC hiện tại) | 4,53s | 101/269 | 0 | $0,000466 | 1302 |
| `meta/muse-glimmer-30b` | 12,32s | 117/1222 | **996** | $0,001855 | 938 |
| `meta/muse-spark-1.2-contributor` | — | — | — | — | **HTTP 404** |

`muse-spark-1.2-contributor` rẻ trên bảng ($0,10/$0,20 mỗi M token) nhưng bị chặn:

```
404 "No endpoints available matching your guardrail restrictions and data policy."
```

Tier `contributor` đổi giá rẻ lấy quyền dùng prompt để train. Prompt BLOG/APC là nội dung
merchant — `blogs/packages/functions/CLAUDE.md` ghi rõ *"AI prompt content (PII — contains
merchant blog data)"*. **Không mở data policy này.** Loại vì lý do dữ liệu.

`muse-glimmer-30b` đốt 996/1222 token output cho reasoning → đắt gấp 15× `gemini-2.5-flash-lite`,
chậm nhất, ra ít chữ nhất. Loại.

**Finding phụ, giá trị cao hơn Muse:** `openai/gpt-4.1-mini` của APC đắt hơn
`gemini-2.5-flash-lite` **3,9×** và chậm hơn **1,9×** với chất lượng ngang — mà APC *đã* dùng
flash-lite cho đường text-only rồi. Bỏ nhánh `MODEL_ALIASES → gpt-4.1-mini`
(`aiService.gateway.js:27-31`) cắt được phần lớn chi phí **trước cả khi đụng Ollama**. → Task 7a.

---

## 5. Kiến trúc port Ollama — chọn C

- **A** copy nguyên `services/ollama/` từ SEO (~950 dòng × 2 repo) — trùng lặp nặng
- **B** tách lib chung (`avada-core` / npm) — DRY, nhưng phải publish, CI immutable install bắt
  commit `yarn.lock`, và muốn DRY thật thì SEO phải migrate → chạm prod đang chạy ổn. **Loại.**
- **C ✅** copy tối giản: `services/ollama/{index,keyPool}.js` + `config/ollama.js` + route
  wrapper (~570 dòng/repo), **bỏ cron `ollamaQuotaAlert`**

Lý do bỏ cron: quota là **per-account, không per-app**. Ba cron cùng bắn Slack về cùng account =
3× noise với ba latch rời nhau. Cron SEO đã chạy đúng trong prod (latch + window-reset đã verify)
và pool key dùng chung nên đã bao luôn BLOG/APC.

**Điều kiện:** nếu BLOG/APC dùng key riêng thì cron SEO không thấy — lúc đó phải mở
`OLLAMA_API_KEYS` của cron SEO để bao key mới, không dựng cron thứ hai.

### Điểm chèn

- **BLOG text**: dưới `resolveModel()` (`openAi.service.js:39`)
- **APC**: nhánh Ollama trong `resolveClientAndModel()` (`aiService.gateway.js:65-72`),
  fallback về `toOpenRouterModel()` hiện tại. Đường có-ảnh dùng `gemma4:31b` vision.

---

## 6. Eval harness (offline, throwaway)

`second-brain/jobs/ai features/bench/` — chạy N sản phẩm/bài thật, panel 3 judge chấm:
bám prompt, độ dài, HTML hợp lệ, không leak template, giọng văn. Ra bảng model × điểm ×
latency × $. **Không vào repo app.**

---

## 7. Rủi ro

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Quota Ollama không đủ cho 3 app | Fallback OpenRouter ồ ạt, mất phần tiết kiệm | Task 1 đo trước; mua key 3 nếu cần |
| Key cũ `755509cb` weekly 87,1%, có workload lạ ăn ~23% | Cán trần → dồn hết sang key 2 | Truy ai chạy `glm-5.2`; tách staging |
| `image.js` viết lại sang `/api/v1/images` | Đường gen ảnh prod của BLOG | Test song song hai endpoint trước khi cắt |
| Muse 29s trên đường sync | Merchant chờ / vượt HTTP timeout | Chỉ dùng cho `createFeaturedImageNode` |
| 1 sample/model | Chốt sai model | Task 4 chạy 5–10 prompt thật |

---

## 8. Vấn đề ngoài scope, chỉ ghi nhận

1. `services/openrouter/image.js:43-44` — comment *"OpenRouter doesn't expose
   /v1/images/generations"* đã sai. Đúng lúc 2026-05-15, nay hết đúng. Chính comment này khoá
   BLOG vào `chat/completions` nên chỉ model Google dùng được.
2. `aiModels.js:24-26` — nhãn Recraft/Flux hiện trên UI nhưng BE không bao giờ gọi.
3. `STAGING_ENV_FILE` của SEO vẫn dùng key prod `755509cb`.
4. Workload lạ `glm-5.2` (14.681 req/tuần) trên key `755509cb` — không phải app SEO.
