trước tiên tôi muốn hiện diện cái webmcp này trên app để khách hàng biết được đã, hãy thiết kế 1 menu riêng đặt ở đầu tiên trong menu Performance, sau đó làm liệt kê tất cả các issue có thể fix được từ trong app để vào check list + test api pageinsignt từ google xem có sẵn field lỗi này hay không? ccuws liệt kê hết ra để t view checklist đã
**Thêm: Để educate tốt hơn thì m có menu Agentic AI: (chưa các mục sau)
**Sửa**: gộp WebMCP vào AI Agent Readiness + show checklist ra
LLMs (llms.txt và full)
WebMCP: dạng audit về check và sửa 1 click.
... các feature khác cho LLM 
---
---

## Progress

Started: 2026-08-03
Checklist: `jobs/seo/webmcp-phase1-checklist.md`
Spec: `projects/Falcon/seo/docs/superpowers/specs/2026-08-03-agentic-browsing-score-design.md`
Branch: `feat/agentic-browsing-score` (cắt từ master `256018611d45`)

Chốt scope: chỉ scan + report. Tên menu "AI Agent Readiness". Dùng chung 1 PSI call.

| # | Task | Agent / Model | Status | Rounds | Notes |
|---|------|---------------|--------|--------|-------|
| 1 | BE: PSI category AGENTIC_BROWSING + formatAuditResults + jest | general-purpose / sonnet | ✅ | 1/5 | 6 test mới trên fixture PSI thật |
| 2 | BE: prepareDataOnePage emit agentic fields | cavecrew-builder / haiku | ✅ | 1/5 | sửa lại IIFE → destructuring |
| 3 | FE: page AI Agent Readiness + route + menu + card | general-purpose / sonnet | ✅ | 1/5 | sửa `EmptyState image=""` |
| 4 | Verify: jest + eslint | inline | ✅ | 1/5 | +2 test cho prepareDataOnePage |

**COMPLETE** — 283 test pass (17 suite), eslint sạch trên toàn bộ file đã đụng. Tổng 4 vòng.

### Log

#### ✅ Task 1: BE PSI category + extract
- Agent: general-purpose (sonnet)
- Sửa `helpers/google.js`: `category: ['PERFORMANCE','AGENTIC_BROWSING']` + degrade retry khi PSI
  400 vì param category; `buildAgenticResult()` trích 6 audit, bỏ `details.items[].node`
- Test mới: `helpers/__tests__/googleAgentic.test.js` (6 case) + 2 fixture PSI thật
- Vòng 1 pass

#### ✅ Task 2: prepareDataOnePage
- Agent: cavecrew-builder (haiku) — agent này không có Bash, tao chạy test hộ
- Thêm `${device}AgenticScore` (fraction, không scale 0-100) + `${device}AgenticAudits`
- Review: agent viết IIFE để bỏ key `score`, tao đổi thành destructuring rest
- Vòng 1 pass

#### ✅ Task 3: FE page
- Agent: general-purpose (sonnet)
- Mới: `pages/AiReadiness/{AiReadiness.js,AiReadiness.json,index.js}`, `loadables/AiReadiness.js`
- Sửa: `routes.js`, `config/appMenu.js`, `pages/Performance/Performance.{js,json}`,
  `const/productAnalytics.js` (CARD_AI_READINESS), `helpers/screenTracker.js` (analytics tự động)
- Review: `EmptyState image=""` → render `<img src="">`, đổi sang CDN URL đang dùng sẵn
- Vòng 1 pass

#### ✅ Task 4: Verify
- `npx jest packages/functions/src/helpers` → 17 suite / 283 test pass
- `npx eslint` (Node 20.19) → 0 lỗi. Node 22 ambient chạy eslint lỗi ESM, phải nvm use 20
- Thêm `helpers/pageSpeed/__tests__/prepareDataOnePage.test.js` (2 case) vì task 2 chưa có test phủ

### Còn lại (chưa làm)

- `yarn update-label` để sinh 14 locale — cần `GOOGLE_TRANSLATE_API_KEY`, chưa chạy
- Test tay trên staging: chạy speed scan rồi mở page readiness

Commit Phase 1: `74a99be0532d` — 16 file, pre-commit ESLint hook pass, 283 test pass.
3 symlink `node_modules` cố tình để ngoài commit, tách MR riêng.

---

## Phase 2 — menu Agentic AI + WebMCP 1-click

Chốt 2026-08-03: **menu top-level riêng** (không chôn trong Performance), làm **WebMCP trước**
llms.txt.

Đổi IA: page readiness dời `/performance/ai-readiness` → `/agentic-ai/readiness`. Chưa ship nên
dời miễn phí. Performance giữ 1 card trỏ sang.

