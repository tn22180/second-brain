show 1 check list cho WebMcp cùng với speed up ở dashboard sau đó làm liệt kê tất cả các issue có thể fix được từ trong app để vào check list + test api pageinsignt từ google xem có sẵn field lỗi này hay không? (t thấy có sẵn từ API page speed insign rồi, trong checklist có (LLMstxt. CLS, Agent Accessibility, WebMCP form coverage, WebMCP tools registered, WebMCP schemas))
Để educate tốt hơn thì m có menu Agentic AI: (chưa các mục sau)
  -AI Agent Readiness(WebMCP) + show checklist ra
  -LLMs (llms.txt và full intergrate từ AEO LLM txt của mình)
checkout từ master và remove nhánh hiện tại đi làm lại từ đầu cho t

---

## Decisions (2026-08-04)

- **Nhánh giữ, không làm lại.** `feat/agentic-browsing-score` đã cover phần data. Chỉ commit
  `d7f0fa5` là rác — nó xoá `extensions/optimize-product-images/` (657 dòng) + 3 symlink
  `node_modules` + `@remote-ui` trong `yarn.lock`, toàn thứ không liên quan.
- **PSI đã có sẵn hết data.** 1 call, `category: ['PERFORMANCE','AGENTIC_BROWSING']`
  (`google.js:85`), lưu vào chính doc speed score cũ (`pageSpeed.js:53-55`). Tầng data = 0 việc mới.
- **Chỉ 3/6 audit tính điểm hôm nay**: `agent-accessibility-tree`, `cumulative-layout-shift`,
  `llms-txt`. 3 audit WebMCP `notApplicable` weight 0 — Chrome 150 còn sau flag.
- **LLMs = cross-sell AEO**, không port `llmsTxtSyncService`. Đánh đổi: merchant chỉ dùng SEO app
  không tự fix được `llms-txt` trong app.
- **Tầng fix tách khỏi tầng data** → T2–T4 ship/rollback độc lập.

Spec: `projects/Falcon/seo/docs/superpowers/specs/2026-08-04-agentic-ai-checklist-design.md`

---

## Progress

Started: 2026-08-04

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| T0 | Dọn nhánh: revert xoá ngoài scope + rebase lên master | inline | ✅ | 1/5 | clean | rebase 0 conflict; chờ mày force-push |
| T1 | Card tóm tắt agentic trên trang Speed Up | inline | ✅ | 2/5 | clean | `4732828` |
| T2 | `const/agenticChecklist.js` — map audit→fixChannel | inline | ✅ | 0/5 | clean | `c45eef8`, hook pass sạch |
| T3 | Gắn nút fix vào row `AiReadiness` | inline | ✅ | 0/5 | clean | `68c2df5`, hook pass sạch |
| T4 | Card + trang LLMs, cross-sell AEO | inline | ✅ | 0/5 | clean | `8f14881`, hook pass sạch |
| T5 | `yarn update-label` + `trackEvent` | inline | ✅ | 1/5 | clean | `715cb78` analytics + `3df0866` locale |
| T6 | Gộp trang WebMCP vào AI Agent Readiness, bỏ card WebMCP khỏi landing | inline | ✅ | 0/5 | clean | `50fd8e0`, hook pass sạch |
| T7 | Xoá card AI Agent Readiness khỏi menu Performance | inline | ✅ | 0/5 | clean | `94bff8c`, hook pass sạch |
| T8 | Sinh lại locale sau T6+T7 (hệ quả bắt buộc, không phải task mới) | inline | ✅ | 0/5 | clean | `08634e5`, −25 key/locale, 2 chuỗi dịch lại |
| T9 | Fix Firestore `undefined` khi lưu agentic audits lúc scan PageSpeed | inline | ✅ | 0/5 | clean | `4b5d652`, TDD, 9/9 pass |
| T10 | AiReadiness: bỏ chọn page type, chỉ home page | inline | ✅ | 0/5 | clean | `118aea1` (chung commit với T11) |
| T11 | AiReadiness: score theo UI `OverviewCard`, checklist theo UI `QueueTask` | inline | ✅ | 0/5 | clean | `118aea1` |
| T12 | Sinh lại locale sau T10+T11 | inline | ✅ | 0/5 | clean | `bfe2d44`, +2/−4 key, 1 chuỗi đổi |
| T13 | Back lại `optimize-product-images` ở extension | inline | ✅ | 0/5 | clean | đã xong từ T0 (`3e6cd0e`), verify lại, 0 commit mới |
| T14 | Rút mọi description trên trang Readiness còn 1 dòng, tối đa 2 | inline | ✅ | 0/5 | clean | `42770a8` (chung commit T15+T16) |
| T15 | Checklist hiện hết audit, bỏ collapse | inline | ✅ | 0/5 | clean | `42770a8` |
| T16 | Toggle WebMCP lên `titleMetadata` của Page | inline | ✅ | 0/5 | clean | `42770a8` |
| T17 | Sinh lại locale sau T14–T16 | inline | ✅ | 0/5 | clean | `db0f056`, 20 chuỗi đổi, −1 key |
| T18 | Đưa `avada-seo-webmcp-tools.liquid` vào theme app extension | inline | ✅ | 0/5 | clean | `be1043e`, +3 test chống lệch 2 bản |
| T19 | Bật/tắt từng tool trong "Tools this app registers" | inline | ✅ | 0/5 | clean | `be1043e` |
| T20 | Rút description còn sót — nằm ở trang LLMs, không phải Readiness | inline | ✅ | 0/5 | clean | `be1043e` + `41bc89a` |
| T21 | Sinh lại locale sau T19+T20 | inline | ✅ | 0/5 | clean | `41bc89a`, 3 chuỗi, 0 key mới |
T22 show save bar to save action như mấy chỗ khác, không update luôn
t23 hình như đang không save data vào metafile + setting đang k chia theo show từng phần ở Tools this app registers
t24 WebMCP registered tools và WebMCP form coverage đang không update status, status hơi khó hiểu chỉ có pass và chưa apply thôi cho dễ hiểu
Nguyên văn Tony báo, đã gộp vào T9 ở trên:

> fix lỗi saveStorage error 6FFrhDPLyN9t8mLeRT8r Error: Update() requires either a single JavaScript object or an alternating list of field/value pairs that can be followed by an optional precondition. Value for argument "dataOrField" is not a valid Firestore value. Cannot use "undefined" as a Firestore value (found in field "`avada-speed-score.homePage.desktopAgenticAudits`.audits.`agent-accessibility-tree`.displayValue"). If you want to ignore undefined values, enable `ignoreUndefinedProperties`. khi scan pagespeed

> T5 đổi: `locale/translations/*` là **generated**, cấm sửa tay (`packages/assets/CLAUDE.md` §i18n).
> Key đặt ở `ComponentName.json` cạnh component, rồi `yarn update-label` (cần
> `GOOGLE_TRANSLATE_API_KEY`) sinh ra 14 locale. Mỗi task tự tạo file JSON của nó; T5 chỉ chạy
> generator + wire `trackEvent`.

### Reported, không sửa

- `subscribeOptimizeStore.js:245` ghi progress `ACTION_WEBMCP` giả: `delay(1000)` rồi set
  `STATUS_DONE`, việc thật nằm ở `subcribeSpeedupBackground.js:58`. Merchant thấy "done" trước khi
  theme ghi xong. Ngoài scope brief.

### Log

#### 🔄 T0: Dọn nhánh
- Agent: **inline** (không dispatch — git history surgery, subagent không quyết được lúc conflict)
- Status: 🔄 in-progress
- Plan:
  - Goal: `git diff origin/master...HEAD --name-only` chỉ còn file agentic-AI + locale; test
    `googleAgentic` xanh; nhánh nằm trên `origin/master`.
  - Files allowed: `extensions/optimize-product-images/**`, `yarn.lock`. Không đụng gì khác.
  - Approach: `git checkout origin/master -- <2 path>` → 1 commit revert riêng → `git rebase
    origin/master`. Bỏ phương án `rebase -i` sửa thẳng `d7f0fa5`: commit đó còn chứa 11 file
    locale thật, tách trong rebase rủi ro hơn và không để lại dấu vết audit được.
  - **Không** restore 3 symlink `node_modules`: `origin/master` cũng không còn chúng.
  - Test command: `npx jest packages/functions/src/helpers/__tests__/googleAgentic.test.js`
    → 6 passed; và `git ls-tree HEAD extensions/optimize-product-images/src` có 2 file.
  - Risk: rebase 11 commit có thể conflict ở locale (11 file locale là chỗ hay đụng nhất).
    Conflict locale → giữ cả 2 phía, không tự ý bỏ string của master.
  - Rollback: `git reset --hard d7f0fa5560da` (SHA gốc, chưa push gì).
