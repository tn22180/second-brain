---
name: blogs-mcp-tools-free-by-design
description: "blogs MCP tools không trừ AI token là CỐ Ý (0215e3a95, 2026-09-08); audit báo \"MCP alt-text không charge\" là false positive"
metadata:
  node_type: memory
  type: project
  originSessionId: b5bb89c5-eccb-4694-98f6-60c203d0a438
  modified: 2026-10-07T08:31:18.543Z
---

MCP tools của blogs chạy free có chủ đích. Commit `0215e3a95` (2026-09-08, "stop charging shop AI tokens for every MCP tool") ghi ở `docs/features/mcp-tools.md`, và test `mcp/tools/__tests__/mcpFreeTokens.test.js` giữ quy tắc này. `tokensSpent`/`metered` trong tool chỉ là số analytics.

**Why:** 10-07 tao viết brief bắt MCP `generateAltText` trừ credit, dựa theo audit tự động. Codex làm theo, phải sửa luôn test `mcpFreeTokens`. Lúc review mới thấy, rồi revert (blogs !916).

**How to apply:** finding kiểu "tool tính phí mà không charge" ở blogs MCP thì coi như theo thiết kế, trừ khi Tuan đổi chính sách. Giới hạn chi phí MCP bằng cap (ví dụ 50 ảnh ở `chains.js`), không bằng cách trừ credit. Executor phải sửa một test có tên kiểu "never/không bao giờ" thì dừng lại hỏi, đừng merge. Liên quan [[autofix-absence-evidence-retro]].
