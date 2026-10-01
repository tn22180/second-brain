# skims.com (Tranco #29347)
| Check | Result |
|---|---|
| 1. Stack | Headless Hydrogen/Oxygen (`powered-by: Shopify, Oxygen`, server cloudflare). Không có `Shopify.theme`. CMS = Sanity (`skims-sanity.imgix.net`), ảnh qua imgix. Geo-redirect theo IP: `/` → 302 `/en-vn` (audit từ VN nên mọi page là `/en-vn/...`, giá VND) |
| 2. Apps | Okendo (reviews, `d3hw6dc1ow8pp2.cloudfront.net/reviews-widget-plus`), Klaviyo, Attentive, Braze, Algolia (search), Dynamic Yield (personalization), Global-e, Klarna, Afterpay, Singular, Segment, Quantum Metric, OneTrust, Loop, Pinpoint (careers). Không thấy app SEO/image/speed nào — ảnh tối ưu bằng imgix `auto=format,compress` |
| 3a. Home | title 32 "SKIMS \| Solutions For Every Body"; desc 104; canonical self (`/en-vn`); hreflang 8; H1 1 = "BEST SELLERS"; OG title/desc/url (không og:image, không twitter:*); JSON-LD: Organization(sameAs 7, logo, ContactPoint, founder Person), WebPage. Không WebSite+SearchAction |
| 3b. Collection `/collections/shapewear` | title 62; desc 130; canonical self; hreflang 8; H1 1 "Women's Shapewear"; OG 3 tag; JSON-LD: CollectionPage, ItemList, BreadcrumbList(14 ListItem), Organization |
| 3c. PDP `/products/cotton-rib-long-sleeve-t-shirt-marble` | title 47; desc 148; canonical self; hreflang 20; H1 1; OG đủ (og:image + alt/width/height); JSON-LD valid (python json OK): ProductGroup(variesBy, productGroupID) + 9 Product variant (gtin, mpn, sku) + 9 Offer(availability, price, UnitPriceSpecification) + AggregateRating 4.6/208 + BreadcrumbList. Không có Review node, không FAQPage |
| 4. robots.txt | 18 KB, base Shopify default + rule custom (`Allow: /search/`, `Disallow: *//collections*`, `*anchor*anchor`, `*hash*hash`, `/*cursor=*`). AI bot: 0 rule cho GPTBot/ClaudeBot/PerplexityBot/Google-Extended/CCBot → allowed qua `*` |
| 5. llms.txt | `/llms.txt` 404, `/llms-full.txt` 404 (trả trang 404 HTML ~450 KB) |
| 6. sitemap.xml | Custom index (không phải Shopify `sitemap_products_1.xml`), 4 child: pages, products (3753 URL), collections (361), blog (73) |
| 7. Images PDP | 21 `<img>` SSR; 13/21 alt non-empty (62%), 8 `alt=""`; lazy 14/21; srcset 13; format: webp 8, svg 8, jpg 2 (imgix `auto=format` 18/21); width param 8/21. Alt ảnh sản phẩm lộ metadata crop: "…MARBLE ON A MODEL FRONT VIEW @ \| FOCUS: 0.0, 1.0, 0.9" |
| 8. Blog | Có: `/blogs/solutions` (72 URL) + `/blogs/tv` (1). Lastmod mới nhất 2026-05-07 → ~5 tháng không đăng |
| 9. PageSpeed | PSI rate-limited (429, quota "Queries per day" của key chung) |

## Notable
- Product schema tốt nhất nhóm: ProductGroup + 9 variant có gtin/mpn/sku/Offer + AggregateRating 4.6 (208) — đủ điều kiện Merchant listing rich result.
- Alt text lỗi pipeline: PDP alt = "COTTON RIB LONG SLEEVE T-SHIRT \| MARBLE ON A MODEL FRONT VIEW @ \| FOCUS: 0.0, 1.0, 0.9" — metadata focal-point của CMS rò thẳng vào alt; thêm 8/21 ảnh `alt=""`.
- hreflang lệch: home/collection 8 locale, PDP 20; canonical `/en-vn` nhưng `en-VN` không có trong cluster hreflang → trang locale tự canonical mà không nằm trong set alternate.
- Geo-redirect 302 cứng theo IP ở `/` (cả `?country=US`, `Accept-Language: en-US` vẫn về `/en-vn`) — crawler không ở US thấy bản locale; Offer.url trỏ root `/products/...` trong khi canonical là `/en-vn/...`.
- H1 home = "BEST SELLERS" (không chứa brand/keyword); không WebSite+SearchAction; không twitter:card; home không og:image.
- Blog đứng từ 2026-05-07, 72 bài dạng "solutions" (FAQ-style) nhưng không có FAQPage schema.

## Gaps our apps could fill
- Không có llms.txt / llms-full.txt (404) dù 3753 product + 72 bài blog — AEO app sinh được ngay.
- Alt ảnh: 38% `alt=""` trên PDP + alt chứa rác "@ \| FOCUS: …" → image optimizer / AI alt rewrite.
- Thiếu WebSite+SearchAction, FAQPage cho blog "solutions", Review node (chỉ có AggregateRating) → SEO schema app.
- Blog đứng 5 tháng → blog app (AI post) để giữ nhịp.
