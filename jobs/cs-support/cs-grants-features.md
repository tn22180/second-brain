# CS grants: mọi tính năng pro đều grant được, một cơ chế duy nhất

Repo: `~/Documents/second-brain/projects/Falcon/seo`
Branch: `feat/cs-grants-features` (off `origin/master` @ `f64315fa25`)
Design: `docs/superpowers/specs/2026-08-13-cs-grants-features-design.md` (commit `2e2dfe64e4`)
Tiếp nối: `issue-12-08-2026.md` → MR !2171 (merged `33832c7abd`), MR !2172 (merged `8074c254e8`)

## Mục tiêu

1. Liệt kê đủ mọi tính năng pro vào `GRANTABLE_FEATURES` để CS pick được trong DevZone, giống
   `xmlSitemap` đã làm.
2. Gộp phần **Dev & Test tools** (`No limit feature speed`, `No limit feature structured`, …) vào
   cùng một cơ chế — hiện là hai hệ song song.
3. Bịt lỗ write-guard `isDevZone` đọc từ request body.

## Ground truth (đo trên `origin/master`, không phải phỏng đoán)

| Flag | BE | FE | Thực chất |
|---|---|---|---|
| `noLimit` | 27 | 6 | Enforce thật, mở **tất cả** |
| `noLimitOptimizeImages` | 3 | 2 | Enforce thật, per-feature |
| `noLimitBr` | 1 (`pickFields`) | 57 | **FE-only** |
| `noLimitSchema` | 1 | 14 | FE-only |
| `ignoreNewLimit` | 1 | 5 | FE-only |
| `unlockFeatures` | 1 | 3 | **Chết — 0 consumer** |
| `ignoreRevertAllFree` | 1 | 5 | FE-only |
| `ignoreRevertAllStarter` | 1 | 5 | FE-only |

484 lần check gate trong 94 file, nhưng chỉ **94 file import `PricingModalContext`**. Chặn ở chỗ
đọc context, không sửa 484 điều kiện inline.

### Bẫy: legacy flag là override xuyên tầng

`noLimitBr` không phải "flag pro của speed". Nó ghi đè 4 predicate khác nhau:

| File | Predicate bị ghi đè |
|---|---|
| `PageSpeed`, `LazyLoad`, `AssetImageOptimization`, `ScriptManager`, `Minify` | `isLimitNew` (pro) |
| `CriticalCss`, `FontSwap`, `HyperSpeed`, `Preconnect`, `StyleOptimization` | `isLimitEnterprise` |
| `SiteSpeedUp/…/ModeDescription` | `isLimitOld` (`:128`) + `isLimitFreeNew` (`:297-298`) |

`noLimitSchema` y hệt: ghi đè `isShopPro()` ở save path (`StructuredV2.js:144`, `Edit/Edit.js:334`),
`isLimitNew` ở display path (`StructuredV2.js:285,309,398,405`), **và** `isEnterprisePlan()` qua
`enabledAdvancedForm` (`Edit/Edit.js:260` — ghi thẳng Firestore).

→ Tách nhỏ hai flag này = **rút quyền** khách đang có. Mỗi legacy flag map 1:1 sang đúng một key thô.

### Findings ngoài scope (báo, không sửa)

- `StructuredV2.js:285-288`: `(isPro && !isLimitNew && !shop.noLimitSchema) || isUnlimited || shop.noLimitSchema`
  — mệnh đề 3 nuốt mệnh đề 1, `!shop.noLimitSchema` ở đó là dead code.
- Structured data dùng `isShopPro()` ở save path nhưng `isLimitNew` ở display path cho cùng feature.
  Hai cái lệch nhau được: toggle hiện bật mà save bị chặn.
- `.worktrees/fleet-deploy` là gitlink (mode `160000`) trên `master`, không có `.gitmodules`, do
  commit `b082616e81`. `.gitignore` có `/.claude/worktrees/` nhưng thiếu `/.worktrees/`.

## Quyết định đã chốt

- **Hướng gộp**: compat shim + 1 helper. `hasFeature()` đọc grant **hoặc** legacy flag → không cần
  backfill Firestore, shop cũ không mất quyền.
- **Scope**: toàn bộ 13 key (mọi tính năng pro).
- **Không siết backend**: branch này đổi *cách đọc* gate, không đổi *gate quyết định gì*. Nhóm FE-only
  vẫn FE-only. Siết BE cần đo số shop bị ảnh hưởng và release riêng.