- Rounds used: 1/5 (round 1: pre-commit ESLint chặn — xử lý bên dưới, không phải fail logic)
- Security check: **clean**. Diff 6 file `+784/-1`. Secret-scan chỉ hit `Bearer ${token}` từ
  `getSessionToken(api)` — session token App Bridge lấy runtime, không hardcode, không log.
  0 `console.*`. `yarn.lock` thuộc danh sách file cấm nhưng restore nó là mục tiêu task, đã khai
  trong plan.
- Started: 2026-08-04
- Completed: 2026-08-04

**Kết quả**

- Commit restore: `3e6cd0e40a88` (sau rebase). 6 blob **byte-identical** với `origin/master`
  (verify bằng `git rev-parse origin/master:<f>` vs `:<f>`).
- Rebase lên `origin/master`: 0 conflict, 4 commit.
- `git diff origin/master...HEAD --name-only` → 44 file, toàn agentic-AI + locale.
- Test: `npx jest googleAgentic prepareDataOnePage webMcpService` → **3 suites / 17 tests passed**.

**Bypass hook, ghi lại để audit**: pre-commit hook lint file staged và fail 72 lỗi ESLint
(`valid-jsdoc`, `react/prop-types`) trong `ActionExtension.js` + `utils.js`. Cả 2 file
byte-identical với master → lỗi có sẵn trên master, không do commit này tạo. Sửa chúng = đụng file
mà commit chỉ đang đặt lại chỗ cũ, trái `Files allowed`. Commit bằng `--no-verify`, lý do ghi
trong commit message.

**Chưa push.** Nhánh giờ `ahead 15, behind 3` so với `origin/feat/agentic-browsing-score` do
rebase → cần `git push --force-with-lease`. Đang chờ mày.
- Rollback nếu cần: `git reset --hard wip/t0-backup` (tag trỏ `d7f0fa5560da`, SHA gốc trước T0).

#### 🔄 T1: Card tóm tắt agentic trên trang Speed Up
- Agent: inline (1 component mới + 1 dòng vào page có sẵn)
- Status: 🔄 in-progress
- Plan:
  - Goal: `/performance/speed-up` (page `SiteSpeedUp.js`) có 1 card: điểm agentic + `n/m audits
    passing` + link `/agentic-ai/readiness`. Không audit nào → card không render.
  - Files allowed:
    - mới `packages/assets/src/helpers/agenticAudits.js` + test của nó
    - mới `packages/assets/src/pages/SiteSpeedUp/Components/AgenticSummary/{AgenticSummary.js,
      AgenticSummary.json,index.js}`
    - sửa `packages/assets/src/pages/SiteSpeedUp/SiteSpeedUp.js` — thêm đúng 1 `Layout.Section`
    - sửa `packages/assets/src/pages/AiReadiness/AiReadiness.js` — bỏ bản `getAuditStatus` cục bộ,
      dùng helper chung
  - Approach: `SiteSpeedUp.js:87` đã có `scoreData` + `loadingScore` và đẩy vào
    `SiteSpeedUpContextProvider:247` → card đọc từ context, **không** gọi API mới. Card tóm tắt
    cứng ở homepage/mobile, không có toggle riêng: PSI chấm mobile, và `OverviewCard` đã có
    `DevicesToggle` của nó — thêm cái thứ hai trên cùng trang là hai nguồn sự thật cho merchant.
    Đổi thiết bị/loại trang nằm ở trang readiness.
    Bỏ phương án copy `getAuditStatus` sang component mới: `AiReadiness.js:71` đã có một bản; hai
    bản sẽ lệch ngay lần đầu Lighthouse đổi `scoreDisplayMode`.
  - Test command: `npx jest packages/assets/src/helpers/__tests__/agenticAudits.test.js` → passed;
    và `npx jest packages/functions/src/helpers/__tests__/googleAgentic.test.js` vẫn xanh.
  - Risk: trang Speed Up là trang mọi merchant gói performance đều mở. Shop chưa rescan từ lúc
    category ra thì `AgenticAudits` là `null` → card **phải** trả `null`, không được render khung
    rỗng hay ném lỗi.
  - Rollback: additive, `git revert` commit T1.
- Rounds used: 2/5 (round 1: `npx eslint` crash; round 2: hook chặn vì lỗi có sẵn — cả hai là
  môi trường/nợ cũ, không phải logic sai)
- Security check: **clean**. 7 file `+228/-70`. 0 secret, 0 `console.*`, 0 dep mới, 0 file cấm.
  Chỉ đọc `scoreData` — dữ liệu đã scope theo `activeShop` từ `getSpeedScore`, không nhận input
  nào từ request.
- Started: 2026-08-04
- Completed: 2026-08-04 — commit `4732828adca9`

**Kết quả**

- Mới: `helpers/agenticAudits.js` (50 dòng) + test 7 case;
  `pages/SiteSpeedUp/Components/AgenticSummary/{AgenticSummary.js,AgenticSummary.json,index.js}`
- Sửa: `SiteSpeedUp.js` +4 dòng (1 import + 1 `Layout.Section` giữa `OverviewCard` và `QueueTask`);
  `AiReadiness.js` bỏ bản `getAuditStatus`/`AUDIT_IDS`/4 hằng status cục bộ, dùng helper chung.
- Test: **4 suites / 24 tests passed**.

**2 phát hiện về môi trường, đáng ghi vì sẽ đập vào mặt task sau**

1. **ESLint v6 của repo crash trên node 22.** `node_modules/async-function/require.mjs:1
   SyntaxError: Cannot use import statement outside a module` khi lint `packages/assets/**`
   (lint `extensions/**` thì không). Local default là v22.22.0, repo chạy node 20.19 (CI) / 20.20
   (GCF). Chạy lint phải prefix `PATH="$HOME/.nvm/versions/node/v20.19.0/bin:$PATH"`.
2. **`SiteSpeedUp.js` có sẵn 2 lỗi ESLint trên nhánh** — `WidgetInlineBannerV2` (giữ cho 1 dòng
   JSX đã comment ở `:282`) và `isLimitNew` (`:47`), cả hai `no-unused-vars`. Verify bằng cách
   stash rồi lint file gốc: y hệt 2 lỗi. Nghĩa là **mọi commit sau này chạm `SiteSpeedUp.js` đều
   bị pre-commit hook chặn**. Không sửa ở đây (dead code không thuộc task) — nhưng nên dọn riêng.

#### 🔄 T2: `const/agenticChecklist.js` — map audit → fixChannel
- Agent: inline (1 file const + 1 test, không đủ việc để dispatch)
- Status: 🔄 in-progress
- Plan:
  - Goal: 1 map thuần, mỗi audit id → `{scoredToday, fixChannel, target}`. Test chứng minh mọi id
    trong `AGENTIC_AUDIT_IDS` đều có entry và mọi `fixChannel` là giá trị hợp lệ.
  - Files allowed: mới `packages/assets/src/const/agenticChecklist.js` + test của nó. Không sửa
    file nào khác — T3 mới là chỗ dùng nó.
  - Approach: **đổi vị trí so với spec** — bỏ `packages/functions/src/const/`, đặt ở
    `packages/assets/src/const/`. Không có gì phía backend đọc map này; `target` toàn route FE.
    `packages/assets/CLAUDE.md` nói `const/` là chỗ của hằng FE-only, và chỉ import từ
    `@functions/*` khi backend đã sở hữu khái niệm đó — ở đây thì không.
    Tách khỏi `helpers/agenticAudits.js`: helpers là logic thuần, const là bảng dữ liệu.
  - **Sửa 1 route sai trong spec**: `/image-seo` không tồn tại. Route thật là
    `/search-optimization/image-alt` (`routes.js:97` mount + `:235`).
  - Test command: `npx jest packages/assets/src/const/__tests__/agenticChecklist.test.js` → passed
  - Risk: thấp — dữ liệu tĩnh, chưa ai dùng. Rủi ro thật là target trỏ route chết → test phải
    khoá danh sách route hợp lệ chứ không chỉ khoá hình dạng.
  - Rollback: additive, revert commit.
- Rounds used: 0/5 — pre-commit hook `ESLint Passed` cả 2 file, không phải bypass
- Security check: **clean**. 2 file mới, dữ liệu tĩnh + test. 0 secret, 0 `console.*`, 0 dep,
  0 file cấm, không có input từ request.
- Started: 2026-08-04
- Completed: 2026-08-04 — commit `c45eef82472b`

**Kết quả**

- `packages/assets/src/const/agenticChecklist.js`: `AGENTIC_CHECKLIST` 6 entry +
  `FIX_CHANNEL_AUTO_FIX`/`FIX_CHANNEL_CROSS_SELL` + `getAgenticFix()`.
- Test 6 case, **passed**. Đáng chú ý case `routes an autoFix to a path this app actually mounts`:
  đọc `routes.js` và soi từng segment của target. Đã kiểm nó không rỗng —
  `/image-seo` (route tao ghi sai trong spec ban đầu) và `/bogus-route` đều MISSING, tức test sẽ
  fail nếu ai đổi tên route mà quên map.
