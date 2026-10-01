# Inventory: ADS / SOCIAL / EMAIL MARKETING — có gì, ở đâu

Ngày 2026-10-01. Read-only. Đọc default branch (`git grep origin/<default>`) của 16 repo local trong `projects/Falcon/` (bỏ `*-wt-*`), + GitLab API cả 2 host, + `docs.avada.io`, `team-ops`.

## Kết luận

- **ADS: không có app nào trong repo SEOOn.** Có 2 app tiền-ads thuộc board khác (Board 2 Nghĩa·Tam): **Product Feed** (Google Merchant Center, đã có docs + MCP live) và **Pixel & Tracking** (Meta CAPI + GA4). App **Google Ads** (FAL-94) mới ở R&D/MVP. "Google Ads" trong `seo`/`blogs` chỉ là **Keyword Planner** để lấy search volume, không chạy quảng cáo.
- **SOCIAL: không có social publishing/auto-post ở đâu cả.** SEOOn chỉ có OG/Twitter meta + nút share. Social *thật* duy nhất nằm ở `joy` (team Starlink, không phải SEOOn): Instagram comment/story/mention auto-reply (AI) + Facebook Page OAuth, phục vụ loyalty "earn points".
- **EMAIL MARKETING: SEOOn chỉ có email giao dịch/báo cáo** (nodemailer + Mailgun SMTP). Email marketing thật là app **Avada Email Marketing (AEM)** của team khác: còn asset trên `avada-apps-cdn/public/email-marketing` (105 file, có thư mục `magento2/`), không có code local. `joy` sync dữ liệu loyalty sang Klaviyo/Omnisend/Mailchimp (đây là tích hợp, không phải công cụ campaign).
- Code của Product Feed / Pixel: `gitlab.com/avada/blocko-team/{product-feed,pixel-tracking}` (theo MR URL trong team-ops). Token của Tuan nhận **404** ở cả 2 host → chưa đọc được code, không xác minh được.

## Bảng

