---
name: ts-ai-internal-support-key
description: TS AI dùng key nội bộ riêng (/proxy/internal-token) sau khi bind-shop giết key global; hash-only, actor+ticket bắt buộc, JWT 15m.
metadata:
  type: project
---

Bind integration key vào shop (FAL-757 blog, FAL-746 seo) làm chết 64 tool TS AI (19 blog + 45 seo):
tool cầm 1 key global rồi đổi `?shop=`, sau fix trả `403 Access token is not valid for this shop`.

Thay bằng credential loại hai, KHÔNG nới key merchant — MR blog !874, seo !2207 (mở 2026-08-28):
collection `internalKeys` riêng, lưu **chỉ SHA-256**, exchange ở `/proxy/internal-token`
(blog: POST body; seo: GET query — theo idiom từng repo), key luôn ở header `Authorization`.
`actor` (người, không phải tên service) + `ticket` bắt buộc, thiếu → 400. JWT 15m (merchant 2h),
mang `internal: true`. Audit `internalKeyAudits`: 1 doc mỗi exchange + 1 doc mỗi request non-GET.
Seo còn re-check key mỗi request nên revoke giết cả session đang sống; blog thì chờ exchange kế.

Mint/revoke bằng `packages/functions/scripts/internal-key.js` (list|mint|revoke), token in một lần.

**Why:** Tony chọn full quyền cho key này (tool có write), IP động nên không allowlist được — nên
thứ giữ được trách nhiệm chỉ còn hash + TTL ngắn + actor/ticket + audit + revoke.

**How to apply:** app khác dính cùng lỗi (xem [[integration-key-unbound-fleetwide]]) thì bê nguyên
shape này, đừng thêm cờ `allShops` vào `integrationKeys`.
