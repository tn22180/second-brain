# glossier.com (Tranco #48445)
| Check | Result |
|---|---|
| 1. Stack | Liquid, custom theme: `Shopify.theme` name "9/30 Release 3.51.0", schema_name "Glossier" v3.51.0, theme_store_id null. `powered-by: Shopify`, Cloudflare. Không headless. |
| 2. Apps | Klaviyo (app block), Elevar (app block), Yotpo (staticw2.yotpo.com, reviews), Gorgias chat, Optimizely, OneTrust (cdn.cookielaw.org), Global-e, Findation, Recharge (subscription), Afterpay, Vimeo. Ảnh qua **imgix** (glossier-prod.imgix.net) tự vận hành. **Không app SEO/image/speed nào.** |
| 3a. Home | title "Glossier" (8), desc "Glossier" (8); canonical self; hreflang 190; H1 = 0; OG đủ (9 tag) + 4 twitter; JSON-LD: **0 block** (không Organization, không WebSite+SearchAction). |
| 3b. Collection `/collections/skincare` | title "All Skincare – Glossier" (23); **desc thiếu**; canonical self; hreflang 190; **H1 = 0**; OG đủ; JSON-LD **0 block** (không ItemList/BreadcrumbList). |
| 3c. Product `/products/boy-brow` | title "Boy Brow \| Tinted Brow Gel – Glossier" (37); desc 128; canonical `…/boy-brow?variant=43886803190005` (**không self — trỏ variant URL**); hreflang 190; H1 = 1 "Boy Brow"; OG đủ (có og:image:alt); JSON-LD 1 block parse OK: Product(+Brand, Offer 1 dict) + Organization. **Không AggregateRating/Review** dù có Yotpo; không sku/gtin; không BreadcrumbList. |
| 4. robots.txt | **Shopify default** (bản 2026: UCP/MCP, agents.md, shop.app/SKILL.md). Không rule riêng cho GPTBot/ClaudeBot/PerplexityBot/Google-Extended/CCBot → **tất cả allowed** (`User-agent: * Allow: /`). |
| 5. llms.txt | `/llms.txt` 200 text/markdown 4431B (lần 1 timeout, retry OK); `/llms-full.txt` 200 4436B. Cả hai = **template Shopify tự sinh** "# Agent Instructions — Glossier" (quảng cáo shop.app/SKILL.md, UCP), không có nội dung brand/catalog. |
| 6. sitemap.xml | **757** child sitemap (5 root + 188 locale × 4: products/pages/collections/blogs) + `sitemap_agentic_discovery.xml`. products_1 = **98 URL** (toàn catalog). collections_1 = 98. |
| 7. Images (product) | 196 `<img>`; alt non-empty **99 (50%)**, 97 `alt=""` (chủ yếu nav/highlight card: Highlight-card-skincare.jpg…). 193/196 từ imgix `auto=compress,format` (webp/avif negotiate theo Accept); lazy = lazysizes JS (191 class `lazyload` + `data-widths`), native `loading=lazy` chỉ 1; srcset attr 3; fetchpriority 0; width attr 1. |
| 8. Blog | `/blogs/company-blog`: **4 bài** (sitemap blogs_1 = 5 URL), lastmod mới nhất **2023-08-01**. Content editorial nằm ở domain ngoài **intothegloss.com** (link từ nav). |
| 9. PageSpeed | **PSI rate-limited** (429 "Queries per day" quota). |

## Notable
- Home title + meta description đều chỉ là "Glossier" (8 ký tự) — brand #48k mà bỏ trống 2 slot SERP quan trọng nhất.
- Không có JSON-LD nào ở home + collection (0 Organization/WebSite/SearchAction/ItemList/BreadcrumbList); home và collection đều 0 H1.
- Product canonical trỏ `?variant=43886803190005` thay vì URL sạch → rủi ro chia tín hiệu canonical giữa variant.
- Có Yotpo reviews nhưng Product JSON-LD không có AggregateRating/Review → mất rich snippet sao.
- Làm tốt: hreflang 190 cặp/trang, 188 locale sitemap; ảnh qua imgix auto-format + responsive widths.
- AEO: llms.txt/llms-full.txt chỉ là template Shopify tự sinh; robots mở hết cho AI bot; blog chết từ 2023, editorial đẩy sang intothegloss.com (không cộng authority cho domain bán hàng).

## Gaps our apps could fill
- SEO meta: home title/desc 8 ký tự, collection thiếu meta description → bulk meta template.
- Schema: thêm AggregateRating (từ Yotpo) vào Product, Organization + WebSite/SearchAction ở home, BreadcrumbList + ItemList ở collection.
- Image alt: 97/196 (50%) img `alt=""` trên product page → AI alt-text bulk.
- llms.txt: thay template Shopify bằng llms.txt có catalog/collection/FAQ thật; blog on-domain (4 bài, dừng 2023-08).