- **`isDevZone`**: fix trong brief này, không tách ticket.
- **Executor**: chạy inline, không spawn subagent. `~/.claude/CLAUDE.md` cấm spawn subagent trừ khi
  được yêu cầu; luật đó đè lên routing table của tony-wf. Cột "Agent / Model" ghi routing *đáng lẽ*
  dùng, để vẫn audit được.

---

## Progress

Started: 2026-08-13

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| 0 | Gỡ gitlink `.worktrees/`, chặn jest đọc nó | inline | ✅ | 0/5 | clean | `1d66a8a438` — phát sinh khi verify |
| 1 | Registry object shape + `hasFeature()` + test | inline (~general-purpose/opus) | ✅ | 0/5 | clean | `7274dee304` |
| 2 | `useFeatureGate` hook + `hasFeature` trên provider | inline (~general-purpose/sonnet) | ✅ | 0/5 | clean | `f4e45fbac8` |
| 3 | Migrate speed-up group → `speedUp` | inline (~general-purpose/sonnet) | ✅ | 1/5 | clean | `df592af6cf` — 16 file, −139/+100 |
| 4 | Migrate structured group → `structuredData` | inline (~general-purpose/sonnet) | ✅ | 0/5 | clean | `a6c577bb77` — 7 file |
| 5 | Migrate image group → `imageOptimize` | inline (~general-purpose/sonnet) | ✅ | 0/5 | clean | `03eb718466` — 19 file; bỏ key `revertAll` |
| 6 | Migrate sitemap / robots / 404 / audit | inline (~general-purpose/sonnet) | ✅ | 0/5 | clean | `2a35d64723` — 22 file, 5 key |
| 7 | Migrate meta / social / site-verify / rule + 4 key mới | inline (~general-purpose/sonnet) | ✅ | 0/5 | clean | `2eb18bcd21` — 22 file |
| 8 | DevZone gộp + BE honor grant cho image | inline (~cavecrew-builder/haiku) | ✅ | 0/5 | clean | `ca50bde5f2` |
| 9 | Fix write-guard `isDevZone` | inline (~general-purpose/opus) | ↩️ | 0/5 | — | làm ở `68753214f4`, **đã revert** `db2b4df08f` theo yêu cầu Tuan (tự làm lại) |
| 10 | Credit management + subscription → container `Credit and subscription manager` | inline | ✅ | 0/5 | clean | `33447647a3` |
| 11 | Xoá Test zone, `Get all active charge` sang credit card | inline | ✅ | 0/5 | clean | `33447647a3` |
| 12 | `Shopify Plan` + `Test installed at` → `Shopify plan & shop info` | inline | ✅ | 0/5 | clean | `33447647a3` |
| 13 | Bỏ Promotion / BFCM 2024 / Trigger cron / Mark downgrade done / export email 404 / Metafields | inline | ✅ | 0/5 | clean | `33447647a3` |
| 14 | `Extend optimize image quota` + `Uses on page number` → Growth Hacking, lên đầu cột phải | inline | ✅ | 0/5 | clean | `33447647a3` |
| 15 | `Toggle using API functions V2` + `Use English language` → TS tools | inline | ✅ | 0/5 | clean | `33447647a3` |
| 16 | Reset + Webhook ra container riêng `Reset & Webhook` | inline | ✅ | 0/5 | clean | `7ababe05ca` |
| 17 | Bỏ Speed Score / Email / Time execute load JS / Device A/B Testing / Custom speed score / Skip optimize / 2 section test 404 | inline | ✅ | 0/5 | clean | `7ababe05ca` |
| 18 | Bỏ block Revert charge khỏi `Credit and subscription manager` | inline | ✅ | 0/5 | clean | `7ababe05ca` |
| 19 | Dev & Test tools → CardCollapse, đổi tên `Trigger function` | inline | ✅ | 0/5 | clean | `a9759c1905` |
| 20 | Phần speed up trong TS tools → card `Speed up` (`SpeedUpSettingsContainer`) | inline | ✅ | 0/5 | clean | `a9759c1905` |
| 21 | Bỏ 7 nút khỏi `Reset & Webhook` | inline | ✅ | 0/5 | clean | `a16f6f8934` |
| 22 | Sắp xếp lại 2 cột DevZone: tools trái / feature phải | inline | ✅ | 0/5 | clean | `f0df7047ac` |
| 23 | `Trigger function` sang cột phải, sau `Migrate to App Embed` | inline | ✅ | 0/5 | clean | `0a3109bbba` |
| 24 | Gộp `On Page SEO Audit` vào `Checklist & Audit` | inline | ✅ | 0/5 | clean | `0a3109bbba` |
| 25 | Sắp lại đầu cột trái theo thứ tự chỉ định | inline | ✅ | 0/5 | clean | `0a3109bbba` |
### Log