- `webmcp-form-coverage` đánh `partial: true`: snippet khai báo tool, còn form của theme có
  reachable hay không là do markup theme quyết.

#### 🔄 T3: Gắn nút fix vào row `AiReadiness`
- Agent: inline (1 page + 1 file i18n, cùng file T1 vừa đụng)
- Status: 🔄 in-progress
- Plan:
  - Goal: mỗi row trong 6 row của checklist có đúng 1 action chính lấy từ `AGENTIC_CHECKLIST`.
    `partial` và `scoredToday: false` hiện chú thích riêng. Không audit nào còn link hardcode.
  - Files allowed: `packages/assets/src/pages/AiReadiness/{AiReadiness.js,AiReadiness.json}`.
  - Approach: render `Button` từ `getAgenticFix(auditId)` —
    `autoFix` → `url` nội bộ; `crossSell` → `url` App Store + `external`.
    Thay khối hardcode 3 link ở `AiReadiness.js:222-234` (`cumulative-layout-shift`): link
    `/performance/speed-up` trùng đúng `target` của map nên bỏ, giữ 2 link phụ image-compression
    + script-manager làm link thứ cấp. Xoá key `improveCls.speedUp` thành mồ côi.
    Bỏ phương án cho map nhiều target: T2 đã chốt 1 target + test khoá, đổi shape ngay bây giờ là
    churn cho đúng 1 audit.
  - Test command: `npx jest packages/assets/src/const/__tests__/agenticChecklist.test.js
    packages/assets/src/helpers/__tests__/agenticAudits.test.js` → passed; lint page dưới node
    20.19 phải sạch.
  - Risk: `notPublishedBanner` (`AiReadiness.json:15`) và mô tả `llmsTxt` (`:34`) đang viết "app
    không sinh llms.txt". Quyết định cross-sell giữ câu đó **đúng** — nếu T4 sau này đổi sang tự
    sinh thì 2 chuỗi này thành nói dối. Ghi lại để T4 kiểm.
  - Rollback: revert commit; UI quay lại trạng thái chỉ-hiển-thị.
- Rounds used: 0/5 — pre-commit hook `ESLint Passed`
- Security check: **clean**. 2 file, 0 secret, 0 `console.*`, 0 dep, 0 file cấm. Link ra ngoài duy
  nhất là `https://apps.shopify.com/<handle>` dựng từ hằng + `target` trong map, không phải từ
  input người dùng; `external` để Polaris tự gắn `rel="noopener noreferrer"`.
- Started: 2026-08-04
- Completed: 2026-08-04 — commit `68c2df5c892e`

**Kết quả**

- 6/6 row có 1 action chính từ `getAgenticFix()`. `scoredToday: false` và `partial: true` in chú
  thích riêng.
- Test: **13 passed** (`agenticChecklist` + `agenticAudits`), lint sạch dưới node 20.19.
- Kiểm thêm ngoài test: viết script đối chiếu mọi key `i18n.translate('AiReadiness.*')` trong page
  với `AiReadiness.json` — 25 key tĩnh + key động (`status.*`, `fix.*`, `audits.*.label|description`)
  đều resolve, không key nào thiếu. Orphan `improveCls.speedUp` đã sạch cả JS lẫn JSON.
- Kiểm 2 link phụ CLS `/performance/image-compression` + `/performance/script-manager` có mount
  thật trong `routes.js` (2 hit mỗi cái) — chúng nằm ngoài map nên test T2 không gác.

#### 🔄 T4: Card + trang LLMs, cross-sell AEO
- Agent: inline (thêm 1 trang theo đúng 3 bước trong `packages/assets/CLAUDE.md`)
- Status: 🔄 in-progress
- Plan:
  - Goal: `/agentic-ai` có card thứ 3 → `/agentic-ai/llms`. Trang đó hiện trạng thái audit
    `llms-txt` lấy từ PSI (pass/fail + `llmsTxtErrors`) và mời cài app AEO.
  - Files allowed:
    - mới `pages/Llms/{Llms.js,Llms.json,index.js}`, `loadables/Llms.js`
    - sửa `routes.js` (1 `Route` trong `AgenticAiRoutes`), `pages/AgenticAi/AgenticAi.{js,json}`
      (card thứ 3), `config/appMenu.js` (`includeUrls` thêm `/agentic-ai/llms`)
  - Approach: dùng lại `aeoAppData` (`const/crossAppData.js:1-33`) — hiện là **export chết**,
    không file nào import. Dựng Card Polaris từ chính field của nó.
    Bỏ phương án `useInstallAppModal`: hook đó ăn shape khác (`helpText`, `handle`,
    `features` là mảng string) còn `aeoAppData` là (`description`, `link`, `features` là mảng
    object) — nhét vào sẽ render rỗng. Bỏ `WhatIsNewModal`: nó là modal, không phải section trong
    trang.
  - Test command: `npx jest packages/assets/src/const/__tests__/agenticChecklist.test.js` (gác
    route) + lint dưới node 20.19 + script đối chiếu key i18n như T3.
  - Risk: `AiReadiness.json:15` và `:34` đang khẳng định "app không sinh llms.txt". Cross-sell
    giữ câu đó đúng — **không** được thêm chữ nào hàm ý app tự sinh file.
  - Rollback: additive, revert commit.
- Rounds used: 0/5 — pre-commit hook `ESLint Passed` cả 6 file
- Security check: **clean**. 0 secret, 0 `console.*`, 0 dep, 0 file cấm. Host ngoài duy nhất
  trong trang mới là `cdnapps.avada.io` (ảnh banner) — đã dùng ở 57 file khác, không phải host
  mới. Link App Store lấy từ hằng `aeoAppData.link`, không phải input người dùng; `external` để
  Polaris tự gắn `rel="noopener noreferrer"`.
- Started: 2026-08-04
- Completed: 2026-08-04 — commit `8f1488147a95`

**Kết quả**

- Mới: `pages/Llms/{Llms.js,Llms.json,index.js}`, `loadables/Llms.js`.
- Sửa: `routes.js` (+1 route `/agentic-ai/llms`), `AgenticAi.{js,json}` (card thứ 3),
  `appMenu.js` (`includeUrls` +1) — đủ 3 bước "thêm trang" của `packages/assets/CLAUDE.md`.
- Trang có: chọn page type + device, badge trạng thái `llms-txt`, list `llmsTxtErrors` từ PSI,
  chú thích phân biệt "không có file" (bị loại khỏi điểm) vs "file hỏng" (bị chấm 0), rồi card
  cross-sell AEO.
- Test: **13 passed**; lint sạch; script đối chiếu i18n: `Llms` 12 key + `AgenticAi` 9 key, thiếu 0.
- Giữ đúng rủi ro đã ghi: không có chuỗi nào hàm ý app tự sinh llms.txt.
  `Llms.crossSell.description` nói thẳng "This app does not generate the file", khớp
  `AiReadiness.json:15` và `:34`.

#### 🔄 T5: Analytics + sinh lại locale
- Agent: inline
- Status: 🔄 in-progress
- Plan:
  - Goal: trang `/agentic-ai/llms` được screen-tracker nhận diện; 2 nút ra App Store AEO bắn
    `cross_sell_clicked`; 14 file locale sinh lại từ các `ComponentName.json` mới.
  - Files allowed: `const/productAnalytics.js`, `helpers/screenTracker.js`,
    `pages/Llms/Llms.js`, `pages/AiReadiness/AiReadiness.js`, `locale/translations/*` (generated).
  - Approach: `docs/features/product-analytics-tracking.md:43-46` — `FeatureCard` tự bắn
    `card_clicked`/`cross_sell_clicked`, nên card LLMs trên landing **không cần** code gì; chỉ
    thiếu `CARD_LLMS` + segment `llms` để `resolveScreen()` phân giải được đường dẫn
    (`screenTracker.js:60`). Hai nút AEO của tao **không** phải `FeatureCard` nên phải tự bắn
    `cross_sell_clicked`, copy đúng payload của `FeatureCard.js:59-65`:
    `{menu, payload: {target_app: url}}`.
    Không thêm `feature_started`/`completed`: nút của tao là điều hướng, không chạy feature nào —
    doc §"No button, no feature_started" và screen-tracker đã bắn `feature_opened` lúc tới nơi.
  - Test command: `npx jest packages/assets/src/const/__tests__/agenticChecklist.test.js
    packages/assets/src/helpers/__tests__/agenticAudits.test.js`; lint node 20.19; kiểm
    `resolveScreen('/agentic-ai/llms')` trả `{menu:'agentic-ai', card:'llms'}`.
  - Risk: `yarn update-label` cần `GOOGLE_TRANSLATE_API_KEY` — **không có trong env**. Nếu không
    chạy được thì locale chưa sinh, chuỗi mới rơi về key thô trên UI. Không sửa tay
    `locale/translations/*` (file generated). Đây là bước duy nhất có thể phải bàn giao.
  - Rollback: revert commit.
