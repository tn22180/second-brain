---
name: seo-embed-metafield-silent-wipe
description: SEO app embed render rỗng trên prod vì app metafield seo.meta2 bị ghi đè/không ghi — cả 2 lỗi đều câm, FE vẫn báo "Saved".
metadata:
  type: project
---

App embed của SEO đọc **toàn bộ** setting từ app-owned metafield `seo.meta2`
(fallback `seo.meta`), owner = `currentAppInstallation`. Firestore `seo/<shopId>`
KHÔNG phải nguồn storefront đọc. Firestore đầy mà storefront trống là chuyện bình thường —
luôn so `updateTime` của doc với `updatedAt` của metafield trước khi nghi theme/cache.

Ba lỗi cộng dồn, phát hiện 2026-09-21 trên `3i0jqs-f2.myshopify.com` (shopId `dugsyfwhAvh1JRlwxOJy`):

1. `services/searchAppearance/updateStructuredFeature.js:60` — `settings.customOpenHours.map()`
   không guard. Shop bật `localBusinessStructured.status=true` mà `typeOpenHour !== 'available'`
   và chưa set custom open hours → `TypeError: Cannot read properties of undefined (reading 'map')`.
   Throw **đồng bộ** trong biểu thức đối số của `updateDisplayAppBlock` ở
   `services/setting/updateSettingToTheme.js:78` → metafield không bao giờ được ghi.
   Fleet: 3/3018 shop bật localBusiness dính (quét đủ 243.853 doc `seo` prod).

2. `controllers/seoController.js` (`setSpeedUp`) — từng ghi metafield bằng `data` hẹp
   `pick(setting, ['preload','pageSpeed','loading','minify'])` trong khi metafield là
   **full replace** → 1 lần bấm Speed-up thu metafield về ~187 byte, xoá sạch
   social/homepage/localBusiness/FAQ/breadcrumb. **Đã vá sẵn trên master** bởi `2850de4db4`
   (`{...storedSettings, ...settings, ...pick(setting, fieldsToCheck)}`).
   Local master hay lệch xa — `git fetch` rồi đọc `origin/master` trước khi kết luận.

3. Cả 2 đều câm: `updateSettingsToTheme` bọc try/catch nuốt (`:111`), và
   `services/shopifyService.js:917-925` chỉ `logger.warn` khi `metafieldsSet` trả `userErrors`.
   FE luôn hiện "Saved".

Dấu vết duy nhất nằm ở Cloud Logging, không có trong `errorAlerts`:
`[updateSettingToTheme:updateSettingsToTheme] update settings asset error <shopId> <msg>`.

Bug phụ cùng ổ: `extensions/theme-app-extension/snippets/avada-custom-css.liquid:2` đọc
namespace `customCss` trong khi `seoController.js:1658,1668` ghi `customCSS` — namespace
case-sensitive → custom CSS chưa từng render cho shop nào.

Đã vá: !2293 (guard `customOpenHours`; merged 2026-09-21, master `60bb0ecc9c`) và !2294
(log rõ khi write metafield không land). Cả hai chờ cắt tag mới lên prod.

Liên quan: [[seo-prod-deploy-by-tag]], [[seo-prod-error-slack-pipeline]], [[gen2-deploy-silent-freeze]]
