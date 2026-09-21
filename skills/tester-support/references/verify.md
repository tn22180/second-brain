---
title: "tester-support · verify — fix xong, verify, Done, báo thread"
audience: tester
updated: 2026-07-17
related: [intake.md, ../SKILL.md]
---

# Verify — dev fix xong → tester verify → evidence → Done → báo lại thread

> Chạy tuần tự TỪNG BƯỚC. Gặp ⛔ GATE chưa thoả → DỪNG ở đó.

## Bước 1 — Nối lại ngữ cảnh

Tester đưa **link task Jira** (hoặc key `FAL-xxx`, hoặc link thread Slack).

```bash
node <skill-root>/scripts/jira-actions.mjs get FAL-xxx
```

- Từ `description`, tìm dòng `Thread Slack: <permalink>` → lấy permalink cho Bước 5.
- Không có dòng đó (task tạo ngoài luồng intake) → hỏi tester xin link thread.
- Tester đưa link thread thay vì task → hỏi tester key task tương ứng.

## Bước 2 — GATE đã test lại

Hỏi: *"Anh/chị đã test lại trên prod/staging chưa? Hết lỗi chưa? (hết lỗi / còn lỗi / chưa test)"*

⛔ **GATE 1:**
- "chưa test" → DỪNG, nhắc test trước.
- "còn lỗi" → soạn draft RIÊNG báo dev còn lỗi (mô tả lỗi còn lại + môi trường — KHÔNG dùng khung "hết lỗi / task đã chuyển Done" của Bước 5, không có câu chuyển Done), áp dụng đúng cơ chế GATE 3 duyệt + post của Bước 5. Bỏ Bước 3-4, task GIỮ NGUYÊN status. KẾT THÚC.
- "hết lỗi" → đi tiếp.

## Bước 3 — Evidence

Xin tester path ảnh evidence (đã test hết lỗi trên prod/staging).

⛔ **GATE 2: chưa có evidence → KHÔNG transition Done.** Tester nói "khỏi evidence" → giải thích SF8 yêu cầu evidence để lưu vết, vẫn DỪNG chờ file.

```bash
node <skill-root>/scripts/jira-actions.mjs attach FAL-xxx <path-1> [path-2 …]
```

## Bước 4 — Done

```bash
node <skill-root>/scripts/jira-actions.mjs transition FAL-xxx "Done"
```

Lỗi `NO_SUCH_TRANSITION` → báo tester danh sách transition khả dụng (in sẵn trong message lỗi), hỏi chọn status trung gian đúng workflow board.

## Bước 5 — Draft tin báo done & post

Khung draft (giữ đủ ý: đã test lại · môi trường · hết lỗi · evidence ở Jira · task Done):

```
Em đã test lại trên <prod/staging> và xác nhận hết lỗi ạ.
Evidence em attach trong task <link Jira FAL-xxx>, task đã chuyển Done.
Cảm ơn anh/chị đã fix ạ.
```

⛔ **GATE 3: chờ tester duyệt draft.** Duyệt xong:

```bash
node <skill-root>/scripts/post-message.mjs '<permalink>' --text '<draft đã duyệt>'
```

Post fail → giữ draft cho tester gửi tay, KHÔNG retry. Post ok → nhắc tester: nếu bug đáng lưu, thêm case hồi quy bằng `/falcon:testing` (chế độ testcases) — theo SF8 bước 5.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-17 | LamLN | Tạo mới theo spec tester-support |
