# Blog — auto brand colors cho default settings (Done For You, Dev Zone)

- **Ngày**: 2026-07-28
- **Repo**: `blogs` (prod `avada-blog-app`, staging `avada-blog-staging`)
- **Nguồn yêu cầu**: `jobs/esther-ask.md` — Esther (CS)
- **Trạng thái**: code xong trên worktree `blogs-wt-brand`, branch `feat/brand-colors-devzone`
  (base `origin/master` 7cdfb4381), commit `8e85fa6ae`. Chưa push, chưa deploy, chưa mở MR.
  Spike đã chạy, kết quả ở §3.
- **Lưu ý**: §3 và §7 đã viết lại sau khi implement. Hướng ban đầu (Storefront `shop.brand` +
  resolver FE) bị bỏ cả hai — lý do ghi ngay trong từng mục.

## 1. Yêu cầu

Esther hỏi 2 việc:

1. Default settings của app Blog có tự lấy màu theo branding của khách để setup, khỏi sửa tay không?
2. Nếu được thì CS offer "Done For You": bấm 1 nút ở Dev Zone là setup xong cho khách.

Trả lời: được, nhưng phần khó không phải lấy màu — là chỗ đổ màu vào. Màu default hiện là
hằng số cứng phía FE, nên phải thêm một lớp `brandColors` cấp shop + resolver, nếu không thì
nút bấm xong không có gì đổi.

## 2. Hiện trạng (verify 2026-07-28)

Branch kiểm tra: `feat/openrouter-prompt-cache` (sau `origin/master` 20 commit).
Các đường dẫn dưới đây cần re-verify trên `master` trước khi code.

- `packages/functions/src/const/default.js:63` — `defaultSettings` **không có màu nào** trừ
  `effects.colorSnow` (dòng 75). Tức "default settings" mà CS thấy không phải chỗ chứa màu.
- Màu thật nằm ở default từng block, hardcode phía FE, gom tại
  `packages/assets/src/const/elementDefaultSettings.js:18`:
  - `ctaSettingDefault.js:9-11` — `borderColor` `#005BD3`, `color` `#005BD3`, `textColor` `#ffffff`
  - `ctaBannerSettingDefault.js:12-15` — `buttonColor` `#121212`, `buttonTextColor` `#FFFFFF`,
    `textColor` `#FFFFFF`, `backgroundColor` `#005BD3`
  - `eventCountDownDefaultSetting.js:20-25`
  - `textAndImageDefaultSetting.js:9-10`
  - `quoteSettingDefault.js:9-12`
  - `testimonialSettingDefault.js:6-9`
  - `recipeDefaultSetting.js:78-90`
- Consumer đọc thẳng const: `components/molecules/EditorJs/CTABanner/CTABanner.js:18`,
  `CTAButton/CTAButton.js:18`, `pages/Blog/hooks/useBlogCommon.js:26-55`.
- Theme app-extension có bộ default riêng: `packages/functions/src/const/appBlock.js:23-62`
  (`border_color` `#9D8DF1`, `bg_color` `#F9F7FF`, `heading_color` `#202223`,
  `content_color` `#585858`). **Ngoài scope** bản này.
- Dev Zone đã có pattern sẵn: `PUT /dev_zone?type=<action>` (`routes/api.js:296`), switch tại
  `controllers/devZoneController.js:58-60`, UI `packages/assets/src/pages/DevZone/index.jsx`
  + `components/RedisTool.jsx`, `components/CSSupportTool.jsx`.

## 3. Nguồn màu — theme `settings_data.json` (sau khi Storefront thất bại)

### Storefront API: đã thử, đã loại

Spike chạy thật trên dev store `truong-test-blog` (2026-07-28):

```
[1] admin: shop.storefrontAccessTokens(first:100) → OK, 0 token      ← đọc được
[2] storefrontAccessTokenCreate                   → ACCESS_DENIED    ← tạo thì không
    "Access denied for storefrontAccessTokenCreate field." code=ACCESS_DENIED
```

Khớp docs: token storefront kế thừa toàn bộ `unauthenticated_*` scope của app tạo ra nó; app
không có scope nào thì tạo token fail. `shopify.app.toml:14` không khai `unauthenticated_*` nào.

Hai yếu tố nhiễu (token spike là `shpua_` — user token của CLI, không phải app token offline):
mutation đòi access mode **offline**, và có report nó không chạy trên development store. Nhưng
cả ba đường đều về một chỗ: không thêm scope thì không có token → không đọc được `shop.brand`.
Thêm scope = re-consent toàn install base. **Loại.**

