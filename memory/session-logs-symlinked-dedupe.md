---
name: session-logs-symlinked-dedupe
description: ~/.claude/projects chứa symlink do harness/resume.py tạo — mọi script đếm session phải bỏ islink, không thì đếm trùng ~2-4x.
metadata:
  type: reference
---

`harness/resume.py` (resume-all) symlink mọi session của mọi project vào `~/.claude/projects/-Users-nguyentuan-Documents-second-brain/` để `/resume` liệt kê hết. Glob `*/*.jsonl` vì vậy đọc mỗi session nhiều lần: 30 ngày tới 10-08 có 1.541 dòng nhưng chỉ 844 session thật; số round autofix bị thổi từ 109 lên 464.

**Why:** audit 7-Level 10-01 và số nền retro autofix đều dính lỗi này; phải sửa lại ở 10-08.
**How to apply:** mọi audit hay retro đọc transcript thì `if os.path.islink(path): continue` (đã vá trong `harness/retro_autofix.py`). Liên quan [[autofix-absence-evidence-retro]].
