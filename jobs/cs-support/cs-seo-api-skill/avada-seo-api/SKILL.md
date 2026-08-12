---
name: avada-seo-api
description: Gọi API backend của Avada SEO Suite để tra cứu hoặc sửa dữ liệu một shop — lấy token, tìm endpoint, dựng curl. Dùng khi người dùng muốn kiểm tra shop trên app SEO, xem điểm/checklist SEO, đếm ảnh thiếu alt, bật/tắt app embed, xem lịch sử tối ưu, hoặc gọi thẳng một path ("call API", "test endpoint", "GET /api/...", "POST /api/...", "check shop này giúp tôi"). Skill không chứa danh sách endpoint — nó lấy spec trực tiếp từ app đang chạy nên không bao giờ lỗi thời.
---

# Avada SEO Suite — API (bản cho CS)

Skill này **không giữ danh sách endpoint**. Nó giữ cách lấy token, cách tự tra spec từ app đang
chạy, và những cái bẫy mà spec không nói. Endpoint đổi hàng tuần; bản copy thì không tự đổi theo.

Base URL production: `https://seo.apps.avada.io`

> Đây là **production, shop thật của merchant**. Mặc định chỉ đọc. Mọi lệnh ghi phải hỏi người dùng
> xác nhận trước, kể cả khi họ đã mô tả sẵn ý định.

## Bước 1 — lấy token

Hỏi người dùng hai thứ, **không được đoán**:

- **accessToken** — key tích hợp (không phải token Shopify)
- **shop** — ví dụ `example.myshopify.com`

```bash
curl -s "https://seo.apps.avada.io/proxy/swagger-token?accessToken=ACCESS_TOKEN&shop=SHOP_DOMAIN" | jq .
```

Lấy field `token`, gắn vào mọi request sau: `Authorization: Bearer <token>`.

Token sống **2 giờ** trên production. Lấy lại khi API trả `401`, hoặc khi đổi shop / đổi accessToken
(đổi shop thì hỏi lại người dùng, đừng tự dùng token cũ).

Token đã mang sẵn shop bên trong — **không truyền `shop` vào các endpoint `/api/*`**, truyền cũng
bị bỏ qua.

## Bước 2 — tự tra endpoint từ spec live

Spec đầy đủ nằm ở một URL công khai, **không cần token**:

```bash
curl -s https://seo.apps.avada.io/api/swagger.json -o /tmp/seo-swagger.json
```

Tải một lần rồi dùng lại trong cả phiên. Tra bằng `jq`:

```bash
# liệt kê path khớp từ khoá
jq -r '.paths | keys[]' /tmp/seo-swagger.json | grep -i checklist

# xem chi tiết một endpoint: method, mô tả, param, response
jq '.paths["/api/seo-score"]' /tmp/seo-swagger.json

# xem endpoint đó nhận query param nào
jq -r '.paths["/api/seo-score"].get.parameters[]? | "\(.name) — \(.description)"' /tmp/seo-swagger.json
```

Spec này sinh từ chính code đang chạy, nên nó luôn khớp với bản đã deploy.

**Giới hạn phải biết:** spec không phủ hết mọi endpoint — một phần route không được mô tả trong đó.
Nếu người dùng đưa một path không có trong spec, đừng khẳng định "không có endpoint đó"; cứ thử gọi,
hoặc báo là không tra được và hỏi lại.

Muốn xem bằng giao diện: `https://seo.apps.avada.io/api/docs`.

## Bước 3 — gọi

```bash
curl -s -X METHOD "https://seo.apps.avada.io/api/ENDPOINT" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d 'BODY_JSON' | jq .
```

Trả về dài thì lọc bằng `jq`, lấy đúng field người dùng hỏi, đừng dán cả payload.

## Bẫy — đọc trước khi kết luận

### HTTP 200 không có nghĩa là thành công

Nhiều endpoint bắt lỗi rồi vẫn trả **200 kèm `success: false`**. Luôn đọc `success` và `error`,
đừng nhìn mã HTTP.

### `null` khác `0`, `false` khác "sạch lỗi"

| Giá trị | Nghĩa thật |
|---|---|
| `missingAltCount: null` | Chưa quét lần nào. **Không phải là không có ảnh thiếu alt.** |
| `scanned: false` | Shop chưa scan checklist xong. `score = 0`, `issues = []` là do chưa scan. |
| `scanning: true` | Đang scan; số đang đọc là của lần scan trước. |
| `syncTotalImagesStatus: "RUNNING"` | Kết quả đếm ảnh chưa xong, số hiện tại là của lần trước. |
| `status: true` (trong issue) | Issue đó **đạt**. `false` mới là còn lỗi. |

### Có endpoint chạy vài phút và bị cắt ở 180s

Endpoint nào crawl storefront hoặc chạy Lighthouse sẽ mất 1–4 phút và có thể bị edge cắt `503`.
Trước khi gọi một endpoint kiểu scan/audit/rescan, tra spec xem có đường đọc kết quả đã lưu không —
gần như luôn có, và nhanh hơn hàng trăm lần.

Với checklist: `GET /api/seo-score` đọc kết quả đã lưu, trả ngay. Chỉ gọi endpoint scan khi merchant
thật sự muốn quét lại.

### Đếm ảnh thiếu alt là bất đồng bộ

Không có đường đồng bộ. `POST` để chạy, rồi `GET` lại để lấy số. Xem
`jq '.paths["/api/image-optimization/missing-alt"]'` cho shape chính xác.

### Bật/tắt app embed

`POST /api/shopify/enable-embed` **không** bật app embed — nó chỉ ghi một metafield điều khiển việc
block có hiện trong Theme Editor hay không. Gọi nó sẽ trả `success: true` mà merchant không thấy gì
đổi. Đây là tool nội bộ.

Endpoint đúng để bật/tắt là `POST /api/shop/status` với `{"appStatus": true|false}`. Nó ghi thẳng vào
theme đang live của merchant — **hỏi xác nhận trước khi gọi**. `success: false` nghĩa là embed
KHÔNG đổi, đọc `error`.

Đọc lại trạng thái thật: `GET /api/shop/appStatus`.

## Quy tắc

- Base URL mặc định `https://seo.apps.avada.io` — chỉ đổi khi người dùng nói rõ môi trường khác
- Không bao giờ đoán `accessToken` hay `shop` — hỏi
- Ưu tiên `GET`. Mọi `POST` / `PUT` / `DELETE` phải hỏi xác nhận trước
- Endpoint có param bắt buộc mà bạn phải đoán giá trị → hỏi, đừng đoán
- `401` → lấy token mới một lần rồi thử lại
- Luôn format bằng `jq .`
- Báo lại cho người dùng bằng kết quả thật; nếu một bước bị bỏ hoặc lỗi thì nói rõ kèm output