Ghi lại để khỏi có người thử lại:

- Admin API **không** có brand colors. Dump `2025-10` của chính repo không có `type Brand`,
  `BrandColors`, `BrandColorGroup`; `type Shop:73681` không có field `brand`.
- Storefront API **có** `shop.brand`, `primary`/`secondary` là list `[BrandColorGroup!]!`,
  `BrandColorGroup {background, foreground}`. Chỉ là không với tay tới được.

### Nguồn đang dùng: `config/settings_data.json` của main theme

Chỉ cần `read_themes` — app đã có. Store nào cũng có theme, nên coverage ~100%, khác hẳn
`shop.brand` (chỉ có khi merchant tự điền Settings → Brand).

Đọc bằng GraphQL `theme(id).files(filenames:)` — Admin API, đúng cách repo đã đọc file theme ở
`graphql/query/sidebarAds.graphql`. File có banner `/* ... */` nên `JSON.parse` thẳng sẽ ném;
dùng `parseWithComments` (`controllers/sidebarAdsController.js:281`) có sẵn.

Thứ tự tìm cặp màu, dừng ở cái đầu tiên đủ cặp:

1. **OS2 (Dawn và mọi theme dẫn xuất)**: `current.color_schemes[<tên>].settings` →
   `button` + `button_label`. Duyệt theo thứ tự khai báo; `scheme-1` là scheme mặc định
   toàn theme nên gần như luôn thắng.
2. **Theme cũ / Vintage**: cặp key phẳng, xếp theo độ cụ thể —
   `colors_accent_1 + colors_solid_button_labels`, `color_button + color_button_text`,
   `button_background + button_text`, `colors_button + colors_button_text`,
   `color_primary + color_primary_text`, `colors_primary + colors_primary_text`.

`current` có thể là **tên preset** thay vì object settings → tra `presets[<tên>]`.

Chấp nhận `#RGB` (nở thành `#RRGGBB`) và `#RRGGBB`. Gradient, `rgba()`, chuỗi rỗng → loại.

**Nguyên tắc all-or-nothing:** thiếu một nửa cặp thì trả null, không lấy. Có nền mà không có màu
chữ thì phải đoán màu chữ, mà đoán sai là đẩy thẳng ra blog của khách.

Theme chỉ cho đúng 1 cặp đáng tin → `secondary`/`onSecondary` để null, quote symbol rơi về
fallback `primary`.

### Verify thật (không phải lý thuyết)

Chạy extractor đã ship trên `settings_data.json` thật của dev store (theme Dawn):

```
extracted: {"primary":"#121212","onPrimary":"#FFFFFF","via":"color_schemes.scheme-1"}
```

Rồi đưa qua `applyBrandColorsToElements` → patch 6 block đúng như bảng §6.

## 4. Kiến trúc

```
[CS] DevZone → BrandColorTool.jsx
        │  PUT /dev_zone?type=brand-colors-preview   (read-only, KHÔNG ghi)
        ▼
[BE] devZoneController → brandColor.service
        │  1. themeBrandColor.service: main theme → config/settings_data.json
        │  2. helpers/themeBrandColors: tìm cặp accent (button + button_label)
        │  3. → {primary, onPrimary, secondary: null, onSecondary: null}
        ▼
[CS] xem swatch, sửa tay nếu muốn → bấm Apply
        │  PUT /dev_zone?type=brand-colors-apply  {4 màu}
        ▼
[BE] elementSettingsRepository → patch elementSettings.elements  (chỗ editor đọc)
     settingsRepository       → settings.brandColors             (lưu vết)
        ▼
[FE editor] useElementSettings → mergeWithDefaults → useBlogCommon
     → block chèn MỚI ăn màu brand
```

Bài đã publish và block đã chèn giữ nguyên data — không đụng.

### Đơn vị tách

| Đơn vị | Việc | Phụ thuộc |
|---|---|---|
| `graphql/query/themeSettings.{graphql,js}` | đọc file theme | codegen |
| `helpers/themeBrandColors.js` | **thuần**: parse settings → cặp accent | không có gì |
| `services/themeBrandColor.service.js` | fetch main theme + settings_data.json | shopifyService, api |
| `services/brandColor.service.js` | detect, validate, patch/revert elementSettings, auto-setup | 2 cái trên + repositories |
| `const/brandColorMap.js` | bảng field nào ăn màu nào | không có gì |
| `devZoneController` 3 case mới | HTTP glue, không logic | brandColor.service |
| `BrandColorTool.jsx` | UI preview + apply + reset | api client |

