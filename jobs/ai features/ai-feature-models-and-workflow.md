ollama có vẻ ổn trên SEO rồi, bây giờ sẽ được apply trên app BLOG và app APC
trước hết audit toàn bộ model đang được sử dụng bằng openrouter trên những app này, sau đó testing những model trên ollama để thay thế phù hợp. ưu tiên chất lượng + latency thấp. tất cả đều có backup từ openrouter nhé
Yêu cầu:
 - BLOG: phần gen ảnh bằng model banana của Gemini đang được sử dụng và khá tốn tiền cần sử dụng 1 model khác từ ollama
 - APC: gpt4.1 mini khá cũ cần 1 model tốt hơn từ ollama gen content tốt cho description, dùng model gen xong cần vài agent bên mình vào đánh giá chất lượng nhé

---

## Progress

Started: 2026-08-27
Design: `2026-08-27-ollama-blog-apc-design.md` (đã duyệt)
Thứ tự: BLOG trước, APC sau. Eval: harness offline throwaway.

Không có tool TaskCreate trong session này — bảng dưới là tracker duy nhất.

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| 1 | Đo volume AI call/ngày BLOG + APC prod → headroom Ollama; đếm tỉ trọng ảnh `/ai-image` vs featured-image | inline (không dispatch) | ✅ | 1/5 | clean | **2 key đủ, không cần mua key 3** |
| 2 | BLOG: viết lại `openrouter/image.js` sang `/api/v1/images`, tách model theo đường | general-purpose / sonnet | ✅ | 2/5 | clean | +vá bug mime · gộp vào MR !869 |
| 3 | Dựng eval harness offline + judge panel | general-purpose / sonnet | ✅ | 0/5 | clean | `bench/run.py` 636 dòng, stdlib |
| 4 | Bench ảnh thật + fan-out p-limit(4) | inline | ✅ | 0/5 | clean | **Muse chịu được: 22,4s/bài 5 ảnh** |
| 5a | BLOG: mở Muse sang content image + vá `ensureDataUrl` | general-purpose / sonnet | ✅ | 0/5 | clean | 23/23 pass · $215/tháng đã mở khoá |
| 4b | Bench Ollama text cho BLOG | general-purpose / sonnet | ✅ | 0/5 | clean | **gemma4:31b thắng — nhanh 2×, $0** |
| 5b | BLOG: port lớp ollama text + fallback | general-purpose / opus | ✅ | 0/5 | clean | 66/66 pass · gộp vào MR !869 |
| 6 | Bench model Ollama cho APC description | inline | ✅ | 0/5 | clean | **incumbent flash-lite bét bảng 4,40** · $0,060 |
| 7a | APC: bỏ nhánh `MODEL_ALIASES → gpt-4.1-mini` | cavecrew-builder / haiku | ⬜ | 0/5 | — | hoãn tới sau Task 6: đường có-ảnh chưa bench |
| 7b | APC: port ollama vào gateway | inline | ✅ | 0/5 | clean | **MR !194** · 56/56 pass · key riêng |
| 8 | Review + security toàn nhánh 2 repo | cavecrew-reviewer / sonnet | 🔄 | 0/5 | clean (BLOG) | BLOG xong → MR !869; APC chờ Task 7 |

### Log

#### ✅ Task 1: Đo volume + headroom
- Agent: chạy inline (đã biết quirk log 2 project; subagent phải học lại từ đầu)
- Status: ✅ completed
- Plan:
  - Goal: ra con số AI call/ngày của BLOG và APC prod (7 ngày gần nhất), và tỉ trọng ảnh giữa `/ai-image` và featured-image, đủ để kết luận 2 key Ollama có đủ hay phải mua key 3
  - Files allowed: không sửa file nào — read-only, log/GCP query
  - Approach: đếm request Cloud Run theo service + đọc OpenRouter activity nếu key cho phép. Bỏ cách grep log app: APC/BLOG `logger` tắt info/debug ở production (`logger.js:18-20`) nên không có log per-call
  - Test command: kết quả phải có bảng calls/ngày × 7 ngày cho từng app, và so với headroom ~12.600/ngày
  - Risk: đọc nhầm project id → số sai → mua thừa/thiếu key. Prod: `avada-blog-app`, `ai-product-copy`
  - Rollback: không có write, không cần
- Rounds used: 1/5 (vòng 1 `gcloud logging read` 7 ngày timeout ở 2m → đổi sang Cloud Monitoring `request_count` + log 1 ngày lọc theo path)
- Security check: clean — read-only, 0 file sửa. Key OpenRouter đọc từ `.env` vào file `chmod 600`, chỉ in sha8, đã xoá sau khi dùng. Không token nào lên command line.
- Started: 2026-08-27
- Completed: 2026-08-27
- Kết quả:
  - **Volume Ollama cần: ~2.300 call/ngày (BLOG ~2.000 + APC ~250) vs headroom ~12.600/ngày → 2 key hiện có là đủ, KHÔNG cần mua key thứ 3.** Task 5 và 7b bỏ chặn.
  - BLOG AI text 08-26: `audit-agent/fix-issue` 574, `gen-ai-suggested/*` 318, `generate-alt-text` 76, `gen-ai-blog/ideas` 9 → 977 call trực tiếp; cộng 66 bài × nhiều LLM call/bài ≈ 2.000/ngày
  - BLOG gen bài chạy ở service **`apiv2`**, path `/apiv2/apiV2/langgraph/blog` — 66 lần/ngày. Không phải service `api` (ở đó `/api/langgraph/blog` = 0)
  - BLOG gen ảnh: `/api/ai-image` 12 + `/api/langgraph/featured-image` 5 = 17/ngày trực tiếp; cộng ảnh trong 66 bài. `POST /api/shopify/file` 323/ngày là cận trên (lẫn upload tay) → **ước 200–320 ảnh/ngày**
  - APC: `/api/generate` 35, `/api/publish` 29, `handlebulkgeneratesubscriber` 205/ngày, `updatedesc` 214/ngày, `publishall` 214/ngày → AI call chính là bulk generate ~250/ngày
  - Tiết kiệm ảnh khi đổi banana → Muse: ~250 ảnh/ngày × $0,0284 ≈ **$7,1/ngày ≈ $213/tháng**
