# Avada SEO — API doc cho CS / AI agent

Cập nhật 2026-08-12. Bản này thay bản trước.

> **Chưa deploy xong.** `apiGen2` (function phục vụ `/api/**`) trên prod `avada-seo` vẫn đang mang
> code ngày 2026-08-11. Ba endpoint đánh dấu 🆕 dưới đây chỉ hoạt động sau khi `apiGen2` chuyển
> sang `updateTime = 2026-08-12` và `state = ACTIVE`. Test trước đó là test code cũ.

---

## Auth

Hai bước. Access token lấy từ bảng integration key, không phải Shopify token.

```
GET  /proxy/swagger-token?accessToken=<INTEGRATION_KEY>&shop=<shop>.myshopify.com
→ {success: true, token: "<JWT>", expiresIn: "2h", shopifyDomain}
```

JWT sống **2 giờ** trên prod. Mọi request sau đó:

```
Authorization: Bearer <JWT>
```

Base URL = `APP_BASE_URL` của prod (dùng đúng host đang gọi hiện tại). `/api/**` route về function
`apiGen2`.

JWT mang sẵn `shopID` — **không truyền `shop` vào các endpoint `/api/*`**, nó lấy từ token.

---

## 1. Bật / tắt app embed

### ⚠️ Đừng gọi `POST /api/shopify/enable-embed`

Endpoint này **không** bật app embed. Nó chỉ ghi metafield `avadaSEO.enable` trên app installation
— metafield đó gate việc block có hiện trong *block picker* của Theme Editor hay không. Hardcode
`'true'`, không có đường tắt. Đây là tool nội bộ của Dev Zone. Gọi nó sẽ trả `success: true` mà
không có gì thay đổi — đúng như đã quan sát.

### Bật / tắt

```
POST /api/shop/status
Content-Type: application/json

{"appStatus": true}     // false = tắt
```

Trả:

```json
{"success": true, "data": {"appStatus": true}}
```

Endpoint này ghi thẳng `config/settings_data.json` trên theme đang live (`themeFilesUpsert`), bật
/ tắt app embed block thật, cộng thêm snippet `avadaSeoStatus` và cờ trong Firestore.

**`success: false` = embed KHÔNG đổi.** Đọc `error` để biết lý do. Trước 2026-08-12 nó có thể trả
`success: true` dù theme write bị từ chối — đã sửa.

Lỗi hay gặp: `Response code 429 (Too Many Requests)` — Shopify rate limit, retry sau vài giây.

### Đọc trạng thái thật

```
GET /api/shop/appStatus
→ {"data": {"themeId": "...", "appStatus": true, "totalImageOptimized": 123}}
```

`appStatus` ở đây đọc từ theme thật (block `disabled` hay không), không phải cờ Firestore — trừ
shop chưa migrate sang embed block thì rơi về cờ Firestore. Có `error` kèm nếu không đọc được theme.

### Bug đã sửa 🆕

Shop nào có `settings_data.json` với `current` là **tên preset** (`"Dawn"`, `"Rise"`, `"Trade"`,
`"Tails"`) thì toggle chết:

```
TypeError: Cannot create property 'blocks' on string 'Dawn'
```

27 shop dính trong 30 ngày trên prod. Đã fix. Nếu CS còn thấy toggle fail sau khi deploy xong,
lấy `error` gửi lại.

---

## 2. Đếm ảnh thiếu alt

Bất đồng bộ. Trigger rồi poll — không có đường đồng bộ.

```
POST /api/image-optimization/missing-alt
→ {"success": true, "data": {"syncTotalImagesStatus": "RUNNING"}}
```

Chạy bulk operation của Shopify. Shop V25 quét Files (`alt`); shop trước V25 quét
products / collections / articles (`altText`). Webhook ghi kết quả về sau.

```
GET /api/image-optimization/missing-alt
→ {"success": true,
   "data": {"missingAltCount": 33,
            "syncTotalImagesCount": 263,
            "syncTotalImagesStatus": "DONE",
            "syncTotalImagesUpdatedAt": "2026-08-12T..."}}
```

