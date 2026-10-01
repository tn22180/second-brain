# gymshark.com (Tranco #23625)
| Check | Result |
|---|---|
| 1. Stack | Headless Shopify (robots: "we use Shopify", store id `988822`/`0156/6146`, 1029 ref `cdn.shopify.com`) + **Next.js pages router** (`x-powered-by: Next.js`, `__NEXT_DATA__`, buildId `P2uyf75gO3vf0JwGMU58C`, `/_next/image` 2489 ref), CMS Contentful (`images.ctfassets.net`), CloudFront + AWS WAF. Trang 404 (vd /llms.txt) do app khác render: `Astro v6.3.3`. Cache `s-maxage=60, stale-while-revalidate=1000` |
| 2. Third-party | 10 `<script src>` đều self-host `/_next/`; vendor nạp động/flag: mParticle (CDP), Dynamic Yield (`ecom.web.dynamicyield.scripts`=true), Algolia (search, flag), OneTrust/cookielaw, GTM, Klarna, Afterpay, Loop Returns, GovX. Không Klaviyo/Yotpo/Okendo/Nosto — review in-house (flag `ecom.web.pdp.reviews`, `pdp.reviewsaisummary`=false). Không app SEO/image/speed nào (Next image optimizer tự làm) |
| 3a. Home | title 55 "Gymshark Official Store - Gym Clothes & Workout Clothes"; desc 163 (hơi dài); canonical `https://www.gymshark.com`; hreflang 23; H1 ×1 "Workout Clothes & Gym Clothes"; OG 7 tag + 4 twitter; LD: `WebSite`, `Organization` |
| 3b. Collection `/collections/leggings/womens` | title 46 (không brand); desc 160; canonical self; hreflang 22; **H1 ×2** ("Leggings", "Women's Gym Leggings & Workout Leggings"); **OG 0, twitter 0**; LD chỉ `FAQPage` — không `ItemList`/`BreadcrumbList`/`CollectionPage` |
| 3c. Product `/products/gymshark-fit-seamless-cropped-leggings-smokey-grey` | title 63; desc 126; canonical self; hreflang 22; H1 ×1; OG 7 + 9 twitter; LD `ProductGroup` (valid JSON) → `hasVariant` 5 `Product` có sku/mpn/**gtin**/Offer, `variesBy`, `aggregateRating` 3.8/54, `review` 2. Lỗi: `description` mất xuống dòng khi strip HTML ("FOCUSED ON FITThe…", "…Silicone grip print- 86% Nylon"); brand = "Gymshark \| We Do Gym"; không `BreadcrumbList` |
| 4. robots.txt | Tuỳ biến nặng: base Shopify + rule `es-US`, AhrefsBot/AhrefsSiteAudit crawl-delay 10, `Nutch` Disallow /, MJ12bot, Pinterest. **0 dòng cho GPTBot/ClaudeBot/PerplexityBot/Google-Extended/CCBot** → AI bot rơi vào `*` (được crawl) |
| 5. llms.txt | `/llms.txt` 404, `/llms-full.txt` 404 (trang 404 Astro, 16067 B) |
| 6. Sitemap | index 9 child (pages/collections/products/hreflang × en + `es-US`, + `sitemap_blog.xml`). products_1: **2204 URL** (1 `image:loc`/URL); collections_1: 1017; pages_1: 114; hreflang_sitemap: 27 |
| 7. PDP images | 154 `<img>`; alt non-empty 109 (71%), 42 thiếu attr alt; 96 `srcSet`; format jpg 82/png 7, không webp/avif trong markup (Shopify CDN tự negotiate); lazy 134/154, **ảnh chính "View 1" cũng `loading="lazy"`**, 0 `fetchpriority`; width: Shopify suffix cũ `_82x…_3840x` (71 URL mỗi size), `/_next/image` w=3840 ×19 |
| 8. Blog | Có, `/blog` trên cùng Next app: 385 article + 26 author + 12 category; lastmod mới nhất 2026-09-30 (`running-warm-ups`) |
| 9. PSI mobile | **blocked 429** (quota "Queries per day" của consumer key chung) — không có số |

## Notable
- Headless 2 tầng: Next.js pages router cho storefront, nhưng 404 lại là Astro v6.3.3 → đang migrate/strangler từng phần.
- PDP schema chuẩn Google 2024: `ProductGroup` + `hasVariant` + `variesBy` + `gtin` từng size — hơn hẳn Liquid theme mặc định (1 `Product`, offers phẳng).
- Nhưng `description` trong JSON-LD là HTML strip thô, dính chữ ("FITThe", "print- 86%") → đoạn text mà LLM/AI Overview trích sẽ xấu.
- Collection page gần như trắng về social/schema: 0 OG, 2 H1, chỉ `FAQPage` — trong khi 1017 collection URL là phần lớn surface ranking.
- Ảnh hero PDP lazy-load, không `fetchpriority` → LCP penalty trên trang tiền nhất; 29% ảnh thiếu alt (42 img không có attr).
- AEO bỏ ngỏ: không llms.txt, robots không nhắc AI bot nào dù chăm chút Ahrefs/Nutch.

## Gaps our apps could fill
- Schema collection: `ItemList` + `BreadcrumbList` + OG cho PLP — brand top vẫn thiếu, app SEO bán được ngay (merchant Liquid còn thiếu hơn).
- Clean description cho JSON-LD (giữ ngắt dòng/bullet thành câu) + `ProductGroup`/`hasVariant`/`gtin` — làm default trong app schema.
- Image: auto alt (71% → 100%) + rule "ảnh đầu PDP eager + fetchpriority=high" — check cụ thể cho app image-optimizer/speed.
- AEO: sinh `/llms.txt` từ 2204 product + 385 blog + policy AI bot trong robots — gymshark còn chưa có, là điểm bán cho app AEO.
