# aloyoga.com (Tranco #24725)
| Check | Result |
|---|---|
| 1. Stack | Liquid, theme custom `EM 09.25 Prod v2026.9.R18.1` (id 139545149799, theme_store_id null, deploy từ git tag). Không headless. Homepage ghép Builder.io (`cdn.builder.io/js/webcomponents@1.3.53`) |
| 2. Apps | Attentive (`cdn.attn.tv`), Optimizely, Bazaarvoice (flag `bazaarvoiceEnabled`, review load client-side), Global-e, Riskified, Afterpay, Heap, GTM, pixel Pinterest/TikTok/Snap, Shop Pay (`shop.app`). Không có app SEO/ảnh/speed bên thứ 3 |
| 3a. Home | title 66 `ALO \| Yoga leggings, clothes, and accessories for studio to street`; desc 208 (dài); canonical OK; hreflang 260; **H1 = 0**; OG 9 tag; JSON-LD: Organization, WebSite+SearchAction, MobileApplication(AggregateRating 4.9/177000), 0 invalid |
| 3b. Collection `/collections/bestsellers` | title 45; desc 145; canonical OK; hreflang 259; **H1 = 0**; JSON-LD giống home, **không ItemList/BreadcrumbList**; HTML SSR có **0 link `/products/`** (grid render client-side) |
| 3c. Product `w91017r-airbrush-lock-in-bra-tank-california-blue` | title 49; desc **320** (bị cắt giữa câu "Pair i"); canonical OK; hreflang 259; **H1 = 0**; OG có price; Product JSON-LD hợp lệ: sku, gtin12, brand, color, category, 1 Offer — **không aggregateRating/review, không BreadcrumbList** |
| 4. robots.txt | Shopify default (bản 2026: header agents.md/UCP/MCP, "Checkouts are for humans"). **0 rule riêng cho GPTBot/ClaudeBot/PerplexityBot/Google-Extended/CCBot** → tất cả allow qua `*` |
| 5. llms.txt | `/llms.txt` 200 (4425 B), `/llms-full.txt` 200 (4430 B) — cùng nội dung, chỉ khác 1 dòng tự-tham chiếu; dòng đầu `# Agent Instructions — Alo Yoga`; là mirror Shopify-generated của `/agents.md` (UCP, shop.app/SKILL.md), **0 nội dung brand/catalog** |
| 6. Sitemap | index 2065 child = 258 locale prefix × 8 (products 1-5, pages, collections, blogs) + `sitemap_agentic_discovery.xml` (chỉ `/agents.md`). Product ~4.1k (p1 985, p2 993, p5 112; p3-4 chưa đếm); collection 332 |
| 7. Ảnh PDP | Gallery render client-side: SSR có 3 `<img>` (1 alt non-empty = 33%), 0 `loading="lazy"`, 0 `width=` param; ảnh sản phẩm chỉ ở JSON-LD (`&width=600`) + sitemap (p1: 1966 `image:image`). Home: 57 img, **alt non-empty 0/57**, lazy qua lazysizes (`data-src`), format jpg/png `.progressive`, không webp/avif khai báo |
| 8. Blog | Có: 459 URL (`alo-blog` 381, `videos` 67, `practice` 7, **`testing-blog` lọt sitemap**). lastmod mới nhất 2026-09-02 |
| 9. PSI mobile | **429** (quota PSI/ngày của project hết, `quota_limit_value 0`) — không có số |

## Notable
- 0 H1 trong SSR trên cả 3 trang (home, collection, PDP) — brand #24725 mà thiếu tín hiệu heading cơ bản.
- Collection grid + gallery PDP render client-side: HTML collection có 0 link sản phẩm → crawler không chạy JS / bot AI thấy danh mục trống.
- PDP Product JSON-LD thiếu `aggregateRating`/`review` dù chạy Bazaarvoice → mất rich result sao; AggregateRating duy nhất trên site là của app iOS (4.9/177000), in lên **mọi** trang.
- 258 locale × hreflang ~260 tag/trang (Global-e + Shopify Markets) — HTML ~385-410 KB/trang, phần lớn là hreflang + inline.
- llms.txt/agents.md/UCP chỉ là default Shopify rollout; robots không đụng tới AI bot → Alo chưa làm AEO chủ động.
- Meta desc PDP 320 ký tự cắt cứng giữa từ; home desc 208 — cả 2 vượt ~155-160.

## Gaps our apps could fill
- Product JSON-LD đầy đủ: merge rating/review từ app review (Bazaarvoice/Yotpo/...) + BreadcrumbList + ItemList cho collection — đúng thứ Alo đang thiếu.
- Audit H1/meta: phát hiện 0 H1, meta desc >160 bị cắt giữa từ, auto-sinh bản ngắn gọn.
- Alt text AI hàng loạt cho ảnh theme/section (home 0/57 có alt) + convert/khai báo webp/avif.
- llms.txt có nội dung thật (danh mục, collection chính, size guide, policy) thay mirror agents.md mặc định + rule AI bot tuỳ chỉnh trong robots.
