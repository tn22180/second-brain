---
name: ask-rule-prefix-git-c
description: "`Bash(git push:*)` ask rule không khớp `git -C <path> push` hay lệnh bọc for-loop → auto mode classifier deny thẳng, không hỏi Tuan"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 04b399c5-8074-49c2-ac4e-c3d1b43184af
  modified: 2026-09-23T07:20:36.939Z
---

Rule `ask` là prefix match. `git -C <path> push …` và `for …; do git … push; done` KHÔNG khớp `Bash(git push:*)` → rơi xuống auto-mode classifier → bị deny thẳng (Modify Shared Resources) thay vì hiện prompt. Tuan muốn được hỏi, không muốn bị chặn câm.

Đã thêm `Bash(git -C * push *)` vào `ask` của `~/.claude/settings.json` (2026-09-23).

**Why:** 2026-09-23 push merge master lên 3 MR FAL-658 bị classifier chặn; Tuan: "bình thường m có hỏi để thêm vào rule mà".
**How to apply:** Lệnh ghi ra ngoài (push, glab mr, deploy) → chạy từng lệnh trần, 1 repo 1 lệnh, không bọc loop/biến, để khớp rule `ask` và hiện prompt. Bị deny bởi classifier thì kiểm tra xem lệnh có khớp prefix rule không trước khi bảo Tuan tự chạy.