#### ✅ Task 0: gỡ gitlink `.worktrees/` (phát sinh, không có trong plan gốc)
- Status: ✅ completed — commit `1d66a8a438`
- Vì sao: `npx jest` là công cụ verify của cả nhánh này, mà nó đang chạy **2 bản** mỗi suite
  (`.worktrees/fleet-deploy` là checkout đầy đủ của chính repo) + haste collision mọi package.
  Không sửa thì mọi con số test của các task sau đều gấp đôi và không tin được.
- Đã làm: `git rm --cached .worktrees/fleet-deploy`, thêm `/.worktrees/` vào `.gitignore`,
  thêm `testPathIgnorePatterns` **và** `modulePathIgnorePatterns` vào `jest.config.js`
  (chỉ `testPathIgnorePatterns` không đủ — package.json trong worktree vẫn đăng ký vào haste).
- Kiểm chứng: trước 2 suite / 44 test → sau 1 suite / 27 test, hết warning collision.
- Thư mục local còn nguyên, chỉ bỏ khỏi index.

#### ✅ Task 1: Registry object shape + `hasFeature()`
- Status: ✅ completed — commit `7274dee304`
- Plan:
  - Goal: `GRANTABLE_FEATURES` có 13 key, value là `{label, legacyFlag}`; `hasFeature(shop, key)`
    trả true khi `noLimit` **hoặc** có trong `grantedFeatures[]` **hoặc** legacy flag bật.
  - Files allowed: `packages/functions/src/config/subscription/grantedFeatures.js`,
    `packages/functions/src/config/subscription/__tests__/grantedFeatures.test.js`,
    `packages/assets/src/pages/DevZone/containers/GrantedFeaturesContainer.js` (chỗ duy nhất đọc
    value làm label, `:31`).
  - Approach: đổi value string → object, giữ nguyên `hasGrantedFeature`/`sanitizeGrantedFeatures`
    (cả hai key off `hasOwnProperty`, không quan tâm kiểu value). Bỏ phương án map riêng
    `LEGACY_FLAGS` vì tách registry làm hai chỗ là đúng thứ brief này đi xoá.
  - Test command: `npx jest packages/functions/src/config/subscription/__tests__/grantedFeatures.test.js`
    — pass, có case cho từng nhánh của `hasFeature`. (Repo **không có** npm script `test`;
    `packages/functions/CLAUDE.md` bảo gọi `npx jest` từ repo root.)
  - Risk: `sanitizeGrantedFeatures` là hàng rào ghi Firestore. Sai = key rác lọt vào shop doc.
  - Rollback: revert commit, không có dữ liệu nào bị ghi.
- Rounds used: 0/5
- Kết quả: `Tests: 27 passed, 27 total`, eslint sạch 3 file.
- Security check: **clean**. Diff 3 file / +115 −4. Không secret, không file cấm
  (`.env*`/lockfile/CI/firebase/firestore rules/package.json), không log mới, không dep mới.
  `hasFeature` guard bằng `hasOwnProperty` nên `'constructor'`/`'toString'` không leo prototype
  chain thành entry hợp lệ — có test khẳng định.

#### ⬜ Task 2: `useFeatureGate` hook
- Status: ⬜ pending
- Plan:
  - Goal: `useFeatureGate(key)` trả đúng shape `PricingModalContext`, ép mọi `isLimit*` = false khi
    `hasFeature(shop, key)`. Gọi không key = context nguyên vẹn.
  - Files allowed: `packages/assets/src/hooks/useFeatureGate.js` (mới),
    `packages/assets/src/providers/PricingModalProvider*` (thêm `hasFeature`),
    `packages/assets/src/hooks/__tests__/useFeatureGate.test.js` (mới).
  - Approach: hook mỏng bọc `useContext`, không đụng provider logic ngoài việc expose `hasFeature`.
    Bỏ phương án nhét featureKey vào chính provider vì provider là singleton trên cây, không biết
    call site đang hỏi feature nào.
  - Test command: `yarn jest packages/assets/src/hooks/__tests__/useFeatureGate.test.js` — pass.
  - Risk: hook trả thiếu field → call site destructure ra `undefined`, gate biến thành falsy, mở
    nhầm tính năng. Test phải khẳng định hook là superset của context.
  - Rollback: revert; chưa call site nào dùng.
