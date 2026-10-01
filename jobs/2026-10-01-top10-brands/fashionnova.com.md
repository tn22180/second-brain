# fashionnova.com (Tranco #11691)
| Check | Result |
|---|---|
| 1. Stack | **Headless Hydrogen/Oxygen** — header `powered-by: Shopify, Oxygen, Hydrogen`, asset `cdn.shopify.com/oxygen-v2/...`; không có `Shopify.theme`. Cloudflare trước Oxygen |
| 2. Apps | Algolia (search/filter, `algolia_filters_*`), Yotpo (reviews + UGC `yotpo.com/go/*`), Attentive (SMS, `undgb.fashionnova.com` first-party), Klaviyo, Nosto, Optimizely, TikTok/Pinterest pixel, GTM, Afterpay/Klarna/Zip. Không thấy app SEO/image/speed nào — SEO tự build trong Hydrogen |
| 3a. Home `/` | title 57 "Fashion Nova \| Trendy Clothes for Women, Men & Plus Sizes"; desc 156; canonical self; hreflang 3 (en/es/x-default); H1 1 = "Shop By Brand"; OG title/desc/image (không og:url/type), 0 twitter:*; JSON-LD: Organization (+PostalAddress, ContactPoint). **Không WebSite/SearchAction** |
| 3b. Collection `/collections/dresses` | title 54; desc 144; canonical self; hreflang 3; H1 1 "Women's Dresses"; OG 3 tag; JSON-LD: CollectionPage + **ItemList 60 Product** (Brand, AggregateOffer) + BreadcrumbList + Organization — valid |
| 3c. Product `/products/zoey-feathered-sequin-mini-dress` | title 47; desc 152; canonical self; hreflang 3; H1 1 = tên SP; OG 8 tag (có og:image w/h); JSON-LD valid: **ProductGroup** + 34 variant Product/Offer/SizeSpecification, PeopleAudience, **AggregateRating 4.21/383**, BreadcrumbList. Thiếu: sku/gtin ở group, Review, Offer không có itemCondition/shippingDetails/hasMerchantReturnPolicy |
| 4. robots.txt | Customized nặng (~60 Disallow thêm: filter/sort/tags=ColorFam/price/size, `*.data`, `/api/`). AI bots: **không rule riêng** cho GPTBot/ClaudeBot/PerplexityBot/Google-Extended/CCBot → allowed theo `*`. Chặn Nutch toàn site |
| 5. llms.txt | `/llms.txt` 200 (5.5KB, hand-written, list hub/category links: "# LLMs.txt - Fashion Nova ... Primary shopping hubs"). `/llms-full.txt` **404** |
| 6. sitemap.xml | Custom Hydrogen index, 22 child (1 products.xml, 18 collections, pages, otherPages, blogs). `products.xml` 1 file **41,438 URL**, không lastmod/image |
| 7. Images (product) | 75 `<img>`, alt non-empty 68% (24 thiếu = swatch 32px `alt=""`); 100% có `width=` param + srcset; lazy 31/75; fetchpriority 54; src .jpg/.webp, CDN trả `image/webp` theo Accept |
| 8. Blog | Không dùng Shopify blog: `/blogs/` → redirect home; blog custom `/blog`, sitemap 24 post (+6 category); post mới nhất trên listing Sep 18, 2026; lastmod sitemap = thời điểm generate (vô nghĩa) |
| 9. PageSpeed | **PSI rate-limited** (429 "Queries per day" quota) |
## Notable
- Hydrogen nhưng SEO nền rất đầy đủ: canonical self + hreflang en/es trên cả 3 page, H1 đúng 1/page.
- Product schema tốt hơn Liquid default: ProductGroup + 34 variant + AggregateRating 4.21/383 (Yotpo) → đủ điều kiện rich result sao/variant.
- Collection có ItemList 60 Product + AggregateOffer — hiếm thấy ở Shopify.
- Home không có WebSite+SearchAction, H1 home là "Shop By Brand" (không keyword), không có twitter card ở mọi page.
- Có llms.txt viết tay nhưng chỉ là danh sách link category; không llms-full.txt; không chặn/không cấu hình AI bot nào.
- Sitemap products 41k URL trong 1 file không lastmod — crawler không biết page nào đổi.
## Gaps our apps could fill
- Home thiếu WebSite+SearchAction; Offer thiếu shippingDetails/hasMerchantReturnPolicy/itemCondition; group thiếu gtin/sku → meta/schema app.
- `/llms-full.txt` 404, llms.txt chỉ là link list không có mô tả sản phẩm/policy → AEO app.
- 32% ảnh product page `alt=""` (swatch) + 0 twitter:* tag → image optimizer (alt) / meta app.
- Sitemap không lastmod, blog sitemap lastmod giả → SEO app sitemap.