- Finding ngoài scope: **OpenRouter account của APC đã cạn credit** — `total_credits=100, used=100.199` (âm $0,199). Nhưng 0 lỗi `generateFromPrompt` trong 3 ngày prod → nhiều khả năng account chạy pay-as-you-go, hoặc key `12837ef4` không còn là key đang dùng. Cần xác nhận. BLOG còn $31,58.

#### ✅ Task 2: BLOG — image.js sang /api/v1/images
- Agent: general-purpose (sonnet)
- Status: ✅ completed
- Plan:
  - Goal: `generateOpenRouterImage` gọi `POST /api/v1/images`; `/ai-image` dùng `google/gemini-3.1-flash-lite-image`, `createFeaturedImageNode` dùng `meta/muse-image`; test hiện có xanh
  - Files allowed: `packages/functions/src/services/openrouter/image.js`, `const/aiModels.js`, `langgraph/nodes/createFeaturedImageNode.js`, `services/imageGeneration.service.js`, và test dưới `packages/functions/src/services/__tests__/`. Ngoài ra là ngoài scope
  - Approach: đổi transport sang `{model,prompt,n}` → `data[].b64_json`; giữ nguyên `p-limit(4)`, retry 429/5xx, `IMAGE_TIMEOUT_MS`. Bỏ phương án giữ `chat/completions` vì nó khoá BLOG vào model Google (nhóm khác trả 404)
  - Test command: `yarn --cwd packages/functions test imageGeneration` — pass
  - Risk: đường gen ảnh prod BLOG. Sai → merchant không gen được ảnh. Ví OpenRouter dùng chung với APC
  - Rollback: revert commit; làm trên worktree từ `origin/master`, chưa merge
- Rounds used: 0/5
- Security check: —
- Started: 2026-08-27
- Completed: —

#### ✅ Task 3: Eval harness offline
- Agent: general-purpose (sonnet)
- Status: ✅ completed
- Plan:
  - Goal: một lệnh chạy N input thật qua M model, 3 judge chấm, in bảng model × điểm × latency × $ và ghi JSON
  - Files allowed: `second-brain/jobs/ai features/bench/**` only. Không sửa repo app nào
  - Approach: python thuần + urllib, đọc key từ `.env` lúc chạy (không hardcode, không in). Bỏ phương án viết vào repo app — brief chốt harness là throwaway
  - Test command: `python3 bench/run.py --dry-run` liệt kê kế hoạch + ước phí mà không gọi API; rồi 1 lần thật với `--max-spend 2.00`
  - Risk: ví OpenRouter $31,57 dùng CHUNG với prod BLOG + prod APC. Chạy hở = gãy AI hai app. Bắt buộc có `--max-spend`, mặc định thấp, cộng dồn `usage.cost` và dừng khi chạm trần
  - Rollback: xoá thư mục, không có gì để undo
- Rounds used: 0/5
- Security check: —
- Started: 2026-08-27
- Completed: —

### Kết quả Task 2 + 3 (2026-08-27)

**Task 2 — 1 round.** Vòng 1 review trượt: code đúng nhưng không test nào chạm transport mới
(`imageGeneration.fetchAllImages.test.js:25` mock thẳng `generateOpenRouterImage`). Vòng 2 thêm
`services/__tests__/openrouterImage.test.js` — 151 dòng, 24 assert, mock client, phủ: request
shape đúng `{model,prompt,n:1}` + timeout 60000, aspectRatio nhét vào prompt, parse b64/url,
empty-200 retry đến đúng 4 call, 429/500 retry, 400 fail-fast 1 call, `n:3` fan-out 3 call.
Verify độc lập: `jest openrouterImage imageGeneration genImageAIController` → **15/15 pass**.
Security: clean — 4 file sửa + 1 test mới, `package.json`/`yarn.lock`/`.env` không đổi,
không secret, không log mới, không dep mới (`openai@^4.95.0` đã có sẵn ở origin/master).
Chưa commit, nằm ở worktree `blogs-wt-images` nhánh `feat/openrouter-images-endpoint`.

**Task 3 — 0 round.** `bench/run.py` 636 dòng stdlib. Verify độc lập: `--dry-run` in đúng ma
trận, 0 network call. Security clean: key chỉ in `sha256[:8]`, không lên command line, không
ghi ngoài `bench/`. Tiêu $0,057, ví còn $31,52.

