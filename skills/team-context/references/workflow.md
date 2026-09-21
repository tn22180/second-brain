# Quy trình phát triển sản phẩm — 6 nhịp + 8 subflow

Bản gốc đầy đủ: [`../../../workflows/master-flow.md`](../../../workflows/master-flow.md).

Nguyên tắc cốt lõi: là **vòng lặp** (nhịp ⑥ nuôi lại nhịp ①) · vừa tìm ý tưởng vừa làm song song · code & test chạy song song (Tester vào sớm) · **hai cổng kiểm nhẹ** · lên sản phẩm **mở dần** (canary) · trang bị Support **trước** khi mở 100% · đo kết quả thật, không chỉ đo "đã ship".

## 6 nhịp

**① Nảy ý tưởng** *(Discovery)*
Chọn ý tưởng đáng làm, có mục tiêu đo được. PO chủ trì họp định kỳ (~2 tuần/lần); Dev & Tester nêu ý tưởng bottom-up; Support mang tín hiệu khách.
Điểm kiểm: ý tưởng có gắn với vấn đề/khách thật không?

**② Làm rõ & viết tài liệu** *(Define + Spec)*
PO + BA + Dev + Tester họp làm rõ scope/logic; **BA viết PRD + tiêu chí nghiệm thu + hướng giao diện**, PO duyệt; Designer vào nếu UI phức tạp.
Điểm kiểm — **Cổng 1 "Đã sẵn sàng làm chưa?"**: rõ vấn đề & khách · có user story · có tiêu chí nghiệm thu · đã hỏi Dev/TL về ràng buộc kỹ thuật · có hướng giao diện · đã đặt con số mục tiêu.

**③ Làm & kiểm thử** *(Develop + Testing)*
Dev code + dựng UI Polaris + tự viết unit test; Tester test song song ngay từ sớm; PO trả lời khi Dev hỏi.
Điểm kiểm — **Cổng 2 "Đã xong chưa?"**: đạt hết tiêu chí nghiệm thu · không còn lỗi nghiêm trọng · smoke test chức năng chính ổn · đã soạn hướng dẫn sử dụng · đã chuẩn bị nội dung thông báo.

**④ Duyệt kỹ thuật** *(Techlead review)*
Tech Lead review code theo từng phần nhỏ; Dev chỉnh theo phản hồi. Chưa đạt → trả lại Dev.

**⑤ Lên sản phẩm** *(Live + QA/QC)*
Tech Lead deploy **mở dần** (5–10% khách trước); Tester kiểm tra bản thật + theo dõi 24–72h; PO chốt go/no-go, viết thông báo + hướng dẫn, trang bị Support **trước khi mở rộng**. Không ổn → rollback.

**⑥ Học & cải thiện** *(Support + Retro)*
Support hỗ trợ khách; PO chủ trì Retro sau 2 tuần–1 tháng, đối chiếu kết quả thật với mục tiêu (ví dụ <15% khách dùng sau 30 ngày = cờ đỏ). Bài học → nuôi lại nhịp ①.

## 8 subflow — khi nào rơi vào cái nào

| Subflow | Rơi vào khi | Ai với ai | Nhịp |
|---|---|---|---|
| [SF1 — Discovery intake](../../../workflows/subflows/sf1-discovery-intake.md) | Tới buổi Discovery định kỳ, hoặc insight tích luỹ đủ nhiều quanh 1 vấn đề → cần chốt "làm / không làm" | Support·Dev·Tester nêu → **PO quyết** | ① |
| [SF2 — Bàn giao tài liệu](../../../workflows/subflows/sf2-po-dev-handoff.md) | BA đã họp làm rõ (3 bên) + viết xong tài liệu, PO duyệt → giao Dev/Tester | BA → Dev·Tester (PO duyệt; TL/Designer được hỏi) | ②→③ |
| [SF3 — Build ↔ Test (vòng bug)](../../../workflows/subflows/sf3-dev-tester-bug.md) | Dev có bản build đầu tiên (đã unit test + tự chạy thử) → chạy vòng code/test/bug tới khi "đã xong" | Dev ↔ Tester (PO vào khi có blocker; TL khi bug lặp mãi) | ③ |
| [SF4 — Review & Release](../../../workflows/subflows/sf4-review-release.md) | Tính năng đạt "đã xong" (DoD) → duyệt code rồi deploy mở dần | Dev → TL (review + deploy) → production; Tester kiểm bản thật; PO go/no-go | ④⑤ |
| [SF5 — Vòng Support](../../../workflows/subflows/sf5-support-loop.md) | Trước live: sắp mở rộng 100% → trang bị Support. Sau live: khách bắt đầu dùng → gom insight | PO ↔ Support (CS/TS) | ⑤⑥→① |
| [SF6 — Escalation kỹ thuật](../../../workflows/subflows/sf6-escalation.md) | Ticket kỹ thuật mà Technical Support không tự giải được → đẩy lên Dev | SP (TS) → Dev · TL (deploy hotfix); PO được báo nếu ảnh hưởng nhiều khách | ⑥ (hotfix xuyên ⑤) |
| [SF7 — Giao tiếp release](../../../workflows/subflows/sf7-release-comms.md) | Tính năng qua duyệt kỹ thuật, bắt đầu mở dần → PO sản xuất trọn gói giấy tờ giao tiếp | PO làm → Support + nội bộ + khách nhận | ⑤ (song song lúc deploy) |
| [SF8 — Bug production](../../../workflows/subflows/sf8-production-bug.md) | **Khách gặp bug trên bản thật**, CS nhận phản ánh → báo vào thread nội bộ | CS → TL·Tester đánh giá → Tester tạo task & assign → Dev fix + deploy → Tester test production & xác nhận | ⑥ (hotfix ⑤) |

> SF6 là bản **tổng quát** của escalation kỹ thuật; **SF8 là quy trình cụ thể cho bug production** — hỏi "bug production làm gì" thì đọc SF8.

Danh sách subflow là **danh sách mở** — cách thêm mối nối mới: [`../../../workflows/subflows/README.md`](../../../workflows/subflows/README.md).

## Nối với Jira

Từ khi vào dev, task chạy trên **Jira project FAL** — 12 status map với 6 nhịp:

| Nhịp | Jira status (FAL) |
|---|---|
| ① Nảy ý tưởng | *(Notion / discovery — chưa vào Jira)* |
| ② Làm rõ & tài liệu | **To Do** (tạo Jira Task khi đạt "sẵn sàng làm") |
| ③ Làm & kiểm thử | Doing → Waiting To Test → Test Staging |
| ④ Duyệt kỹ thuật | Waiting For Review → Reviewing → Review Done → QA/QC |
| ⑤ Lên sản phẩm | Waiting To Live → Testing Production |
| ⑥ Học & cải thiện | Done → Archived |

Chi tiết board/field/naming → [`jira.md`](jira.md).

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
