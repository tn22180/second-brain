---
title: support-handoff — template tin báo test (render-slack)
audience: dev
updated: 2026-07-17
related: [pipeline, roster, prerequisites]
---

# Render tin báo test — support-handoff

> Chế độ "Draft" (bước 6) của [`pipeline.md`](pipeline.md). File này tự đủ: đọc xong render đúng tin, không cần mở file khác.

## Bối cảnh

Tin này **post-as-user** — `post-slack.mjs` dùng `SLACK_TOKEN` (xoxp, user token) nên tin hiện ra là **chính dev đang đăng**, không phải bot. Vì vậy xưng hô/giọng văn phải như **dev tự tay nhắn**, không phải giọng hệ thống/bot báo cáo.

## Template

```
:white_check_mark: *Đã xử lý xong* — nhờ mọi người review + test lại giúp
• *Vấn đề:* <tóm tắt 1-2 dòng vấn đề khách>
• *MR:* <webUrl>
• *Đã deploy:* <staging|production|cả hai>
• *Task:* <JIRA_BASE>/browse/<key>
cc <@UID-techlead> <@UID-tester>
```

## Điền từng dòng — lấy dữ liệu ở đâu

| Placeholder | Nguồn dữ liệu | Ghi chú |
|---|---|---|
| `<tóm tắt 1-2 dòng vấn đề khách>` | Tóm tắt agent đã đưa dev ở bước 3 của pipeline (từ `messages[].text` của thread hoặc `description` của task Jira) | Ngắn gọn, giọng khách hiểu được — không dán nguyên văn log kỹ thuật. |
| `<webUrl>` | `resolve-mr.mjs` → field `webUrl` khi `found:true`; hoặc MR link dev tự dán khi `found:false` (fallback) | Nếu chưa có MR (task không cần code change) → bỏ dòng `*MR:*` khỏi tin, đừng để trống link gãy. |
| `<staging\|production\|cả hai>` | Câu trả lời dev khi agent hỏi ở bước 5 của pipeline | Không tự suy đoán — luôn hỏi dev, vì đây là thông tin chỉ dev biết chắc. |
| `<JIRA_BASE>` | Hằng số `JIRA_BASE` trong `scripts/lib/config.mjs` (mặc định `https://space.avada.net`, override qua env `JIRA_BASE_URL`) | Ghép cùng `/browse/<key>`. |
| `<key>` | Jira key đã xác định ở bước 2 của pipeline (`FAL-xxx`) | |
| `<@UID-techlead>` `<@UID-tester>` | `roster.mjs` — dev chọn từ danh sách hiện ra (nguồn: `nhan-su/roster.json`, xem [`roster.md`](roster.md)) | Dùng nguyên cú pháp `<@U0XXXXXXX>` (Slack tự resolve thành mention khi post). Người chưa có `slackUid` → script in tên thường, Slack **không** tag được: báo dev và gợi ý bổ sung UID. |

## Ví dụ đã điền

```
:white_check_mark: *Đã xử lý xong* — nhờ mọi người review + test lại giúp
• *Vấn đề:* Khách báo ảnh sản phẩm không nén được trên theme Dawn, lỗi 500 khi bulk optimize >50 ảnh.
• *MR:* https://gitlab.com/avada/speed/-/merge_requests/224
• *Đã deploy:* staging
• *Task:* https://space.avada.net/browse/FAL-231
cc <@U0TL0001> <@U0TE0002>
```

## Nguyên tắc render

- **Giữ ngắn gọn** — đây là tin Slack, không phải báo cáo đầy đủ. Chi tiết kỹ thuật để lại trong task Jira, không nhồi vào tin.
- **1 tin duy nhất**, không tách nhiều tin nhỏ.
- Dòng nào không có dữ liệu (vd chưa xác định deploy target) → **hỏi lại dev** trước khi render, không tự điền "N/A" hay bỏ trống mập mờ.
- Emoji `:white_check_mark:` giữ nguyên cú pháp Slack shortcode (không đổi sang Unicode) — `post-slack.mjs` gửi thẳng text, Slack tự render shortcode phía client.
- Sau khi render, **in nguyên văn ra chat cho dev xem** (đúng dạng sẽ post) rồi mới hỏi duyệt — đây là bước "Draft" bắt buộc theo guard draft-first của `SKILL.md`.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-17 | LamLN | Tạo file — template tin báo test + bảng nguồn dữ liệu từng dòng + ví dụ đã điền |
| 2026-07-21 | LamLN | Nguồn UID trỏ `nhan-su/roster.json`; nêu cách xử lý khi người cần tag chưa có `slackUid` |