**Kết quả bench đầu tiên, ngược với kế hoạch:** `gemini-2.5-flash-lite` 4,60/5 nhưng
**allowed_tags_compliance 0/2** — phun tag ngoài `<h2>/<p>/<ul>/<li>`. `gpt-4.1-mini` 5,00/5,
judge spread 0,00. Đây đúng là nhánh Task 7a định bỏ → giữ nguyên quyết định hoãn 7a tới sau Task 6.

**Lỗ do plan Task 2 viết thiếu (không phải lỗi agent):** `DEFAULT_IMAGE_MODEL` vẫn là banana và
`callModelNode.js:131` (ảnh nội dung trong bài) vẫn dùng nó. Allowlist Task 2 không có file đó.
Hệ quả: giảm 74% mới chỉ áp cho featured image (66 ảnh/ngày ≈ $1,9/tháng), chưa phải toàn bộ
200–320 ảnh/ngày (≈ $213/tháng). Task 4 phải trả lời trước: 4–5 ảnh/bài qua `p-limit(4)` ở
29s/ảnh có chấp nhận được không. Rồi Task 5 mới mở rộng.

### Kết quả Task 4 + vá mime (2026-08-27)

**Bug chặn merge, tìm ra bằng đo thật:** ba model trả ba format khác nhau —
banana `image/png` 1024×1024 · `gemini-3.1-flash-lite-image` `image/jpeg` 1376×768 ·
`meta/muse-image` `image/webp` 2048×1152. `imageGeneration.service.js:41` hardcode
`mimeType: 'image/png'`. Task 2 vừa trỏ `/ai-image` sang model trả JPEG → mọi ảnh merchant
gen sẽ upload lên Shopify khai sai mime.

Vá (round 2 của Task 2): `parseImage` mang `data[0].media_type` ra thành key `mediaType`
(thêm, không đổi 3 key cũ → 2 call site cấm-đụng vẫn chạy); `processImageUpload` dùng
`imageItem.mediaType || 'image/png'`; `createFeaturedImageNode.generateHeroImage` phải
truyền `mediaType` qua vì nó dựng lại payload `{b64_json}` và làm rơi mất field.
Filename không cần đuôi — `stagedUploadsCreate` khai Content-Type từ field `mimeType`
riêng, không suy từ filename (đọc `shopifyGraphQlService.js:94-126`, không đoán).
Verify độc lập: **20/20 pass**. Security clean, `package.json`/`yarn.lock` không đổi.

**Bench ảnh 3 prompt × 3 model** ($0,214, cap $0,40):

| model | $/ảnh | latency ×3 | kích thước | format | 16:9 |
|---|---|---|---|---|---|
| `meta/muse-image` | $0,0100 | 16,9 / 16,1 / 12,2s | 2048×1152 | webp | ✅ |
| `gemini-3.1-flash-lite-image` | $0,0336 | 2,5 / 3,6 / timeout 31,9s | 1376×768 | jpeg | ✅ |
| `gemini-2.5-flash-image` | $0,0387 | 7,0 / 6,1 / 6,9s | 1024×1024 | png | ❌ |

**Fan-out `p-limit(4)`, 5 ảnh/bài, đúng shape production** ($0,222):
```
gemini-3.1-flash-lite-image   WALL= 7,84s  5/5  per-call 3,8/4,2/4,4s    $0,1715/bài
meta/muse-image               WALL=22,41s  5/5  per-call 11,1/11,6/12,5s $0,0500/bài
```

→ **Muse chịu được fan-out.** 22,4s nằm gọn trong pipeline gen bài 60–120s, rẻ hơn 3,4×.
Task 5 được phép mở Muse sang `callModelNode.js`. Tiết kiệm tính lại trên số đo:
250 ảnh/ngày × ($0,0387 − $0,0100) = **$7,18/ngày ≈ $215/tháng**.

Muse thực đo 11–17s/ảnh, không phải 29s như lần đo đơn đầu tiên (prompt lần đó dài hơn).

**Chặn Task 5:** `callModelNode.js:92` `ensureDataUrl` hardcode `data:image/png;base64,${value}`.
Hiện vô hại vì `generateImageForDescriptor` không truyền model nên vẫn rơi về
`DEFAULT_IMAGE_MODEL` (banana, PNG). Đổi sang Muse (WebP) mà không vá dòng này = lỗi mime lần hai.

Ví OpenRouter còn **$31,26**. Task 4 tiêu $0,436.

**Nợ nhỏ:** harness in `widthxheight = NonexNone` cho JPEG/WebP — parser chỉ đọc PNG header.
Không chặn gì (đọc dims bằng `sips` ngoài harness), nhưng vá trước vòng đo lớn.

#### ✅ Task 5a: BLOG — Muse cho content image
- Agent: general-purpose (sonnet), cùng worktree `blogs-wt-images`
- Status: ✅ completed
- Plan:
  - Goal: `generateImageForDescriptor` dùng `meta/muse-image`; `ensureDataUrl` không còn hardcode PNG; test chứng minh WebP đi đúng tới upload
  - Files allowed: `langgraph/nodes/callModelNode.js` + test dưới `services/__tests__/`. KHÔNG đụng 4 file của Task 2 (đã xong, đã review)
  - Approach: truyền model tường minh + cho `ensureDataUrl` nhận mediaType. Bỏ phương án đổi `DEFAULT_IMAGE_MODEL` — nó còn là fallback của `openAi.service.js`, đổi sẽ kéo theo đường không liên quan
  - Test command: `node_modules/.bin/jest callModelNode openrouterImage imageGeneration genImageAIController` — pass
  - Risk: ảnh nội dung trong bài = phần lớn 200–320 ảnh/ngày. Sai mime = lặp đúng bug vừa vá
  - Rollback: revert; worktree riêng, chưa commit
