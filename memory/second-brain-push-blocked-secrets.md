---
name: second-brain-push-blocked-secrets
description: second-brain không push được 07-30→09-23 vì GitHub push protection (GH013); brain.py chỉ in WARN nên fail câm 23 đêm
metadata:
  node_type: memory
  type: project
  originSessionId: 5a94b883-9706-43b4-9ded-2efb96ad2add
  modified: 2026-09-23T09:47:40.684Z
---

`brain.py sync` commit mỗi đêm nhưng `gitutil.commit_push` chỉ in
`WARN push failed (commit is safe locally)` rồi chạy tiếp → 136 commit tồn local,
GitHub đứng ở bản 2026-07-30 suốt gần 2 tháng mà không ai biết. Lỗi thật:
`GH013 Repository rule violations` — push protection bắt secret trong
`tools/prod-error-autofix/brain/` + `scripts/jev-eval/eval.jsonl`.

Đã xử lý 2026-09-23: redact 75 giá trị thật + rewrite 183 commit bằng
`git filter-repo --replace-text`, force push. Fixture giả trong test cũng bị chặn
(đúng shape) → phải ghép chuỗi lúc runtime, xem `test/fixtures/fakeSecrets.ts`.
`filter-repo` xoá remote `origin` mỗi lần chạy — nhớ `git remote add` +
`branch --set-upstream-to` sau đó.

**Why:** push fail câm = backup chết âm thầm; log `launchd/sync.log` có chữ WARN
nhưng không ai đọc.

**How to apply:** kiểm tra `git log @{u}..HEAD | wc -l` khi nghi sync; nếu thấy
GH013 thì tìm giá trị thật, đừng bấm link "allow secret" của GitHub.
Liên quan: [[prod-logs-leak-credentials]]
