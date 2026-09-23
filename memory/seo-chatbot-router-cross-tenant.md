---
name: seo-chatbot-router-cross-tenant
description: seo /chatbot router ĐÃ XOÁ khỏi master (868ca4b90ff); nhánh /api/settings ?shopId= override vẫn còn
metadata:
  type: project
---

`/chatbot/*` (bot token dùng chung, shopId từ query → đọc `google.tokens` shop bất kỳ) đã bị gỡ
hẳn khỏi `origin/master` ở `868ca4b90ff` "remove the dead /chatbot router" — trước đó tồn tại tới
2026-09-21. Prod chỉ hết khi cắt tag chứa commit đó ([[seo-prod-deploy-by-tag]]).

Phần CÒN SỐNG (verify 2026-09-23 @ 0547925a9cb): `seoController.get` +
`subscriptionController.getSubscription` vẫn nhận `?shopId=` override thay vì session — nằm
trong `jobs/security/fix/02-seo.md` task 6.

**Why:** cùng họ [[integration-key-unbound-fleetwide]] — định danh tenant lấy từ request.

**How to apply:** trước khi báo lỗ này còn ở prod, `git tag --contains 868ca4b90ff`.
