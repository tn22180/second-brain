# Feed field spec — ChatGPT (OpenAI) + Google Merchant Center (US)

Lấy về ngày 2026-10-01, chỉ từ doc chính thức. Trang OpenAI **không ghi version/ngày**. Bản dùng ở đây là
`developers.openai.com/commerce/specs/file-upload/products` (bản "currently stable"), lấy tại thời điểm trên.

## Nguồn

OpenAI
- Products (field reference): https://developers.openai.com/commerce/specs/file-upload/products
- Bản stable (9 field required): https://developers.openai.com/commerce/specs/file-upload/products-fragments/currently-stable
- File-upload overview (SFTP, format, cadence): https://developers.openai.com/commerce/specs/file-upload/overview
- Ads product feeds: https://developers.openai.com/ads/product-feeds
- Ads Delta Feeds API: https://developers.openai.com/ads/delta-feeds
- Ads Manager help (403 khi fetch, chỉ đọc được qua snippet search): https://help.openai.com/en/articles/20001268-create-campaigns-from-product-feeds
- Bản ACP cũ (lỗi thời, KHÔNG dùng): https://agentic-commerce-protocol.com/docs/commerce/specs/feed

Google
- Product data spec: https://support.google.com/merchants/answer/7052112
- Shipping: https://support.google.com/merchants/answer/6324484
- GTIN: https://support.google.com/merchants/answer/6324461
- Mismatched price: https://support.google.com/merchants/answer/12159029
- Mismatched availability: https://support.google.com/merchants/answer/12470049
- Misrepresentation: https://support.google.com/merchants/answer/6150127
- Data quality disapprovals: https://support.google.com/merchants/answer/13693497

---

## 1. OpenAI ChatGPT product feed

### Đổi tên / thay đổi so với spec ACP 2025
- Cờ eligibility đổi tên: `enable_search` → **`is_eligible_search`**, `enable_checkout` → **`is_eligible_checkout`**. Tên cũ vẫn nhận làm alias, và **nếu có cả hai thì tên cũ `enable_*` thắng**. Đừng gửi cả hai.
- Cờ mới cho ads: **`is_ads_eligible`** (alias `is_eligible_ads`).
- `id`/`sku` → `item_id`; `item_group_id` → `group_id`; `return_window` → `return_deadline_in_days`; `Custom_variant1_category/option` → `variant_dict`.
- Spec ACP cũ: `enable_search` + `enable_checkout` là bắt buộc, `seller_name` tối đa 70 ký tự, `color` 40, `size` 20, gửi qua HTTPS push, refresh 15 phút. **Spec hiện hành đã bỏ những điểm đó.** Giờ là SFTP, full snapshot, ít nhất 1 lần/ngày.

### Cờ eligibility
| Flag | Default khi bỏ trống | Ghi chú |
|---|---|---|
| `is_eligible_search` | `true` | Đặt `false` thì gỡ item ngay. Khi là `false` thì checkout cũng tắt theo. |
| `is_eligible_checkout` | `false` | Cần `is_eligible_search=true`, integration checkout đã bật, và có `seller_privacy_policy` + `seller_tos`. |
| `is_ads_eligible` | `false` (feed tạo trong Ads Manager thì mặc định `true`, trừ khi item ghi rõ `false`) | Độc lập với search. |

Boolean: JSON `true`/`false`, hoặc chuỗi chữ thường `"true"`/`"false"` trong file delimited.

### Giá — format
`price` là **chuỗi** `"<amount> <ISO4217>"`, ví dụ `"79.99 USD"`. Dùng dấu chấm thập phân, không có dấu phân cách hàng nghìn, phải > 0, độ chính xác đúng theo tiền tệ. **Không** tách thành number + currency. `sale_price` cùng format, cùng currency, phải > 0 và nhỏ hơn hẳn `price`. `shipping_price` cùng format, cho phép ≥ 0.