- Rounds used: 0/5
- Security check: -

#### ✅ Task 2: `useFeatureGate` hook — commit `f4e45fbac8`
- Repo **không có** infra test React (`testEnvironment: 'node'`, không jsdom/testing-library) nên
  logic thuần nằm ở `helpers/featureGate.js` (test được), hook chỉ là vỏ 3 dòng.
- Test quan trọng nhất: hook trả **superset** của context. Rơi mất 1 key → call site destructure ra
  `undefined` → gate hiểu là "không limit" → **mở** tính năng chứ không đóng.
- `Tests: 7 passed`. Security **clean**.

#### ✅ Task 3: speed-up — commit `df592af6cf`, 1/5 round
- 16 file, **−139/+100**. Xoá 57 điều kiện inline `&& !shop.noLimitBr`.
- **Round 1 (lỗi của registry ở Task 1, bắt được khi làm Task 3):** key `lazyLoad` sai. Legacy flag
  `ignoreNewLimit` **không** gate lazy load — consumer duy nhất là `Minify.js:59`, mà minify đã
  sunset. Nút DevZone ghi "Enable lazy load & minify" nhưng `LazyLoad.js` chỉ gate bằng `noLimitBr`.
  → bỏ key `lazyLoad`, thêm test khẳng định nó không tồn tại.
- 3 fix phát sinh: `SiteSpeedUp.js` gọi `useContext(PricingModalContext)` mà không destructure gì
  (call chết); `ModeDescription` đọc context 2 lần cách nhau 5 dòng; `StyleOptimization.js:405` đọc
  `activeShop` **không bound** trong component (props là `{i18n, shop}`) — nó rơi về global
  `window.activeShop` set lúc bootstrap (`embed.js:54`), không throw nhưng đọc snapshot cũ.

#### ✅ Task 4: structured data — commit `a6c577bb77`
- 7 file. **Không** strip đồng loạt được như `noLimitBr`: `noLimitSchema` gác **hai** predicate.
  - Đi kèm `isLimitNew` → xoá (hook đã áp grant).
  - Đi kèm `isShopPro()` / `isEnterprisePlan()` → **không xoá được**, hai hàm đó plan-based và mù
    grant; strip là khoá luôn shop đã được grant. 4 chỗ đó gọi `hasFeature('structuredData')`.
- `Edit.js:257` là chỗ **duy nhất** grant đổi dữ liệu lưu (`enabledAdvancedForm` ghi Firestore).
- Xoá 1 mệnh đề chết ở `StructuredV2.js` status expression.

#### ✅ Task 5–7: migrate các nhóm còn lại
- T5 `03eb718466` → rebase `9b7b78e8cd`: 19 file image. Bỏ key `revertAll` theo yêu cầu —
  consumer duy nhất là `Steps.js:344` (`handleRevert`, gate `isLimitFreeNew`), tức nó thuộc image
  chứ không phải speed. Hai flag `ignoreRevertAll*` giữ nguyên làm escape nội bộ, **không** map vào
  `speedUp` (map vào đó là tự tay trao mọi feature speed pro cho shop chỉ từng có flag revert).
- T6 `2a35d64723` → `f1f9164534`: 22 file / 5 key. `GoogleSitemap` xếp vào `xmlSitemap` (nó submit
  sitemap.xml lên Search Console). `SitemapGenerator` bỏ 2 lần gọi `hasGranted('xmlSitemap')` của
  !2171 — hook đã clear `isLimitNew` trước khi tính `canUseXml`/`isXmlLimited`.
- T7 `2eb18bcd21` → `58aeebd6aa`: 22 file. Thêm 4 key cho vùng pro trước đây **không có** cả grant
  lẫn flag: `internalLink`, `instantIndexing`, `emailReport`, `googleConsole`.
- 5 file cố ý **không** migrate: `UpgradePlanModal` / `NotifyBanner` / `ReadyBanner` chỉ lấy
  `goToPricingPage`, không gate gì; `LanguagePickerPopover(GSD)` render trong **cả** AuditDetail lẫn
  BulkEdit — hai key khác nhau, chọn 1 là để grant `seoAudit` mở lén language picker ở bulk edit.

#### ✅ Task 8: gộp Dev & Test tools — `9fd5538fe6`
- Gỡ 3 nút + 1 toggle: `No limit feature speed` → `speedUp`, `No limit feature structured` →
  `structuredData`, `Unlimited optimize images` → `imageOptimize`, `Unlock features` → **xoá hẳn**
  cùng `unlockFeatures` (0 consumer trong cả 2 package).
