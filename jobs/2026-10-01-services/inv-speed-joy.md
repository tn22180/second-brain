# Inventory engine: speed-up-report / joy / banner-cross-sell

Pin tree (fetch 2026-10-01):
- `speed-up-report` origin/main `b7d7ef3` (2026-07-25) — remote gitlab.com/avada/speed-team
- `joy` origin/master `0b9c5d440c` (2026-08-17) — remote **gitlab.com**/avada/starlink-team (chưa thấy chuyển git.avada.net; nếu đã chuyển thì tree này có thể cũ)
- `banner-cross-sell` origin/main `e40a634` (2026-09-22) — git.avada.net/avada/falcon/cdn-falcon

## TL;DR

1. **speed-up-report KHÔNG phải engine đo/tối ưu tốc độ.** Là BI nội bộ (Next.js + Functions + local cron sync → BigQuery) cho *dịch vụ* Speed Up: Shopify Partner API, Avada Ticket, GA4, GitLab, cost. `lighthouse` 0 file, `crux` 0, `puppeteer` 0, `web-vitals` 0, `critical.css` 0 (grep `-i` trên `apps packages`). "pagespeed/lazyLoad/defer" chỉ xuất hiện như **tên event** để đếm adoption (`apps/functions/src/reports/templates/events/features/speed-feature-adoption.ts:6-7`). Engine thật (minify, lazyLoad, extractCriticalCSSV2, fontSwap, hyperSpeed…) nằm ở app Speed Up — **không clone trong `projects/Falcon/`**.
2. **joy = engine loyalty đầy đủ** (points, tier VIP, referral, social-earn, wallet pass, REST API v2) nhưng **dính Shopify sâu**: 199/1903 file JS dùng `shopifyCustomerId`, redeem tạo discount qua Shopify Discount Function/Admin API.
3. **joy có hạ tầng gửi email transactional** (Mailgun + SMTP custom + Liquid template v2 + tracking open/click + unsubscribe) nhưng **KHÔNG có email marketing**: không campaign/broadcast, không flow builder. Marketing = *đẩy dữ liệu sang* Klaviyo/Omnisend/Drip/Sendlane/Attentive/PushOwl.
4. **banner-cross-sell không phải engine** — chỉ là JSON config `bannerSeoAppV2.json` cho `<CrossAppBanner>` cross-sell giữa các app Avada, CI rsync lên GCS. Nhánh "product-feed" = đổi banner sang quảng cáo app Product Feed.

## Bảng engine

