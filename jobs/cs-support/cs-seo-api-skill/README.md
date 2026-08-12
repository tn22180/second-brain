# Skill `avada-seo-api` — bản gửi CS

Gói này để CS bỏ vào Claude Code của họ và tự gọi API SEO, không cần checkout repo.

## Cài

```bash
mkdir -p ~/.claude/skills
cp -r avada-seo-api ~/.claude/skills/
```

Mở phiên Claude Code mới. Gõ `/avada-seo-api`, hoặc chỉ cần hỏi thẳng "check shop
abc.myshopify.com giúp tôi" — skill tự kích hoạt.

CS cần sẵn `curl` và `jq`.

## Cần chuẩn bị trước khi đưa

- **accessToken** — key trong collection `integrationKeys`, đúng cơ chế đang dùng, không phải làm gì
  mới. Skill sẽ hỏi, nó không đoán và không hardcode.
- Nhắc CS: đây là **production, shop thật**. Skill đã đặt mặc định chỉ đọc và bắt xác nhận trước
  mọi lệnh ghi, nhưng `POST /api/shop/status` vẫn ghi thẳng vào theme của merchant.

### Key không gắn shop — đọc trước khi cấp

Doc trong `integrationKeys` chỉ có `{name, type, accessToken, createdAt}`, **không có `shopId`**.
`exchangeToken` chỉ kiểm tra key tồn tại rồi ký JWT cho bất kỳ `shop` nào được truyền vào. Một key
mở được **mọi merchant** của app, gồm cả lệnh ghi vào theme. Không có cách giới hạn CS chỉ xem một
tập shop.

Vì vậy cấp key riêng cho CS không phải để giới hạn phạm vi — mà để **thu hồi và truy vết** (JWT mang
`integrationId`, key có `name`):

```
POST /api/integration/keys   {"name": "cs-team", "type": "restApi"}
```

Thu hồi có độ trễ, cộng dồn tới ~3h:

- repo không có hàm xoá key → xoá doc trong Firestore bằng tay
- key hợp lệ cache 1h (`cacheWrap` trong `integrationRepository`)
- JWT đã cấp sống thêm 2h

Không có đường revoke tức thì. Nếu key CS lộ, coi như còn hiệu lực tới 3h sau khi xoá.

## Khác gì bản trong repo

Bản trong repo (`seo/.claude/skills/avada-seo-api/`) bảo agent đọc `packages/functions/src/routes/api.js`
và `docs/*.yaml`. CS không có repo nên bản đó vô dụng với họ.

Bản này thay bằng spec live:

```
GET https://seo.apps.avada.io/api/swagger.json      # public, không cần token
GET https://seo.apps.avada.io/api/docs              # giao diện swagger
```

Spec sinh từ code đang chạy nên luôn khớp bản đã deploy — cùng triết lý "không giữ bản copy", chỉ
khác nguồn đọc. Không phải update skill khi API đổi.

Kiểm tra ngày 2026-08-12: HTTP 200, 135 KB, 195 path.

## Cái skill dạy CS mà spec không nói

- HTTP 200 vẫn có thể là `success: false`
- `missingAltCount: null` = chưa quét, không phải "không thiếu ảnh nào"
- `scanned: false` = chưa scan xong, không phải "sạch lỗi"
- endpoint scan/audit mất 1–4 phút và bị cắt 503 ở 180s → dùng `GET /api/seo-score` đọc cache
- đếm ảnh thiếu alt là bất đồng bộ: POST rồi poll GET
- `POST /api/shopify/enable-embed` là tool nội bộ, **không** bật app embed — dùng
  `POST /api/shop/status`

## Lưu ý version

Tính đến 2026-08-12 `apiGen2` trên prod chưa deploy xong bản mới, nên `GET /api/seo-score` còn thiếu
`issues[]`. Đợi function sang `ACTIVE` với `updateTime` 2026-08-12 rồi hãy bảo CS test:

```bash
gcloud functions list --project=avada-seo --format='value(name,updateTime,state)' | grep -E '^apiGen2\b'
```

Doc dài hơn cho người đọc (không phải cho agent): `../seo-api-doc-cs.md`.
