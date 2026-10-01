# Báo cáo bảo mật phase 4 — SEO Suite: trạng thái khắc phục

Ngày kiểm: 2026-10-01 · Báo cáo gốc: https://notes.avada.net/AGrhGjTx65.md (audit 2026-09-24, commit `f863d3a`)
Đối chiếu với: code ở tag prod `v1.86.51`, pipeline GitLab, Firestore/Storage rules đang release, revision Cloud Run đang phục vụ, và gọi thử trực tiếp vào endpoint prod.

## Kết luận

**Trong 16 finding: 13 đã fix và đang chạy trên prod, 3 mới fix một phần (rủi ro còn lại thấp). Không còn Critical nào mở.**

- Trong 8 Critical, 6 đã fix hoàn toàn. C1 và C6 fix một phần, rủi ro còn lại thấp. C5 lên prod ngày 2026-10-01 (tag `v1.86.51`).
- Trong 3 High, H1 và H3 đã fix. H2 (GDPR) mới fix một phần: webhook đã nối, nhưng việc xoá dữ liệu vẫn làm tay.
- Medium 2/2 và Low 3/3 đã fix.
- Mọi fix đã merge đều đã lên prod:
  - Rules được release lúc 2026-09-30 08:30 và giống hệt file trong repo.
  - `proxygen2` chạy revision `00390-zug`, tạo 2026-10-01 04:30 UTC từ `v1.86.51`; pipeline `deploy_production` xanh.
  - Theme extension được deploy 2026-09-30.

## Chi tiết từng finding

| ID | Finding | Trạng thái | Ghi chú |
|---|---|---|---|
| C1 | Firestore: ghi không cần auth vào `generateBulk`, `featureReq`, `commentFeatureReq` | ⚠️ Một phần | `generateBulk` đã đóng hẳn (`write: if false`). `featureReq`/`commentFeatureReq` vẫn cho người chưa đăng nhập bấm vote ±1, theo thiết kế: bơm được số vote nhưng không sửa được nội dung |
| C2 | ~20 collection Firestore ai cũng đọc/list được, lộ dữ liệu mọi shop | ✅ Fixed | Không còn dòng `if true` nào. Mỗi shop chỉ đọc được dữ liệu của mình (theo claim `shopId`). Đã kiểm rules đang release trên prod |
| C3 | Stored XSS qua FAQ `answerHTML` | ✅ Fixed | Mọi đường ghi metafield FAQ đều qua bộ lọc HTML allowlist (`sanitizeFaqHtml`) |
| C4 | Script injection qua JSON-LD Local Business | ✅ Fixed | Dựng bằng `JSON.stringify` rồi escape `<>&`. JSON-LD của Product, shipping và GSD cũng đã dùng `\| json` |
| C5 | `/proxy/**`: integration key của shop A thao tác được shop B (tin vào header domain) | ✅ Fixed (2026-10-01) | MR !2348, tag `v1.86.51`.<br>• 5 route đọc/ghi dữ liệu shop giờ chỉ nhận key của Blog/APC (`requireSiblingApp`).<br>• Xoá 2 route không còn ai gọi (`/speed-score`, `/optimizeImage`).<br>• `/shop/blog` chỉ còn trả trạng thái cài app.<br>• BFCM chỉ nhận 2 key hợp lệ.<br>Kiểm trên prod: gọi bằng token sai thì 5 route trả 401, 2 route đã xoá trả 404. Blog/APC vẫn gọi bình thường (585 request `/updateOvrList` trả 200 sau deploy).<br>4 app kia vẫn dính cùng loại lỗi (FAL-720) |
| C6 | `blogAppIntegrationController` trả nguyên `accessToken` | ⚠️ Một phần (chủ ý) | Merchant không còn gọi được. Chỉ staff có quyền DevZone (CRM login) còn thấy key cấp app, vì trang /partner/key cần dùng |
| C7 | Route `/proxy/**` không có auth (jsonl backup, revert, file-id, republish, updateObfucate) | ✅ Fixed | Đã thêm session token và kiểm shop có sở hữu `:id` không. `/file-id` đã xoá. republish và updateObfucate giờ cần internal key |
| C8 | Tự khai email đuôi Avada để xem activity của shop khác | ✅ Fixed | Production chỉ chấp nhận claim CRM (SSO) |
| H1 | Storage rules: shop nào đã đăng nhập cũng đọc/ghi được cả bucket | ✅ Fixed | Mặc định chặn hết, và `storage.rules` giờ đã thật sự được deploy (trước đây `firebase.json` không khai) |
| H2 | 3 webhook GDPR bắt buộc không làm gì | ⚠️ Một phần | Đã nối callback, webhook trả 200 và có log audit (log prod 3 ngày có hit). Nhưng `shop/redact` chỉ đánh dấu `redactRequestedAt`, **không tự xoá**: việc purge vẫn chạy tay qua DevZone |
| H3 | `createIntegrationKey` lấy `shopId` từ body client gửi lên | ✅ Fixed | Giờ lấy từ `getCurrentShop(ctx)` |
| M1 | So HMAC không timing-safe | ✅ Fixed | Đã dùng `timingSafeEqual` cho webhook và extension |
| M2 | `/proxy/optimize/start` không có auth, chỉ "tình cờ an toàn" | ✅ Fixed | Đã thêm `verifySessionToken` |
| L1 | Email merchant bị ghi vào log mức error | ✅ Fixed | Email đã được che trong log |
| L2 | Elasticsearch fallback password `changeme` | ✅ Fixed | Đã bỏ fallback |
| L3 | `product.vendor` không escape | ✅ Fixed | Đã dùng `\| json` |