| Capability | Repo | Entry file:line (verified origin) | Input | Output | Shopify coupling | Effort non-Shopify |
|---|---|---|---|---|---|---|
| Speed-feature adoption report (đếm merchant bật minify/lazyLoad/criticalCSS…) | speed-up-report | `apps/functions/src/reports/templates/events/features/speed-feature-adoption.ts:6` | BQ `USER_EVENTS_FQN` (event app Speed Up) | Card dashboard nội bộ | HIGH (event của Shopify app) | n/a — analytics nội bộ, không bán được |
| Sync Shopify Partner API (install/uninstall/charge) → BQ, churn/retention/cohort | speed-up-report | `apps/sync/src/cli.ts:372` (`command(jobId)`), `apps/sync/src/shopify/events.ts:1` | Partner API token | BQ tables + report churn/retention | HIGH (Partner API = metric của *app*, không phải store) | n/a |
| NL → SQL → chart ("Ask AI" Query Explorer) | speed-up-report | `apps/sync/src/ai/generate-sql.ts:45` `generateSqlFromPrompt`, `apps/sync/src/ai/generate-viz.ts:56` `generateVizBoard` | Prompt + BQ schema; chạy `claude -p` local daemon | SQL + VizSpec | LOW (generic BQ) | M — engine generic nhưng chạy bằng Claude CLI trên máy local (runbook `.claude/runbooks/05-ai-query-worker.md`), phải đổi sang API + multi-tenant |
| GA4 acquisition report | speed-up-report | `apps/functions/src/reports/templates/ga4-acquisition/` | GA4 BQ export | Report kênh/URL | LOW (GA4 chung) | M — cần GA4 BQ export của khách + grant cross-project (runbook 10) |
| (Ngoài scope, pointer) PageSpeed API v5 wrapper | seo | `packages/functions/src/helpers/google.js:76` `getGooglePageSpeedScore({url, device})` | **public URL** + PSI key | score PSI | LOW (nhận URL bất kỳ; :128 `getGooglePageSpeed` thì gắn `shop.shopifyDomain`) | S — gọi được cho URL bất kỳ ngay |
| Points engine (earn theo order) | joy | `packages/functions/src/services/pointService.js:30` `calcPointService({shop, shopifyCustomerId, items, order})` | Order + customer data (Shopify webhook) | Points/activity Firestore | HIGH | L — key theo `shopifyCustomerId`, order shape Shopify |
| Referral (code, referee coupon, order attribution) | joy | `packages/functions/src/services/referralService.js:143` `giveReferralCouponToReferee`, `:575` `createRefereeShopifyCustomer`, `:747` `processReferralWithOrder` | Customer + order + Admin token | Coupon Shopify, tag customer/order | HIGH (tạo Shopify customer, tag) | L |
| Redeem → discount | joy | `packages/functions/src/services/discountService.js:16` `generateByDiscountFunctionV2` | Admin token + program | Discount code (Shopify Function) | HIGH | L — phải viết adapter coupon cho Woo/Magento |
| VIP tier / milestone | joy | `packages/functions/src/services/social/socialEngagementService.js:242` `processVipTier`; `services/tierService.js` | Points history | Tier + notification | MED (logic thuần, lưu theo customer Shopify) | M |
| Social share-to-earn (IG comment/story mention/live, FB comment) | joy | `packages/functions/src/services/social/socialEngagementService.js:121` `awardSocialPoints`; `services/instagram/instagramStoryMentionActivityService.js`, `services/facebook/facebookCommentActivityService.js` | OAuth IG/FB của merchant + customer | Points | MED (Meta API độc lập Shopify, award points dính Shopify customer) | M |
| Google Maps review → points | joy | `packages/functions/src/services/googleMapsReviewService.js:37` `submitGoogleMapsReview` | Customer + review | Points | MED | M |
| Review-app rewards (KHÔNG host review; nghe Judge.me/Loox/Yotpo/Stamped/Fera/Okendo…) | joy | `packages/functions/src/services/reviews/judge.js`, `loox.js`, `yotpo.js`…; `services/reviewsRewardsService.js:22` | Webhook review app Shopify | Points | HIGH (review app đều là Shopify app) | L — **không có engine review riêng** |
| Receipt OCR → points (offline purchase) | joy | `packages/functions/src/services/receiptAnalysisImageReceipt.js:3` | Ảnh hoá đơn | Line items parsed (AI) | LOW | S/M — hàm thuần nhận ảnh |
| Wallet pass (Google/Apple) | joy | `packages/functions/src/services/walletPassService.js:33` `generateGoogleWallet`, `:168` `getAppleWalletQRDataUrl` | Customer + tier | Pass URL/QR | MED | M |
| Retention risk / points expiring | joy | `packages/functions/src/services/retentionRiskService.js:55` `getPointsExpiringMembers` | Firestore loyalty data | Danh sách member | MED | M |
| Loyalty REST API v2 (headless: programs, earn calc, redeem, customers, tiers, transactions) | joy | `packages/functions/src/routes/restApiV2.js:69` `/programs/earning/points/calculate`, `:70` social/interactions, `:71` redeem, `:91` customers, `:103` `/customers/external/:shopifyCustomerId` | App key per shop | JSON | MED/HIGH — API độc lập nhưng shop phải được tạo qua Shopify install (`handlers/apiV2.js:9` `@avada/core` shopifyCharge/verifyEmbedRequest) | M/L — điểm vào tốt nhất cho non-Shopify, nhưng cần flow tạo shop không qua OAuth Shopify + adapter order/coupon |
| Email notification transactional (Liquid v2, 20 event loyalty) | joy | `packages/functions/src/services/sendMailService.js:29`; `services/email/emailV2RenderService.js:172` `renderV2Email`; event list `const/notifications.js:67` `EMAIL_NOTIFICATIONS_EVENT` | Customer email + loyalty event | Email | MED (render/gửi generic; trigger là event loyalty) | M — tách được làm "loyalty email" nhưng không phải ESP |
| Gửi mail: Mailgun + SMTP custom + custom sending domain + tracking | joy | `services/email/mailgunService.js:70` `sendEmail`, `services/email/sendEmailService.js` (SMTP + `getVerifiedDomain`), `services/email/emailSendingService.js:19` `addTrackingLinkEmail`, unsubscribe `emailV2RenderService.js:85` `ensureUnsubscribe`; preset SendGrid chỉ là SMTP host `const/defaultSmtpSettings.js:63-64` | Domain + SMTP | Email gửi + log sent/opened/clicked (`const/notifications.js:67-70`) | LOW | S/M — hạ tầng gửi tái dùng được |
| Weekly report email cho merchant | joy | `packages/functions/src/services/weeklyReportService.js:48` `prepareReportWeeklyData` | Activity loyalty | Email báo cáo | MED | M |
| Sync customer/loyalty sang ESP (Klaviyo, Omnisend, Drip, Sendlane, Attentive, PushOwl) | joy | `services/integrateKlaviyoService.js:95` `syncCustomerToKlaviyoRecursive`, `:419` `triggerEventKlaviyo`; `services/dripService.js`; `services/EmailMarketing/sendlanceService.js`; list app `const/programs/integrationPrograms.js:8-15,30` | API key ESP + customer | Profile/event bên ESP | MED (ESP độc lập, nguồn data là Shopify customer) | M |
| Storefront screenshot / HTML capture / social link extract (Puppeteer) | joy | `packages/functions/src/services/puppeteerService.js:94` `captureShopScreenshot(shopUrl)`, `:308` `captureShopHtml`, `:276` `extractSocialLinks` | **public URL** (+ password store) | PNG / HTML / social links | LOW | S — chạy URL bất kỳ |
| Spam/fraud store detection | joy | `packages/functions/src/services/spamDetectionService.js:71` `analyzeShopMetrics`, `:212` `shouldBlockStore` | Metrics shop | Verdict | LOW (heuristic thuần) | S nhưng giá trị bán thấp |
| Cross-sell banner catalog | banner-cross-sell | `public/ag-blog/bannerSeoAppV2.json`, `tools/publish.py`, `tools/validate.py` | — | JSON trên GCS `avada-apps-config/ag-blog/` | n/a (config nội bộ) | n/a — không phải engine |