Tách `helpers/themeBrandColors.js` khỏi service là cố ý: nửa fetch kéo theo `@avada/core`, thứ
này init `firebase-admin` ngay lúc import và làm mọi unit test đòi credential. Phần thuần nằm
riêng thì test chạy sạch, không mock gì.

## 5. Data model

Thêm vào `defaultSettings` (`packages/functions/src/const/default.js:63`):

```js
brandColors: {
  primary: null,      // '#RRGGBB' — theme accent (button)
  onPrimary: null,    // '#RRGGBB' — text trên nền đó (button_label)
  secondary: null,    // theme không cho cặp thứ 2 đáng tin → chỉ set khi CS nhập tay
  onSecondary: null,
  source: null,       // 'theme-settings' | 'manual'
  detectedAt: null    // ISO string
}
```

`null` = chưa set → FE dùng đúng const cũ. Đây là hợp đồng quan trọng nhất: shop chưa chạy tool
phải hành xử **y hệt hôm nay**.

## 6. Mapping màu → field block

Nguyên tắc: chỉ đổi field mang nghĩa "màu nhấn / thương hiệu". Không đụng màu chữ thân bài,
nền trung tính, hay màu mang quy ước riêng.

| Block | Field | Nguồn |
|---|---|---|
| `ctaButton` | `color`, `borderColor` | `primary` |
| `ctaButton` | `textColor` | `onPrimary` |
| `ctaBanner` | `backgroundColor` | `primary` |
| `ctaBanner` | `textColor` | `onPrimary` |
| `ctaBanner` | `buttonColor` | `onPrimary` — **đảo**, xem ghi chú |
| `ctaBanner` | `buttonTextColor` | `primary` — **đảo** |
| `eventCountDown` | `buttonColor`, `timerTextColor`, `textColor` | `primary` |
| `eventCountDown` | `buttonTextColor` | `onPrimary` |
| `textAndImage` | `buttonColor` | `primary` |
| `textAndImage` | `buttonTextColor` | `onPrimary` |
| `recipe` | badge + button `background` | `primary` |
| `recipe` | badge + button `text` | `onPrimary` |
| `quote` | `symbolColor` | `secondary`, fallback `primary` |
| `testimonial` | `starColor` | **không đụng** — sao vàng `#f8ba25` là quy ước, đổi thành màu brand là hỏng nghĩa |
| `quote` | `quoteColor`, `authorColor` | **không đụng** — màu chữ |
| `eventCountDown` | `backgroundColor`, `timerBoxColor` | **không đụng** — nền trung tính |

Field nào không có trong bảng thì giữ nguyên hằng số cũ.

**Ghi chú nút trong CTA banner (khác spec gốc):** bản đầu cho cả `backgroundColor` và
`buttonColor` cùng ăn `primary` → nút trùng màu nền banner, nhìn như mất nút. Sửa thành đảo:
nút lấy `onPrimary` làm nền, `primary` làm chữ. Contrast được bảo toàn theo định nghĩa vì
Shopify khai `foreground` là màu để đặt lên `background`.

## 7. Chỗ đổ màu vào — REVISED khi implement

**Spec gốc sai hướng.** Bản đầu định sửa `elementDefaultSettings.js` thành factory và chuyển
`CTABanner.js:18`, `CTAButton.js:18`, `useBlogCommon.js:26-55` sang resolver — chỗ rủi ro nhất
vì nằm trên đường editor.

Khảo sát lúc code phát hiện **lớp per-shop đã tồn tại sẵn**:

- Collection Firestore `elementSettings` (`repositories/elementSettingsRepository.js:6`),
  API `GET/POST /element-settings` (`routes/api.js:149-150`).
- FE `hooks/api/useElementSettings.js:18` merge doc của shop lên trên const mặc định bằng
  `mergeWithDefaults` (deep merge, **bỏ qua key lạ**).
- `pages/Blog/hooks/useBlogCommon.js:24-37` đã lấy default từng block ra từ
  `elementSettingsData`, không phải từ const.

Nghĩa là "default settings" mà Esther nói chính là doc này. Nên apply = **ghi patch màu vào
`elementSettings` của shop**, không đụng file FE nào.

Hệ quả:

- Không sửa `elementDefaultSettings.js`, không sửa consumer nào → mất luôn rủi ro editor path.
- Patch chỉ chứa block + field trong `brandColorMap`; phần còn lại `mergeWithDefaults` tự lấp
  bằng const mặc định. Không cần BE biết toàn bộ default của FE.