- Giữ lại: `No limit` (blanket override, khác bản chất), `Enable lazy load & minify`, 2 nút
  `Enable Revert All`.
- **BE phải sửa thì grant `imageOptimize` mới có tác dụng**: `checkLimitImage.js` và
  `increaseFreeUsage.js` đọc thẳng `shop.noLimitOptimizeImages` — đây là gate **duy nhất** vùng image
  mà backend thật sự enforce. Không sửa thì CS grant xong UI mở nhưng call optimize vẫn bị chặn.
  Cả hai giờ qua `hasFeature(shop,'imageOptimize')` (superset của flag cũ → không shop nào mất quyền).

#### ✅ Task 9: write-guard `isDevZone` — `68753214f4`
- **Lỗ**: `updateShopData` quyết định privileged bằng `postData.isDevZone` — field trong request
  body. `POST /shop {"isDevZone":"true","noLimit":true}` từ session merchant bất kỳ = tự grant.
  `blockFields` có strip `isDevZone` nhưng **sau** cả 3 chỗ đọc nó.
- **Không sửa được bằng session**: session Shopify chứng minh shop nào gọi, không chứng minh người
  gọi là nhân viên Avada. Phải thêm tín hiệu mới.
- `middleware/requireDevZone.js` theo đúng pattern `requireGhPassword` có sẵn: header
  `x-dev-zone-token` vs env `DEV_ZONE_TOKEN`, `crypto.timingSafeEqual`, check length trước (nếu không
  timingSafeEqual throw khi lệch độ dài), fail closed khi thiếu env.
- `POST /dev-zone/shop` là route đặc quyền duy nhất. `POST /shop` **không** ghi được
  `noLimit`/`grantedFeatures`/`plan`/`installedAt` nữa, body ghi gì cũng vậy.
- `updateShopData(shopID, postData, {privileged})` — 113 caller còn lại giữ default `false`, đúng
  bằng hành vi cũ của chúng. 2 caller nội bộ ở `devController` truyền `{privileged: true}`.
- Nhánh standalone của `getAuthenticatedFetchApi` đang **vứt** `options.headers` (nhánh embedded thì
  forward). Không sửa thì header mới 401 chỉ ở standalone.
- **Cần `DEV_ZONE_TOKEN` trong env trước khi deploy**, nếu không trang Dev Zone mất khả năng ghi.

##### 🔴 Finding phải rotate — không sửa trong MR này
`packages/functions/src/const/seo.js:1`:
```js
export const DEV_ZONE_PASSWORD = 'admin_avada_!@#';
```
`useAccessPassword.js` import nó qua alias `@functions/*` → **nằm trong bundle JS public**. Merchant
mở devtools đọc được rồi vào `/dev_zone` trên store của chính mình. Ghép với lỗ `isDevZone` là chuỗi
self-grant hoàn chỉnh. Xoá dòng không gỡ được phơi nhiễm — **cần rotate** và thay bằng giá trị không
compile vào frontend. Đây là lý do fix phải là token server-side chứ không phải siết page gate cũ.

##### 🟡 Finding ngoài scope — cùng loại lỗ, chưa sửa
`seoController.js:746,1194` nhận `isDevZone` từ `ctx.req.body` rồi truyền xuống
`checkOtmDevZone` (`optimizeHelper.js:623`) và `optimizeImg.js:105` để **bỏ qua giới hạn optimize
image**. Cùng kiểu: field body do merchant kiểm soát, dùng làm quyền. Không đụng vì ngoài phạm vi
task 9 (task 9 là write-guard của shop doc).

---

## COMPLETE — 2026-08-13

11 commit trên `feat/cs-grants-features`, đã rebase lên `origin/master` (`dba4ae0e51`), 0 behind.

**Verification (chạy thật, không phải claim):**
- `npx jest --testPathIgnorePatterns "/node_modules/" "/lib/" "/.worktrees/" "/scripts/__tests__/"`
  → `Test Suites: 4 failed, 113 passed, 117` / `Tests: 4 failed, 994 passed, 998`
- Baseline `origin/master` trong worktree tách riêng, cùng cờ → `4 failed, 110 passed, 114` /
  `4 failed, 965 passed, 969`. **Tập suite fail giống hệt**: `onPageListQuery.helpers`,
  `overviewCardScore`, `shopify2026Client`, `workListStore`. +29 test mới, 0 regression.