| Capability area | Exists? | Repo + file:line evidence | What it does | Shopify coupling | Notes |
|---|---|---|---|---|---|
| ADS: Product feed → Google Merchant Center | **Product** (team khác) | `docs.avada.io/components/apps-config` (entry `product-feed`: "Sync your Shopify products to Google Merchant Center"); `docs.avada.io/pages/product-feed/*` (thêm 2026-07-28); MCP connector "Product Feed" đang live (tool `create_feed/publish_feed/get_feed_issues`); code: `gitlab.com/avada/blocko-team/product-feed` (team-ops `skills/review-mr-queue/references/probe-findings.md:44`) — **404, không đọc được** | Sync catalog → map spec channel → host XML file → GMC fetch theo lịch; đọc approval qua Reports API (`feedLabel`) | MED — input catalog Shopify, output XML/GMC độc lập platform; thay nguồn catalog là chạy được store khác | Theo hướng dẫn của MCP: hỗ trợ cả **Meta catalog** (feed override theo country/language). Docs hiện chỉ ghi Google (grep `meta` trong `pages/product-feed` = 0). Repo `git.avada.net/avada/falcon/product/product-feed` chỉ có doc gần rỗng ("đang planning"). Jira FAL-156 |
| ADS: Conversion tracking (Meta CAPI, GA4) | **Product** (team khác) | `docs.avada.io/pages/pixel-tracking/connections/add-a-pixel.mdx:51` (Meta CAPI token); `settings.mdx:71` ("Google Ads isn't a channel in the app yet"); code `gitlab.com/avada/blocko-team/pixel-tracking` — 404; repo `git.avada.net/.../pixel-tracking` rỗng | Gửi conversion browser + server sang Meta/GA4, đối soát với đơn Shopify thật | HIGH — đối soát dựa trên Shopify orders + web pixel | Hạ tầng đo lường cần có trước khi bán gói ADS. Chưa có TikTok/Google Ads. Jira FAL-146 |
| ADS: Google Ads campaign app | **None** (R&D) | `team-ops/sprint/sprints/sprint-01/report.md:81,280` (FAL-94 "R&D: research + WF + design → App MVP", trạng thái Doing) | — | — | Không có repo/code nào. Facebook catalog sync = FAL-155, trạng thái New (`report.md:322`) |
| ADS (giả): Google Ads Keyword Planner | partial — chỉ dùng cho SEO | `seo/packages/functions/src/services/googleAdService.js:2,20` (`google-ads-api`, `KeywordPlanIdeaService`); `seo/.../auditAgent/chains.js:44,666`; `blogs/packages/functions/src/services/googleAdService.js` | Lấy volume/competition keyword cho audit SEO + related keywords của blog | LOW — chỉ cần keyword + geo | **Không phải tính năng quảng cáo.** Dùng lại được làm "keyword research" cho bất kỳ store nào |
| ADS: banner cross-sell Product Feed | marketing copy | `banner-cross-sell/public/ag-blog/bannerSeoAppV2.json:304-415` | Banner trong app Blog quảng bá Product Feed (GMC) | — | Xác nhận Product Feed là app định cross-sell trong suite |
| SOCIAL: OG / Twitter card meta | partial (SEO) | `seo/extensions/theme-app-extension/snippets/avada-seo-social-post.liquid:27,51-52`; `blogs/extensions/theme-extension/snippets/avada-seoon-social.liquid:18-22`; preview FB/Twitter `llm-ai-search-seo/packages/assets/src/components/PreviewSocial/PreviewFacebook.js:7` (copy trong `seo` + `avada-image-optimizer`) | Set tiêu đề/mô tả/ảnh "Social post" cho từng trang, preview card FB/X | HIGH — inject qua theme app extension + metafield | Chỉ là meta tag. "Social post" trong UI SEO = OG title/desc, không đăng bài |
| SOCIAL: Share button / embed | partial | `blogs/packages/assets/src/const/elementList.js:251` (element "Social share"); `blogs/.../EditorJs/InstagramEmbed`, `TiktokEmbed`; author social links `blogs/extensions/theme-extension/blocks/show-author.liquid:41-58` | Nút share bài blog, nhúng post IG/TikTok vào bài | HIGH (theme extension) | Không có auto-post/schedule lên mạng xã hội ở bất kỳ repo nào (grep `auto.?post` = 0 hit thật) |
| SOCIAL: Site verification Pinterest | trivial | `seo/extensions/theme-app-extension/blocks/avada-site-verification.liquid:3,37` | Chèn meta `p:domain_verify` | HIGH | — |
| SOCIAL: Instagram/Facebook engagement automation | **Product** (team Starlink) | `joy/packages/functions/src/services/instagram/instagramAutoReplyService.js:2-6` (auto-reply single/list/**AI**); `instagramApiService.js:20`; `instagramStoryMentionActivityService.js`, `instagramLiveCommentActivityService.js`; `controllers/facebookPageOAuthController.js:18-71`; `const/programs/programSocial.js:1-8` (like/follow/share/comment/mention) | Merchant nối IG/FB Page; khách comment/mention/story → cộng điểm loyalty + bot trả lời tự động (OpenAI) | MED — API Meta độc lập; điểm thưởng gắn customer Shopify | Chỉ engagement-for-points, không đăng nội dung. Code thuộc `gitlab.com/avada/starlink-team/joy` — không phải SEOOn, phải hỏi team khác trước khi tái dùng |
| EMAIL: transactional / report (SEOOn) | transactional-only | `seo/packages/functions/src/services/email/mailService.js:258,297` (404 report, broken-link export); `seo/.../handlers/cron/subscribeSendEmails.js:22` (weekly SEO report); `seo/.../services/email/unsubscribeService.js:9`; `blogs/packages/functions/src/services/mailService.js:48,102` (export/import bài); `ai-product-copy/packages/functions/src/services/mailService.js:31`; `avada-image-optimizer/packages/functions/src/services/email/index.js:26`; tất cả qua nodemailer + Mailgun SMTP (`seo/packages/functions/cloud-run/.env.example:48-50`) | App gửi email báo cáo/hoàn tất job cho **merchant** | LOW | Không phải email marketing. `seo/controllers/emailController.js:91` "Black Friday Cyber Monday is coming!" = app → merchant, không phải merchant → khách |
| EMAIL: ESP integration (Klaviyo/Omnisend/Mailchimp) | partial (team Starlink) | `joy/packages/functions/src/services/integrate/syncMarketingAppService.js:233,265`; `omnisendService.js:9` (`api.omnisend.com/v5`); `mailchimpService.js:25`; `controllers/integrate/klaviyoController.js:21`; `handlers/schedule/syncMailchimpCustomers.js` | Đẩy điểm/tier/event loyalty lên ESP của merchant để họ tự chạy flow | MED | Tích hợp, không phải campaign builder. Có loyalty lifecycle email (`handlers/pubsub/subscribeSentEmailNotification.js:105`, point expiration, Mailgun/SMTP `config/email/mailgun.js`) — gần với "marketing email" nhất trong code local |
| EMAIL: Email marketing app (campaign, popup, contact, template) | **Product** (team khác, code không local) | `avada-apps-cdn/public/email-marketing/` — 105 file: `templates/`, `popup/`, `grapesjs/`, `contact-attributes/`, `magento2/`; commit cuối 2024-03-05 (Dong NV, "aem ...") | Asset của app Avada Email Marketing (AEM): editor template GrapesJS, popup thu email, contact segment | LOW–MED — có thư mục `magento2/` → app đã chạy được ngoài Shopify | Không có trong `docs.avada.io` và team-ops. Asset đứng im từ 2024-03. Repo code không tìm thấy trên 2 host GitLab bằng token của Tuan |
| SPEED liên quan ads/social | n/a | `avada-image-optimizer/packages/functions/src/config/assets.js:139,147` (trì hoãn script Klaviyo/FB); `const/preconnectService.js:18-20` | Hoãn/preconnect pixel FB/TikTok/Twitter để tăng tốc | HIGH | Chỉ là tối ưu tốc độ, ghi nhận để không đếm nhầm |

## Hàm ý khi đóng gói 3-4 dịch vụ cho "mọi store"

- **ADS** là ứng viên ngoài SEO duy nhất đã có nền: Product Feed (GMC + Meta) + Pixel (Meta/GA4). Còn thiếu đúng phần chạy quảng cáo (FAL-94). Phần chạy được ngoài Shopify là feed XML; Pixel đang dựa vào đơn Shopify để đối soát.
- **SOCIAL** = từ con số 0 về publishing. Thứ tái dùng được: OG meta (SEO) + IG/FB OAuth + AI auto-reply (joy, team khác).
- **EMAIL MARKETING** = SEOOn không có. AEM tồn tại ở tầng org (có cả Magento), nhưng code không nằm trong tay team → phải hỏi chủ AEM nếu muốn đưa vào gói.
- Việc tiếp theo: xin quyền đọc `gitlab.com/avada/blocko-team/*` (product-feed, pixel-tracking) để xác minh mức Meta/TikTok và mức độ gắn với Shopify trước khi đưa vào gói.

## Danh sách app (docs.avada.io `components/apps-config` + team-ops `skills/team-context/references/apps.md`)

Team SEOOn/Falcon (team-ops: 6 app trên App Store + Feed; Jira Falcon App: SEO·Blog·APC·AEO·Feed·Ads·Pixels·Speed·Canva·Team):
- **Avada SEO Suite** (`seo`) — SEO tổng hợp: meta, sitemap, schema, ảnh, tốc độ.
- **Avada AEO Optimizer** (`llm-ai-search-seo`) — index store cho ChatGPT/Claude/Gemini/Perplexity, llms.txt.
- **Avada AI Blog Builder** (`blogs`) — AI viết blog chuẩn SEO.
- **Avada Product Copy** (`ai-product-copy`) — AI viết mô tả sản phẩm.
- **Avada Images & Page Speed Up / AP Speed Optimizer** (`avada-image-optimizer`) — Core Web Vitals, nén ảnh.
- **Blocko: AI Theme Sections** — thư viện section + AI tạo section.
- **Avada Product Feed** (Feed) — sync sản phẩm lên Google Merchant Center (+ Meta theo MCP).
- **Avada Pixel & Tracking** (Pixels) — conversion Meta + GA4, browser + server, đối soát với đơn.
- **Ads** (FAL-94) — Google Ads, R&D, chưa có app. **Canva** — chỉ là option Jira, không có repo/docs.

App Avada khác có trên docs.avada.io (team khác):
- Avada PDF Invoice — hoá đơn, phiếu đóng gói, biên lai.
- Avada Appointment Booking — bán dịch vụ/lịch hẹn.
- Avada Online Course — bán khoá học số.
- Avada Order Tracking — trang tracking + **thông báo giao hàng** (email giao dịch).
- Luna Order Editing — khách tự sửa/huỷ đơn.
- Avada Affiliate Marketing — chương trình affiliate/referral.
- Avada Shipping Labels — in nhãn hàng loạt.
- Avada Backups & Restore — backup dữ liệu store hằng ngày.
- Air Product Reviews — thu thập/hiển thị/import review.
- Avada Cookie Consent — banner GDPR/CCPA.
- Shopvid Shoppable Video Reels — video ngắn gắn sản phẩm (gần social commerce nhất trong danh sách, nhưng chỉ hiển thị trên storefront).
- Avada Accessibility — WCAG scanner/widget.
- Avada Order Limit — giới hạn min/max mua.
- Avada Fraud Filter — chặn đơn/IP gian lận.
- Avada Age Verification — chặn theo tuổi.
- Avada EU Withdrawal Form — form rút đơn theo luật EU.

Không có trong docs nhưng có dấu vết:
- **Joy Loyalty** (`joy`, `gitlab.com/avada/starlink-team`) — loyalty/referral + IG/FB engagement + sync ESP.
- **Avada Email Marketing (AEM)** — chỉ còn asset trên CDN.
- Thư mục khác trên `avada-apps-cdn/public/`: `whatsapp`, `marketing-tool`, `proofo`, `upsell`, `bundle`, `survey`… (asset của các app khác, không có code local).
