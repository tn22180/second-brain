---
name: seoon-team-members
description: "Team SEOOn của Tuan = 6 người (tuannv, tunglv, truongnn, minhpt, dungtt, tranggt); \"team\" trong câu hỏi Jira nghĩa là 6 người này, không phải cả Board 1."
metadata:
  node_type: memory
  type: user
  originSessionId: f29f7be4-3af8-460f-90a2-9bf59de4d3ab
  modified: 2026-10-05T04:13:21.935Z
---

Khi Tuan nói "ae trong team" thì là **6 người SEOOn**: tuannv (TL), tunglv, truongnn, minhpt (dev),
dungtt, tranggt (tester). Tuan nói 2026-10-05.

**Why:** team-roster.json của skill jira gộp cả Board 1 (Linh · Tuân · Lâm, 14 người: PO, BA, lamln,
hailt, taing, ducnm01, designer…). Sprint FAL còn dùng chung với Board 2. Lọc theo roster thì ra sai người.

**How to apply:** báo cáo task/point "của team" chỉ lọc 6 username trên. Point lấy theo vai trò: dev → devPoint
(customfield_11204), tester → testerPoint (customfield_11202). Point của tuannv (Tuan nói 2026-10-05):
task chỉ mình tuannv là dev → **100%** devPoint; task có dev khác (tunglv, truongnn, minhpt), kể cả task có
tên tuannv → tuannv chỉ được **20%** devPoint, mỗi task tính một lần. Không cộng 100% + 20% trên cùng task. "Dung" = dungtt (tester), không phải dungta (designer).
