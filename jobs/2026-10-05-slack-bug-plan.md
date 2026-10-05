# Plan fix: 10 thread bug mới nhất (2026-10-05)

Nguồn: `#seo-suite-support` (G01N5G8D562) + `#blog-support` (C08928RK00H), đọc qua bot token của falcon-fix-bot. 10 thread mới nhất đều nằm ở seo-suite-support, khoảng 10-01 → 10-05; blog-support không có thread nào lọt top 10.
Code đọc ở `origin/master`: seo `9839ca0` (sau v1.86.59), APC `1744d88` (= prod v1.6.45). Local master của cả 2 repo đang tụt sau origin.
Chế độ: chỉ lên plan. Chưa sửa code, chưa có branch, chưa có MR.

## Tóm tắt

| # | Shop | Vấn đề | Verdict | Effort | Ai đang giữ |
|---|------|--------|---------|--------|------------|
| 2 | iconic-rugs-au | `validFrom` mặc định 2030-01-01 xuất ra Offer | **FIX** (high) | S | chưa ai |
| 3 | f2xvjq-10 | Toggle Review tự tắt sau reload (Air Reviews `air-reviews-1`) | **FIX** (high) | S | chưa ai |
| 4 | ladyandoscar | AggregateRating giả 5★/1 review | **FIX** (high) | S | chưa ai |
| 6 | tomskitchen | Sitemap báo "insufficient permission" | SKIP, đã có fix | — | MR !2357 / FAL-1061 |
| 7 | 7e7d24-a8 | GSC báo chưa login dù đã login | SKIP, đã có fix | — | MR !2357 / FAL-1061 (Trường) |
| 10 | nativekorean | Filename optimized = 0 | SKIP, đã fix | — | 4bff97c (v1.86.52) |
| 5 | 0mbyi0-1e | Organization logo lấn ảnh sản phẩm | SKIP, cần product quyết | S | — |
| 8 | 6940c4 | Product schema giá 0/OutOfStock cho template riêng | SKIP, feature request | M | — |
| 1 | 3d52da-2 (APC) | App không chạy khi login từ CRM | NEED-INFO (low) | ? | — |
| 9 | t2kbya-i8 | Crisp tạo 2 session cho cùng khách | NEED-INFO (low) | M | — |

**Thứ tự làm:** (1) merge !2357 + cắt tag, vì MR này còn là bản vá bảo mật. (2) 1 MR schema gom T2 + T4, vì cùng file liquid và cùng cần `[deploy-extensions]`. (3) 1 MR riêng cho T3, chỉ 1 dòng.

## Hành động cấp fleet

- **Bảo mật:** prod `GET /settings/google` hiện vẫn trả `access_token` và `refresh_token` của GSC về trình duyệt. `redactSettings` không xử lý được object google dạng phẳng (`seoPresenter.js:102-109`), và đây cũng là lỗi gây ra T6/T7. Ưu tiên merge MR !2357 rồi cắt tag. Sau đó grep các chỗ gọi `redactSettings(` khác xem có truyền object con không.
- **Rating giả:** mọi shop có `ratingAndReview.status=true` và `productAndCollection.status=false` mà sản phẩm không có review đều đang khai 5★/1 với Google, có nguy cơ bị manual action. Chưa đếm số shop.
- **validFrom 2030:** prod có 4894 doc `seo` mang giá trị này. 279 doc đang bật Product schema, trong đó 196 doc bật luôn priceValidUntil, tức đang xuất ra storefront (đã thấy live trên openvape.com).
- **gcloud config `sa` bị reauth lại:** báo "Reauthentication failed" khi đọc log `apisa` (APC) và lúc check deploy GCF. Config này dựng ra để né reauth, cần xem lại.

---

## T2: iconic-rugs-au, bỏ `validFrom` (FIX)

<https://avadaio.slack.com/archives/G01N5G8D562/p1791115075459679>

