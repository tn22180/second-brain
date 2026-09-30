---
name: no-jira-for-own-tooling
description: Việc tooling/harness/loop cá nhân của Tuan không tạo task Jira FAL; pilot harness chạy qua tony-wf/brief, không cần ticket.
metadata:
  type: feedback
---

Tuan (2026-09-30): "cái jira không cần tạo task cho những thứ như này đâu" — harness, loop-health, hook, skill là tooling của anh, không đi qua Jira FAL.

**Why:** Jira là cho việc sản phẩm của team; tooling cá nhân mà gắn ticket chỉ thêm thủ tục.

**How to apply:** đừng đề xuất tạo FAL cho việc kiểu này, đừng bắt pilot harness chờ ticket thật. Chạy thử harness qua `tony-wf` (brief file) hoặc task trực tiếp. `jira-fix` vẫn dùng harness khi có ticket thật, nhưng không phải đường duy nhất. Liên quan [[agent-autonomy-mr-not-merge]].
