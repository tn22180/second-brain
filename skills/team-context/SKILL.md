---
name: team-context
description: "Tri thức vận hành team Falcon (Avada) — trả lời MỌI câu hỏi 'ai làm gì · ai quyết gì · làm tiếp bước nào · quy ước ra sao', kể cả khi câu hỏi cụt/mơ hồ (bật skill TRƯỚC rồi mới hỏi lại cho rõ). Gồm: xong việc rồi làm gì tiếp; ai deploy, ai bấm live, ai chốt go/no-go, khi nào rollback; giao task cho ai; quy ước Jira FAL (board, status, field Assignees) và task không lên board; khách báo lỗi bản thật xử lý sao; tài liệu/PRD/user guide app nằm đâu; sprint, 6 nhịp, subflow. Đây là skill TRẢ LỜI câu hỏi vận hành — KHÔNG dùng để: tạo issue (→ `jira`), chấm PRD đủ điều kiện giao Dev (→ `check-dor`), bàn giao Dev→Tester khi vừa code xong kể cả lúc gọi tên riêng người test (→ `testing`)."
user_invocable: true
---

# Team Falcon — tri thức vận hành

## Team là ai
Team product của **Avada / SEO On**, làm app Shopify mảng **SEO + tốc độ website**. Tự lo trọn vòng đời: nghiên cứu → roadmap → tài liệu nghiệp vụ → dev → test → hướng dẫn người dùng.

8 vai trò (SP tách 2 sub-role: CS + TS): **PO** · **BA** · **TL** (Tech Lead) · **Dev** · **QC** (Tester) · **UX** (Designer, ad-hoc) · **SP** (Support: CS + TS). CEO đứng ngoài team, cho định hướng.

## 6 nhịp làm việc
① Nảy ý tưởng → ② Làm rõ & viết tài liệu → ③ Làm & kiểm thử → ④ Duyệt kỹ thuật → ⑤ Lên sản phẩm → ⑥ Học & cải thiện → (quay lại ①)

Là **vòng lặp**, không phải đường thẳng. Hai cổng chất lượng: **"đã sẵn sàng làm chưa?"** (trước khi code) và **"đã xong chưa?"** (trước khi duyệt kỹ thuật).

## Ai quyết gì (rút gọn)

Ký hiệu: **Q** = người quyết · **b** = phải bàn/hỏi trước.

| Quyết định | Ai quyết (Q) | Phải bàn với (b) |
|---|---|---|
| Làm / không làm 1 request | **PO** | TL · SP |
| Thứ tự ưu tiên roadmap | **PO** | TL |
| Phạm vi (scope) tính năng | **PO** | BA · TL · Dev |
| Tiêu chí nghiệm thu | **BA** | PO · Dev · QC |
| Kiến trúc & chuẩn kỹ thuật | **TL** | PO · Dev |
| Cách code 1 task cụ thể | **Dev** | TL |
| Ưu tiên nợ kỹ thuật / refactor | **TL** | PO |
| Thời điểm deploy (an toàn) | **TL** | — |
| Rollback khi sự cố | **TL** | Dev · QC |
| Kết luận chất lượng (đạt/không) | **QC** | — |
| Chặn go-live (blocker) | **QC** | PO · TL · Dev (bàn tradeoff, không chặn đơn phương) |
| Go / no-go trước khi live | **PO** | TL · QC |
| Thiết kế UI (phần được giao) | **UX** | PO · BA · Dev |
| Cách xử lý 1 ticket | **SP** | — |
| Hứa tính năng / giá với khách | **PO** | SP |
| Đổi Vision / Strategic Theme | **CEO** | PO |

> **Nguồn sự thật đầy đủ:** [../../roles/interaction-matrix.md](../../roles/interaction-matrix.md). Nếu bảng trên và ma trận lệch nhau → **ma trận đúng**.

## Vài câu hay bị hỏi

- **Ai viết PRD? Ai duyệt?** → **BA viết** PRD + tiêu chí nghiệm thu; **PO duyệt** (PO không tự viết). Tài liệu *kỹ thuật* (kiến trúc/SRS) → TL/Dev.
- **Bug production thì làm gì?** → CS báo bug vào thread → TL + Tester đánh giá → **Tester tạo task & assign** → Dev fix + TL deploy → Tester test production & xác nhận. Chi tiết: [../../workflows/subflows/sf8-production-bug.md](../../workflows/subflows/sf8-production-bug.md).
- **Ai bấm deploy?** → **Tech Lead**, mở dần (canary 5–10% khách trước), rồi mở 100%.
- **Ai được tạo task Jira?** → chỉ role "Manager" trên FAL — 10 người (PO + 3 TL + 3 BA + 3 Tester). Xem `references/jira.md`.
- **Sprint chạy thế nào?** → 2 board team đều là **scrum**; sprint hiện chạy **chung cả Falcon** (đọc live: `GET /rest/agile/1.0/board/10028/sprint?state=active` — tại 04/09/2026 là **Falcon Sprint 4** (Jira id 66)); task định tuyến vào board theo field **Falcon App**.

## Cần sâu hơn → đọc

| Câu hỏi | Đọc |
|---|---|
| Vai trò cụ thể phụ trách gì, không phụ trách gì | [references/roles.md](references/roles.md) |
| Quy trình 6 nhịp, mối nối giữa vai trò (8 subflow) | [references/workflow.md](references/workflow.md) |
| Quy ước Jira: board FAL, status, field, naming | [references/jira.md](references/jira.md) |
| Team có app nào, tài liệu app nằm đâu | [references/apps.md](references/apps.md) |
| Ai quyết gì (bản đầy đủ) · ai bàn giao gì cho ai | [../../roles/interaction-matrix.md](../../roles/interaction-matrix.md) |
| Quy trình 6 nhịp (bản gốc đầy đủ) | [../../workflows/master-flow.md](../../workflows/master-flow.md) |

## Công cụ liên quan
Tạo task Jira → skill `jira`. Bàn giao Tester / sinh test case → skill `testing`. Changelog / release note → skill `release`. Soát "sẵn sàng làm" (DoR) → skill `check-dor`.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