- **Root cause:** mặc định là `validFrom: '2030-01-01'` (`packages/functions/src/config/default.js:121`). Liquid chỉ check `!= blank`, không check ngày tương lai, cũng không đọc `excludeFields` (`extensions/theme-app-extension/snippets/avada-product-and-collection.liquid:284-286`, `:389-391`; bản legacy ở `packages/functions/src/config/customGsdLiquid.js:290-292`, `:615-617`). CS đã thêm `excludeFields:"validFrom"` cho shop nhưng liquid không đọc, nên không có tác dụng.
- **Plan:**
  - Goal: không còn shop nào xuất `validFrom` ngày tương lai. `excludeFields` chứa validFrom thì bỏ field đó.
  - Files: `default.js`, `avada-product-and-collection.liquid`, `customGsdLiquid.js`, `config/__tests__/customGsdLiquid.jsonld.test.js`.
  - Cách làm: `default.js:121` đổi thành `''`. Trong liquid, `assign avadaToday = 'now' | date: '%Y-%m-%d'`, chỉ xuất khi `validFrom != blank and validFrom <= avadaToday`, bọc trong `unless excludeFields contains "validFrom"`. Không migrate data, vì guard ở storefront đã chặn ngày 2030.
  - Test: jsonld test 3 case: ngày tương lai bị bỏ, ngày quá khứ được giữ, có exclude thì bị bỏ.
  - Risk: thấp, chỉ bớt field. Shopify cache trang nên `now` có thể trễ vài giờ.
  - Deploy: commit có `[deploy-extensions]` + cắt tag.
- Yêu cầu cho gõ ngày thay vì chọn lịch là feature request riêng, nằm ngoài plan này.

## T4: ladyandoscar, AggregateRating giả 5★/1 (FIX)

<https://avadaio.slack.com/archives/G01N5G8D562/p1791102519313699>

- **Root cause (2 lỗi cộng nhau):**
  1. Snippet review hardcode giá trị dự phòng `else 5` / `else 1` khi không có review (`extensions/theme-app-extension/snippets/avada-rating-and-review.liquid:73-77`; bản legacy ở `customGsdLiquid.js:604-605`). Snippet Product thì đã có guard `ratingValue > 0 and reviewCount > 0` (`customGsdLiquid.js:124`).
  2. UI hiện toggle Review là OFF vì `getStructuredSetting.js:94-97` tính theo `installed`, nhưng Firestore và metafield vẫn lưu `status:true`. Khách tắt Product thì `blocks/avada-seo.liquid:67` rơi vào nhánh review và render khối 5★ giả.
- **Plan:**
  - Goal: chỉ xuất aggregateRating khi có review thật.
  - Files: `avada-rating-and-review.liquid:72-78`, `customGsdLiquid.js:600-606`, `customGsdLiquid.jsonld.test.js`.
  - Cách làm: đổi điều kiện thành `appReview != 'ali-reviews' and ratingValue > 0 and reviewCount > 0`, bỏ giá trị dự phòng 5/1.
  - Test: liquidjs với review rỗng → không có key `aggregateRating`, JSON vẫn parse được. Với 4.5/3 → xuất đúng 4.5/3.
  - Deploy: `[deploy-extensions]`. Gom chung MR với T2.
- **Follow-up, cần product quyết, không auto-fix:** UI hiện sai trạng thái toggle so với giá trị đã lưu (`getStructuredSetting.js:94-97`). Hướng sửa: metafield đi qua cùng điều kiện `installed`, hoặc UI hiện đúng giá trị đã lưu.
- **CS gỡ ngay cho khách:** bấm toggle Review snippet 2 lần (ON rồi OFF), hoặc bật lại Product.

## T3: f2xvjq-10, Review toggle tự tắt (FIX)

<https://avadaio.slack.com/archives/G01N5G8D562/p1791105893380469>