| # | Task | Agent / Model | Status | Rounds | Notes |
|---|------|---------------|--------|--------|-------|
| 5 | FE: menu top-level Agentic AI + landing + dời readiness | general-purpose / sonnet | ✅ | 1/5 | icon `AutomationIcon`, verify có export |
| 6 | BE: webMcpService inject + revert + wiring + test | general-purpose / opus | ✅ | 1/5 | tao vá 2 thứ, xem dưới |
| 7 | FE: page WebMCP audit + nút fix 1 click | general-purpose / sonnet | ✅ | 3/5 | 2 vòng sửa hướng, xem dưới |
| 8 | Verify: jest + eslint + soi snippet liquid | inline | ✅ | 1/5 | eslint 0 lỗi/19 path, 618 pass |

**PHASE 2 COMPLETE** — commit `e54de44c2d1e`, 22 file.

### Task 7 mất 3 vòng — 2 lần đổi hướng, lần 2 là lỗi của tao

**Vòng 1:** nút enable chỉ gọi `/settings/speedUp`. Mà `setSpeedUp` chỉ lưu setting +
`updateSettingsToTheme` cho `preload/pageSpeed/loading/minify` → **không inject gì**. Nút 1-click
là no-op.

**Vòng 2 (tao chỉ sai):** bảo agent POST `/optimize-store` với `actionList: ['webMcp']`.
`subscribeOptimizeStore.js:280` **luôn** dispatch `downgradeSpeedUp` với actionList trong khối
`finally`, và `subcribeDowngradeSpeedUp` revert mọi kỹ thuật vắng mặt trong list → sẽ **gỡ sạch**
critical CSS + preconnect + font swap + HyperSpeed của shop. `SiteSpeedUp` không dính vì luôn gửi
full task set.

**Vòng 3 (đúng):** inject thẳng trong `setSpeedUp` — body có `webMcp` + resolve được `themeId`
→ gọi `handleWebMcpService`/`revertWebMcp`, đẩy vào `postUpdateSettings` sẵn có. Không đụng
pipeline optimize. FE chỉ còn 1 lệnh `handleSave`, gỡ hết `/optimize-store`, `/shopify/themes`,
`THEME_ROLE_MAIN`, state `themeError`.

Agent chết giữa vòng 3 vì API error — tao kiểm tra file, phần dọn đã xong sạch, 0 leftover.

Cũng đã chặn đề xuất thêm `'webMcp'` vào `tasksRocket`: `optimizeStoreRocket.actionList` chính là
mảng đó không lọc → mọi shop bấm "Run Optimization" sẽ bị inject WebMCP dù không bật.

### Nhánh đã tạo

| Nhánh | Commit | Nội dung |
|---|---|---|
| `feat/agentic-browsing-score` | `74a99be0532d` | Phase 1: PSI agentic score + page readiness |
| | `e54de44c2d1e` | Phase 2: menu Agentic AI + WebMCP 1-click |
| `fix/optimize-report-total-images` | `947d0f9056f7` | 1 dòng, fix `ReferenceError` Report card |

Chưa push nhánh nào. Symlink `node_modules` vẫn để ngoài, chờ MR riêng thứ 3.

### Soi snippet liquid (8081 bytes) — pass

- `{{` = **0**; `{%`/`%}` đúng 2 cặp, chỉ ở header comment → không vỡ Liquid render.
  `}}` có 10 lần (JSON đóng ngoặc lồng) nhưng Liquid chỉ parse khi có `{{` mở → literal, vô hại.
- 0 URL tuyệt đối, 0 `myshopify`; toàn root-relative + `credentials: 'same-origin'`
- Guard `typeof document.modelContext === 'undefined'` + guard `fetch`; toàn bộ đăng ký trong
  `try/catch` nuốt lỗi có chủ ý (chạy trong theme merchant sống)
- Output qua `toolResult()` cắt 1500 ký tự, `summarize()` bóp field trước khi cắt
- `readOnlyHint: true` cho 4 tool đọc; `add_to_cart` `readOnlyHint: false`

### Tao vá tay sau review task 6

1. **`revertWebMcp` không có caller** — viết ra rồi bỏ đó. Wire vào `subcribeDowngradeSpeedUp.js`
   theo đúng mẫu 4 revert đang có. Thiếu nó thì merchant tắt WebMCP mà JS vẫn nằm trong theme.
2. **`ACTION_WEBMCP` bị nhét vào `ENTERPRISE_ACTION_LIST`** (agent tự quyết vì HyperSpeed nằm đó).
   Chốt: gỡ ra, WebMCP mở cho mọi plan.

### 8 suite jest fail — verify xong, KHÔNG liên quan

`shopify2026Client` (expect `2026-01`, code trả `2026-07`), `workListStore`, `spillPolicy`,
`detect-changed-functions` (cần `origin/<branch>`, chưa push). Không file nào nằm trong 11 file
branch này đụng. Số 8 vì `lib/` chứa bản build cũ và jest không ignore build output.

### Bug prod nhặt được, không phải của branch này

`packages/functions/src/controllers/historyOptimizeController.js:218` dùng
`totalAllPageImageCount`, nhưng destructure của biến đó nằm ở dòng 246 — **khác scope**. Runtime
`ReferenceError` mỗi lần `getAnalysisData()` chạy → vỡ Report card của Optimize. Do commit
`4afaf49c9589`, đang nằm trên master. Chốt: **tách MR riêng**, làm sau khi commit Phase 2.