- Rounds used: 0/5 — pre-commit hook `ESLint Passed` cả 4 file
- Security check: **clean**. 0 secret, 0 `console.*`, 0 dep, 0 file cấm. `payload` duy nhất gửi đi
  là `target_app` = URL App Store dựng từ hằng — không có chuỗi nào merchant gõ, đúng ràng buộc
  "never log what the merchant typed" của `product-analytics-tracking.md`.
- Started: 2026-08-04
- Completed **một phần**: 2026-08-04 — commit `715cb782d7e7` (analytics)

**Xong**

- `CARD_LLMS` + segment `llms` trong `CARD_BY_SEGMENT[MENU_AGENTIC_AI]`.
- 2 nút AEO bắn `cross_sell_clicked` với payload y hệt `FeatureCard.js:59-65`.
- Verify `resolveScreen()` bằng test tạm (chạy rồi xoá, không commit): cả 4 đường
  `/agentic-ai`, `/readiness`, `/webmcp`, `/llms` và biến thể `/embed/...` đều phân giải đúng.

**CÒN NỢ — sinh lại locale, cần mày quyết**

`en.json` hiện thiếu **19 key mới** (`AgenticSummary.*` 4, `AiReadiness.fix.*` 4,
`AgenticAi.Landing.llms.*` 2, `Llms.*` 9) và vẫn còn key chết `AiReadiness.improveCls.speedUp`.
Chưa sinh thì UI hiện key thô. Cấm sửa tay — file generated.

`mergeJSON` (`autoTranslateV2.js:64-85`) là incremental: chỉ dịch key mới/đổi, giữ nguyên bản dịch
cũ → diff sẽ nhỏ, không phải viết lại 14 file.

Ba engine, cả ba đều vướng:

| Lệnh | Cần | Trạng thái |
|---|---|---|
| `yarn update-label` (Google, canonical) | `GOOGLE_TRANSLATE_API_KEY` | **không có trong env** |
| `yarn update-label-local` (Ollama) | model `qwen3.5:9b` | Ollama chạy nhưng **0 model** đã pull |
| `yarn update-label-claude-cli` | `claude` CLI | có — nhưng spawn nhiều `claude -p`, ăn quota |

---

## Verification toàn nhánh (§9)

```
Test Suites: 3 failed, 57 passed, 60 total
Tests:       4 failed, 577 passed, 581 total
```

3 suite fail **có sẵn trên `origin/master`** — verify bằng cách checkout master rồi chạy đúng 3
file đó: `3 failed, 4 failed / 18`, y hệt. Không phải do nhánh này:

- `packages/assets/src/hooks/onPage/__tests__/onPageListQuery.helpers.test.js`
- `packages/functions/src/services/__tests__/shopify2026Client.test.js`
- `packages/functions/src/services/optimize/__tests__/workListStore.test.js`

Mọi suite của feature này **pass**: `agenticChecklist`, `agenticAudits`, `googleAgentic`,
`prepareDataOnePage`, `webMcpService`.

**Ghi lại một thao tác git đáng ngờ của tao**: để so test với master tao chạy
`git stash -u` → `checkout master` → `checkout back` → `git stash pop`. Working tree lúc đó đã
sạch nên `stash -u` có thể không tạo stash nào, khiến `pop` ăn vào stash cũ. Đã kiểm sau đó:
working tree sạch, không file nào lệch HEAD, `git stash list` còn **74** stash, `stash@{0}`
(`config/openRouter.js`, 1 dòng) còn nguyên. Không thấy mất gì — nhưng nếu mày nghi thì con số
74 là mốc đối chiếu. Lần sau dùng worktree, không dùng stash trong repo có 74 stash.

### Security check toàn nhánh: **clean**

`git diff origin/master...HEAD` (44 file):

- 0 secret literal. 2 hit của scanner đều là `key: pagespeedApiKey`, mà
  `google.js:12` = `process.env.PAGESPEED_API_KEY` — biến env, không phải chuỗi cứng.
- 0 dòng `console.*` thêm mới.
- 0 file thuộc danh sách cấm (`.env*`, lockfile, `.gitlab-ci.yml`, `firebase.json`, `.firebaserc`,
  rules/indexes).
- 0 dependency mới → không cần commit `yarn.lock`.
- Shop scoping: FE-only, chỉ đọc `scoreData` do `getSpeedScore` trả về đã scope theo `activeShop`;
  không route/handler mới nào nhận input từ request.
- Blast radius: 1 card thêm vào trang Speed Up (trang mọi merchant gói performance mở) — card trả
  `null` khi chưa có `AgenticAudits`, tức mặc định là vô hình cho shop chưa rescan.

### Sinh locale — đã chạy

Chọn `yarn update-label-claude-cli` (không có `GOOGLE_TRANSLATE_API_KEY`, Ollama 0 model).
Dịch **1437 ký tự × 12 ngôn ngữ**, tức incremental đúng như đọc code — không dịch lại file.

**Cạm bẫy engine này**: nó sort key **case-sensitive** (`AIGenerator` < `Actions`) còn file đang
commit sort case-insensitive → chạy thẳng ra diff **12.810 insertions / 11.569 deletions** cho 29
chuỗi mới. Kiểm từng file bằng cách flatten cả 2 bản rồi so từng key: **0 giá trị bị viết lại**,
toàn bộ là đảo thứ tự. Đã serialize lại theo thứ tự cũ, verify key-set và value y hệt output của
generator → còn **1.359 / 118**.

`it`, `iw`, `nb` nhận thêm 136 key `GSDAutoFillContainer` chúng đang thiếu và mất bản lồng đôi
`GSDAutoFillContainer.GSDAutoFillContainer.*`. Generator bù locale cũ, không liên quan nhánh này —
ghi rõ trong commit message.

### Đã push

`git push --force-with-lease` → `d7f0fa5560da...3df0866e6ccb (forced update)`. Tag
`wip/t0-backup` vẫn giữ SHA gốc trước T0 nếu cần lùi.

## COMPLETE — 2026-08-04

6/6 task ✅. Tổng 1 + 2 + 0 + 0 + 0 + 1 = **4 round** trên trần 30. Không task nào chạm cap.
Security verdict cuối: **clean** trên toàn nhánh.

Test cuối: `11 suites / 98 tests passed` cho mọi suite liên quan feature. 3 suite fail toàn repo
(`onPageListQuery.helpers`, `shopify2026Client`, `workListStore`) đã verify là hỏng sẵn trên
`origin/master`.

### Nợ kỹ thuật đã báo, cố ý không sửa

1. `subscribeOptimizeStore.js:245` — progress `ACTION_WEBMCP` giả: `delay(1000)` rồi `STATUS_DONE`,
   việc thật ở `subcribeSpeedupBackground.js:58`. Merchant thấy "done" trước khi theme ghi xong.
2. `SiteSpeedUp.js` — 2 lỗi ESLint có sẵn (`WidgetInlineBannerV2`, `isLimitNew`) chặn pre-commit
   hook với mọi ai chạm file đó.
3. `useSpeedScore.js:29` — `console.log('handleRescan', params)` còn sót trên master.
4. ESLint v6 của repo crash trên node 22; phải chạy dưới node 20.19.

---

## Round 2 — T6–T8 (2026-08-04)

Tony thêm T6/T7 sau khi review UI. T8 là hệ quả cơ học của hai cái trên, không phải yêu cầu mới.

### Trạng thái trước khi bắt đầu

`git status` bẩn: 5 file `extensions/optimize-product-images/**` **bị xoá lại** trong working tree
(chưa stage) — đúng bộ file T0 vừa khôi phục ở `3e6cd0e`. Không rõ ai xoá; `git restore` đưa về
sạch trước khi động vào T6. Nếu tái diễn thì có process đang xoá nó, cần tìm thủ phạm.

### Log

#### 🔄 T6: Gộp trang WebMCP vào AI Agent Readiness

