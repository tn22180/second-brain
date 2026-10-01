# wearfigs.com (Tranco #32076)
| Check | Result |
|---|---|
| 1. Stack | Headless custom: Next.js App Router (`x-powered-by: Next.js`, RSC `self.__next_f`, không `__NEXT_DATA__`), sau `server: istio-envoy` + CloudFront. Không Hydrogen/Oxygen, không `Shopify.theme`. CMS = Contentful; ảnh proxy qua first-party `/i/shopify/...` và `/i/contentful/...` |
| 2. Apps | Nosto (recs), TurnTo/Emplifi (reviews), Attentive, Algolia, Amplitude, Singular, Global-e, Affirm, Loop, Zendesk (help.wearfigs.com), OneTrust. Không app SEO/image/speed; resize ảnh tự làm qua proxy `?fm=webp&w=` / `?width=` |
| 3a. Home | title 65 "FIGS Scrubs Official Website - Medical Uniforms & Clothing · FIGS"; desc 157; canonical `https://www.wearfigs.com` (self, thiếu `/`); hreflang 95; H1 **0**; OG 7 tag + twitter 5 tag; JSON-LD: **0 thẻ `<script ld+json>` trong HTML SSR** — Organization/LocalBusiness chỉ nằm trong RSC payload (render client) |
| 3b. Collection `/collections/scrub-tops-womens` | title 36; desc 124; canonical self; hreflang 95; H1 **0**; OG 7; JSON-LD 1 block valid: ProductCollection (+Brand, Organization, PeopleAudience). Không ItemList, không BreadcrumbList |
| 3c. PDP `/products/mens-timmons-mock-neck-quarter-zip-scrub-top?color=Navy` | title 47; desc 144 (có `\n\n` thừa cuối); canonical self (giữ `?color=Navy`); hreflang 95; H1 2 (trùng "Timmons Mock-Neck Scrub Top" mobile/desktop); OG 7 + twitter 5; **Product JSON-LD MISSING** — 0 block ld+json, không Product/Offer/AggregateRating/BreadcrumbList. Review SSR hiện "0.00 out of 5." (TurnTo load client) |
| 4. robots.txt | Custom (9.5 KB): `/portals`, `/images-to-protect`, `/*write-review=true`, ~90 dòng "Temp block for international collection filters" `/xx-XX/collections/*filters=`. AI bot: 0 rule GPTBot/ClaudeBot/PerplexityBot/Google-Extended/CCBot → allowed qua `*` |
| 5. llms.txt | `/llms.txt` 404, `/llms-full.txt` 404 |
| 6. sitemap.xml | Custom index, 4 child: collections (195), kits (5), pages (78), products (1602 URL = 456 handle × `?color=`; 100% URL có `?color=`). Không image sitemap dù khai namespace |
| 7. Images PDP | 22 `<img>`; 11/22 alt non-empty (50%), 11 `alt=""`; lazy 20/22; srcset 22/22; width param 22/22; format: webp 7, jpg 10, svg 4, png 1. Alt ảnh gallery lặp y hệt "Timmons Mock-Neck Scrub Top Navy" ×7 |
| 8. Blog | Không có: `/blogs` 404, `/blog` 404, `/blogs/news` → 307 `/pages/press`. 0 post |
| 9. PageSpeed | PSI rate-limited (429, quota "Queries per day" của key chung) |

## Notable
- PDP không có Product JSON-LD trong HTML (0 block) → không Offer/price/availability/rating cho Google Merchant listing lẫn AI crawler không chạy JS; review SSR "0.00 out of 5.".
- Structured data home chỉ tồn tại trong RSC flight payload (`$L29` client component) — GPTBot/ClaudeBot/PerplexityBot (không render JS) thấy 0 schema.
- H1: home 0, collection 0, PDP 2 bản trùng.
- Tốt: hreflang 95 locale nhất quán trên mọi page, canonical self per color, OG + twitter:card đầy đủ, ảnh 100% srcset + width, lazy 20/22.
- Sitemap sản phẩm là variant-level `?color=` (1602 URL / 456 handle) — không có URL handle gốc.
- Không blog → không có content funnel/AEO cho query "best scrubs for nurses"…

## Gaps our apps could fill
- No Product/Offer/AggregateRating/BreadcrumbList JSON-LD trên PDP (SSR) → schema app (dạng inject server-side/metafield cho headless).
- Không llms.txt / llms-full.txt; schema chỉ có client-side → AEO app (llms.txt + SSR-safe schema).
- 50% ảnh PDP `alt=""`, alt còn lại lặp 1 chuỗi ×7 → AI alt per-image.
- Không blog (0 post) → blog app.