- **Root cause:** `APP_AIR_REVIEW_BLOCKS` (`packages/functions/src/config/integration/appList.js:28-32`) không có handle mới `air-reviews-1`. Hàm `isAppInstalledByBlock` (`shopifyGraphQlService.js:1921`, so bằng `includes`) không khớp nên `installed=[]`, và UI ép status=false. Dữ liệu đã lưu và storefront vẫn đúng.
- **Plan:**
  - Files: `appList.js`, cộng test cho `isReviewAppInstalled`.
  - Cách làm: thêm `'air-reviews'` vào danh sách. Chắc hơn là so khớp theo uuid extension `c4e1e9ca-4d46-4e76-bc39-7e42417cb327`, vì uuid ổn định khi handle đổi. `gatherShopData.js:82` dùng chung danh sách nên được sửa luôn.
  - Test: block type `shopify://apps/air-reviews-1/blocks/app-embed/c4e1e9ca-…` với `selected='ag-product-reviews'` thì ra `status:true`. Test của gatherShopData đang mock danh sách thành `[]`, cần bổ sung.
  - Risk: thấp, chỉ là lỗi hiển thị. Nhưng kết hợp với lỗi toggle ở T4 thì khách bấm lại sẽ ghi sai trạng thái.
- Lỗi GSC disconnect trong cùng thread chưa chẩn đoán. Có thể chính là lỗi `isConnected` của T6/T7.

## T6 + T7: GSC (SKIP, MR !2357 đã có)

- T6 <https://avadaio.slack.com/archives/G01N5G8D562/p1790957259542309>, T7 <https://avadaio.slack.com/archives/G01N5G8D562/p1790934957755509>
- **Root cause chung:** commit `7873be4` (v1.86.32) làm `redactSettings` không thêm `isConnected` khi `field=google`, và còn để lọt `tokens` (`seoPresenter.js:102-109`, gọi tại `seoController.js:170,185`). FE tưởng chưa kết nối:
  - T7: hiện banner "chưa đăng nhập".
  - T6: Sitemap Manager gọi `https://crewild.com` (`SitemapManager.js:34`), trong khi khách chỉ có property `sc-domain:crewild.com`, nên Google trả 403. Lượt gọi lại với property đã lưu ở `:52-55` không bao giờ chạy.
- **Việc cần làm:** review, merge !2357, cắt tag. CS gắn T6 vào FAL-1061.
- **Follow-up (S):** bỏ lượt fetch đầu theo domain shop ở `SitemapManager.js:34` (`initLoad:false`).

## T10: nativekorean, Filename = 0 (SKIP, đã fix)

<https://avadaio.slack.com/archives/G01N5G8D562/p1790822300458949>

- Fix `4bff97c3411` (MR !2351) chỉ chặn theo AI credit cho `TYPES_AI_ALT`, và sửa bộ đếm. Có trong tag v1.86.52 trở đi. Shop chưa chạy lượt nào từ 10-01.
- CS nhờ khách chạy lại Image filename → Optimize. Vẫn 0 thì mở lại FAL-1043.

## T5: 0mbyi0-1e, Organization logo (SKIP, cần product quyết)

<https://avadaio.slack.com/archives/G01N5G8D562/p1790991787828999>

- Shop đã có workaround: `homepage.status:false` từ 10-03, storefront giờ chỉ còn Product + Breadcrumb.
- Nếu product duyệt chỉ render Organization ở trang chủ: thêm `and request.page_type == 'index'` tại `blocks/avada-seo.liquid:52`. Thay đổi này áp cho mọi shop.

## T8: 6940c4, giá 0 cho template riêng (SKIP, feature request)

<https://avadaio.slack.com/archives/G01N5G8D562/p1790901982038139>

- Chưa có option loại trừ theo template. `price` luôn được xuất (`avada-product-and-collection.liquid:272`, `avada-seo-social.liquid:62-63`).
- Workaround: tắt Stock status, hoặc bật `excludeOnProductPage`. Làm thật thì effort M (UI + liquid + OG).