- Rounds used: 0/5
- Security check: —
- Started: 2026-08-27
- Completed: —

**Quyết định (Tony, 2026-08-27):** `/ai-image` GIỮ `google/gemini-3.1-flash-lite-image`.
Đường merchant chờ trực tiếp, chỉ 17 call/ngày → không đánh đổi UX 7,8s → 22,4s lấy $0,12/bài.

### Kết quả Task 5a (2026-08-27) — 0 round

`callModelNode.js` +18/−5. `generateImageForDescriptor` truyền `model: OPENROUTER_MUSE_IMAGE`
tường minh (trước đó không truyền → rơi về `DEFAULT_IMAGE_MODEL` = banana).
`ensureDataUrl(value, mediaType)` hết hardcode PNG.

**Lỗi thứ ba cùng hình dạng, agent tự tìm:** `resolveImageResult` gọi
`processImageUpload({b64_json: imageBase64}, ...)` — dựng lại payload và làm rơi `mediaType`,
y hệt `generateHeroImage` ở round trước. Vá `ensureDataUrl` thôi thì data-URL đúng nhưng
mimeType khai lên Shopify vẫn sai. Đã truyền `{b64_json, mediaType}`.
→ Ba lần cùng một lỗi ở ba chỗ khác nhau: payload dựng lại tay làm rụng field.
Đáng nhớ khi review phần còn lại.

Test mới `langgraph/nodes/__tests__/callModelNode.test.js` (chưa từng có test cho file này).
Phải mock `@langchain/core/messages` vì package ESM-only, babel-jest không transform được —
hack test, ghi lại để biết.
Verify độc lập: `jest callModelNode openrouterImage imageGeneration genImageAIController`
→ **23/23 pass**. Security clean, không forbidden file.

`DEFAULT_IMAGE_MODEL` giữ nguyên banana — vẫn là fallback của `openAi.service.js:246`,
đổi sẽ kéo theo đường không liên quan.

**Nhánh `feat/openrouter-images-endpoint` giờ đủ để lấy trọn $215/tháng.** Vẫn CHƯA commit,
CHƯA push, CHƯA deploy.

### Kết quả Task 4b (2026-08-27) — bench Ollama text cho BLOG

6 case đúng hình dạng BLOG (2 audit-agent, 3 gen-ai-suggested, 1 alt-text), 6 model,
3 judge. 108 call OpenRouter ($0,0614) + 23 call Ollama (cap 40, không chạm).

| model | score | spread | latency | tok | json | keys | fail |
|---|---|---|---|---|---|---|---|
| `google/gemini-2.5-flash-lite` (baseline) | 4,81 | 0,23 | 3,76s | 158 | 6/6 | 6/6 | 0 |
| `google/gemini-2.5-flash` (pro) | 4,63 | 0,73 | 2,80s | 174 | 6/6 | **5/6** | 0 |
| **`ollama:gemma4:31b`** | **4,82** | **0,20** | **1,87s** | 135 | 6/6 | 6/6 | 0 |
| `ollama:deepseek-v4-flash:0731` | **4,90** | 0,20 | 14,77s | 2056 | 6/6 | 6/6 | 0 |
| `ollama:glm-5.3-flash` | 4,69 | 0,30 | 17,02s | 1700 | 6/6 | 6/6 | 0 |
| `ollama:qwen3.5:397b` | 4,69 | 0,36 | 40,95s | 4544 | 5/5 | 5/5 | **1 timeout** |

**Chốt: `gemma4:31b`.** Chất lượng ngang baseline (4,82 vs 4,81 — trong nhiễu, đừng đọc là
"hơn"), nhưng **latency 1,87s vs 3,76s (nhanh 2×)**, judge spread thấp nhất 0,20 (ranking tin
cậy nhất bảng), $0 vì ăn quota Ollama thay vì ví OpenRouter, và đã chạy prod SEO nên đã biết
tính nết.

`deepseek-v4-flash` điểm cao nhất 4,90 nhưng latency dao động 3,1–31,3s (tb 14,77s) — loại
theo đúng thứ tự ưu tiên chất lượng-rồi-latency. `qwen3.5:397b` 31–52s + 1 timeout, loại.
`glm-5.3-flash` 11–25s, loại (dù thắng riêng case alt-text).

**Cảnh báo mẫu:** 6 case, 1 lần chạy mỗi cặp. Chênh lệch điểm dưới ~0,3 là nhiễu.
Cái chắc chắn là latency và chi phí, không phải thứ hạng điểm.

**Điểm cần lưu:** baseline `gemini-2.5-flash-lite` ở case `blog-audit-02` mất **15,4s** trong
khi các lần khác ~1s — Gemini có đuôi latency dài, giống hệt cú timeout 31,9s của
`gemini-3.1-flash-lite-image` ở Task 4. Đây là lý do thứ hai để rời Gemini ở đường text.

**Giá trị của 5b không phải tiền.** BLOG text ~2.000 call/ngày × $0,00011 ≈ $6,6/tháng.
Giá trị thật: latency giảm 2× trên 2.000 call/ngày, và bớt phụ thuộc ví OpenRouter đang
dùng chung với APC. Quota: 2.000/ngày vào headroom ~12.600 → còn dư ~10.600.