## Chạy được HÔM NAY trên URL/store bất kỳ với <1 ngày glue

Trong 3 repo này: **gần như không có engine bán được ngay**.
1. `joy` `puppeteerService.captureShopScreenshot/captureShopHtml/extractSocialLinks` (`puppeteerService.js:94,308,276`) — nhận URL bất kỳ. Chỉ là primitive (screenshot/scrape), không phải dịch vụ.
2. `joy` `receiptAnalysisImageReceipt` (`:3`) — OCR hoá đơn bằng AI, input ảnh, không dính Shopify. Primitive.
3. `joy` hạ tầng gửi mail (Mailgun/SMTP + Liquid render + tracking) — tái dùng làm transport, không phải sản phẩm.
4. (Ngoài 3 repo) `seo` `getGooglePageSpeedScore({url})` (`helpers/google.js:76`) — PSI cho URL bất kỳ, thứ gần nhất với "speed audit any URL". Speed *optimizer* (áp defer/lazy/critical CSS) không có trong repo nào ở đây.

Loyalty (joy) cho non-Shopify: **L**. Cửa vào là REST API v2 (`routes/restApiV2.js`), nhưng shop provisioning, customer identity (`shopifyCustomerId`), coupon (Shopify Discount Function) đều Shopify. Cần: shop provisioning không OAuth, customer id trung lập, adapter order-webhook + coupon cho Woo/Magento, widget storefront không qua theme app extension.

## Email marketing — có không?

**KHÔNG có** gửi campaign hay flow builder trong 3 repo này.
- `joy` `packages/functions/src` grep `-i` (git grep trên `origin/master`):
  - `broadcast` → **0 file**.
  - `campaign` → 33 file, toàn là AI-assistant prompt/tool (`services/ai/**`), `aovBundle`, `merchantReferralService`, const program — không có sender campaign.
  - `abandon` → 5 file, không có abandoned-cart flow (`services/ai/tools/planModeToolService.js:58` chỉ là label gợi ý của AI; còn lại là lock/batch).
  - `newsletter` → chỉ là checkbox opt-in newsletter trong widget referral (`const/branding/defaultBrandingReferral.js:39-42`) và earn-rule `CUSTOMER_SIGN_UP_NEWSLETTER` (`const/customers.js:75`).
  - `twilio` → **0 file**; `-w sms` → 21 file, toàn là consent field / integration mapping (`controllers/apiHookV1/customersMarketingConsentController.js`), **không gửi SMS**.
  - `amazon-ses|SESClient` → 0; `sendgrid` → 1 (chỉ là preset SMTP host `const/defaultSmtpSettings.js:63-64`).
- Có: email **transactional triggered theo event loyalty** (20 event `const/notifications.js:67-88`: earn points, birthday, tier achieved/downgrade, points expire 7d/3d, coupon reminder, referral share…) qua Mailgun (`mailgunService.js:70`) / SMTP merchant (`sendEmailService.js`), template Liquid v2 (`emailV2RenderService.js:172`), tracking sent/opened/clicked, unsubscribe (`:85`). Đây là "lifecycle notification" của loyalty, không phải ESP.
- Marketing thật = **outsource**: đồng bộ profile/event sang Klaviyo/Omnisend/Drip/Sendlane/Attentive/PushOwl (`integrationPrograms.js:8-15,30`).
- `speed-up-report`: `mailgun|nodemailer|sendgrid` → 0 file trong `apps packages` (bước "send mail report" là thủ công của TS, `.claude/domain/speed-up-business.md`).
- `banner-cross-sell`: chỉ JSON + 2 script Python, 0.

=> Nếu muốn bán dịch vụ email marketing: phải build (segment + campaign scheduler + flow engine + deliverability), joy chỉ cho sẵn transport + template render + tracking (~30% phần hạ tầng).
