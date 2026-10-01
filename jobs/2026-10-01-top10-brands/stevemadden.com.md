# stevemadden.com (Tranco #32546)
| Check | Result |
|---|---|
| 1. Stack | Liquid theme. `Shopify.theme` name "monorepo-ecom/SM - Production", schema Dawn 13.0.0 (custom fork, theme_store_id null). `powered-by: Shopify`, Cloudflare. Header `rel="ucp"` (Shopify UCP 2026-08-25) |
| 2. Apps | Reviews: Yotpo (576 hit trên PDP). Search/merch: Algolia + Fast Simon. Klaviyo, Attentive, Gorgias, Swym (wishlist), Stylitics, AB Tasty, Narvar, Lucky Labs, Fenix Commerce, ShopMy, OneTrust, Afterpay/Klarna/Kueski/Amazon Pay. **SEO/image/speed app: không thấy** — JSON-LD tự viết trong theme |
| 3a. Home | title 58c "Steve Madden® Official Site \| Free Shipping on orders $75+"; desc 123c; canonical `href="/"` (relative); hreflang 0; H1 ×1 = logo wrapper, text rỗng; OG thiếu og:image; JSON-LD: Organization, WebSite+SearchAction, BreadcrumbList |
| 3b. Collection `/collections/womens-sneakers` | title 59c; desc 132c; canonical self; hreflang 0; **H1 ×7** ("SNEAKERS", "WOMEN'S - SNEAKERS", "Women's Sneakers"…); OG thiếu og:image; JSON-LD: ItemList + 15 Product/Offer, 13 AggregateRating, BreadcrumbList, Organization |
| 3c. Product `/products/mavis-black-suede` | title 65c (có `\n` trong title); **desc 356c** (bị cắt SERP); canonical self; hreflang 0; **H1 ×6** ("Mavis Black Suede", "Holiday Gift Guide", "Subscribed Successfully"…); OG đủ + og:price; JSON-LD parse OK: Product + Brand + AggregateRating(4.8/218) + 15 Offer (gtin12, mpn, UnitPriceSpecification) + BreadcrumbList. **Không có Review**; property lạ `q_and_a` (không phải schema.org) chứa Q&A |
| 4. robots.txt | Custom (robots.txt.liquid: `Allow: /` đầu, Allow `/products/account`…, Disallow `/21708465`, `/sf_*`). **0 rule AI bot** → GPTBot/ClaudeBot/PerplexityBot/Google-Extended/CCBot đều allowed qua `*` |
| 5. llms.txt | `/llms.txt` 200 (4533B), `/llms-full.txt` 200 (4538B) — cả 2 là template Shopify tự sinh "# Agent Instructions — Steve Madden", đẩy `shop.app/SKILL.md`; không có nội dung brand/catalog. Sitemap có `sitemap_agentic_discovery.xml` → `/agents.md` |
| 6. sitemap.xml | 8 child: products ×3, pages, collections, blogs, metaobject_pages, agentic_discovery. products_1 = 1001 url, products_3 = 443 → ~2.4k product (products_2 chưa fetch, giả định ~1000) |
| 7. Img PDP | 41 `<img>` (~6 là JS template), alt non-empty 24/41 = **59%**; lazy 23/41; `width=` param 14/41; srcset 13/41; ext jpg 25 / png 6, **0 `format=` param, 0 `<source type=image/webp>`** (Shopify CDN tự negotiate theo Accept). Megamenu img alt rỗng |
| 8. Blog | Có, 5 blog (news, must-haves, trends, size-fit-guides, shoe-reviews-guides), **10 bài** tổng; lastmod mới nhất 2026-09-24 (trends/tabi-boots…) |
| 9. PageSpeed | PSI rate-limited (429 "Queries per day" quota) |

## Notable
- PDP JSON-LD tốt hơn mặc định: gtin12 + mpn + 15 Offer/variant + AggregateRating 4.8/218 (Yotpo) — nhưng tự code trong theme, không app.
- Q&A AEO-ready nhưng đặt sai: `q_and_a` là key custom trong Product JSON-LD → Google/LLM không hiểu; lẽ ra là FAQPage/Question.
- H1 hỗn loạn: PDP 6 H1, collection 7 H1, home H1 rỗng (logo).
- Home canonical relative `/`, home + collection thiếu og:image → share preview trống.
- PDP meta description 356c (gấp ~2x giới hạn SERP ~155c), title chứa newline.
- Blog gần như bỏ hoang: 10 bài / 5 blog cho brand ~2.4k SKU.

## Gaps our apps could fill
- Schema: map `q_and_a` → FAQPage; thêm Review (hiện 0 Review node dù có 218 review); og:image cho home/collection.
- Meta/H1 audit: desc 356c trên PDP, H1 ×6–7/trang, canonical relative.
- Image: alt 59% trên PDP (megamenu img alt rỗng) — auto alt-text.
- Blog/AEO: 10 bài tổng + llms.txt chỉ là template Shopify → AI blog + llms.txt có nội dung catalog/brand.