**Nợ harness:** stdout bị buffer khi redirect → log rỗng tới lúc kết thúc, không theo dõi
được tiến độ. Thêm `flush=True` hoặc chạy `python3 -u` nếu còn dùng cho vòng đo dài.

### Bổ sung Task 4b — ba điểm từ báo cáo đầy đủ (2026-08-27)

**1. Tier "pro" của BLOG đang tệ hơn tier thường.** `google/gemini-2.5-flash` (DEFAULT_PRO_TEXT_MODEL)
đạt 4,63 vs `flash-lite` 4,81, judge spread 0,73 (cao gấp 3× gemma4), và là **model DUY NHẤT
fail format-compliance thật**: `blog-suggest-05-outline` trả `outline.body` 7 mục trong khi
prompt yêu cầu 5–6. Merchant trả tiền cho tier pro đang nhận kết quả kém hơn. Ngoài scope brief
— ghi nhận, chưa sửa.

**2. Case alt-text KHÔNG đại diện production.** Prod `getPromptAltText` gọi **vision** (gửi kèm
ảnh thật); harness chỉ chạy text nên thay ảnh bằng mô tả cảnh viết sẵn. Điểm alt-text của mọi
model trong bảng (gemma4 4,47, glm-5.3-flash 5,00) **không dùng để quyết định được**.
Muốn chốt alt-text phải bench vision riêng. 76 call/ngày nên ưu tiên thấp, nhưng đừng ship
alt-text sang Ollama dựa trên bảng này.

**3. Sizing quota — con số của agent tính trên 1 account, thực tế có 2.** Đo lại trực tiếp
`https://ollama.com/api/usage` lúc chốt Task 4b:
```
755509cb  weekly 91,7%  req=68.720   ← sáng cùng ngày mới 87,1% (66.285)
7cbb4392  weekly  1,1%  req= 5.468
```
Trần suy từ % của key mới (1,1%) quá nhiễu để dùng — hai account có vẻ khác gói, không kết luận.
Điều chắc chắn: **key cũ đã 91,7% và đang bò lên**. Khi nó cán trần, `keyPool` park nó
(`QUOTA_COOLDOWN_MS` 5h) và dồn toàn bộ sang key mới. Thêm BLOG (~6.776 req/tuần) vào pool là
nhỏ so với SEO (~47.929/tuần), nhưng phải bàn với chính SEO trước khi ship — quota là tài
nguyên chung, không phải free.

**Judge spread — không được đọc bảng như thứ hạng chắc.** Dải điểm 4,63–4,90 trên thang 5 quá
hẹp; per-case spread có lúc 1,4–1,6 (`glm-5.3-flash` ở `blog-audit-01` spread 1,6 → case đó
vô giá trị để xếp hạng). Cụm top (`flash-lite` / `gemma4:31b` / `deepseek-v4-flash`) coi như
**hoà**. Chỉ latency phân biệt được ba model đó.

Harness: 636 → 1019 dòng. Security clean — không secret literal, key chỉ fingerprint,
`OllamaCallGuard` tách riêng khỏi `SpendGuard`, không ghi gì vào `projects/Falcon/**`.
Đã vá bug `NonexNone`: thêm `jpeg_dimensions()`/`webp_dimensions()`, dispatch theo magic bytes,
file lưu đúng đuôi `.jpg`/`.webp`/`.png`.

#### ✅ Task 5b: BLOG — port lớp Ollama text
- Agent: general-purpose (opus)
- Status: ✅ completed
- Plan:
  - Goal: `audit-agent/fix-issue` và `gen-ai-suggested/*` của BLOG chạy `gemma4:31b` qua Ollama
    Cloud, tự fallback sang OpenRouter khi lỗi/hết quota; alt-text và mọi đường khác KHÔNG đổi
  - Files allowed: worktree mới `blogs-wt-ollama` — thêm `services/ollama/{index,keyPool}.js`,
    `config/ollama.js`, một route wrapper; sửa điểm chèn tối thiểu ở đường audit-agent +
    gen-ai-suggested; test dưới `__tests__/`. KHÔNG đụng `.env`, CI config, lockfile
  - Approach: kiến trúc C — copy tối giản từ `seo` (`origin/master`), **bỏ cron quotaAlert**
    (cron SEO đã phủ cả 2 key). Bỏ phương án tách lib chung: phải publish + SEO phải migrate
  - Test command: `node_modules/.bin/jest ollama` trong worktree — pass, mock hết network
  - Risk: đường AI text lớn nhất của BLOG (892 call/ngày). Fallback hỏng = mất tính năng, không
    chỉ chậm. Quota là tài nguyên chung với SEO
  - Rollback: revert; worktree riêng, chưa commit
- Rounds used: 0/5
- Security check: —
- Started: 2026-08-27
- Completed: —

**Quyết định (Tony, 2026-08-27):** BLOG dùng **key Ollama thứ 2 (`7cbb4392`) riêng**, không
gộp pool với key cũ đang 91,7%. Alt-text ở lại OpenRouter tới khi bench vision.

### Kết quả Task 5b (2026-08-27) — 0 round