## Việc xuyên suốt (thuộc platform)

| Việc | Trạng thái SEO |
|---|---|
| Token npm registry commit trong `.npmrc` | ❌ Vẫn còn, ở 2 file (`.npmrc`, `packages/functions/.npmrc`). Chờ platform xoay token, sau đó app chuyển sang `${NPM_TOKEN}` |
| Backdoor `TEST_KEY` ở webhook middleware | ✅ SEO không có (0 hit, kể cả trong `@avada/core` 4.8.2) |
| Callback GDPR cho `@avada/core` | ⚠️ Đã nối. Còn thiếu bước xoá tự động, như H2 |
| `@avada/core` bỏ qua được bước xác nhận billing | Chờ bản vá ở package chung |

## Rủi ro phát hiện thêm trong lúc kiểm (ngoài báo cáo gốc)

1. **Tự cấp credit AI miễn phí.** `creditCartController.js:18-19,149` coi shop có email đuôi `@avada.io` là shop nội bộ, và test charge được tính như đã thanh toán. Email này do merchant tự khai, nên merchant nào đặt email kiểu này đều được credit miễn phí. Lỗi cùng bản chất với C8. **Nên fix sớm.**
2. **Route test bị lộ, không có auth.**
   - `/proxy/test/updateActive`: ai cũng kích được job quét toàn bộ shop.
   - `/proxy/test/crawlProxy`: proxy fetch mở. Vẫn có chặn SSRF nhưng không cần auth.
3. **Endpoint tốn tiền không có auth.**
   - `POST /proxy/chat` gọi LLM, chỉ có rate limit.
   - `POST /proxy/temp/seo-tool/image` nén ảnh cho bất kỳ ai.
4. **Link unsubscribe không ký.** `/proxy/unsubscribe/:identifier` dùng base64 trần, nên ai cũng hủy đăng ký email hộ người khác được. Mức Low.
5. **Payload XSS cũ vẫn còn.** FAQ `answerHTML` và LocalBusiness được ghi trước ngày fix chưa được làm sạch lại. Payload cũ vẫn ra storefront tới khi merchant lưu lại. Cần một lượt quét và ghi lại metafield.
6. **Ảnh preview public.** Storage `previewCompress/{shopId}/**` vẫn để `read: if true`. Cần xác nhận đây là chủ ý.
7. **Đòi xoá dữ liệu khách nhiều bất thường.** `customers/redact` có 427 lần trong 3 ngày từ một shop (`vograce*`). Đây là việc vận hành, không phải lỗ hổng.

## Đề xuất bước tiếp

1. **Cùng loại lỗi C5 ở 4 app còn lại (FAL-720)**, kèm xoay token proxy đang bị lộ trên gói npm `avada-components-seoon`.
2. Sửa lỗi cấp credit qua email tự khai (mục 1 ở trên) và gỡ/chặn 2 route `/proxy/test/*`.
3. GDPR: chạy purge tự động cho shop có `redactRequestedAt`, bỏ bước làm tay.
4. Platform xoay token npm, sau đó gỡ `.npmrc` khỏi git.
5. Quét và làm sạch lại metafield FAQ và LocalBusiness đã ghi trước ngày fix.

---
Ghi chú vận hành:
- `v1.86.50` có `deploy_production` bị canceled, nhưng tag này không có thay đổi code nào so với `v1.86.49`, nên không ảnh hưởng.
- `deploy_worker` bị cancel ở v1.86.47–v1.86.50. Tới `v1.86.51` thì chạy lại xanh (2026-10-01), nên fleet worker đã lên code mới.
