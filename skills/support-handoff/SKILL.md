---
name: support-handoff
description: Dev dán 1 link support (Slack permalink hoặc Jira key) → agent đọc message + cả thread Slack (hoặc task Jira), tóm tắt vấn đề khách hàng, hỗ trợ fix nếu cần → khi dev báo done thì soạn tin báo test (link MR, đã deploy đâu, nhờ Tech Lead + Tester test lại), post reply vào thread gốc tag đúng người, rồi chuyển Jira sang "Waiting to test" theo draft-first. Dùng khi dev gõ "/support-handoff", "xử lý task support (của khách) này", đưa 1 link Slack/Jira support nhờ xử lý, hoặc "fix xong rồi, nhắn Slack báo Tech Lead + Tester test lại giúp". KHÔNG dùng để sinh test brief/test case từ code diff (đó là skill testing).
title: support-handoff — dev-side support handoff
audience: dev
updated: 2026-07-21
related: [prerequisites, pipeline, roster, render-slack]
user_invocable: true
---

# support-handoff — dev tự chủ quy trình support qua agent

`$DIR` = thư mục skill này. Script: `$DIR/scripts/...`.

**Điều kiện chạy** (đọc lần đầu trên máy mới): `references/prerequisites.md` — cần Node ≥18,
`SLACK_TOKEN` (xoxp), `JIRA_TOKEN`. Roster Slack UID có sẵn trong repo
(`nhan-su/roster.json`) — không phải onboard. Thiếu token → dừng, báo.

## Step 0 — Preflight token (BẮT BUỘC, chạy TRƯỚC mọi bước)

Trước khi làm bất cứ việc gì, chạy:

    node "$DIR/../../scripts/preflight-env.mjs" support-handoff

- Exit 0 (không in gì) → token đủ, tiếp tục quy trình.
- Exit ≠ 0 → script đã in hướng dẫn set up token còn thiếu. DỪNG NGAY: chuyển nguyên hướng dẫn đó cho user, KHÔNG chạy tiếp bước nào, KHÔNG tự điền token.

## Guard (đọc trước)
- **Draft-first tuyệt đối:** in draft tin Slack ra chat, CHỜ dev gõ duyệt ("ok"/"post") mới chạy
  `post-slack.mjs --confirm`. Không tự post.
- **Đổi status Jira chỉ SAU khi post Slack thành công**, cùng lượt duyệt (không hỏi lần 2).
  Không có transition phù hợp (exit 2) → non-fatal, ghi báo cáo, đừng dừng.
- Post reply vào **thread support gốc**, KHÔNG mở tin mới / channel khác.
- KHÔNG đụng code/production ngoài phần dev chủ động fix.
- Thiếu `SLACK_TOKEN`/`JIRA_TOKEN` → dừng, báo, không cố post.

## Pipeline
Theo `references/pipeline.md` — tự đủ:
1. **Intake** — dev dán link → `node $DIR/scripts/parse-link.mjs "<link>"`.
2. **Context** — Slack: `read-thread.mjs <channel> <threadTs>` (lấy message + jiraKeys); Jira:
   `fetch-task.mjs <key>`. Ra Jira key + nội dung khách.
3. **Tóm tắt** — in tóm tắt vấn đề khách cho dev.
4. **Fix (tuỳ chọn)** — hỏi dev có cần hỗ trợ fix; dev tự làm hoặc nhờ agent.
5. **Done → gom info** — `resolve-mr.mjs` (fallback hỏi dán MR); hỏi deploy target; `roster.mjs` cho
   dev chọn Tech Lead + Tester.
6. **Draft** — render tin theo `references/render-slack.md`, in ra chat, chờ duyệt.
7. **Post & status** — dev OK → `post-slack.mjs --confirm` rồi `set-status.mjs --confirm`. In link.

## Báo cáo cuối
Bảng: task | tóm tắt | MR | deploy | đã post Slack? | status → Waiting to test? | ghi chú.

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-17 | LamLN | Tạo skill support-handoff (dev-side support handoff cho team-ops) |
| 2026-07-17 | LamLN | Bỏ prereq CLI GitLab ma (copy nhầm từ skill khác) khỏi điều kiện chạy + guard — skill này không shell ra tiến trình ngoài nào (review batch 2/2 docs) |
| 2026-07-21 | LamLN | Roster Slack UID gộp về nguồn chung `nhan-su/roster.json` (commit trong repo, khoá `jiraUsername`) — bỏ bước onboard `roster.json` từng máy |
| 2026-07-21 | LamLN | Wrapper Slack + đọc token chuyển sang lib chung `scripts/lib/`; `parsePermalink` nay chặn host ngoài (ném `BAD_PERMALINK` thay vì trả null) |
