---
name: agent-harness-graph-learn
description: agent-harness có graph runner (B6) và learn hằng tuần (B7) từ 2026-09-30; runner không push, integration verify ghi tree tip vào ledger cho git_guard
metadata:
  type: project
---

`tools/agent-harness` (second-brain) từ 2026-09-30:
- `harness graph run <graph.json>`: node = contract + prompt, worktree riêng `<repo>-wt-<graph>-<node>`, `cc -p --permission-mode acceptEdits`, `jev supervise` 60s, verify, resume cùng session ≤5 round, commit đúng tree verify, merge `--no-ff` vào `branch`. Node song song phải allow rời nhau. Xong hết → verify tổng tree ở worktree tạm → ledger có row cho tip tree → git_guard cho push không hỏi. Runner KHÔNG push.
- `baseRef` chỉ dùng cho second-brain (main local đi trước origin); repo sản phẩm cắt từ `origin/<base>`.
- `harness learn`: thứ Hai 09:00 (launchd `com.tn22180.harness-learn`) → `jobs/learn/<date>.md` + DM; ngưỡng 10 task, chỉ đề xuất, không sửa skill.
- Verdict detail qua `redact()` trước ledger/Telegram. Contract có `meta {agent, model, round}` — thiếu meta thì learn không đếm.

**Why:** Tuan muốn lên bậc 6 (graph) và 7 (self-improve) sau khi harness vững.
**How to apply:** tony-wf "Graph mode" cho 3+ task hoặc task song song. Pilot đầu: `jobs/graphs/harness-minors.json`. Liên quan [[agent-autonomy-mr-not-merge]], [[telegram-dm-format]].