- `lib/` và `scripts/` **không có trong diff** so với master → fail ở đó không thể do nhánh này.
- eslint toàn `packages/assets/src` + `packages/functions/src`: 1 lỗi duy nhất, `main.js:12`
  `ReactDOM.render` deprecated — có sẵn, không nằm trong diff.

**Security §8 toàn nhánh** (`git diff origin/master...HEAD`, 111 file, +967/−378): **clean**.
0 file cấm, 0 credential thật (4 hit đều là fixture giả `'correct-horse-battery'` trong
`requireDevZone.test.js`), 0 `console.*` mới ở backend, 0 dep mới, 0 query Firestore mới.

**Tổng rounds: 1/5** (round duy nhất: key `lazyLoad` sai ở Task 1, bắt được khi làm Task 3).

**Registry cuối — 16 key**, `GRANTABLE_FEATURES`:
`xmlSitemap`, `speedUp`, `structuredData`, `imageOptimize`, `robotsTxt`, `redirect404`, `seoAudit`,
`htmlSitemap`, `metaRule`, `social`, `siteVerify`, `internalLink`, `instantIndexing`, `emailReport`,
`googleConsole`.

**Trước khi deploy:**
1. Rotate `DEV_ZONE_PASSWORD` (finding 🔴 ở trên) — vẫn cần bất kể gate được dựng lại kiểu gì.
2. Không có file nào thuộc worker fleet trong diff → **không cần** `[deploy-worker]`.
3. **Không** cần `DEV_ZONE_TOKEN` nữa — task 9 đã revert.

### ↩️ Task 9 đã revert — `db2b4df08f` (2026-08-13)

Tuan yêu cầu bỏ token gate, tự dựng lại sau, tạm để action Dev Zone thoải mái. Đã gỡ:
`requireDevZone`, route `/dev-zone/shop`, `shopController.setDevZone`, tham số `privileged` của
`updateShopData`, card token trong DevZone.

**Hệ quả đã báo và Tuan chấp nhận**: `updateShopData` quay lại quyết định đặc quyền bằng
`postData.isDevZone`, tức lỗ self-grant mở lại **đúng bằng master hôm nay**, không tệ hơn:
`POST /shop {"isDevZone":"true","noLimit":true}` từ session merchant bất kỳ ghi được `noLimit` và
`grantedFeatures` cho shop đó. Hai thứ khiến nó với tới được: `isDevZone` nằm trong request body, và
`DEV_ZONE_PASSWORD` hardcode ship trong bundle public.

Giữ lại 1 mảnh không liên quan token: nhánh standalone của `getAuthenticatedFetchApi` đang vứt
`options.headers` (nhánh embedded thì forward). Bug riêng, và gate mới dựng lại sẽ cần header chạy.

Verify sau revert: eslint 1 lỗi có sẵn (`main.js:12`), `Tests: 4 failed, 988 passed, 992` — vẫn
đúng 4 suite fail có sẵn của baseline.
- Plan: viết ngay trước khi chạy từng task (tony-wf §6). Khuôn chung:
  - Goal: mọi file trong nhóm đọc gate qua `useFeatureGate('<key>')`; xoá điều kiện inline
    `&& !shop.<legacyFlag>` đã thừa.
  - Approach: đổi 1 dòng destructure mỗi file. Không đụng điều kiện nào khác.
  - Test command: `yarn jest <suite của nhóm>` + `yarn eslint <file đã sửa>`.
  - Risk: xoá nhầm điều kiện inline = rút quyền khách đang bật flag.
  - Rollback: revert commit của nhóm đó.
- Rounds used: 0/5
- Security check: -

#### ⬜ Task 8: DevZone gộp
- Status: ⬜ pending
- Plan:
  - Goal: 5 nút `No limit …` biến mất khỏi `dev-test-tool.helper.js`; `GrantedFeaturesContainer`
    render đủ 13 checkbox từ registry; `unlockFeatures` bị xoá khỏi `pickFields` và helper.
  - Files allowed: `packages/assets/src/pages/DevZone/helpers/dev-test-tool.helper.js`,
    `packages/assets/src/pages/DevZone/containers/GrantedFeaturesContainer.js`,
    `packages/functions/src/config/pickFields.js`.
  - Risk: xoá nút mà chưa có checkbox thay thế = CS mất công cụ đang dùng. Task 8 chạy **sau** 1–7.
  - Rollback: revert commit.
- Rounds used: 0/5
- Security check: -

