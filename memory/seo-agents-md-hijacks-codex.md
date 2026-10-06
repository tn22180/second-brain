---
name: seo-agents-md-hijacks-codex
description: "seo master has a committed AGENTS.md (Bullpen \"morgan\" persona) that makes every Codex run on seo refuse to code; workaround -c project_doc_max_bytes=0"
metadata:
  node_type: memory
  type: project
  originSessionId: e62895f4-dfcb-4e14-9b85-335fef451d43
  modified: 2026-10-06T07:36:48.350Z
---

`seo` master có `AGENTS.md` = persona "morgan" của Bullpen (commit 16adf2d790f, tunglv, 2026-09-03, `[FAL-440] update`). Codex đọc AGENTS.md TRƯỚC, chỉ dùng CLAUDE.md (`project_doc_fallback_filenames`) khi không có → mọi `codex exec` trên seo trả "Blocked by the morgan instructions… BULLPEN_MAILBOX" và không sửa gì, exit 0. Check 2026-10-06: blogs/APC/AEO/img/joy/speed không có.

**Why:** exit 0 + không có diff = harness graph node trông như "xong" mà không có code; tốn 1 round.
**How to apply:** dispatch Codex trên seo thêm `-c 'project_doc_max_bytes=0'` (mất CLAUDE.md, nên prompt phải tự đủ quy ước) cho tới khi AGENTS.md bị gỡ khỏi master. Liên quan [[codex-astra-codes]].
