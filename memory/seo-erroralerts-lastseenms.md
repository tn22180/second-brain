---
name: seo-erroralerts-lastseenms
description: errorAlerts đổi field lastSeen→lastSeenMs từ 2026-07-23; mọi reader order theo lastSeen trả về feed đóng băng ở tháng 7, không phải pipeline chết.
metadata:
  type: reference
---

`errorAlerts` (cả 5 app) **không chết**. Ngày 2026-07-23 writer chuyển sang npm
`avada-prod-error-alert` (unscoped) và đổi schema:

| cũ | mới |
|---|---|
| `count` | `totalCount` |
| `firstSeen` / `lastSeen` (Timestamp) | `firstSeenMs` / `lastSeenMs` (epoch ms) |
| — | `appName`, `suppressed` |

Firestore **loại doc thiếu field orderBy**, nên `--order lastSeen:desc` chỉ trả doc trước
07-23 → nhìn như feed đứng im 2 tháng. Đã sửa reader: `falcon-bug-fix-agent/src/diagnose.js`
(buildProdLogsSection) và `~/.claude/skills/prod-logs/SKILL.md`.

TTL `errorAlerts` = **1 ngày** (app không truyền `ttlMs`, lib lấy default), nên không có doc
cũ hơn ~24h. "Không thấy lỗi" ≠ "không có lỗi".

Trạng thái đo 2026-09-21: seo / blogs / AEO có doc mới. **APC (`ai-product-copy`) rỗng hoàn
toàn** — xem [[apc-prod-error-no-consumer]]. image-optimizer chưa đọc được, xem
[[falcon-bot-img-sa-key-revoked]].

Liên quan: [[seo-prod-error-slack-pipeline]]
