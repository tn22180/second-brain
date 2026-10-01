# jbhifi.com.au (Tranco #12923)
| Check | Result |
|---|---|
| 1. Stack | **Liquid theme custom**: `Shopify.theme` name "v2026.09.29.1", schema_name "JB Hi-Fi", theme_store_id null. Header `powered-by: Shopify`; robots ghi "served using Cloudflare Workers". Nội dung listing/gallery render bằng JS (SSR gần như không có `<img>`) |
| 2. Apps | Klaviyo (`static.klaviyo.com`), Optimizely (`cdn.optimizely.com`), instant.page, Algolia (search/facets, robots có `hPP/idx/dFR`), Criteo, GTM, Segment, FB pixel, Afterpay/Zip. Theme có key rating okendo/Yotpo/Loox (không xác định được source review nào đang active). Không thấy app SEO/image/speed |
| 3a. Home `/` | title 58 "JB Hi-Fi - Australia's Largest Home Entertainment Retailer"; desc 144; canonical self; hreflang 0; **H1 0**; OG 9 tag + 4 twitter; JSON-LD: WebSite + SearchAction. **Không Organization** |
| 3b. Collection `/collections/tvs` | title 70 (dài); desc 150; canonical self; hreflang 0; H1 1 "TVs & Home Theatre"; OG 9 + twitter 4; JSON-LD chỉ BreadcrumbList. **Không ItemList**; SSR HTML chỉ 6 ref `/products/` → grid SP render client-side |
| 3c. Product `/products/tcl-75-p7ls-qled-4k-uhd-google-tv-with-gemini-2026` | title 64; desc 115 (boilerplate "keep the competition on their toes..."); canonical self; hreflang 0; H1 1 = tên SP; OG 9 (có og:price) + twitter 4; JSON-LD valid: Product (sku, **gtin**, 67 PropertyValue spec), Offer (itemCondition, UnitPriceSpecification, **WarrantyPromise**), AggregateRating 4.9/10, BreadcrumbList. Không Review riêng, không shippingDetails/return policy |
| 4. robots.txt | Customized (Algolia param `hPP/idx/dFR/queryID`, `/pages/sku/*`, `/*.atom$`, gift-card/extra-care, thêm `sitemap-subcollections.xml`). AI bots: **không rule riêng** GPTBot/ClaudeBot/PerplexityBot/Google-Extended/CCBot → allowed. Chặn Nutch |
| 5. llms.txt | `/llms.txt` 200 (6KB, custom: "# llms.txt for JB Hi-Fi", Brand + Section /collections /products /blogs /pages + key collections). `/llms-full.txt` 200 (4KB) = Shopify agent doc: "# Agent Instructions — JB Hi-Fi", UCP `/.well-known/ucp`, Shop skill. Sitemap có `sitemap_agentic_discovery.xml` → `/agents.md` |
| 6. sitemap.xml | Shopify index, 117 child: 105 products, 6 collections, 4 blogs, 1 pages, 1 agentic. `sitemap_products_1` = 1,001 URL → ước ~105k product URL |
| 7. Images (product) | SSR chỉ **2 `<img>`** (1 ảnh SP `width=480` .jpg, 1 FB pixel); alt 1/2 (50%, cái thiếu là pixel); lazy 0; gallery thật load bằng JS → Googlebot phải render mới thấy ảnh |
| 8. Blog | Shopify `/blogs/` có: 4 blog sitemap ~3,693 URL (tech 387, games 344, guides-tips 267, competitions 212, movies-tv-show 162 trong file 1+4). Post mới nhất lastmod 2026-09-30 ("7-must-have-gaming-pickups-for-september-2026") |
| 9. PageSpeed | **PSI rate-limited** (429 "Queries per day" quota) |
## Notable
- Đi đầu AEO trong Shopify: llms.txt custom + llms-full.txt/agents.md + UCP `/.well-known/ucp` + sitemap agentic riêng.
- Product schema giàu: gtin, 67 PropertyValue spec, WarrantyPromise, UnitPriceSpecification — mẫu tốt cho electronics.
- Content engine lớn: ~3.7k blog URL, cập nhật hằng ngày.
- Home 0 H1, không Organization schema; collection chỉ có Breadcrumb, không ItemList.
- Listing + gallery render client-side: SSR collection không có grid, product page SSR chỉ 1 ảnh SP → phụ thuộc Google render JS; AI crawler không chạy JS (GPTBot/ClaudeBot) gần như không thấy ảnh/list.
- Meta description product là boilerplate chung ("With TCL keep the competition on their toes...", 115 ký tự).
## Gaps our apps could fill
- Home 0 H1 + không Organization; collection không ItemList → meta/schema app.
- Meta description product boilerplate/template → AI meta generator (bulk rewrite ~105k SP).
- Ảnh SP không có trong SSR HTML (2 `<img>`, 0 lazy/srcset) → image optimizer / SSR image + image sitemap.
- Không Review/shippingDetails/hasMerchantReturnPolicy trong Product JSON-LD → schema app.
