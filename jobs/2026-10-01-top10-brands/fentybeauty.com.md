# fentybeauty.com (Tranco #42347)
| Check | Result |
|---|---|
| 1. Stack | Liquid theme. `Shopify.theme` name "9/29 - 10/1 Mini Puffer Bag on $80+" (theme theo campaign, id 188634267693), schema "Fenty Theme" 1.8.0 custom. `powered-by: Shopify`, Cloudflare; www → apex 301. Header `rel="ucp"` |
| 2. Apps | Reviews: Yotpo (842 hit PDP). Search: Searchspring. Klaviyo, Gorgias, Tolstoy (video), Ordergroove (subscription), Rivo (loyalty), Clarip (consent), Kendo Brands, GTM, Klarna/Afterpay/Square. **Speed app: Yottaa** (`rapid-cdn.yottaa.com` preload trong Early Hints 103). SEO/image app: không thấy |
| 3a. Home | title 40c "Fenty Beauty by Rihanna \| Beauty for All"; **desc 255c**; canonical self; hreflang 192; H1 ×1 = SVG logo (không text); OG đủ + og:image; JSON-LD: WebSite+SearchAction, Organization |
| 3b. Collection `/collections/new-best-sellers` | title 46c; desc 133c; canonical self; hreflang 192; **H1 ×0**; OG đủ; JSON-LD: CollectionPage + 50 Product/Brand/Offer + 36 AggregateRating + BreadcrumbList + Organization |
| 3c. Product `/products/invisimatte-instant-setting-blotting-powder` | title 60c; desc 140c; canonical self; hreflang 192; H1 ×1 đúng tên SP; OG đủ + og:price (thiếu og:image:width/height); JSON-LD parse OK: Product + Brand + AggregateRating + 3 Offer + BreadcrumbList + Organization. **Không có Review, không FAQPage** |
| 4. robots.txt | Custom nặng (415 dòng): rule riêng Googlebot, AhrefsBot, MJ12bot, Pinterest, Nutch, chặn `*yoReviewsPage=`, `*.atom`. Block "Explicit AI bot allow directives" `Allow: /` cho 23 UA: GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, CCBot, Bytespider, Grok, DeepSeek, Amazonbot… → **tất cả allowed** |
| 5. llms.txt | `/llms.txt` 200 (4505B), `/llms-full.txt` 200 (4510B) — template Shopify tự sinh "# Agent Instructions — Fenty Beauty" (shop.app SKILL.md), không nội dung brand. Có `sitemap_agentic_discovery.xml` |
| 6. sitemap.xml | **951 child** = 6 root + 189 locale folder (`/en-ad/`…) × 5. Root: products_1 = 891 url, products_2 = 35 → ~925 product |
| 7. Img PDP | 239 `<img>`, alt non-empty 212/239 = **89%**; lazy 234/239 (98%); `width=` 238/239; srcset 238; format: webp 231, svg 4, pjpg 3 (`format=webp` qua Shopify CDN) |
| 8. Blog | Có, 1 blog `the-fenty-blog`, **14 bài**; lastmod mới nhất 2026-09-28 (moisturizer-with-spf…) — đang ra bài đều tháng 9 |
| 9. PageSpeed | PSI rate-limited (429 "Queries per day" quota) |

## Notable
- AEO chủ động nhất: robots.txt explicit allow 23 AI crawler (kể cả OAI-SearchBot, Claude-SearchBot, Google-Extended) — hiếm thấy ở brand lớn.
- Image pipeline chuẩn: 98% lazy, 99% có width + srcset, webp qua `format=webp`, alt 89%.
- i18n mạnh: 192 hreflang/trang, 189 locale sitemap folder.
- Heading yếu: collection 0 H1, home H1 chỉ là SVG logo.
- 415 dòng robots nhưng llms.txt vẫn là template Shopify — đầu tư AI crawler access mà không cung cấp nội dung cho LLM.
- Blog nhỏ (14 bài) nhưng chủ đề how-to/buying-guide đúng intent AEO, cập nhật 2026-09.

## Gaps our apps could fill
- Schema: Product có AggregateRating nhưng 0 Review node, 0 FAQPage trên PDP; collection 0 H1.
- llms.txt: chỉ là template Shopify (shop.app upsell) → llms.txt/llms-full.txt có catalog + shade guide + blog.
- Meta: home desc 255c; 11% img PDP thiếu alt (27/239).
- Blog scale: 14 bài cho ~925 SP — AI blog theo product/shade query.