## T1: APC 3d52da-2, CRM login (NEED-INFO)

<https://avadaio.slack.com/archives/G01N5G8D562/p1791148968126919>

- Đã loại FAL-720: chưa merge, chưa có tag. Prod v1.6.45 không có thay đổi auth nào đủ để làm hỏng mọi trang. Doc shop bình thường.
- **Cần:**
  1. Log `apisa`/`authsa` ngày 2026-10-04 khoảng 21:00Z, status ≥400.
  2. Ảnh Console/Network của phiên CRM bị lỗi.
  3. CS thử CRM login vào một shop APC khác: nếu cũng hỏng thì lỗi nằm ở cả đường standalone, không riêng shop này.

## T9: t2kbya-i8, Crisp tách 2 session (NEED-INFO)

<https://avadaio.slack.com/archives/G01N5G8D562/p1790862980443389>

- Token cố định và truyền đúng (`uuidHelper.js:8-14`, `MainFrame.js:91`, `buildCrispSrcDoc.js:41`). Fix chat đôi `cb16e430d6b` đã có từ v1.86.12. Dù vậy, cùng một Safari vẫn tạo session mới ngày 09-28.
- Giả thuyết: Safari chặn hoặc tách storage trong iframe bên thứ ba.
- Muốn điều tra tiếp: log `$crisp.get("session:identifier")` cùng tokenId lúc `session:loaded` (`CrispIsolated.js:117`) trong 1–2 tuần, rồi mới quyết định cách sửa.

---

## Decisions

- Phạm vi "nhóm báo bug": lấy 2 kênh trong `falcon-fix-bot/config/config.json` (seo-suite-support, blog-support), chọn 10 post top-level mới nhất có header bug.
- Chỉ lên plan, không mở graph hay MR, vì yêu cầu là "lên plan … báo ra file md". Khi chạy thật: T2 + T4 thành 1 node (chung file liquid), T3 là 1 node riêng → graph 2 node chạy song song được.
- Worktree đọc tạm (`scratchpad/seo-om`, `scratchpad/apc-om`, detached) vẫn còn đăng ký trong `git worktree list` của 2 repo. Dọn bằng `git worktree prune` sau khi scratchpad bị xoá.

---

## Progress

Started: 2026-10-05 · base `origin/master` e84a815

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| 1 | T2+T4 validFrom + fake rating → `fix/schema-validfrom-fake-rating` | cc-p / sonnet | ✅ | 2/5 | clean | graph `jobs/graphs/seo-slack-schema-validfrom-rating.json` |
| 2 | T3 Air Reviews handle → `fix/air-reviews-embed-handle` | cc-p / haiku | ✅ | 1/5 | clean | graph `jobs/graphs/seo-slack-air-reviews-handle.json` |

### Decisions (run)

- 2 graph / 2 branch / 2 MR thay vì 1 graph — plan đã chốt tách MR; schema cần `[deploy-extensions]`, T3 chỉ backend.
- GSC part của T3 + T6/T7: Sarus đã merge vào master (5dfb38d, 3d69ede qua `fix/slack-1790934957`, `fix/slack-1791105893`) — không build lại. Prod vẫn cần cắt tag.
- UI toggle lệch (getStructuredSetting.js:94-97) để ngoài, chờ product.
- Review sửa tay task 1: legacy `ratingReviewsStructured` agent thêm `assign productAndCollection` → bật khối offers/priceValidUntil cho theme render snippet tách scope. Đổi sang đọc thẳng `excludeFields`. Squash về 1 commit để harness verify (HEAD=baseSha), tree khớp bản verify.

**COMPLETE** — MR !2360 (schema, [deploy-extensions]), MR !2361 (Air Reviews). Chưa merge, chưa tag. Test 57/57 + 30/30, security clean.