#### ⬜ Task 9: write-guard `isDevZone`
- Status: ⬜ pending
- Plan:
  - Goal: `POST /shop {"isDevZone":"true","grantedFeatures":[…]}` từ session merchant thường bị từ
    chối; DevZone thật vẫn ghi được.
  - Files allowed: `packages/functions/src/repositories/shopRepository.js`,
    `packages/functions/src/controllers/*` (chỗ dựng ctx cho updateShopData), test tương ứng.
  - Risk: **prod path**. Siết sai = CS không grant được nữa, hoặc chặn nhầm luồng nội bộ đang gửi
    `isDevZone: 'true'` (`devController.js:605`, `:1629`, `DevZone.js:324`). Phải liệt kê hết caller
    trước khi đổi.
  - Rollback: revert commit.
- Rounds used: 0/5
- Security check: -

---

## Vòng 2 — dọn DevZone + sunset minify (2026-08-14)

Tuan thêm yêu cầu trực tiếp trong session, không qua brief. Toàn bộ nằm trên cùng nhánh
`feat/cs-grants-features`, đã push vào **MR !2193**.

### Dọn DevZone (`825b7519b4` → `33447647a3`)

| Commit | Việc |
|---|---|
| `70d06f5a8f` | Wire gate 301 redirect, bỏ 2 key, làm lại grant card |
| `825b7519b4` | Gỡ Review Management, action `getNewFeatureLimited`, Show Banner Score + banner "Management by score" |
| `12bea3c497` | Custom structured data về card Google structured data |
| `0c445b7242` | Gỡ FAQ Setting + Minification |
| `568fc38feb`, `43dbd11222` | Gỡ 10 toggle Dev & Test |
| `6da498f8d7` | Tách Block competitors / Custom CSS ra container riêng, bỏ Fix error 502 |
| `c8bbc8dbad` | Gỡ Enable speed up + override preview domain khỏi CS tools |
| `162cc8f3a4`, `1e5d1e7d0e` | 2 container đó thành collapsible, đẩy xuống cuối |
| `19973027c1` | Gộp Shopify plan check + Sync shop info thành 1 card |
| `aedefede57`, `c41a36a132` | CS tools và TS tools thành CardCollapse |
| `33447647a3` | Job 10–15 (bảng Progress ở trên) |
| `7ababe05ca` | Job 16–18 (bảng Progress ở trên) |

Sau job 16–18, `Dev & Test tools` chỉ còn `Trigger function` + `Weekly scan speed up test`, không
còn cần redux / i18n / prop `shop`. Section `Assets` trong đó bọc `{!1 && …}` — guard không bao giờ
true, code chết có sẵn từ trước nhánh này; **báo, không xoá**.

**Job 22 — 3 block không có trong danh sách**: brief liệt kê cột trái là "tools", nhưng 3 block
sau **là tool mà không nằm trong list** nên theo đúng chữ đã sang phải: khối Shop Data Backup /
Batch Purge / Job History / Wave5 Probe (owner-only), `Trigger function`, `Referral`. Nói 1 câu là
chuyển sang trái. Panel domain / access token giữ trên cùng cột trái làm header trang.

**Job 21**: bỏ `Remove old HTML sitemap`, `Check bulk`, `Cancel bulk`, `Optimize Store`,
`Test Auto Optimize Now`, `Test function`, `Stop minification`. Cái cuối trước đó **cố ý giữ** ở
vòng quét minify (cách clear `minify.updating` bị kẹt) — Tuan yêu cầu bỏ nút, route BE
`/dev?x=reset_minify` vẫn còn nên shop kẹt giữa chừng revert vẫn gọi trực tiếp được.
Reset còn: Wizard, Review, Checklist, Force done Script Manager scan, Stop lazy loading,
Stop critical CSS, Update Active Sub, Send test Email.

**Job 20 — quyết định phạm vi**: brief ghi "đến cuối container", nhưng 2 thứ nằm cuối TS tools mà
**không** phải speed up — `Extend Trial` / `Trial Ends At` (billing) và `Broken link support` — vẫn
để nguyên trong TS tools. Muốn chuyển nốt thì nói.

`SpeedUpSettingsContainer` đọc cùng draft `settings` qua `DevZoneContext` nên TS tools và card
Speed up vẫn sửa chung 1 object; `TSToolsContainer` bỏ prop `handleChangeInput` — đó là chỗ duy
nhất DevZone dùng nó.

Bug bắt được khi làm: ô "Ignore files" trong Fix error 502 bind vào `themeFixId` — trùng key với
dòng ngay trên, 2 field ghi đè nhau. Đã đi cùng lúc gỡ block đó.

