---
name: integration-key-unbound-fleetwide
description: integrationKeys không bind shop ở CẢ 5 app — cross-tenant takeover qua /proxy/swagger-token; FAL-720 mới chỉ vá APC.
metadata:
  type: project
---

`createIntegrationKey` ghi `{name, type, accessToken, createdAt}` — **không field shop** — ở cả 5
app. `exchangeToken` lấy shop từ `ctx.query.shop` do caller gửi và ký JWT; `validateAccessToken` lấy
`X-SEO-Access-Token` + `X-SEO-Shop-Domain` từ header và không so chúng. Key hợp lệ bất kỳ + domain
shop bất kỳ = full quyền dưới danh nghĩa shop đó.

Đọc trên origin/<base> ngày 2026-08-25:
- `seo` integrationRepository.js:83, swaggerAuth.js:10
- `blogs` integrationRepository.js:90, swaggerAuth.js:31
- `llm-ai-search-seo` integrationRepository.js:64, swaggerAuth.js:13
- `avada-image-optimizer` integrationRepository.js:56
- `ai-product-copy` — **đã vá**, MR !191/!192/!193 (Draft), chưa merge

Quyết định 2026-08-25: key cũ thiếu `shopId` → **403 fail-closed**, không grandfather.

Ticket mở 2026-08-26 sau khi verify tay lại: **SEO FAL-746**, **Blog FAL-757**, **AEO FAL-761**
(còn `avada-image-optimizer` chưa có). Tất cả `Relates` → FAL-720.

Hai điểm phát hiện thêm ngày 2026-08-26, không có ở bản đọc 08-25:
- `blogs` **route swagger-token hoàn toàn không auth** — `routes/proxy.js:18`
  `router.post('/swagger-token', exchangeToken)` không middleware, trong khi các route quanh nó có
  `validateAccessToken`/`verifyAppProxySignature`. Cộng `api.js:200` cho **mint key mới**. Chain
  không cần credential nào để bắt đầu → Blog nặng nhất trong 5 app.
- `llm-ai-search-seo` nhận `accessToken` qua **`ctx.query`** (swaggerAuth.js:13-14) → token đã nằm
  trong access log và header `Referer`. Coi như đã lộ, phải rotate chứ không chỉ vá bind.

Xem [[avada-gitlab-selfhost]] cho remote đúng khi mở MR.

APC: `.gitlab-ci.yml` **không chạy jest cho app code**, chỉ `npx jest scripts/docs-gate`. Số test
trong MR là chạy tay. `packages/functions/src/__tests__/devZone.test.js` đỏ sẵn trên master
`420385b` (thiếu mock `getCurrentUserInstance` từ khi cổng CRM vào `devZoneController`).
