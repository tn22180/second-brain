---
name: review-mr-queue
description: Pull hết task Jira "waiting to review" assign cho Tech Lead → tìm MR GitLab (field Merge Request, fallback link trong description) → checkout MR về worktree cô lập, diff với origin/master mới nhất, chạy code-review + security-review built-in → format dễ đọc rồi post note GitLab + comment Jira theo draft-first. Dùng khi user gõ "/review-mr-queue", "review task chờ duyệt", "review MR của tôi", "soát MR waiting to review".
user_invocable: true
---

# review-mr-queue — soát MR các task chờ duyệt (Tech Lead)

`$DIR` = thư mục skill này. Đường dẫn script: `$DIR/scripts/...`.

**Điều kiện chạy** (lần đầu trên máy mới đọc kỹ): `references/prerequisites.md` — cần Node, `glab` đã auth,
`JIRA_TOKEN`, built-in `code-review`+`security-review`, repo clone local. Thiếu token/`glab` → dừng, báo.

## Guard (đọc trước)
- **Draft-first tuyệt đối:** in draft ra chat, CHỜ anh gõ duyệt ("ok"/"OK hết"/"post") mới chạy `post-comment.mjs --confirm`. Không tự post.
- **Worktree cô lập:** luôn dọn worktree sau review; không đụng working tree/nhánh gốc.
- **Base = origin/master mới nhất:** luôn `git fetch origin` trước diff.
- Chỉ comment + chuyển status Jira sang **Reviewing** (bước 6). KHÔNG đụng code/production.
- Chuyển status **chỉ sau khi comment Jira post thành công**, và đi kèm cùng lượt duyệt của anh (không hỏi duyệt lần 2). KHÔNG có transition phù hợp (exit 2) → coi là non-fatal (task có thể đã ở Reviewing), ghi vào báo cáo, đừng dừng cả pipeline.
- Thiếu `JIRA_TOKEN` / `glab` chưa auth → dừng, báo, không cố post.

## Pipeline
1. **Pull queue:** `node $DIR/scripts/fetch-queue.mjs` → list task. Rỗng → báo "không có task chờ review" và dừng.
2. **Resolve MR** mỗi task: pipe task qua `node $DIR/scripts/resolve-mr.mjs`. `found=false` → skip, ghi vào báo cáo cuối.
3. **Review** mỗi task có MR: map projectPath → repo local qua `node $DIR/scripts/resolve-repos.mjs --path <projectPath>`; `localPath` null → chạy onboard (`references/onboarding-repos.md`: tự tìm rộng → hỏi xác nhận → nhớ cache), repo vẫn không có → skip + ghi báo cáo. Theo `references/review-core.md` (worktree + built-in `code-review` + `security-review` + gom findings). Worktree LUÔN được dọn sạch (bước §4) trước khi sang task tiếp theo, kể cả khi review lỗi.
4. **Draft:** render findings theo `references/render-gitlab.md` + `references/render-jira.md`. In CẢ 2 draft (GitLab note + Jira comment) ra chat cho từng task.
5. **Duyệt & post:** chờ anh OK. Khi duyệt: 
   - `echo "<note>" | node $DIR/scripts/post-comment.mjs --mr <iid> --repo <projectPath> --confirm`
   - `echo "<comment>" | node $DIR/scripts/post-comment.mjs --key <FAL-xxx> --confirm`
   In link comment để anh kiểm.
6. **Chuyển status Reviewing:** ngay sau khi comment Jira của task đó post OK:
   - `node $DIR/scripts/set-status.mjs --key <FAL-xxx> --confirm` (mặc định → "Reviewing"; đổi đích bằng `--to "..."`).
   - Chạy dry-run trước (bỏ `--confirm`) để xem transition sẽ dùng nếu muốn chắc.
   - Exit 2 (không có transition) → ghi "đã ở Reviewing / workflow không cho", KHÔNG coi là fail.

## Báo cáo cuối
Bảng: task | có MR? | #findings | đã post? | status → Reviewing? | ghi chú (skip vì lý do gì).

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-16 | LamLN | Portable hoá cho mọi Tech Lead: bỏ đường dẫn cứng, token/field id đa nguồn, map repo động qua `resolve-repos.mjs` (auto-search + cache + onboard) thay bảng cứng; thêm `prerequisites.md`, `onboarding-repos.md`; phát hành sang team-ops |
