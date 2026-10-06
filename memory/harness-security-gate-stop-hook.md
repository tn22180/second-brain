---
name: harness-security-gate-stop-hook
description: Harness security check fails review_unavailable at random on blogs — the repo's Stop hook check-docs.sh fires inside the reviewer's claude -p and eats its JSON turn.
metadata:
  type: project
---

`harness verify` gặp `security: review_unavailable: review trả về thứ không phải JSON có key findings` trên repo `blogs`. Ngày 2026-10-06 lỗi này chặn graph `blog-ai-writer-stall` (10 round) và `sec-p5-blogs`.

Nguyên nhân: `blogs/.claude/hooks/check-docs.sh` là Stop hook, block mọi session nào có code bị sửa mà `docs/` thì không. `securityGate` (`prod-error-autofix/src/verify/security.ts`) spawn `claude -p` ngay trong worktree đó, nên hook chạy cả trong session reviewer. Reviewer phải dùng lượt cuối để trả lời hook (numTurns 2–3), và lúc có lúc không còn khối JSON. Khi worktree sạch, hoặc diff có sửa `docs/`, reviewer chỉ chạy 1 turn và pass.

**Why:** test xanh mà node vẫn ⛔ sau 5 round. Runner đốt round sonnet vào một lỗi hạ tầng mà agent không thể sửa.

**How to apply:**
- Graph trên `blogs` thì cho `docs/features/<feature>.md` vào allow + diff. Repo cũng đòi điều này.
- Gặp `review_unavailable` thì xem `numTurns` trước khi nghi code.
- Fix gốc chưa làm: spawn reviewer không load hook của project.

Liên quan [[agent-harness-graph-learn]].