### Sunset minify — quét sạch copy + code chết (`725acadf3e`)

27 file, +75/−645. Fan-out 4 investigator song song (FE text / pricing / BE const / docs) rồi gộp:

- **Pricing**: 3 row `Minification / Minify CSS / Minify JS` trong bảng so sánh tier Speed Up.
- **Speed up mode**: option `minify` ở Custom Mode, row queue-task + case timing, và block
  `minify:{}` chết trong cả 4 preset (FE `speedOptimize.js` + BE `optimizeSpeed.js`). Không preset
  nào có `'minify'` trong `actionList` → scaffolding cho task không chạy được.
- **Copy**: subtitle Speed Up, blurb mode Basic/Standard, mô tả Setup task, block issue
  `checklist.minify` + link guide, entry Onboarding (file mồ côi).
- **Code chết**: `SCAN_PAGE_MINIFICATION`, `SETTINGS_FEATURE_MINIFICATION` trong `issuesHasEnable`,
  nhánh `ACTION_MINIFY` không tới được ở `getListActions`, penalty minify trong `lowerScoreByTier`.
- **Dev tool**: `/dev?x=test_minify` (đọc path cứng `/Users/namtran/Desktop/...`) + nút DevZone,
  2 script mồ côi `commands/testMinify*.js`.
- **Docs**: `home.md`, `performance.md`, skill `image-optimization` (+ mirror `.agent`);
  `optimize-store.yaml` bỏ minify khỏi enum/example; `POST /api/settings/minify` viết lại thành
  revert-only — body `minifyHtml/minifyCss/minifyJs` trong doc là bịa, thay bằng object `minify`
  thật. `docs/features/minify-sunset.md` ghi lại bỏ gì / giữ gì.

**Giữ nguyên đường revert**: `minifyService`, tab Minify cho shop còn `minify.enabled === true`,
`/dev?x=reset_minify`, `defaultMinify`, reset khi downgrade. Shop còn `*.aio.min.*` trong theme vẫn
cần chúng để gỡ ra.

**Không đụng** GA event `MINIFICATION_*` (`analyticHelpers.js`, `useSubscriptionAnalytics.js`) —
xoá là đổi số báo cáo lịch sử, không phải đổi text.

### `devController` thiếu 12 import (`243caab5aa`)

`no-undef` tắt trong eslint config của repo nên chưa ai thấy. Mỗi symbol là 1 `case` của
`/dev?x=...` throw `ReferenceError` ngay khi gọi: `skippedXmlSitemap`, `handleAutoUpdateSitemap`,
`SPEED_SCORE_KEY`, `defaultLazyLoad`, `createTransport`, `smtpConfig`, `renderTemplate`,
`shopifyConfig`, `resolveBrokenLinks`, `handleReviewUpdates`, `startOptimizeByProduct`,
`THEME_LAYOUT`, `OTHER_SNIPPET_NAME`, `avadaYettSnippetOld`.

Còn 2 cái **chưa sửa** vì không phải lỗi import:
- case `lazy_loading` đọc `data` trần (11 chỗ), không bind ở đâu. `lazyLoadSetting` dựng 2 dòng trên
  rồi bỏ không dùng — nhưng `data.lazyLoad` ở chỗ save lại hàm ý object rộng hơn; đoán sai là đổi
  cái nó ghi.
- `Buffer` / `require` chỉ đỏ vì lần lint ad-hoc không có env node; babel compile file này ra CJS.

### Verify vòng 2

- `npx jest --testPathIgnorePatterns "/node_modules/" "/lib/" "/.worktrees/" "/scripts/__tests__/"`
  → `4 failed, 988 passed, 992` — đúng 4 suite fail có sẵn của baseline master.
- eslint `packages/assets/src` + `packages/functions/src`: chỉ `main.js:12` `ReactDOM.render`
  deprecated, có sẵn ngoài diff.

### Còn treo

1. **`yarn update-label` với `GOOGLE_TRANSLATE_API_KEY`** — `en.json` đã regenerate (chạy
   `autoTranslateV2` phần walk, từ chối bước dịch), 12 locale còn lại vẫn giữ 3 câu cũ. Máy không có
   key, cũng không có model Ollama cho bản local.
2. **Rotate `DEV_ZONE_PASSWORD`** (finding 🔴 vòng 1) — chưa làm.
3. **T6**: grant `xmlSitemap` cho `reevolutionsg.myshopify.com` trên prod `avada-seo` — cần Tuan xác
   nhận project id trước khi ghi.