### File / delivery / cadence
- Commerce (ChatGPT search/checkout): đẩy qua **SFTP** vào root dir, không cần file đánh dấu hoàn tất. Ưu tiên **parquet (zstd)**. Cũng nhận `jsonl.gz`, `csv.gz`, `tsv.gz`. Trang products liệt kê thêm `.jsonl/.csv/.tsv/.txt` không nén và `.txt.gz/.txt.gzip`. Encoding UTF-8.
- Mỗi shard tối đa 500k item và dưới ~500MB. Giữ tên shard cố định và ghi đè tại chỗ.
- Chỉ nhận **full snapshot**, không có delta. Cadence **ít nhất daily**. Chưa hỗ trợ thay đổi giá/tồn kho trong ngày.
- Item bị bỏ khỏi snapshot vẫn sống thêm **14 ngày**. Muốn gỡ ngay thì đặt `is_eligible_search=false`.
- Onboarding: gửi sample ~100 item đủ field required → QA bản full snapshot đầu tiên → bật tự động.
- Mỗi dòng là 1 variant mua được. CSV: cell chứa dấu phẩy, ngoặc kép hoặc xuống dòng thì bọc trong ngoặc kép. Object/array trong CSV thì serialize thành chuỗi JSON.
- Giá trị không biết thì bỏ trống, không ghi placeholder kiểu `null`/`n/a`. `unknown` chỉ hợp lệ khi spec cho phép (ví dụ `availability`).

### Ads Manager product feed (beta, ra 2026-06-02)
- **Cùng schema** với "OpenAI product file schema" ở trên, thêm một **Google-compatible profile** (cột `id, title, description, link, image_link, availability, price, brand`, …).
- Help center: 8 field bắt buộc mỗi dòng là `id, title, description, link, image_link, availability, price, brand`, tức là profile Google-compat, **không cần `seller_name`**.
- Format: `.csv` (dấu phẩy) hoặc `.txt/.tsv` (tab), UTF-8, có thể gzip (`.csv.gz`, `.tsv.gz`, `.txt.gz`, `.txt.gzip`). Cột viết thường, ngăn bằng gạch dưới.
- Cách nhập: upload CSV/TXT, **hosted URL** (HTTPS ổn định), hoặc SFTP. Item hết hạn sau 2 tuần, nên dùng hosted URL hoặc SFTP tự động. Cập nhật từng phần (price/availability/title) qua **Delta Feeds API** (riêng cho ads).
- Giới hạn số SKU: doc OpenAI không ghi. Các con số "tối thiểu 1.000 / tối đa 2 triệu" hay "1 triệu SKU" chỉ có ở bài báo bên thứ 3, **chưa verify**.
- Lỗi đã biết trên community: hosted URL dạng CSV có thể báo "Unable to save the hosted URL.", còn TSV thì chạy được.

### Bảng field: OpenAI format (native)
R = required, C = conditional, O = optional.