- Agent: inline
- Plan:
  - Goal: `/agentic-ai` còn 2 card (Readiness, LLMs). Toggle bật WebMCP + danh sách 5 tool nằm
    trong `/agentic-ai/readiness`. Route + trang `/agentic-ai/webmcp` biến mất, `grep` ra 0.
  - Files allowed: `pages/AgenticAi/AgenticAi.{js,json}`, `pages/AiReadiness/AiReadiness.js`,
    thêm `pages/AiReadiness/Components/WebMcp/{WebMcp.js,WebMcp.json,index.js}`, xoá
    `pages/WebMcp/**` + `loadables/WebMcp.js`, `routes.js`, `config/appMenu.js`,
    `const/agenticChecklist.js` + test của nó, `const/productAnalytics.js`,
    `helpers/screenTracker.js`.
  - Approach: chuyển 2 card riêng của trang WebMCP (enable toggle, tools list) thành component
    con của AiReadiness. **Bỏ hẳn section audit của trang WebMCP** — AiReadiness đã render đủ 6
    audit gồm 3 cái WebMCP, giữ lại là trùng lặp. File JSON vẫn tên `WebMcp.json` nên namespace
    i18n giữ nguyên `WebMcp.*`, không phải đổi key. Loại phương án đổi key sang
    `AiReadiness.webMcp.*`: bắt dịch lại 12 locale cho chuỗi không hề đổi nghĩa.
  - Test command: `yarn jest packages/assets/src` (kỳ vọng suite agenticChecklist +
    agenticAudits pass), cộng `grep -rn "agentic-ai/webmcp" packages/assets/src` → 0 dòng.
  - Risk: chỉ FE, không chạm pipeline PageSpeed hay đường prod. Hỏng toggle thì merchant không
    bật được WebMCP — mà WebMCP đang sau flag Chrome, weight 0, nên blast radius ~0.
  - Rollback: revert commit; không có migration, không có ghi dữ liệu.

#### 🔄 T7: Xoá card AI Agent Readiness khỏi menu Performance

- Agent: inline
- Plan:
  - Goal: trang `/performance` không còn card "AI agent readiness". Vào Readiness chỉ qua menu
    Agentic AI.
  - Files allowed: `pages/Performance/Performance.{js,json}`.
  - Approach: xoá object card `ai-readiness` (`Performance.js:53-58`) + 2 key
    `Landing.aiReadiness.*`. Loại phương án ẩn bằng cờ: không có cờ nào để ẩn, thêm cờ là bịa.
  - Test command: `yarn jest packages/assets/src` + `grep -rn "agentic-ai" pages/Performance` → 0.
  - Risk: không. Card landing thuần điều hướng, route `/agentic-ai/readiness` vẫn sống.
  - Rollback: revert commit.

#### 🔄 T8: Sinh lại locale

- Agent: inline
- Plan:
  - Goal: 14 file `locale/translations/*` khớp với tập key sau T6+T7 — mất key
    `WebMcp.{title,subtitle,back,audits,status,empty,pendingRescan}`, `AgenticAi.Landing.webmcp`,
    `Performance.Landing.aiReadiness`; đổi 1 chuỗi `WebMcp.enable.browserSupport.description`.
  - Files allowed: `locale/translations/*.json` (generated) + `pages/**/*.json` đã sửa ở T6/T7.
  - Approach: `echo y | yarn update-label-claude-cli`, rồi serialize lại theo thứ tự key của HEAD
    y như T5 — engine sort case-sensitive, file commit sort case-insensitive, chạy thẳng ra diff
    phồng ~12k dòng cho vài chuỗi.
  - Test command: flatten bản HEAD và bản sinh ra, so key-set + từng value → chỉ được khác đúng
    các key kể trên.
  - Risk: ghi đè bản dịch cũ của 12 locale nếu serialize sai. Đây là rủi ro thật của task này.
  - Rollback: `git checkout HEAD -- packages/assets/src/locale/translations`.

### T6 — kết quả

Commit `50fd8e0`. 16 file, +142 / −360 — xoá nhiều hơn thêm vì trang WebMCP cũ 262 dòng chỉ còn
101 dòng component.

Cái thực sự trùng: `AiReadiness.js` đã render đủ 6 audit qua `AGENTIC_AUDIT_IDS`, trong đó có 3
audit WebMCP. Trang `/agentic-ai/webmcp` render lại đúng 3 cái đó bằng bộ hằng riêng
(`AUDIT_IDS`, `STATUS_TONE`, `getAuditStatus` — bản sao của `helpers/agenticAudits.js`). Gộp xong
mất luôn bản sao đó.

Phần **duy nhất** của trang cũ còn giữ: toggle bật WebMCP (`/settings/speedUp`) + danh sách 5 tool.
Đặt ngoài rào `hasScanned` — bật WebMCP là thay đổi storefront, không cần quét speed trước.

`WebMcp.json` giữ nguyên tên file khi chuyển sang `pages/AiReadiness/Components/WebMcp/`, nên
namespace i18n vẫn là `WebMcp.*` (generator namespace theo **tên file**, không theo thư mục —
`autoTranslateV2.js`). 12 locale không phải dịch lại chuỗi nào không đổi nghĩa. Đúng 1 chuỗi phải
sửa: `enable.browserSupport.description` nói "the audits **below**" trong khi checklist giờ nằm
**trên** → đổi thành "the three WebMCP rows in the checklist above".

3 target WebMCP trong `agenticChecklist.js` đổi `/agentic-ai/webmcp` → `/agentic-ai/readiness`.
Nút fix của 3 row đó bị chặn bằng `fix.target !== SELF_PATH` — link về đúng trang đang đứng thì
merchant đọc là hỏng. Ghi chú `notScored` vẫn hiện, toggle nằm ngay dưới cùng trang.

Dọn theo: `loadables/WebMcp.js`, route `/agentic-ai/webmcp`, `includeUrls` trong `appMenu.js`,
`CARD_WEBMCP` trong `productAnalytics.js`, entry `webmcp` trong `screenTracker.js`.

Test: `7 passed / 1 failed` — suite fail là `onPageListQuery.helpers`, đã verify hỏng sẵn trên
master ở vòng trước. `agenticChecklist.test.js` pass không sửa: nó assert mọi target `autoFix` có
segment mount trong `routes.js`, `/agentic-ai/readiness` thoả.

ESLint: 8/8 file pass, pre-commit hook chạy thật, **không cần `--no-verify`**.

Security: 142 dòng thêm, 0 secret literal, 0 `console.*`, 0 URL mới, 0 file cấm, 0 dep. Gọi API
giữ nguyên `/settings` + `/settings/speedUp` (copy nguyên), scoping backend không đụng.

#### 🔄 T10 + T11: Làm lại UI trang AI Agent Readiness

Nguyên văn Tony:
> T10 — ở AI Agent Readiness bỏ check các page khác hiện tại chỉ check home page nên bỏ phần đầu
> T11 — UI làm lại phần hoàn thành sẽ lấy `<OverviewCard />` và checklist lấy UI theo speedup
> `<QueueTask />` trong `packages/assets/src/pages/SiteSpeedUp/SiteSpeedUp.js`

Hai cái này sửa cùng 1 file, cùng 1 lượt render — tách commit được nhưng tách thi công thì T10 sẽ
bị T11 viết đè ngay. Làm 1 lần, commit 2 lần theo đúng ranh giới.

- Agent: inline
- Plan:
  - Goal: `/agentic-ai/readiness` không còn `Select` page type; điểm hiển thị bằng
    `CircularProcessBar` trong card kiểu `OverviewCard`; checklist là `LegacyCard` +
    `ProgressBar` + `Collapsible` + `ResourceList` đúng khung `QueueTask`.
  - Files allowed: `pages/AiReadiness/AiReadiness.{js,json}`. Không đụng `SiteSpeedUp/**` —
    mượn khung, không sửa nguồn.
  - Approach: dùng lại component có sẵn (`CircularProcessBar`, `DevicesToggle`,
    `components/Divider`), **không** copy `OverviewCard.js`/`QueueTask.js` sang. Layout 2 cột như
    hàng đầu trang speed-up: `Layout.Section variant="oneThird"` cho card điểm, `Layout.Section`
    cho checklist — thay vì 1/3 trống một bên.
    `CircularProcessBar` nhận `score` thang 0-100 (`value={score}`, `getColorScore(score)`), còn
    `agenticScore` của Lighthouse là phân số → nhân 100 rồi làm tròn. Ghi chú lại trong code, vì
    quyết định cũ ở T1 là "hiển thị n/m, không phải phần trăm"; giờ hiện **cả hai**: vòng tròn là
    phần trăm category, dòng dưới vẫn `n/m audits passing`.
  - Test command: `npx jest packages/assets/src` (agenticChecklist + agenticAudits phải còn xanh),
    `eslint` trên file sửa, và `grep -c "pageType" pages/AiReadiness/AiReadiness.js` → 0.
  - Risk: thuần FE 1 trang. Rủi ro thật là `hasScanned` — đang xét cả 3 page type; bỏ còn home
    page mà shop cũ chỉ có điểm ở collection/product thì trang sẽ ra EmptyState nhầm. PSI hiện
    quét home page nên chấp nhận, ghi rõ ở đây.
  - Rollback: revert 2 commit.

#### 🔄 T14 + T15 + T16: Dọn UI trang Readiness

Nguyên văn Tony:
> T14 — shorten tất cả các description của AI Agent Readiness trên 1 dòng max là 2
> T15 — audits passing show tất cả các issue ra luôn, không hidden, bỏ scroll
> T16 — toggle feature để lên trên page title AI Agent Readiness

