---
name: agent-autonomy-mr-not-merge
description: Agent chạy việc được tự quyết + tự mở MR từ feature branch; KHÔNG merge, KHÔNG push base branch, KHÔNG tag/deploy. Hỏi ít.
metadata:
  type: feedback
---

Tuan (2026-09-30): workflow agent (tony-wf, và harness/loop sau này) phải "tránh hỏi nhiều, được quyết". Được: tự chọn thiết kế trong phạm vi brief, tự duyệt plan từng task, commit + push feature branch, mở MR (Draft nếu auth/billing/credit/prod data). Cấm: merge MR, push master/main, force push, tạo tag (tag = deploy prod ở seo/blogs), deploy.

**Why:** hỏi = run đứng chờ anh quay lại; MR là điểm review tự nhiên, merge/tag mới là chỗ rủi ro prod.

**How to apply:** chuyện mơ hồ → chọn phương án rẻ nhất để đảo ngược, ghi vào `## Decisions` của brief, chạy tiếp. Chỉ hỏi (gộp 1 tin) khi brief mâu thuẫn làm đổi thứ được build, finding security muốn giữ, lộ secret, hoặc cần thứ trong cột cấm. Đã ghi vào `~/.claude/skills/tony-wf/SKILL.md` mục Authority. Liên quan [[personal-loop-health]].

**Enforced 2026-09-30:** PreToolUse hook `~/.claude/hooks/git_guard.py` (17 test, `test_git_guard.py`) + PostToolUse `mr_notify.py` (DM MR link qua `hermes send -t telegram:1178722633`). Đã bỏ `ask: Bash(git push:*)` và `Bash(git -C * push *)` khỏi settings vì rule ask thắng hook allow; hook tự trả `ask` cho push lẫn trong chuỗi lệnh / detached HEAD / không parse được. Backup settings cũ ở scratchpad session 91302471.

**Lỗ 1 vá 2026-09-30:** git_guard giờ chỉ allow push nhánh phụ khi tree của tip có row pass=1 trong ledger agent-harness (`~/.cache/agent-harness/ledger.db`, đọc read-only); chưa verify → ask. 22 test. mr_notify cũng bắt `open-mr.mjs`.
