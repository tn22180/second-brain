# ohpolly.com (Tranco #61082)
| Check | Result |
|---|---|
| 1. Stack | Liquid, custom theme: `Shopify.theme` name "Oh Polly UK by BAO - 2026", schema_name "By Association Only" v1.0.0 (agency BAO), theme_store_id null. `powered-by: Shopify`, Cloudflare, 103 Early Hints. Không headless. |
| 2. Apps | App blocks: Okendo (reviews), Nosto (search + recs, search.nosto.com), Bloomreach Loomi (tracking). Extensions: Rivo loyalty, Swym wishlist, Loop Returns, Order Deadline. Khác: Trustpilot widget, Usercentrics CMP, Ada support chat, GTM, Hotjar, Global-e, Purple Dot (preorder), Zoa rental, Klarna/Clearpay/Afterpay, Rakuten, Signifyd. **Không app SEO/image/speed nào.** |
| 3a. Home | title "Oh Polly Official Site │ Elevate Every Occasion\n– Oh Polly UK" (61, **có newline**); desc 202 (**>160**); canonical self; hreflang 9; H1 = 1 "Oh Polly UK"; OG đủ (9) + 4 twitter; JSON-LD: Organization + WebSite + SearchAction. |
| 3b. Collection `/collections/wedding-guest-dresses` | title 59; desc 189 (>160); canonical self; hreflang 9; H1 = 1 "Best-Dressed Guest"; OG đủ; JSON-LD **0 block** (không ItemList/BreadcrumbList). Grid render client-side (Nosto) — HTML chỉ có ~4 product link. |
| 3c. Product `/products/ortega-sheer-cut-out-lace-midi-dress-in-black` | title "Ortega Sheer Cut-Out Lace Midi Dress in Black \| Oh Polly\n– Oh Polly UK" (70, **brand lặp 2 lần + newline**); desc 156; canonical self; hreflang 9; H1 = 1 "Lace Cut-Out Sheer Midi Dress in Black" (≠ product title); OG đủ + og:price. JSON-LD parse OK nhưng **2 entity trùng**: ProductGroup (aggregateRating, `hasVariant` = 0 → ProductGroup không hợp lệ) + Product (sku, 8 Offer, AggregateRating 5.0/3). Không Review, không BreadcrumbList, không gtin. |
| 4. robots.txt | **Shopify default** (bản 2026 UCP, giống hệt glossier trừ domain/shop id). Không rule AI bot → GPTBot/ClaudeBot/PerplexityBot/Google-Extended/CCBot **allowed**. |
| 5. llms.txt | `/llms.txt` 200 (4503B), `/llms-full.txt` 200 (4508B) — cả hai **template Shopify tự sinh** "# Agent Instructions — Oh Polly UK", không nội dung brand. |
| 6. sitemap.xml | 8 child: products ×4, pages 1, collections 1, blogs 1, agentic_discovery 1. Product URL: 710+989+999+965 = **3663**. |
| 7. Images (product) | 126 `<img>`: 86 SVG icon (alt="" — decorative, OK) + 40 ảnh `cdn/shop` .jpg; alt non-empty **13/126 (10%)**, ảnh thật **13/40 (33%)**; 8 ảnh gallery alt = y hệt H1, 1 alt là filename (`oh-polly-swim-estay-…_6.jpg`). `loading=lazy` 125/126, srcset 126/126, width attr 126, fetchpriority 44, `&width=` param (Shopify CDN tự negotiate webp/avif), không `<picture>`. |
| 8. Blog | `/blogs/news` có trong sitemap nhưng blogs_1 chỉ 1 URL (blog index), lastmod **2023-02-24** → **0 bài**. |
| 9. PageSpeed | **PSI rate-limited** (429 "Queries per day" quota). |

## Notable
- Title template lỗi: có `\n` bên trong `<title>` và brand lặp ("\| Oh Polly – Oh Polly UK"), product title 70 ký tự.
- Product JSON-LD bị emit 2 lần (ProductGroup + Product) mà ProductGroup không có hasVariant/variesBy → schema trùng lặp + ProductGroup invalid theo Google spec variants.
- Làm tốt: AggregateRating từ Okendo có trong Product, 8 Offer có sku/availability; home có WebSite+SearchAction; lazy/srcset/width chuẩn, fetchpriority dùng.
- Meta description home 202, collection 189 → bị cắt trên SERP.
- Collection grid render client-side qua Nosto → HTML thô gần như không có product link, 0 ItemList/BreadcrumbList cho crawler/LLM.
- AEO/content: 0 bài blog với ~3663 product; llms.txt chỉ template Shopify.

## Gaps our apps could fill
- Image alt: chỉ 13/40 ảnh sản phẩm (33%) có alt, gallery alt copy nguyên H1, 1 alt là filename → AI alt-text riêng từng ảnh.
- Schema: gộp ProductGroup/Product thành 1 entity đúng spec (hasVariant + variesBy), thêm BreadcrumbList + ItemList ở collection, thêm Review.
- Meta: sửa title template (newline, brand lặp), cắt desc home/collection về ≤160.
- Blog + llms.txt: 0 bài blog, llms.txt template → AI blog + llms.txt sinh từ catalog 3663 SP.