**Seam: `getCompletion` trong `openAi.service.js`, thêm tham số opt-in `ollamaRoute`.**
Không route theo model id như SEO — vì hai đường đích của BLOG truyền đúng những alias
(`gpt-4.1`, `gpt-5.1`) mà alt-text/translation/MCP cũng truyền, nên route theo model sẽ kéo
theo cả những đường brief cấm động. Flag per-call-site là thứ duy nhất tách được, và nó kiêm
luôn nhãn log để đo tỉ lệ fallback theo từng đường.

Chống đúng vết lỗi đã cảnh báo: fallback là `getCompletion({...args, ollamaRoute: undefined})`
— spread cả payload, không liệt kê lại field. Có test assert model/response_format/messages/
usage sống sót qua fallback.

Thêm mới 4 file nguồn (`config/ollama.js` 34, `services/ollama/index.js` 232,
`services/ollama/keyPool.js` 84, `services/aiContent/ollamaRoute.js` 211) + 8 file test.
Sửa 3 file: `openAi.service.js`, `auditAgent/chains.js`, `genAIBlogController.js`
(`3 files changed, 47 insertions(+), 12 deletions(-)`).

Đúng kiến trúc C: KHÔNG port cron quotaAlert / repository / `quotaAlert.js` / `getOllamaUsage`.
Bỏ luôn tầng Redis của breaker SEO — BLOG chỉ tạo Redis client khi `isProduction && REDIS_HOST`
nên latch Redis sẽ chết ở mọi env khác. Process-local, đúng cho GCF.

Fallback phủ: HTTP 5xx, đứt socket, `429 too many concurrent requests` (phân loại `ECONCURRENT`,
không nhầm thành quota), 429/402/403 (quota), deadline, `done_reason:'length'`, completion rỗng,
JSON hỏng, JSON không khớp zod schema của caller, và **không có key nào** (→ đi thẳng OpenRouter,
warn 1 lần/process, không throw). Circuit: quota 5h, 3 timeout liên tiếp → 10 phút.

Đường KHÔNG đổi, chứng minh bằng test chứ không bằng đọc code: `generateImageAltText`
(dùng `getVisionCompletion`), `getImageAlt`, langgraph article, `/genClaude`, image gen.
`getCompletion` còn guard: `isStream` và `content` không phải string (mảng vision parts) không
bao giờ route, kể cả khi truyền flag.

Verify độc lập: `jest --testPathPattern 'src/.*[Oo]llama'` → **66/66 pass, 8 suite**.
Scope sạch, không forbidden file, không secret trong diff.

**Env cần set trong CI `PRODUCTION_ENV_FILE` (Tony tự set, không nằm trong diff):**
`OLLAMA_API_KEYS` = key #2 · `OLLAMA_API_KEY` (fallback đơn) · `OLLAMA_BASE_URL` (mặc định
https://ollama.com) · `OLLAMA_TIMEOUT_MS` (mặc định 20000 — hai caller đều là HTTP handler
đồng bộ trên trần 60s gen2, fallback OpenRouter phía sau bounded 30s/attempt, nên 20s chừa đủ
chỗ cho fallback và vẫn >10× latency đo được 1,87s).
Không set gì cả → app chạy y như hôm nay, mọi call đi OpenRouter.

### 🔴 Bug prod độc lập, xác minh dứt điểm (ngoài scope brief)

`services/openAI/index.js:2` — `CONTENT_MODAL = 'gpt-5.2-2025-12-11'`. Id này KHÔNG có trong
`LEGACY_MODEL_MAP` nên `resolveModel` trả nguyên si sang OpenRouter. Gọi thử thật:
```
gpt-5.2-2025-12-11      HTTP 400 "gpt-5.2-2025-12-11 is not a valid model ID"
gpt-5-mini-2025-08-07   OK  → OpenRouter tự map về openai/gpt-5-mini
```
`DEFAULT_MODEL` sống vì OpenRouter nhận dạng OpenAI-style; `CONTENT_MODAL` thì chết.
Nó là model của `chains.generateDescription` (`chains.js:353`), được gọi từ **6 chỗ** trong
`auditAgentController.js` (`MAIN_CONTENT_ASSESSMENT`, `TEXT_LENGTH`, `RELATED_KEYWORD_DENSITY`,
paragraph/sentence/subheading/introduction/internal-links).

Prod chưa lộ: `/api/audit-agent/fix-issue` 08-26 = **573× 200, 1× 402**, và service `api`
3 ngày chỉ đúng 1 lỗi `[getRedirectTracer]`. Nhiều khả năng những issueType đó ít được bấm.
**Không phải regression của 5b** — hiện tại chúng đã fail sẵn; sau 5b chúng chạy Ollama và
thành công, chỉ fallback là đường chết. Tức 5b làm tình hình tốt lên, nhưng che bug đi.

Chưa vá: sửa thì phải chọn map về đâu, mà `'gpt-5.2' → DEFAULT_PRO_TEXT_MODEL`
(`gemini-2.5-flash`) chính là model Task 4b đo được **kém hơn `flash-lite`** (4,63 vs 4,81)
và là model duy nhất fail compliance. Cần Tony quyết, nên tách MR riêng.

### Findings khác từ 5b (ghi nhận, chưa sửa)

- `getVisionCompletion`: nhánh `|| DEFAULT_VISION_MODEL` **không bao giờ chạy** vì
  `resolveModel('gpt-4o-mini')` luôn trả `DEFAULT_TEXT_MODEL`. Vision đang chạy flash-lite,
  không phải flash. Đã pin bằng test như hành vi hiện tại.
