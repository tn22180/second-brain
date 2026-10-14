---
name: rich-results-test-automation
description: "Cách tự chạy Google Rich Results Test code mode qua Playwright MCP — click chuột vào tab CODE không ăn, phải dùng bàn phím + CodeMirror.setValue"
metadata:
  node_type: memory
  type: reference
  originSessionId: 26b7f52b-67f6-4c2b-8dd3-230ed61d5711
  modified: 2026-10-14T08:12:06.650Z
---

Rich Results Test (search.google.com/test/rich-results) chạy được qua Playwright MCP `--extension` (đã login tuannv@avadagroup.com), dùng `browser_run_code_unsafe`:
- Tab CODE: click chuột timeout/không chọn. Dùng `getByRole('tab').nth(0).focus()` → `ArrowRight` → `Enter`, lặp tới khi có `.CodeMirror` hiển thị.
- Nạp code: `document.querySelector` CodeMirror đang hiển thị → `.CodeMirror.setValue(html)`; nút "TEST CODE": focus + Enter.
- `filename` chỉ nhận file trong `~/Documents/second-brain` (hoặc `.playwright-mcp/`); không có `require`/fs trong code → nhúng HTML thẳng vào file JS.
- Render liquid theme extension để test: liquidjs ở `seo/node_modules/liquidjs`, stub filter `json`/`image_url`/`img_url`.

Luật Google hay vấp: mọi Product/ProductGroup phải có 1 trong `offers`/`review`/`aggregateRating`, thiếu là critical. Áp cho seo !2407 (ẩn offers theo template). Liên quan [[theme-extension-render-in-jsonld]].