| Field | Req | Type | Ràng buộc |
|---|---|---|---|
| `item_id` | R | string | Unique theo variant, ổn định, không tái sử dụng. Giữ số 0 đứng đầu. Phải khác `group_id`. |
| `title` | R | string | ≤150 ký tự, plain text, có cả tên variant |
| `description` | R | string | ≤5000 ký tự, plain text |
| `url` | R | URL | http/https, public, ổn định, chọn sẵn variant |
| `brand` | R | string | Brand thật, không dùng placeholder |
| `seller_name` | R | string | Tên seller thật |
| `image_url` | R | URL | Link trực tiếp tới JPEG/PNG, public |
| `availability` | R | enum | `in_stock`, `out_of_stock`, `pre_order`, `backorder`, `unknown` |
| `price` | R | money string | `"79.99 USD"` |
| `group_id` | C | string | Bắt buộc khi `listing_has_variations=true`. Phải khác mọi `item_id`. |
| `listing_has_variations` | C | bool | Đặt `true` trên mọi dòng variant |
| `variant_dict` | C | object<string,string> | Ví dụ `{"color":"Black","size":"10"}`. Không được rỗng, không key/value rỗng. |
| `offer_id` | O | string | Unique, không nhúng giá vào ID |
| `gtin` | O | string | 8/12/13/14 chữ số, check digit hợp lệ, không có khoảng trắng hay gạch. Không tự bịa. |
| `mpn` | O | string | Gửi kèm `brand` |
| `condition` | O | enum | `new`, `refurbished`, `used` |
| `product_category` | O | string | Đường dẫn ngăn bằng `>` |
| `material` | O | string | |
| `color` | O | string | Khớp với ảnh và `variant_dict` |
| `size` | O | string | |
| `gender` | O | enum | `male`, `female`, `unisex` |
| `age_group` | O | enum | `newborn`, `infant`, `toddler`, `kids`, `adult` |
| `dimensions` | O | object | Có ít nhất 2 trong `length/width/height`, kèm `unit` ∈ `in, cm, ft, m, mm` |
| `length`/`width`/`height` | O | decimal string | > 0, cần `dimensions_unit` |
| `dimensions_unit` | C | enum | `in, cm, ft, m, mm` |
| `weight` | O | decimal string | > 0, cần `item_weight_unit` |
| `item_weight_unit` | C | enum | `g, kg, oz, lb` |
| `additional_image_urls` | O | array hoặc chuỗi phẩy | Dấu phẩy trong URL phải encode thành `%2C` |
| `sale_price` | O | money string | Nhỏ hơn hẳn `price`, cùng currency |
| `shipping_price` | O | money string | ≥ 0 |
| `shipping` | O | string | `country:region:service_class:price`, ví dụ `US::Standard:5.00 USD` |
| `accepts_returns` | O | bool | |
| `return_deadline_in_days` | O | int | > 0, chỉ dùng khi `accepts_returns=true` |
| `return_policy` | O | URL | |
| `review_count` | O | int | ≥ 0, chỉ tính review sản phẩm |
| `star_rating` | O | decimal string | Thang 0–5, 2 chữ số thập phân, đi kèm `review_count` > 0 |
| `store_review_count` | O | int | ≥ 0 |
| `store_star_rating` | O | decimal string | Thang 0–5, 2 chữ số thập phân |
| `seller_url` | O | URL | |
| `marketplace_seller` | C | string | Cần khi là marketplace. Phải khác `seller_name`. |
| `seller_privacy_policy` | C | URL | Bắt buộc nếu bật checkout |
| `seller_tos` | C | URL | Bắt buộc nếu bật checkout |
| `is_eligible_search` | O | bool | Default `true` |
| `is_eligible_checkout` | C | bool | Default `false` |
| `is_ads_eligible` | C | bool | Bắt buộc `true` thì mới chạy ads |
| `ads_metadata` | O | object<string,string> | Ví dụ `{"custom_label_0":"summer"}` |
| `is_digital` | O | bool | |
| `accepts_exchanges` | O | bool | |
| `target_countries` | O | string[] | ISO 3166-1 alpha-2, viết hoa |
| `store_country` | O | string | ISO 3166-1 alpha-2 |
| `size_system` | O | enum | `US, UK, EU, DE, FR, JP, CN, IT, BR, MEX, AU` |

Profile Google-compatible (dùng được cho cả commerce lẫn Ads Manager): `id, title(≤150), description(≤5000), link, image_link, availability (in_stock|out_of_stock|preorder|backorder — viết **`preorder`**, KHÔNG phải `pre_order`), price, brand` là R. Thêm `gtin`/`mpn` theo điều kiện, giống Google. Các field còn lại: `identifier_exists`, `availability_date` (bắt buộc khi preorder/backorder), `sale_price`, `sale_price_effective_date` (`start/end` ISO 8601), `expiration_date`, `additional_image_link`, `item_group_id`, `color`, `size`, `material`, `pattern`, `age_group`, `gender`, `size_type`, `size_system`, `condition`, `product_type`, `google_product_category`, `subscription_cost` (`month:12:30.00 USD`), `custom_label_0..4`.

---

## 2. Google Merchant Center: product data spec (US)

Format giá: `"15.00 USD"` (ISO 4217, dấu chấm thập phân). Ngày theo ISO 8601: `YYYY-MM-DDThh:mm[+hhmm]`. Tên attribute và giá trị enum viết bằng tiếng Anh, ngăn bằng gạch dưới.