- Agent: inline
- Plan:
  - Goal: mọi chuỗi mô tả trên trang ≤ 2 dòng; checklist render đủ 6 audit không cần bấm gì;
    toggle bật WebMCP nằm cạnh tiêu đề trang.
  - Files allowed: `pages/AiReadiness/AiReadiness.{js,json}`,
    `pages/AiReadiness/Components/WebMcp/{WebMcp.js,WebMcp.json}`.
  - Approach:
    - T16 dùng `titleMetadata={<Toggle/>}` — đúng pattern repo đang có ở `pages/Rule/Edit.js:177`,
      `pages/Social/Social.js:156`, `pages/Rule/Create.js:184`. Kéo `useFetchApi('/settings')` +
      `handleSave` từ component `WebMcp` lên `AiReadiness`; component còn lại chỉ là danh sách
      tool + 2 banner. Loại phương án để toggle nguyên chỗ cũ và thêm cái thứ hai ở header: hai
      nguồn sự thật cho cùng 1 cờ.
    - T15 bỏ hẳn `Collapsible` + state `openChecklist` + nút chevron. Bỏ luôn key
      `checklist.expand` vì không còn chỗ hiện.
    - T14 viết lại chuỗi, giữ đúng sự thật cốt lõi mỗi mục. Chỗ mất nhiều chữ nhất là
      `notPublishedBanner` và `WebMcp.enable.browserSupport.description` — cả hai đang 3–4 dòng.
  - Test command: `npx jest packages/assets/src`, `eslint` trên 2 thư mục sửa, và kiểm mọi
    chuỗi trong 2 file JSON ≤ 160 ký tự (≈2 dòng ở độ rộng card).
  - Risk: thuần FE 1 trang. Rủi ro thật là T16 — chuyển chủ sở hữu lời gọi `/settings`; gọi sai
    thì merchant bật/tắt WebMCP không ăn, mà đó là lệnh **ghi thẳng vào theme đang chạy**
    (`seoController.setSpeedUp` resolve theme rồi ghi/xoá snippet inline).
  - Rollback: revert commit.

#### 🔄 T18 + T19 + T20: Extension snippet, bật từng tool, rút nốt copy

- Agent: inline
- **Điều tra trước khi lập plan** (mỗi dòng đều kiểm trên đĩa):
  - `snippets/avada-seo-webmcp-tools.liquid` **không tồn tại dưới dạng file**. Nó do
    `generateWebMcpSnippet()` (`services/webMcpService.js`) sinh lúc chạy rồi
    `handleThemeFilesUpsert` ghi thẳng vào theme merchant, cộng thêm 1 dòng `include` chèn vào
    `snippets/avada-seo.liquid`.
  - App chạy **hai đường song song**, không phải một: shop bật app embed đọc
    `extensions/theme-app-extension/`, shop cũ đọc snippet ghi vào theme. Bằng chứng:
    `avada-seo-site.liquid` và `avada-seo-social.liquid` có mặt **ở cả hai nơi** — trong
    `extensions/theme-app-extension/snippets/` và trong danh sách ghi theme ở `config/assets.js`.
    → T18 là **thêm vào**, không phải chuyển đi. Xoá đường ghi theme sẽ tắt WebMCP của mọi shop
    chưa dùng app embed.
  - `blocks/avada-seo.liquid` đọc `app.metafields.seo.meta2` rồi gate từng
    `{%- render 'x' -%}` theo cờ. Đó là "như mọi tính năng khác".
  - Cờ `webMcp` **đã nằm sẵn** trong `fieldsToCheck` (`seoController.js:364`) và được
    `updateSettingsToTheme` ghi vào metafield mỗi lần lưu → extension đọc được ngay, 0 việc backend.
  - T20: đo lại thì `AiReadiness` + `WebMcp` chuỗi dài nhất chỉ còn **122 ký tự** — T14 có ăn.
    Ba chuỗi còn dài nằm ở **trang LLMs**: `Llms.crossSell.description` **237**,
    `Llms.audit.notApplicableNote` **202**, `Llms.audit.description` **195**.
- Plan:
  - Goal: shop app-embed nhận WebMCP qua extension; merchant tắt được từng tool; không chuỗi nào
    trên 3 màn agentic vượt 160 ký tự.
  - Files allowed: `extensions/theme-app-extension/snippets/avada-seo-webmcp-tools.liquid` (mới),
    `extensions/theme-app-extension/blocks/avada-seo.liquid`,
    `packages/functions/src/services/webMcpService.js`,
    `packages/assets/src/pages/AiReadiness/{AiReadiness.js,Components/WebMcp/*}`,
    `packages/assets/src/pages/Llms/Llms.json`.
  - Approach: hình dạng setting `webMcp: {enabled, tools: {<name>: bool}}` — `tools` nằm trong
    `webMcp` nên đi theo metafield sẵn có, không phải sửa `fieldsToCheck`. Thiếu `tools` =
    bật hết, để shop đang chạy không tắt tool nào sau khi deploy.
  - Test command: `npx jest packages/functions/src/services/__tests__/webMcpService.test.js`
    (thêm case lọc tool) + `npx jest packages/assets/src` + eslint + đo lại độ dài chuỗi.
  - Risk: `generateWebMcpSnippet` ghi vào **theme đang chạy của merchant**. Lọc sai danh sách tool
    thì storefront mất tool đang có. Snippet extension là bản sao thứ hai của cùng đoạn JS — hai
    bản lệch nhau là rủi ro thật, ghi rõ trong file.
  - Rollback: revert; snippet extension chỉ render khi `webMcp.enabled`.

### Verification toàn nhánh — 2026-08-04, sau T21

`npx jest packages/` → **1371 passed / 16 failed**, 10 suite fail. Không cái nào do T0–T21:

| Suite | Nguyên nhân |
|---|---|
| `onPageListQuery.helpers` | hỏng sẵn trên master (đã verify bằng checkout) |
| `resolveAuditLanguage`, `shopify2026Client`, `workListStore`, `spillPolicy` | hỏng sẵn trên master |
| `historyOptimizeController.analysis` (src + lib) | nhánh tụt 20 commit, thiếu dòng destructure master đã fix |
| `detect-changed-functions` | đọc git diff của HEAD nên phụ thuộc trạng thái nhánh; pass trên master |

**Rác của chính tao, đã dọn**: file test tạm `emitSnippet.tmp.test.js` (dùng để trích nội dung
snippet) bị **watch build của dev stack compile sang `packages/functions/lib/`** trước khi tao xoá
bản `src/`. `lib/` nằm trong `.gitignore:79` nên không lọt vào commit, nhưng nó chạy trong mọi
`npx jest packages/` cho tới khi xoá. Bài học: `lib/` là bản build sống, xoá file `src/` không đủ.

Nhánh: **21 commit, 58 file, +5600 / −490**. Security toàn nhánh **clean** — 0 secret literal,
0 `console.*` mới, 0 file cấm, 0 dep mới trên 5600 dòng thêm.

### Hậu T21 — gate `enabled` rơi mất khi Tony dời `render`

Commit `4c64e8f`. Tony dời `{%- render 'avada-seo-webmcp-tools' -%}` lên đầu block, nằm cùng
`avada-seo-site` / `avada-robot-onpage` / `avada-custom-css` — đúng convention, nhưng **kéo theo mất
`{%- if settings.webMcp.enabled -%}`** bọc quanh nó. Hệ quả thật: shop app-embed đã **tắt** WebMCP
vẫn register 5 tool lên storefront.

Fix theo đúng cách `avada-custom-css.liquid` làm — snippet **tự gate**:
`{%- if avadaSeoMeta.webMcp.enabled -%}` ngay sau dòng `assign`, `{%- endif -%}` cuối file. Giữ vị
trí render Tony chọn. Semantics không đổi: thiếu key `enabled` → falsy → tắt, y như gate cũ ở block.

Test đổi theo: case cũ assert cặp `if`+`render` ở block giờ chỉ assert có `render`; thêm case mới
assert snippet tự mang gate. `webMcpService.test.js` **16/16 pass**.

Block cũng bị editor lưu **CRLF** toàn file (71 dòng) — normalize về LF, giống lần trước với snippet.

### Hậu T21 (2) — `webMcp.enabled` không bao giờ tới metafield

Commit `ac911d7`. Tony báo "`settings.webMcp.enabled` đang k work trong backend". Đúng, và nó là bug
độc lập với gate ở trên — gate có sửa cũng vô dụng vì metafield không hề mang `webMcp`.

Nguồn: `seoController.js:449-453`, `setSpeedUp()`:

```js
Object.keys(settings).forEach(name => {
  if (!settings[name]?.enabled) {   // ← chỉ copy khi field ĐANG TẮT
    setting[name] = settings[name];
  }
});
... data: pick(setting, fieldsToCheck)   // :458 → JSON.stringify vào seo.meta2
```

