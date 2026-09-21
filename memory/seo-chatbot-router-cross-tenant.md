---
name: seo-chatbot-router-cross-tenant
description: seo /chatbot/* dùng 1 bot token toàn cục + seoController.get lấy shopId từ query → đọc settings (google.tokens) của bất kỳ shop nào
metadata:
  type: project
---

`seo` router `/chatbot/*` (`routes/chatbot.js:15`) chỉ gác bằng `verifyAccessToken`
(`middleware/chatbot/verifyAccessToken.js`): so sánh header `X-Avada-Access-Token` với **một**
`config.botAccessToken` dùng chung, KHÔNG bind shop. Trong khi đó `seoController.get` lấy shop từ
query: `const shopID = shopId || getCurrentShop(ctx)` (`controllers/seoController.js:139`), và chỉ
mask `instantIndexing`, không strip `google.tokens` (`seoController.js:189`).

Hệ quả (xác nhận trên origin/master 906a7e67af, 2026-09-21): ai cầm bot token gọi
`GET /chatbot/settings?shopId=<id shop khác>` đọc được GSC OAuth access+refresh token của shop đó.
Cùng lỗ hổng này cũng áp cho `GET /api/settings` (merchant đã auth truyền `?shopId=` của shop khác).

**Why:** cùng họ với [[integration-key-unbound-fleetwide]] — key/token xác thực không gắn tenant;
MR !2286 chỉ vá nhánh MCP nên đừng coi ticket MCP là đã đóng mặt phẳng.

**How to apply:** khi audit rò secret ở seo, kiểm tra CẢ 3 nhánh của `seoController.get`
(/api, /chatbot, MCP). Nhánh MCP ĐÃ bind shop đúng (`handlers/mcp.js:104` trả 403 nếu
`connection.shopifyDomain !== pathShop`) — hai nhánh kia thì không.