- `missingAltCount: null` = chưa quét lần nào. **Không phải 0.**
- `syncTotalImagesStatus` còn `RUNNING` thì con số là của lần quét trước, chưa phải lần này.
- Đây là số thật, không ước lượng. Có dedup URL + phân trang + retry.
- Shop >5000 ảnh: có WARN trong log nhưng vẫn đếm đủ, không cap.

---

## 3. Checklist — điểm + danh sách issue, KHÔNG rescan 🆕

### Dùng cái này

```
GET /api/seo-score
GET /api/seo-score?types=metaTitleLength,metaDescriptionLength     // lọc theo issue type
```

```json
{
  "success": true,
  "data": {
    "scanned": true,
    "score": 78,
    "categoryScores": [...],
    "lastScanAt": "2026-08-11T09:12:44.000Z",
    "scanning": false,
    "issues": [
      {
        "type": "metaTitleLength",
        "status": false,
        "severity": "error",
        "category": "...",
        "priority": "...",
        "label": "...",
        "description": "...",
        "pages": [{"url": "...", "content": "...", "length": 82}]
      }
    ]
  }
}
```

Đọc thẳng từ kết quả scan đã lưu. **Không crawl, không gọi Lighthouse, trả về trong mili giây.**

Đọc kỹ mấy field này:

| Field | Nghĩa |
|---|---|
| `scanned: false` | Shop **chưa từng** scan xong. `score = 0`, `issues = []`. Không được hiểu là "sạch lỗi". |
| `scanning: true` | Đang scan. Số đang đọc là của lần scan trước. |
| `status: true` | Issue này **đạt**. `false` = còn lỗi. |
| `pages[]` | Trang cụ thể fail issue đó. Rỗng với issue không gắn theo trang. |
| `lastScanAt` | ISO string. `null` khi `scanned: false`. |

Issue nào merchant đã dismiss sau lần scan sẽ được merge thành `status: true` / `severity:
"success"` — khớp với cái merchant đang nhìn thấy trong app.

### Đường tương đương

```
GET /api/localStorages/avada-seo-checklist?isReloadCheckList=true
→ {"data": {"avada-seo-checklist": { ...payload y hệt trên... }, "id": "<docId>"}}
```

Cùng dữ liệu, bọc thêm một lớp. `/api/seo-score` gọn hơn, ưu tiên dùng.

### ⚠️ Bỏ `isReloadCheckList=true` là re-audit

```
GET /api/localStorages/avada-seo-checklist          ← KHÔNG gọi kiểu này
```

Thiếu param đó là chạy audit đồng bộ: crawl tới 4 URL, mỗi URL timeout 20s, cộng Lighthouse.
Mất 1–4 phút, quá 180s thì Fastly cắt `503`. Đây chính là cái làm CS tưởng "phải rescan mới đọc
được".

Trước 2026-08-12, gọi **có** `isReloadCheckList=true` trả body rỗng — không tồn tại đường đọc
cache. Đã sửa.

### Muốn scan lại thật

```
GET /api/seo-issues
```

Chạy audit đầy đủ, chậm. Chỉ gọi khi merchant chủ động bấm rescan.

---

## Bảng tra nhanh

| Cần gì | Gọi | Đồng bộ? |
|---|---|---|
| Bật/tắt app embed | `POST /api/shop/status` `{appStatus}` | có |
| Đọc trạng thái embed | `GET /api/shop/appStatus` | có |
| Đếm ảnh thiếu alt | `POST` rồi poll `GET /api/image-optimization/missing-alt` | không |
| Điểm + issue checklist | `GET /api/seo-score` | có, tức thì |
| Bắt scan lại checklist | `GET /api/seo-issues` | chậm, 1–4 phút |
| ~~`POST /api/shopify/enable-embed`~~ | đừng gọi — tool Dev Zone, no-op | — |

---

## Swagger

Spec đầy đủ sinh từ `packages/functions/src/docs/*.yaml`, phục vụ trên chính host prod. Các schema
`ChecklistIssue` / `ChecklistIssuePage` định nghĩa trong `config/swagger.js`.