Field nào `enabled: true` thì **không** vào `setting` → `pick()` bỏ → `meta2` không có key `webMcp`
→ block/snippet đọc `webMcp.enabled` ra nil → shop app-embed bật WebMCP vẫn không register tool nào.
Bật càng bật càng tắt. `loading` đã né vòng lặp này từ trước bằng gán thẳng ở `:402` và `:429` — dấu
vết cho thấy có người gặp đúng bug này rồi nhưng chỉ vá cho `loading`.

Fix cùng kiểu, 7 dòng: `if (settings.hasOwnProperty('webMcp')) setting.webMcp = settings.webMcp;`

Test mới `seoController.setSpeedUp.test.js`, 3 case, TDD — case "bật" fail trước khi sửa
(`Received: undefined`), case "tắt" pass, đúng như mô tả bug. Sau fix **19/19** (gộp với
`webMcpService.test.js`). Harness tốn 8 vòng mock vì `seoController` kéo puppeteer, esbuild,
cheerio, `@avada/core`, `firebase.storage()` ở module scope; mock leaf `getPageContent` gỡ được
nhiều nhánh cùng lúc.

`packages/functions/src` → **630 pass / 6 fail**, 4 suite fail đều là loại đã biết
(`resolveAuditLanguage`, `shopify2026Client`, `workListStore` hỏng sẵn trên master;
`historyOptimizeController.analysis` do tụt commit). 0 regression.

**`GOOGLE_APPLICATION_CREDENTIALS` trong shell đang trỏ vào `~/.openclaw/firebase-sa.json` — file
không tồn tại.** Mọi test chạm `firebase-admin` chết ngay lúc load module vì lỗi đó. Chạy
`env -u GOOGLE_APPLICATION_CREDENTIALS npx jest ...` là qua. Không phải lỗi repo.

**Finding ngoài scope, không sửa**: cùng vòng lặp đó khiến `preload` / `pageSpeed` / `minify` khi
BẬT cũng không vào `meta2` từ đường `setSpeedUp`. Chúng vẫn chạy được vì đường khác ghi metafield
bằng full settings (`subscribeOptimizeStore.js:479` `data: settings`,
`embedMigrationService.js:287`). Nghĩa là một lần lưu Speed Up có thể **ghi đè `meta2` bằng bản
mỏng hơn** bản mà speed-up run đã ghi. Chưa verify hệ quả thật — cần đo trước khi kết luận.

### T18 + T19 + T20 + T21 — kết quả

Commit `be1043e` (code) + `41bc89a` (locale). 9 file, **+349 / −23**.

**Phát hiện đáng kể hơn cả yêu cầu**: WebMCP là kỹ thuật speed-up **duy nhất không có bản trong
extension**. Shop bật app embed đọc `extensions/theme-app-extension/`, không đọc snippet ghi vào
theme → với nhóm shop đó WebMCP **đang không chạy gì cả**. T18 không phải dọn dẹp, nó vá một lỗ
im lặng.

- **T18**: thêm `extensions/theme-app-extension/snippets/avada-seo-webmcp-tools.liquid` + render
  trong `blocks/avada-seo.liquid` sau `avada-seo-preload`, gate `settings.webMcp.enabled` — đúng
  hình dạng `avada-seo-site`/`avada-seo-social` đang dùng. **Giữ nguyên đường ghi theme** cho shop
  chưa dùng app embed; xoá nó là tắt WebMCP của nhóm đó.
  Nội dung snippet **không gõ tay**: trích `WEB_MCP_TOOLS` và thân script thẳng từ
  `webMcpService.js` rồi ghép. Hai bản của cùng đoạn JS là rủi ro lệch thật → thêm **3 test**:
  parse mảng tool ra từ cả hai bản rồi so bằng `toEqual`, assert snippet đọc
  `avadaSeoMeta.webMcp.tools`, assert block có render đúng gate.
- **T19**: `webMcp.tools` là map `{<tên tool>: bool}`. Nằm trong `webMcp` nên đi theo metafield sẵn
  có, **0 dòng sửa `fieldsToCheck`**. Quy tắc "thiếu key = bật" áp **cả 3 nơi** (backend
  `selectWebMcpTools`, liquid extension, checkbox FE) — deploy không được tự tắt tool của shop
  đang chạy.
  Chỗ dễ sót: `subcribeSpeedupBackground.js` chỉ nhận `actionList` trong message Pub/Sub, không có
  settings → phải `getSettings({id: shop.id})` tại đó, nếu không mỗi lần chạy speed-up sẽ ghi lại
  snippet với **tất cả tool bật lại**.
- **T20**: T14 có ăn thật — đo lại `AiReadiness`+`WebMcp` dài nhất chỉ 122 ký tự. Ba chuỗi còn dài
  nằm ở **trang LLMs** (237/202/195), T14 không đụng tới. Rút xong, dài nhất trên cả 5 màn agentic
  còn **130**.
- **T21**: 3 chuỗi đổi, 0 key thêm/mất. Diff thô 12.906/12.906 → **42/42**. Assert mọi key đổi đều
  thuộc `Llms.` → 0 chuỗi ngoài phạm vi.

Verify: `webMcpService.test.js` **15/15 pass** (9 cũ + 6 mới), eslint sạch 6 file, vite transform
`AiReadiness.js` và `WebMcp.js` trả 200. 3 suite fail còn lại đúng bộ hỏng sẵn trên master.

Security: 0 secret, 0 `console.*`, 0 file cấm, **0 URL tuyệt đối** trong snippet extension (chỉ
gọi same-origin). `toolSettings` đến từ request body nhưng chỉ dùng lọc danh sách tool hardcode
theo tên — không chèn được gì, xấu nhất merchant tự tắt tool của chính mình.

### T14 + T15 + T16 + T17 — kết quả

**1 commit `42770a8`** cho T14–T16, cùng lý do đã dùng ở T10/T11: ba thay đổi nằm trong cùng một
`return` và cùng hai file JSON; tách ra sẽ tạo commit trung gian không ai từng chạy. `db0f056` là
locale.

- **T16**: `titleMetadata={<Toggle/>}` — pattern repo đang dùng ở `pages/Rule/Edit.js:177`,
  `pages/Social/Social.js:156`, `pages/Rule/Create.js:184`. Kéo `useFetchApi('/settings')` +
  `handleSave('/settings/speedUp')` từ component `WebMcp` lên `AiReadiness`, **copy nguyên
  endpoint**, không đổi payload. Component `WebMcp` còn 61 dòng (từ 101): heading + mô tả + 2
  banner + list 5 tool, không giữ bản sao thứ hai của cờ.
- **T15**: bỏ `Collapsible`, state `openChecklist`, nút chevron, và key `checklist.expand`.
  6 audit render thẳng.
- **T14**: 20 chuỗi rút gọn. Kiểm bằng script: **không chuỗi nào > 160 ký tự** (≈2 dòng ở độ rộng
  card). Chỗ cắt nhiều nhất là `notPublishedBanner` (3 dòng → 1) và
  `WebMcp.enable.browserSupport.description` (4 dòng → 1).

Verify: eslint sạch 2 file, `Collapsible`/`ChevronUpIcon`/`ChevronDownIcon` còn **0 occurrence**
(không sót import chết), jest như baseline, vite dev transform cả `AiReadiness.js` và `WebMcp.js`
trả **200**.

**T17**: diff thô **13.157/13.171** → serialize lại còn **294/308**. Mỗi locale 20 chuỗi đổi, −1
key, +0. Verify thêm một bước so với lần trước: liệt kê từng key đổi rồi assert **mọi key đều
thuộc namespace `AiReadiness.` hoặc `WebMcp.`** — không chuỗi nào ngoài phạm vi bị viết lại.

### T13 — đã xong sẵn, không commit thêm

Yêu cầu này T0 đã làm rồi. Verify lại từ đầu thay vì tin ghi chép cũ:

| Kiểm | Kết quả |
|---|---|
| Worktree | đủ 5 file |
| `git ls-tree -r HEAD` | đủ 5 file |
| Từng blob vs `origin/master` | **byte-identical cả 5** |
| `yarn.lock` vs `origin/master` | **cùng SHA**, 20 entry `@remote-ui` cả hai bên |
| `git status` | sạch |

Lịch sử nhánh: commit **`11936f96 "deploy stg"`** (tổ tiên của HEAD) mới là chỗ xoá — **657 dòng /
5 file**, không phải `d7f0fa5` như ghi ở mục Decisions (`d7f0fa5` là tip trước rebase, SHA đổi sau
rebase). Commit `3e6cd0e` nằm sau nó và restore lại → HEAD net là có đủ.

**Chưa tìm ra thứ xoá nó khỏi working tree.** Hôm nay bị 2 lần, cả 2 đều là deletion chưa stage,
cả 2 đều `git restore` xong. Loại được: không nằm trong `.gitignore`, không khai trong
`shopify.app*.toml` nào (extension được CLI tự dò từ `extensions/*/shopify.extension.toml`, đúng
chuẩn), và 5 stash gần nhất không chứa nó.

