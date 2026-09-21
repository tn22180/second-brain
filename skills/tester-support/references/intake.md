---
title: "tester-support · intake — từ thread Slack đến task Jira"
audience: tester
updated: 2026-08-12
related: [verify.md, ../SKILL.md, ../../jira/SKILL.md]
---

# Intake — khách/CS báo lỗi trên Slack → confirm bug → task Jira → tin tag dev

> Chạy tuần tự TỪNG BƯỚC, không nhảy cóc. Gặp ⛔ GATE chưa thoả → DỪNG ở đó.
> Người TỰ TEST và DUYỆT mọi tin gửi đi; agent lo đọc, soạn, tạo task, post hộ.

## Bước 1 — Đọc thread

Tester đưa link thread Slack. Chạy:

```bash
node <skill-root>/scripts/read-thread.mjs '<permalink>'
```

(`<skill-root>` = thư mục skill này; script đọc token từ biến môi trường trước, rồi mới tới `.env`.)

- Lỗi `MISSING_SLACK_TOKEN` → hướng dẫn tester: thêm `"SLACK_TOKEN": "xoxp-…"` vào khối `env` của `~/.claude/settings.json`, khởi động lại Claude Code, chạy lại. Cách lấy token: `docs/setup.md` mục 5.
- Lỗi `SLACK_API_ERROR … channel_not_found / not_in_channel` → token không vào được channel. **Fallback:** xin tester copy-paste nội dung thread vào chat, đi tiếp Bước 2 bình thường (các bước post sau đó sẽ đưa draft để tester tự gửi tay).

## Bước 2 — Tóm tắt & GATE tự test

Từ JSON thread, tóm tắt: **app nào · lỗi gì · khách nào bị · bước tái hiện (nếu đọc ra được)**. Hỏi tester:

> "Anh/chị đã test lại chưa? Xác nhận đúng là bug không? (đúng bug / không phải bug / chưa test)"

⛔ **GATE 1:**
- "chưa test" → DỪNG. Nhắc tester test trước — bước test là của người, agent không test hộ.
- "không phải bug" → soạn draft tin giải thích cho thread (vì sao không phải bug / hành vi đúng là gì — KHÔNG dùng template confirm bug ở Bước 5, KHÔNG có link Jira), rồi áp dụng đúng cơ chế duyệt + post của Bước 5-6 (⛔ chờ tester duyệt draft → mới post). KẾT THÚC, không tạo task.
- "đúng bug" → đi tiếp.

## Bước 3 — Tạo task Jira (qua skill jira)

Gọi skill `jira` (`/falcon:jira`) tạo issue theo **Nhánh A — khách/CS báo trên production**
(`create.md` Bước 2b): issuetype **`Task`** (không phải Bug), summary `[BUG][<App>] <mô tả>`, **KHÔNG
link** tới task nào. **Không hỏi lại câu phân nhánh** ("production hay feature đang phát triển?") ở đây —
nguồn của intake luôn là 1 thread Slack khách/CS, tức luôn là Nhánh A; hỏi lại là thừa. Nhánh đã chọn vẫn
hiện rõ ở DRY-RUN (issuetype, summary, không link) để tester đổi nếu thấy sai.

Description PHẢI kèm:
- Bước tái hiện (từ thread + bổ sung của tester)
- Mức nghiêm trọng tester đánh giá
- Dòng: `Thread Slack: <permalink>` ← **bắt buộc** — chế độ verify dùng dòng này để nối lại thread.

Skill jira trả về **key + link** (vd `FAL-234`) → giữ lại cho Bước 5.

## Bước 4 — Gợi ý người tag

Đọc `<skill-root>/../jira/team-roster.json`: từ app bị lỗi → team → lấy `dev` phụ trách; không rõ dev nào → `techlead` của team đó — ra **username Jira** (vd `hailt`).

Lấy Slack UID từ nguồn chung `<skill-root>/../../nhan-su/roster.json`: tra trong mảng `members` theo **`jiraUsername`** vừa có. **Không tra theo tên** — team có tên trùng (`tranggt` ≠ `trangdt`, `dungta` ≠ `dungtt`).

Đề xuất cho tester: *"Em định tag: @<tên> (dev app X) — ok hay đổi người?"* → **tester chốt**.
`slackUid` rỗng → tag bằng tên thường trong tin (Slack không resolve thành mention) + nhắc tester bổ sung UID vào `nhan-su/roster.json` (xem `skills/support-handoff/references/roster.md`).

## Bước 5 — Draft tin confirm bug

Soạn draft theo khung (điều chỉnh tự nhiên, giữ đủ 4 ý):

```
<@SLACK_ID> Em đã test lại và xác nhận đúng là bug ạ.
- Lỗi: <tóm tắt 1 dòng>
- Chi tiết + bước tái hiện: <link Jira FAL-xxx>
Nhờ anh/chị check giúp em ạ.
```

⛔ **GATE 2: Hiện draft, chờ tester duyệt.** Tester sửa → cập nhật draft, hỏi lại. CHỈ KHI tester đồng ý mới sang Bước 6. **KHÔNG BAO GIỜ post khi chưa duyệt.**

## Bước 6 — Post & chốt

```bash
node <skill-root>/scripts/post-message.mjs '<permalink>' --text '<draft đã duyệt>'
```

- Post fail → báo lỗi, giữ nguyên draft để tester gửi tay. KHÔNG tự retry.
- Post ok → báo tester: *"Đã post + tạo <FAL-xxx>. Khi dev báo fix xong, quay lại chạy chế độ **verify** với link task hoặc link thread."*

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-17 | LamLN | Tạo mới theo spec tester-support |
| 2026-07-21 | LamLN | Bỏ `slack-ids.json` — Slack UID lấy từ nguồn chung `nhan-su/roster.json`, tra theo `jiraUsername` |
| 2026-07-22 | LamLN | Hướng dẫn `MISSING_SLACK_TOKEN` trỏ sang `~/.claude/settings.json` thay vì `cp .env.example .env` |
| 2026-08-12 | LamLN | Sửa Bước 3: theo luật phân nhánh bug mới (create.md Bước 2b) — intake luôn xuất phát từ thread Slack khách/CS nên luôn là Nhánh A (issuetype `Task`, không link), không còn tạo Bug; không hỏi lại câu phân nhánh vì nguồn đã chắc chắn |