| Field | Req (US) | Ràng buộc |
|---|---|---|
| `id` | R | ≤50 ký tự, unique, nên dùng SKU |
| `title` | R | ≤150 ký tự |
| `description` | R | ≤5000 ký tự, khớp với landing page |
| `link` | R | http/https, domain đã verify |
| `image_link` | R | URL ≤2000 ký tự. Định dạng JPEG/WebP/PNG/GIF/BMP/TIFF. Không có chữ quảng cáo, watermark, viền. **Kích thước tối thiểu 500×500 bắt đầu enforce từ 2027-01-31.** Ảnh do AI tạo phải có IPTC `DigitalSourceType`. |
| `availability` | R | `in_stock`, `out_of_stock`, `preorder`, `backorder` |
| `availability_date` | C | Bắt buộc khi `preorder`/`backorder` |
| `price` | R | `"15.00 USD"`, khớp với landing page |
| `brand` | R* | ≤70 ký tự. *Bắt buộc với mọi hàng new, trừ phim, sách, đĩa nhạc. |
| `gtin` | C | Bắt buộc nếu sản phẩm có GTIN do nhà sản xuất cấp. Tối đa 14 chữ số mỗi giá trị, field ≤50 ký tự. |
| `mpn` | C | ≤70 ký tự. Bắt buộc nếu không có GTIN. |
| `identifier_exists` | O | `yes`/`no`. Ghi `no` khi không có GTIN và không có brand+MPN. |
| `condition` | C | `new`, `refurbished`, `used`. Bắt buộc nếu là hàng used/refurbished. |
| `adult` | C | Bắt buộc nếu là nội dung người lớn |
| `google_product_category` | O | ID hoặc đường dẫn taxonomy |
| `product_type` | O | ≤750 ký tự |
| `item_group_id` | C | ≤50 ký tự. Bắt buộc cho variant (US) |
| `color` | C (apparel) | ≤100 ký tự (≤40 mỗi màu, ngăn bằng `/`). Không dùng mã hex hay 1 chữ cái. |
| `size` | C (clothing/shoes) | ≤100 ký tự |
| `gender` | C (apparel) | `male`, `female`, `unisex` |
| `age_group` | C (apparel) | `newborn`, `infant`, `toddler`, `kids`, `adult` |
| `material` | O | ≤200 ký tự |
| `pattern` | O | ≤100 ký tự |
| `size_type` | O | `regular`, `petite`, `maternity`, `big`, `tall`, `plus` |
| `size_system` | O | `US, UK, EU, DE, FR, JP, CN, IT, BR, MEX, AU` |
| `sale_price` | O | Cùng format với `price` |
| `additional_image_link` | O | Tối đa 10 link, mỗi URL ≤2000 ký tự |
| `mobile_link` | O | ≤2000 ký tự |
| `shipping` | R** | **Bắt buộc có chi phí ship ở US, khai ở account settings (tối đa 20 policy) HOẶC qua attribute.** Google khuyên dùng account settings, attribute chỉ là "last resort". Format `US:NY:6.49 USD`. Sub-attribute: `country` (R), `region`, `postal_code`, `service`, `price`, `min/max_handling_time`, `min/max_transit_time`. |
| `product_highlight` | O | ≤150 ký tự mỗi dòng, 2–100 dòng |
| `product_detail` | O | ≤100 mục |
| `custom_label_0..4` | O | ≤100 ký tự mỗi label |

Apparel ở US: bắt buộc thêm `color`, `gender`, `age_group`, cộng `size` (cho clothing/shoes) và `item_group_id` (khi có variant).

### 5 lý do disapproval phổ biến
Google không công bố bảng xếp hạng. Danh sách dưới đây là các lỗi được tài liệu Google nêu nhiều nhất.
1. **Mismatched price**: giá trong feed khác landing page, dẫn tới preemptive item disapproval (12159029).
2. **Mismatched availability**: tồn kho trong feed khác trên site (12470049).
3. **Incorrect / missing GTIN**: GTIN sai thì bị disapprove; có GTIN mà không gửi thì có thể bị disapprove (6324461).
4. **Image issues**: ảnh placeholder, chất lượng kém, có chữ quảng cáo hoặc watermark, ảnh thumbnail bị scale (7052112, 13693497).
5. **Landing page unavailable / misrepresentation**: link hỏng, robots.txt chặn Googlebot, redirect về trang chung, thông tin thiếu hoặc mâu thuẫn (12153802, 6150127).

Thêm (13693497): category hoặc variant attribute sai/thiếu (`item_group_id`, `color`, `size`).

---

## Machine-readable