- **PII trong log có sẵn**: `chains.js parseJsonCompletion` log `raw.slice(0,500)` của completion
  hỏng qua `logger.error`, và `CompletionNotJsonError` nhúng đúng 500 ký tự đó vào message —
  đó là nội dung blog của merchant, `packages/functions/CLAUDE.md` cấm. Agent tự dính bẫy y hệt
  trong code mới (V8 nhét input hỏng vào `SyntaxError`) và đã vá phía mình; chỗ cũ để nguyên.
- `eslint` không chạy được trong worktree (`async-function/require.mjs` ESM dưới eslint 6 CJS
  loader). Lint chưa chạy — chỉ có prettier qua format hook.
- 3 test fail toàn repo đều pre-existing, đã verify bằng `git stash -u` trên tree sạch:
  `redis.service.test.js` (thiếu REDIS_HOST), `removeRecipeMetafields.test.js` (openai cần fetch
  shim dưới jest 24), `handleAnalysis.excludedChecks.test.js` (`blog-score` không resolve được).

---

## BLOG đã lên MR — 2026-08-28

Hai nhánh gộp làm một để Tony đẩy staging test một lần, không phải deploy hai lượt.

- **MR !869** — https://git.avada.net/avada/blogs/-/merge_requests/869
  `feat(ai): route blog text through Ollama Cloud and image gen through /api/v1/images`
  `feat/openrouter-images-endpoint` → `master`, 23 file, +2087/−54.
- **MR !870** — đóng, comment trỏ về !869. Commit của nó còn nguyên trong !869 qua merge commit.

Gộp bằng `git merge --no-ff feat/ollama-text-route` trên nhánh ảnh: hai changeset không
đụng file nào của nhau và cùng merge-base `64f7f35a2` nên không có hunk nào phải giải quyết
tay. Kiểm chứng bằng số: 23 file = 7 + 16, +2087 = 426 + 1661.

Test trên nhánh gộp (`./node_modules/.bin/jest packages/functions`):

```
Test Suites: 9 failed, 66 passed, 75 total
Tests:       1 failed, 456 passed, 457 total
```

456 = 372 (master sạch) + 18 (ảnh) + 66 (ollama). Cộng khớp tuyệt đối → merge không nuốt
test nào. 9 suite fail + 1 test fail giống hệt master sạch (thiếu `firebase-sa.json`,
`REDIS_HOST`).

Security §8 trên diff gộp: 0 secret literal, 0 `console.log`, 0 log dính prompt/merchant
content, 0 file cấm, 0 dep mới (`package.json`/`yarn.lock` không đổi → immutable install
không bị ảnh hưởng).

**Merge !869 chưa bật Ollama.** `OLLAMA_API_KEYS` không set thì mọi call vẫn đi OpenRouter,
warn một lần mỗi process, không throw. Bật/tắt là CI variable, tách rời khỏi thời điểm merge.
Phần ảnh thì không có cờ — merge là đổi luôn.

Env cần set trong `PRODUCTION_ENV_FILE` của môi trường muốn bật:
`OLLAMA_API_KEYS` (bắt buộc, key #2), `OLLAMA_BASE_URL` (tuỳ chọn), `OLLAMA_TIMEOUT_MS` (tuỳ chọn).

---

## Task 6 — bench APC description, 2026-09-03

7 model × 5 case × 3 judge. 110 call OpenRouter ($0,0603) + 25 call Ollama. Ollama chạy
**key #2 (`7cbb4392`)** — key #1 đang phục vụ SEO prod và prod đang đói concurrency (85%
fallback 5 ngày qua là 429/no-account), bench không được cướp slot.

| model | score | spread | latency | tag hợp lệ | $/call |
|---|---|---|---|---|---|
| `ollama:glm-5.3-flash` | **4,99** | 0,04 | 10,29s | 5/5 | $0 |
| `ollama:nemotron-3-nano:30b` | 4,99 | 0,04 | 29,68s | 5/5 | $0 |
| `openai/gpt-4.1-mini` (đường có ảnh) | 4,98 | 0,04 | 4,52s | 5/5 | $0,00047 |
| `ollama:gemma4:31b` | 4,83 | 0,32 | 2,13s | 5/5 | $0 |
| `ollama:gpt-oss:120b` | 4,77 | 0,32 | 3,08s | 4/5 (`<em>`) | $0 |
| `ollama:deepseek-v4-flash:0731` | 4,75 | 0,56 | 4,31s | 5/5 | $0 |
| `google/gemini-2.5-flash-lite` (đường text) | **4,40** | **1,36** | 1,94s | 5/5 | $0,00012 |

**Sửa số của chính bench.** Bảng harness in `allowed_tags_compliance 0/5` cho `gemma4:31b`
và `gemini-2.5-flash-lite`. Sai — case trong `cases/text_cases.json` chỉ cho `h2,p,ul,li`,
còn prompt thật của APC cho cả `<strong>` và `<br>` (`getPrompt.js:202,307`). Thẻ duy nhất
hai model đó thêm là `<strong>`, hợp lệ ở prod. Tính lại theo policy thật thì chỉ
`gpt-oss:120b` vi phạm (`<em>`). Cột trên là số đã tính lại.

