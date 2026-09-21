---
name: testing
description: "Vật phẩm kiểm thử cho Dev và Tester (luồng SF3 Dev→Tester) — bật skill TRƯỚC rồi mới hỏi lại nếu chưa có diff. Dùng khi: (1) Dev vừa code xong, cần BÀN GIAO cho Tester/QC test → sinh brief bàn giao; kể cả khi gọi TÊN RIÊNG người test ('bàn giao cho Trang kiểu gì') thay vì chữ 'tester' — vẫn là skill NÀY, không phải skill tra quy trình. (2) Sinh test case từ tiêu chí nghiệm thu (AC). (3) 'Sửa chỗ này thì phải thử/test lại những gì nữa', thay đổi ảnh hưởng tới đâu → vùng hồi quy. (4) 'Mai mở canary, cần chạy thử gì trên bản thật' → checklist smoke test."
user_invocable: true
---

# Testing — vật phẩm kiểm thử từ code + AC

Chạy **trong repo code** (cần đọc được diff).

## Cần gì → đọc file nào

| Anh cần | Đọc |
|---|---|
| Dev vừa xong tính năng, bàn giao Tester | `references/handoff.md` |
| Có tiêu chí nghiệm thu, cần bộ test case | `references/testcases.md` |
| Đổi code, không biết phải test lại gì | `references/regression.md` |
| Sắp mở canary, cần checklist chạy thử bản thật | `references/smoke.md` |

Mỗi file **tự đủ** — đọc file đó là làm được, không cần quay lại đây.

## Nếu chưa rõ cần gì
Hỏi lại một câu: *"Anh đang ở bước nào — vừa code xong (handoff), đã có AC (testcases), lo sót vùng ảnh hưởng (regression), hay sắp mở canary (smoke)?"*

## Liên quan
- Quy trình: SF3 (Dev→Tester) và SF4 (canary) — xem skill `team-context`.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