- Reset = xoá đúng các field brand map sở hữu khỏi doc → merge lại trả về mặc định app, mà
  vẫn giữ mọi tuỳ chỉnh khác merchant từng đặt.

`brandColorMap` vì thế nằm ở `packages/functions/src/const/brandColorMap.js` (BE), không phải
`packages/assets`.

## 8. API contract

### `PUT /dev_zone?type=brand-colors-preview`

Read-only, không ghi Firestore.

```jsonc
// 200
{
  "detected": true,
  "source": "shopify-brand",
  "colors": {"primary": "#1A73E8", "onPrimary": "#FFFFFF",
             "secondary": "#F5A623", "onSecondary": "#111111"},
  "raw": {"primaryCount": 2, "secondaryCount": 1}   // để CS biết brand có nhiều nhóm màu
}
// 200 — merchant chưa set Settings → Brand
{"detected": false, "reason": "brand-empty", "colors": null}
// 200 — không tạo được storefront token
{"detected": false, "reason": "storefront-token-failed", "message": "<lý do thật từ Shopify>"}
```

### `PUT /dev_zone?type=brand-colors-apply`

Body: `{primary, onPrimary, secondary, onSecondary, source}` — CS sửa tay được, nên BE
**không** tin body, phải validate `^#[0-9A-Fa-f]{6}$` từng field, field sai → 400.

Làm 2 việc: patch `elementSettings.elements` của shop (chỗ editor thật sự đọc) và ghi
`settings.brandColors` để lưu vết. Trả về `blocks` — danh sách block đã đổi. Idempotent.

### `PUT /dev_zone?type=brand-colors-reset`

Xoá field brand map sở hữu khỏi `elementSettings`, set 4 màu trong `settings.brandColors` về
`null`. Đường lùi khi CS set nhầm shop.

## 8b. Auto-setup lúc cài app — CHỈ khách mới

Bổ sung sau khi Tony chốt: "chỉ dành cho khách mới cài app, lấy primary và text cho hài hoà".

`autoApplyBrandColorsForNewInstall(shop)` gọi fire-and-forget từ `afterLoginService`
(`services/after-login.service.js`), cạnh `checkOneStarShopLogin`. Không bao giờ ném lỗi.

Hai lớp chặn, phải qua cả hai:

1. `shop.installedAt >= BRAND_AUTO_SETUP_FROM` — hằng số trong `brandColor.service.js`, **đặt
   bằng ngày deploy prod trước khi ship** (hiện `2026-07-29T00:00:00Z`). Shop cài trước mốc này
   không bao giờ bị đụng, kể cả login lại. Đây là cái chặn "khách cũ".
2. `shop.brandColorsSetupAt` chưa có — chạy đúng 1 lần/shop. `afterLoginService` chạy **mọi
   lần login**, không riêng lúc cài, nên không có cờ này là mỗi lần login lại query Storefront.

Chỉ áp **cặp primary**: `primary` làm nền nhấn, `onPrimary` (foreground) làm chữ trên nó. Đây là
cặp Shopify bảo đảm để đọc cùng nhau nên an toàn khi không có người nhìn kết quả. `secondary`
không tự động áp — quote symbol rơi về fallback `primary`.

Thiếu 1 trong 2 màu, hoặc shop chưa set brand → **vẫn stamp** `brandColorsSetupAt` rồi thoát.
Không stamp thì mỗi lần login lại gọi Storefront cho một shop chắc chắn không có data.

CS vẫn override được bất cứ lúc nào bằng nút Dev Zone — nút đó không kiểm tra 2 lớp chặn trên.

## 9. Lỗi và biên

| Tình huống | Xử lý |
|---|---|
| `storefrontAccessTokenCreate` fail (thiếu scope / plan) | Trả `reason` + message thật lên UI, không nuốt. Không retry vòng lặp. |
| Token cache chết (merchant revoke) | Bắt 401 từ Storefront → xoá cache → tạo lại **1 lần** → fail thì báo lỗi. |
| `brand.colors.primary` list rỗng | `detected: false`, `reason: 'brand-empty'`. |
| Chỉ có `primary`, không có `secondary` | Vẫn apply được; `secondary`/`onSecondary` = null, quote giữ màu cũ. |
| `background` có mà `foreground` null | `onPrimary` = null → block giữ text color cũ. Không tự chế màu. |
| Contrast `primary` vs `onPrimary` quá thấp (< 3:1) | Cảnh báo trên UI, **vẫn cho apply** — màu là quyết định của khách. |
| Shop domain CS gõ sai | Ownership: action Dev Zone chạy theo `getCurrentShop(ctx)` như các case sẵn có; không nhận shop tuỳ ý qua body. |

