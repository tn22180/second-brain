---
name: avada-components-proxy-tokens-public-npm
description: public npm avada-components-seoon hardcode 5 proxy token (SEO/BLOG/IMAGE/AI/AEO) từ 2025-06; bundle vào FE cả 5 app → rotate bắt buộc, sửa lib trước
metadata:
  type: project
---

`avada-components/src/config/constants.ts:18-22` export cứng `*_PROXY_ACCESS_TOKEN` cho 5 app.
Publish public npm `avada-components-seoon` (tạo 2025-06-06, 2.2.0 ngày 2026-09-22), bundle vào
`packages/assets` của SEO/BLOG/APC/AEO/IMG-OPT → token có trong npm tarball + JS merchant tải.
Phát hiện 2026-09-23 khi agent APC build bundle và vẫn thấy key sau khi bỏ import `@functions`.

**Why:** version npm không xoá được thực tế → token coi như public vĩnh viễn; kết hợp
[[integration-key-unbound-fleetwide]] thì token proxy = đọc/ghi shop bất kỳ.

**How to apply:** thứ tự: sửa lib (gọi qua backend app) → rotate 5 token → bump lib ở 5 app.
Rotate trước khi lib sửa = token mới lại lộ ở bản publish kế. Plan ở
`jobs/security/fix/README.md` mục Khẩn #3.