**Phát hiện chính: model đang chạy prod cho đường text-only là model tệ nhất trong 7.**
`gemini-2.5-flash-lite` 4,40 và spread 1,36 — judge bất đồng hơn 1 điểm, tức chất lượng
không ổn định giữa các lần. Sáu model còn lại đều spread ≤ 0,56. Mọi ứng viên Ollama đều
thắng nó.

`gpt-4.1-mini` — cái brief gọi là "khá cũ" — thực ra 4,98, hạng 3. Nó không phải vấn đề.

**Hai đường, hai ngân sách latency** (`generatorController.js:159` vs `:146`):
- `GENERATE_SINGLE_TYPE` → `await generateContent` inline, merchant chờ.
- bulk → `publishTopic('bulkGenerate')`, trả `processId` ngay, Pub/Sub xử lý.

**Chưa bench: đường có ảnh.** `gpt-4.1-mini` chỉ phục vụ request **kèm ảnh** của shop không
bật `enableGpt41`. Đếm prod `ai-product-copy`: **1/10.395 shop** bật cờ đó, nên `openai/gpt-4.1`
coi như chết, còn `gpt-4.1-mini` ôm toàn bộ đường có-ảnh. Bench này text-only → **Task 7a vẫn
chưa đủ căn cứ để bỏ `MODEL_ALIASES`**. Không có record nào lưu model đã dùng nên cũng không
đo được tỉ trọng request có ảnh từ dữ liệu.

---

## Task 7b — plan (APC ollama route)

- **Goal**: request text-only của APC đi Ollama `gemma4:31b` bằng **key riêng của APC**, mọi
  lỗi rơi về OpenRouter `gemini-2.5-flash-lite` như hôm nay. Không set key = không đổi gì.
- **Files allowed**: `config/ollama.js` (mới), `services/ollama/{index,keyPool}.js` (mới),
  `services/aiService.gateway.js` (sửa), test cho các file trên. Không đụng file khác.
- **Approach**: client shape-compatible với `client.chat.completions.create` để vòng retry sẵn
  có ở `aiService.gateway.js:150` dùng lại nguyên. Bỏ port native `/api/chat` như SEO — Ollama
  Cloud có `/v1/chat/completions` OpenAI-compatible, đo thật 200 OK.
- **Test command**: `./node_modules/.bin/jest packages/functions` — phải xanh, và số test tăng.
- **Risk**: `generateFromPrompt` là đường sinh content chính của cả app. Sai là merchant nhận
  mô tả rỗng. Giảm bằng: opt-in theo env, fallback ôm mọi lỗi, đường có-ảnh không đụng tới.
- **Rollback**: xoá `OLLAMA_API_KEYS` khỏi env → route tắt, không cần revert code.

### Ba thứ đo được, quyết định thiết kế

**1. `reasoning_effort: 'minimal'` BẬT thinking trên Ollama.** Gateway gửi param này mọi call
(`aiService.gateway.js:157`). Đo trên `gemma4:31b`, prompt APC thật, 5 lần mỗi biến thể:

| body | content | reasoning | latency |
|---|---|---|---|
| y hệt gateway hiện tại | 1297 | **2773** | 5,79s |
| `think:false`, bỏ `reasoning_effort` | 1374 | 0 | **3,62s** |

2.773 ký tự reasoning bị `extractTextFromResponse` vứt đi — trả tiền latency cho đúng số 0.
`think:false` một mình không đủ: thêm lại `reasoning_effort` thì reasoning quay về (635 ký tự).
Nên leg Ollama phải **strip `reasoning_effort` + `enable_thinking`, thêm `think:false`**.

**2. Reasoning ăn `max_tokens` → content rỗng.** Ở `max_tokens: 200`, một lần đo trả
`content: ""` với `reasoning` 608 ký tự. `extractTextFromResponse` đọc `choices[0].message.content`
→ rỗng → gateway retry 3 lần rồi trả `text: ''`. **Hỏng câm, không throw.** Với APC hiện tại
rủi ro là lý thuyết: `estimateTranslateMaxTokens` sàn ở 8080 và `MAX_TOKENS` = 8080, không caller
nào truyền nhỏ hơn. Vẫn phải guard vì rỗng-nhưng-200 không phải lỗi mà fallback thấy được.

**3. Đường có-ảnh không đụng.** `gpt-4.1-mini` đạt 4,98 ở bench và chưa ai đo Ollama trên vision.
`hasImage` giữ nguyên OpenRouter.

### Task 7b xong — MR !194

https://git.avada.net/avada/ai-product-copy/-/merge_requests/194 (project 330, base `master`),
6 file, +610/−2.

```
nhánh:       5 suite / 56 test  — toàn xanh
master sạch: 3 suite / 39 test  — toàn xanh
```
APC không có baseline fail nào, khác BLOG. +17 test / 2 suite mới.

Security: 0 secret, 0 `console.log`, 0 log prompt/PII, 0 file cấm, 0 dep mới. Host outbound mới
duy nhất là `ollama.com` — đúng mục đích thay đổi.

Hai lỗ hổng của harness phải né trong file test chứ không sửa config: jest repo này chưa expose
`AbortController` global, và package `openai` cần fetch shim. Stub `AbortController` tự viết
tay chứ không lấy từ package `abort-controller` — nó chỉ tồn tại như transitive install, không
package.json nào khai.

**Chưa làm, có lý do:** `glm-5.3-flash` (4,99) cho đường bulk. `generateFromPrompt` hiện không
có tín hiệu nào phân biệt sync với bulk, nên tách đường là MR riêng.