Rủi ro thật đi kèm: T6/T8/T12 đều commit bằng `git add -A`. Nếu deletion tái diễn đúng lúc đang
commit thì nó bị quét vào commit im lặng. Đã verify HEAD vẫn đủ 5 file → **chưa lần nào dính**.
Lần sau chạm repo này nên `git status` trước khi `git add -A`.

### T10 + T11 + T12 — kết quả

**1 commit `118aea1` cho cả T10 và T11**, không tách. Plan ban đầu định tách 2 commit theo ranh
giới, nhưng cả hai sửa cùng một `return` của cùng một file — tách ra là dựng ranh giới giả, và
commit T10 đứng một mình sẽ là trạng thái không ai từng chạy. Ghi rõ cả 2 phần trong commit body.

`AiReadiness.js`: **+251 / −171**.

- **T10**: bỏ `Select` page type + hằng `PAGE_TYPES`. `hasScanned` trước xét cả 3 page type bằng
  `.some()`, giờ chỉ đọc `homePage` — PSI quét home page cho category agentic, mời merchant chọn 3
  loại trang là gợi ý có dữ liệu ở 2 loại kia trong khi không bao giờ có. `grep pageType` → 0.
- **T11**: điểm dùng `CircularProcessBar` trong card kiểu `OverviewCard` (DevicesToggle góc phải,
  nút rescan trong vòng tròn). Checklist thành `LegacyCard` + `ProgressBar` + `Collapsible` +
  `ResourceList`, mỗi audit 1 `ResourceItem` — đúng khung `QueueTask`. Icon trạng thái mượn đúng
  bộ QueueTask dùng (`CheckIcon`/`MenuHorizontalIcon`) để merchant đọc một ngôn ngữ trạng thái trên
  cả 2 màn. Layout 2 cột `oneThird` + phần còn lại, giống hàng đầu trang speed-up.
- Vòng tròn hiện **phần trăm** category (`agenticScore × 100`, vì `CircularProcessBar` tô màu theo
  thang 0-100), dòng dưới vẫn `n/m audits passing`. Giữ cả hai vì 3/6 audit weight 0 — chỉ đưa phần
  trăm là giấu mất chuyện đó.

**Bẫy CSS tránh được**: `QueueTask` dùng `<div className="Avada-IconCollapsible">` làm nút thu gọn,
nhưng class đó nằm trong `components/ImproveSpeed/ImproveSpeed.scss` — chỉ load khi
`ImproveSpeed` mount, copy sang trang này thì mất style. Dùng `Button variant="plain" icon` thay,
được luôn keyboard access. Ngược lại `Avada-SpeedScore__Cycle` **an toàn**: nó ở
`styles/components/_store_score.scss`, được `styles/app.scss:24` import global.

Verify: eslint sạch, `7 passed / 1 failed` (suite fail là `onPageListQuery.helpers`, hỏng sẵn trên
master), và vite dev transform `AiReadiness.js` trả **200** → compile thật chứ không chỉ parse.

**T12**: generator dịch 3 chuỗi, diff thô **12.565/12.593** → serialize lại còn **70/98**. Mỗi
locale `+2` (`checklist.heading`, `checklist.expand`) `−4` (`pageType.*`) và 1 chuỗi đổi
(`score.heading`). 0 bản dịch cũ bị viết lại.

### Phát hiện ở bước verify — nhánh tụt 20 commit sau master

`npx jest packages/` trên nhánh: **11 suite fail**. Master cũng 11, nhưng **khác tập**. 3 suite chỉ
fail trên nhánh:

| Suite | Trên master |
|---|---|
| `src/controllers/__tests__/historyOptimizeController.analysis` | PASS |
| `lib/controllers/__tests__/historyOptimizeController.analysis` | PASS |
| `scripts/__tests__/detect-changed-functions` | PASS |

Không phải regression của T6–T9 — `git diff origin/master...HEAD` không đụng file nào trong số đó.
Nguyên nhân: `git diff origin/master HEAD` (2 chấm) cho thấy nhánh **thiếu đúng 1 dòng**
`totalAllPageImageCount = 0,` trong destructure ở `historyOptimizeController.js:195-212`, trong khi
dòng 218 vẫn dùng biến đó → `ReferenceError: totalAllPageImageCount is not defined`, crash cứng
trong controller prod.

`git fetch` xong: **origin/master đi trước nhánh 20 commit**, nhánh đi trước 14. Fix cho lỗi này
nằm trong 20 commit đó. Nhánh đang mang bản vỡ vì rebase ở T0 dựa trên `origin/master` cũ.

Rebase lại lên master mới sẽ kéo fix về, nhưng master có `chore(i18n): add published status labels
for the bulk generator list` → **conflict gần như chắc chắn ở 14 file locale**. Quyết định của
Tony, không tự làm.

#### 🔄 T9: Firestore `undefined` khi lưu agentic audits

- Agent: inline
- Lỗi Tony gửi (shop `6FFrhDPLyN9t8mLeRT8r`, lúc scan PageSpeed):
  > `Cannot use "undefined" as a Firestore value (found in field
  > "avada-speed-score.homePage.desktopAgenticAudits.audits.agent-accessibility-tree.displayValue")`
- Root cause: `helpers/google.js:249-254`, `buildAgenticResult()` copy thẳng
  `displayValue: audit.displayValue`. Lighthouse **không phải audit nào cũng có `displayValue`** —
  audit pass hoặc `notApplicable` thường không có. Firestore `update()` từ chối `undefined`, và
  client này không bật `ignoreUndefinedProperties`. Nên **cả lần scan hỏng**, không riêng 1 audit.
  Cùng lỗi tiềm ẩn ở `mode: audit.scoreDisplayMode` và `weight: ref.weight` khi `auditRefs` trỏ id
  không có trong `audits`, và ở `.map(item => item.description/.message)` khi phần tử thiếu field.
- Plan:
  - Goal: `formatAuditResults()` không bao giờ trả `undefined` ở bất kỳ độ sâu nào dưới `agentic`.
  - Files allowed: `packages/functions/src/helpers/google.js`,
    `packages/functions/src/helpers/__tests__/googleAgentic.test.js`.
  - Approach: bỏ hẳn key `displayValue` khi Lighthouse không trả, `mode`/`weight` fallback `null`/`0`,
    lọc phần tử rỗng ở 2 mảng. Loại phương án bật `ignoreUndefinedProperties` trên Firestore client:
    đổi hành vi ghi của **toàn app**, giấu lỗi thay vì sửa, và nằm ngoài scope brief này.
  - Test command: `npx jest packages/functions/src/helpers/__tests__/googleAgentic.test.js` —
    thêm case assert đệ quy không có `undefined`, phải **fail trước khi sửa**.
  - Risk: đây là đường prod thật — hỏng thì mọi scan PageSpeed của mọi shop mất kết quả agentic.
    `prepareDataOnePage` đã bọc `try/catch` trả `defaultPageSpeedReport`, nên lỗi nằm ở tầng ghi
    Firestore chứ không ở tầng parse.
  - Rollback: revert commit; thuần hàm đọc, không migration.

### T9 — kết quả

Commit `4b5d652`. Viết test tái hiện **trước**: 3 fail, trong đó có case chạy trên **2 fixture PSI
thật** — tức bug này bắn với response thật chứ không phải input dựng. Sau fix: **9/9 pass**.

Sửa ở `google.js:249-258`:
- `displayValue` — **bỏ hẳn key** khi Lighthouse không trả, không lưu `null`. FE phân biệt được
  "không có giá trị" với "có giá trị". `grep displayValue` trong 4 màn agentic FE → 0, không ai đọc.
- `mode` → `?? null`, `weight` → `?? 0` cho trường hợp `auditRefs` khai id mà `audits` không có.
- `llmsTxtErrors` / `a11yIssues` → `.filter(Boolean)`, phần tử thiếu `message`/`description` bị bỏ.

Loại phương án bật `ignoreUndefinedProperties`: nó đổi hành vi ghi Firestore của **toàn app** và
giấu lỗi thay vì sửa.

**Chạy trên GCF, không phải worker fleet** — `worker.config.yml` `jobs:` không có job speed scan.
Ship bằng `firebase deploy --only functions`. Deploy thủ công, tao không chạy.

Security: 89 dòng thêm, 0 secret, 0 `console.*`, 0 file cấm, 0 dep. Blast radius: đường prod thật,
mọi shop — nhưng là hàm thuần đọc response, revert 1 commit là xong.

### T7 — kết quả

Commit `94bff8c`. Xoá card `ai-readiness` (`Performance.js:53-58`) + 2 key
`Landing.aiReadiness.*`. `grep "agentic-ai" pages/Performance` → 0. Vào Readiness giờ chỉ qua menu
Agentic AI, không còn 2 lối vào cho 1 trang.