```json
{
  "chatgpt": {
    "source": "https://developers.openai.com/commerce/specs/file-upload/products",
    "retrieved": "2026-10-01",
    "moneyFormat": "<amount> <ISO4217>",
    "fileFormats": ["parquet(zstd)", "jsonl.gz", "csv.gz", "tsv.gz"],
    "delivery": "sftp-full-snapshot",
    "cadence": "daily-min",
    "fields": [
      {"name": "item_id", "required": true, "aliases": ["id", "sku"]},
      {"name": "title", "required": true, "maxLen": 150},
      {"name": "description", "required": true, "maxLen": 5000},
      {"name": "url", "required": true, "format": "url"},
      {"name": "brand", "required": true},
      {"name": "seller_name", "required": true},
      {"name": "image_url", "required": true, "format": "url"},
      {"name": "availability", "required": true, "enum": ["in_stock", "out_of_stock", "pre_order", "backorder", "unknown"]},
      {"name": "price", "required": true, "format": "money"},
      {"name": "group_id", "required": false, "conditional": "listing_has_variations=true", "aliases": ["item_group_id"]},
      {"name": "listing_has_variations", "required": false, "format": "boolean", "conditional": "variants"},
      {"name": "variant_dict", "required": false, "format": "object<string,string>", "conditional": "listing_has_variations=true"},
      {"name": "offer_id", "required": false},
      {"name": "gtin", "required": false, "format": "digits{8|12|13|14}"},
      {"name": "mpn", "required": false},
      {"name": "condition", "required": false, "enum": ["new", "refurbished", "used"]},
      {"name": "product_category", "required": false, "format": "path '>'"},
      {"name": "material", "required": false},
      {"name": "color", "required": false},
      {"name": "size", "required": false},
      {"name": "gender", "required": false, "enum": ["male", "female", "unisex"]},
      {"name": "age_group", "required": false, "enum": ["newborn", "infant", "toddler", "kids", "adult"]},
      {"name": "dimensions", "required": false, "format": "object{length,width,height,unit}"},
      {"name": "length", "required": false, "format": "decimal"},
      {"name": "width", "required": false, "format": "decimal"},
      {"name": "height", "required": false, "format": "decimal"},
      {"name": "dimensions_unit", "required": false, "enum": ["in", "cm", "ft", "m", "mm"], "conditional": "length|width|height"},
      {"name": "weight", "required": false, "format": "decimal"},
      {"name": "item_weight_unit", "required": false, "enum": ["g", "kg", "oz", "lb"], "conditional": "weight"},
      {"name": "additional_image_urls", "required": false, "format": "url[]"},
      {"name": "sale_price", "required": false, "format": "money", "conditional": "< price, same currency"},
      {"name": "shipping_price", "required": false, "format": "money"},
      {"name": "shipping", "required": false, "format": "country:region:service_class:price"},
      {"name": "accepts_returns", "required": false, "format": "boolean"},
      {"name": "return_deadline_in_days", "required": false, "format": "int>0", "aliases": ["return_window"]},
      {"name": "return_policy", "required": false, "format": "url"},
      {"name": "review_count", "required": false, "format": "int>=0"},
      {"name": "star_rating", "required": false, "format": "decimal 0-5, 2dp"},
      {"name": "store_review_count", "required": false, "format": "int>=0"},
      {"name": "store_star_rating", "required": false, "format": "decimal 0-5, 2dp"},
      {"name": "seller_url", "required": false, "format": "url"},
      {"name": "marketplace_seller", "required": false, "conditional": "marketplace"},
      {"name": "seller_privacy_policy", "required": false, "format": "url", "conditional": "is_eligible_checkout=true"},
      {"name": "seller_tos", "required": false, "format": "url", "conditional": "is_eligible_checkout=true"},
      {"name": "is_eligible_search", "required": false, "format": "boolean", "default": true, "aliases": ["enable_search"]},
      {"name": "is_eligible_checkout", "required": false, "format": "boolean", "default": false, "aliases": ["enable_checkout"], "conditional": "is_eligible_search=true"},
      {"name": "is_ads_eligible", "required": false, "format": "boolean", "default": false, "aliases": ["is_eligible_ads"], "conditional": "ads"},
      {"name": "ads_metadata", "required": false, "format": "object<string,string>"},
      {"name": "is_digital", "required": false, "format": "boolean"},
      {"name": "accepts_exchanges", "required": false, "format": "boolean"},
      {"name": "target_countries", "required": false, "format": "ISO3166-1 alpha-2[]"},
      {"name": "store_country", "required": false, "format": "ISO3166-1 alpha-2"},
      {"name": "size_system", "required": false, "enum": ["US", "UK", "EU", "DE", "FR", "JP", "CN", "IT", "BR", "MEX", "AU"]}
    ]
  },
  "chatgpt_ads_google_profile": {
    "source": "https://developers.openai.com/ads/product-feeds",
    "fileFormats": ["csv", "tsv", "txt", "csv.gz", "tsv.gz", "txt.gz", "txt.gzip"],
    "delivery": ["upload", "hosted_url", "sftp", "delta_api"],
    "fields": [
      {"name": "id", "required": true},
      {"name": "title", "required": true, "maxLen": 150},
      {"name": "description", "required": true, "maxLen": 5000},
      {"name": "link", "required": true, "format": "url"},
      {"name": "image_link", "required": true, "format": "url"},
      {"name": "availability", "required": true, "enum": ["in_stock", "out_of_stock", "preorder", "backorder"]},
      {"name": "price", "required": true, "format": "money"},
      {"name": "brand", "required": true},
      {"name": "gtin", "required": false, "conditional": "unless identifier_exists=no"},
      {"name": "mpn", "required": false, "conditional": "no gtin and identifier_exists!=no"},
      {"name": "identifier_exists", "required": false, "enum": ["yes", "no", "true", "false"]},
      {"name": "availability_date", "required": false, "format": "ISO8601", "conditional": "preorder|backorder"},
      {"name": "item_group_id", "required": false, "conditional": "variants"},
      {"name": "is_ads_eligible", "required": false, "format": "boolean", "default": true}
    ]
  },
  "google": {
    "source": "https://support.google.com/merchants/answer/7052112",
    "retrieved": "2026-10-01",
    "moneyFormat": "<amount> <ISO4217>",
    "fields": [
      {"name": "id", "required": true, "maxLen": 50},
      {"name": "title", "required": true, "maxLen": 150},
      {"name": "description", "required": true, "maxLen": 5000},
      {"name": "link", "required": true, "format": "url"},
      {"name": "image_link", "required": true, "maxLen": 2000, "format": "url"},
      {"name": "availability", "required": true, "enum": ["in_stock", "out_of_stock", "preorder", "backorder"]},
      {"name": "availability_date", "required": false, "format": "ISO8601", "conditional": "preorder|backorder"},
      {"name": "price", "required": true, "format": "money"},
      {"name": "brand", "required": true, "maxLen": 70, "conditional": "new products except movies/books/music"},
      {"name": "gtin", "required": false, "maxLen": 50, "format": "digits<=14", "conditional": "if manufacturer-assigned"},
      {"name": "mpn", "required": false, "maxLen": 70, "conditional": "if no gtin"},
      {"name": "identifier_exists", "required": false, "enum": ["yes", "no"]},
      {"name": "condition", "required": false, "enum": ["new", "refurbished", "used"], "conditional": "used|refurbished"},
      {"name": "adult", "required": false, "format": "boolean", "conditional": "adult content"},
      {"name": "google_product_category", "required": false},
      {"name": "product_type", "required": false, "maxLen": 750},
      {"name": "item_group_id", "required": false, "maxLen": 50, "conditional": "variants (US)"},
      {"name": "color", "required": false, "maxLen": 100, "conditional": "apparel (US)"},
      {"name": "size", "required": false, "maxLen": 100, "conditional": "clothing/shoes (US)"},
      {"name": "gender", "required": false, "enum": ["male", "female", "unisex"], "conditional": "apparel (US)"},
      {"name": "age_group", "required": false, "enum": ["newborn", "infant", "toddler", "kids", "adult"], "conditional": "apparel (US)"},
      {"name": "material", "required": false, "maxLen": 200},
      {"name": "pattern", "required": false, "maxLen": 100},
      {"name": "size_type", "required": false, "enum": ["regular", "petite", "maternity", "big", "tall", "plus"]},
      {"name": "size_system", "required": false, "enum": ["US", "UK", "EU", "DE", "FR", "JP", "CN", "IT", "BR", "MEX", "AU"]},
      {"name": "sale_price", "required": false, "format": "money"},
      {"name": "additional_image_link", "required": false, "maxLen": 2000, "format": "url, max 10"},
      {"name": "mobile_link", "required": false, "maxLen": 2000, "format": "url"},
      {"name": "shipping", "required": false, "format": "country:region:service:price", "conditional": "US requires shipping cost via account settings OR this attribute"},
      {"name": "product_highlight", "required": false, "maxLen": 150},
      {"name": "custom_label_0", "required": false, "maxLen": 100},
      {"name": "custom_label_1", "required": false, "maxLen": 100},
      {"name": "custom_label_2", "required": false, "maxLen": 100},
      {"name": "custom_label_3", "required": false, "maxLen": 100},
      {"name": "custom_label_4", "required": false, "maxLen": 100}
    ]
  }
}
```