## 10. Test

Đã viết và chạy (50 test, pass hết; full suite 149 pass, 3 suite fail sẵn từ trước vì thiếu
`~/.openclaw/firebase-sa.json` và 2 test FE trỏ path không tồn tại — fail y hệt trên master):

`helpers/__tests__/themeBrandColors.test.js` (22) — thuần, không mock gì:

- `normalizeThemeColor`: `#RGB` nở đúng, trim, loại gradient / `rgba()` / rỗng / số / object.
- `resolveCurrentSettings`: `current` là object / là tên preset / preset không tồn tại / file rỗng.
- `extractThemeBrandColors`: shape Dawn thật; bỏ qua scheme thiếu nửa cặp rồi lấy scheme sau;
  fallback key phẳng; ưu tiên cặp cụ thể hơn khi có nhiều cặp; `current` là tên preset;
  không có gì dùng được → null; gradient không bị coi là màu.

`services/__tests__/brandColor.service.test.js` (28):

- `detectBrandColors`: đọc scheme đầu dùng được của theme OS2; bỏ qua scheme hỏng lấy scheme sau;
  `current` là tên preset vẫn ra màu; không có cặp nào → `theme-colors-not-found`; đọc file lỗi →
  `theme-read-failed` kèm message thật.
- `validateBrandColors`: `#fff`, `red`, `#GGGGGG`, `<script>` đều reject.
- `applyBrandColorsToElements`: đảo nút CTA banner; ghi path lồng `cuisineUi.background` mà
  không mất key anh em; **không đụng** block ngoài bảng (`testimonials.starColor` giữ nguyên);
  quote fallback `primary` khi thiếu `secondary`; palette rỗng → patch rỗng.
- `applyBrandColorsToElementSettings`: merge lên doc cũ, trả `blocks`; shop chưa có doc vẫn chạy.
- `revertBrandColorsFromElementSettings`: chỉ xoá field của brand map; không có doc → không ghi.
- `autoApplyBrandColorsForNewInstall`: shop cài trước mốc / không có `installedAt` → không đụng,
  không gọi Storefront; đã có `brandColorsSetupAt` → bỏ qua; áp đúng cặp primary và stamp shop;
  brand rỗng → stamp nhưng không ghi màu; có background mà thiếu foreground → bỏ qua; write lỗi
  → trả `{skipped:'error'}`, không ném.

Ngoài ra chạy extractor đã ship trên `settings_data.json` thật của dev store — xem §3.

## 11. Rollout

1. ~~Spike storefront token~~ — đã chạy, fail, đổi nguồn sang theme. Xong.
2. Staging test 3 shop: có brand đầy đủ / chỉ primary / không set brand. Kiểm cả reset.
3. Deploy prod theo tag `v1.81.X`, cân nhắc `[deploy-changed]`.
4. Bàn giao CS: 1 đoạn hướng dẫn ngắn — nút nào, đọc "detected: false" thế nào.

## 12. Ngoài scope

- Ghi đè màu trong bài đã publish (destructive, cần dry-run + undo riêng).
- Default theme app-extension `appBlock.js:23-62`.
- Nút "Match my brand" cho merchant tự bấm trong Settings (cần i18n `en.json` + `origin.json`).
- Fallback đọc theme `settings_data.json` / extract màu từ logo.
- ~~Auto-detect lúc after-login~~ → đã đưa vào scope, xem §8b.

## 13. Việc phụ phát hiện khi khảo sát (không thuộc scope)

`packages/functions/src/graphql/codegen.js:8` commit thẳng Shopify access token dev store vào
repo (`ACCESS_TOKEN = 'shpua_ea86…'`). Nên revoke token đó và đẩy qua `.env`.

## 14. Ước lượng

~2 ngày. Chia: bước 0 spike ~1h; BE + Dev Zone ~0.5 ngày; FE resolver + test hồi quy ~1 ngày;
staging QA ~0.5 ngày.

## 15. Việc phải làm trước khi ship

1. `BRAND_AUTO_SETUP_FROM` trong `services/brandColor.service.js` — đặt bằng ngày deploy prod.
   Để sai thành quá khứ là auto-apply cho shop cũ.
2. QA staging trên theme **không phải Dawn** (theme trả phí, theme Vintage) — nhánh key phẳng
   mới chỉ có unit test, chưa gặp file thật.
3. Revoke token dev store hardcode ở `graphql/codegen.js:8`, đẩy qua `.env`.