### ~~Rủi ro Phase 2~~ → ĐÃ ĐO XONG 2026-08-03

Gate weight-promotion **không còn treo**. Đo bằng `lighthouse@13.4.1` local + Chrome
`150.0.7871.187` (cùng dòng build với Chrome PSI `150.0.7871.186`), không cần deploy staging.
Chi tiết + artefact: `jobs/seo/webmcp-lighthouse-measurement.md`, `jobs/seo/data/`.

4 kết quả đổi kế hoạch:

1. **Chỉ `webmcp-schema-validity` tính điểm.** `webmcp-registered-tools` và `webmcp-form-coverage`
   khai `scoreDisplayMode: INFORMATIVE` trong meta → vĩnh viễn weight 0. FE trình bày cả 3 như
   nhau → đã sửa wording (xem mục dưới).
2. **WebMCP nằm sau flag ở Chrome 150, mặc định tắt.** PSI chạy flag mặc định → cả 3 audit
   `notApplicable` cho **mọi** site, không riêng mình. Không phải schema mình sai.
3. **Snippet đúng.** Bật `--enable-features=WebMCP` chạy lại: `webmcp-schema-validity` nhảy từ
   `notApplicable` → **w=1 score=1**, `webmcp-registered-tools` liệt kê đủ 5 imperative tool.
   Guard `document.modelContext` an toàn — Chrome expose cả `navigator.` lẫn `document.`.
4. **llms.txt mới là đòn bẩy dùng được hôm nay.** Đo: file hợp lệ ở domain root → `llms-txt`
   w=1 score=1. Với gymshark: 0.475 → **0.650 (+17.5)**. File lỗi → 0.317 (**−15.8**).

→ **Đảo thứ tự Phase 3: llms.txt trước.** Vướng cần verify: Shopify không ghi domain root, phải
dùng URL Redirect `/llms.txt` → app proxy, và gatherer chỉ fetch `new URL('/llms.txt', finalUrl)`
nên redirect phải kết thúc 200.

### Sửa wording + 2 defect FE — CHƯA COMMIT (nằm trên `e54de44c2d1e`)

Gỡ `console.log('resprespresp', resp)` ở `helpers/google.js:276` (vi phạm no-raw-console, in nguyên
response PSI ~1 MB). Sửa wording `WebMcp.{js,json}` + `AiReadiness.{js,json}` theo kết quả đo.

Lúc sửa wording lòi ra 2 lỗi thật, không phải cosmetic:

1. **Audit informative render badge xanh "Pass".** `getAuditStatus` chỉ check
   `mode === 'notApplicable'`. Audit informative trả `score: 1` → rơi vào nhánh pass. Hứa tăng
   điểm cho thứ vĩnh viễn weight 0. Fix: match `mode` trước `score`, thêm status `informative`.
2. **`AiReadiness.js:95` đếm audit informative vào `applicable`.** Lighthouse chỉ trung bình audit
   có weight → tỉ lệ "n/m audits passing" lệch với category score hiện ngay cạnh. Fix: loại cả
   `STATUS_INFORMATIVE` khỏi mẫu số.

Nợ merge: `yarn update-label` (key mới `WebMcp.enable.themeWriteNote`,
`WebMcp.enable.browserSupport.*`, `WebMcp.audits.{scored,informationalOnly}`,
`WebMcp.status.informative`, `AiReadiness.status.informative`; bỏ `WebMcp.enable.honestNote`).

### Còn 2 vấn đề chưa fix — phát hiện từ log emulator 2026-08-03

Data BE về đúng: `mobileAgenticScore: 1`, `mobileAgenticAudits` đủ 6 audit +
`a11yIssues`/`a11yIssueCount`/`llmsTxtErrors`. Nhưng:

1. **`${device}AgenticScore` không ai đọc.** Grep `packages/{assets,functions}/src`: đúng 1 hit là
   chỗ ghi (`helpers/pageSpeed/pageSpeed.js:56`), 0 chỗ đọc. Đang ghi 6 field/shop vào Firestore
   cho không. FE tự dựng lại tỉ lệ từ `AgenticAudits`.
2. **Bản dựng lại đó sai với audit `numeric`.** `getAuditStatus` chấm `score === 1` mới pass, mà
   `cumulative-layout-shift` là numeric chứ không binary:
   - shop test: CLS `'0'` → score 1 → FE "2/2 passing", khớp.
   - gymshark: CLS 0.95 → score 0.95 → FE "0/2 passing", Lighthouse tính 0.48.

   CLS 0.95 là xanh trong Lighthouse nhưng FE hiện badge đỏ "Fail". Mọi shop CLS khác 0 tuyệt đối
   đều dính.

Fix đề xuất (2 dòng): headline lấy thẳng `${device}AgenticScore` × 100 thay vì dựng lại;
`getAuditStatus` cho mode `numeric` theo ngưỡng Lighthouse `>= 0.9` pass / `0.5–0.9` average /
`< 0.5` fail, không so `=== 1`.
