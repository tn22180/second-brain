> Chế độ của skill `testing`. File này tự đủ — đọc xong là làm được.

# Test handoff — brief bàn giao Dev → Tester (SF3)

Khi Dev xong 1 tính năng, đọc thay đổi trong **repo code** (SEO Suite ở thư mục repo code SEO Suite của bạn) và dựng brief cho Tester. **AI dựng brief; Tester vẫn là người chấm đạt/không.**

## Input
- Nhánh/diff của tính năng (vd `git diff main...HEAD`).
- Tiêu chí nghiệm thu (AC) từ PRD.

## Các bước
1. Đọc diff → xác định **file/module nào đổi, logic gì mới**. Nếu diff quá lớn/mơ hồ để đọc hết trong 1 lượt → nêu rõ vùng chưa chắc chắn để Tester soi tay, đừng đoán.
2. Map **scope ảnh hưởng**: màn hình/luồng nào bị đụng, có đụng dữ liệu/tích hợp không.
3. Suy **test case gợi ý** từ AC + code thật (happy path + nhánh điều kiện thấy trong code). Xem chi tiết cách sinh case ở [testcases.md](testcases.md).
4. Liệt kê **vùng rủi ro / trường hợp biên** (input lạ, null, quyền, hiệu năng, đa ngôn ngữ...).
5. Chỉ ra **vùng cần test hồi quy** (nối [regression.md](regression.md)).
6. Nếu cần gom cả 4 chế độ (brief · test case · vùng hồi quy · smoke) thành **1 kế hoạch test mạch lạc**, xếp lại theo **ưu tiên rủi ro** (phần rủi ro cao lên trước) trước khi đưa Tester — đừng liệt kê rời rạc không phân cấp. Dùng khung sau:
```markdown
## TEST PLAN — [tính năng]
### 1. Tóm tắt thay đổi & scope ảnh hưởng
### 2. Test case (bảng: tiền điều kiện · bước · kỳ vọng · loại)
### 3. Rủi ro / trường hợp biên cần soi
### 4. Vùng test hồi quy (mức rủi ro)
```

## Output
```markdown
## TEST HANDOFF — [tính năng]
### Thay đổi chính
- <module>: <mô tả>
### Scope ảnh hưởng
- Màn hình/luồng: … · Dữ liệu/tích hợp: …
### Test case gợi ý
| # | Bước | Kỳ vọng | Loại |
### Rủi ro / biên cần soi
- …
### Vùng test hồi quy
- …
```

## Gate
- Brief là **hỗ trợ**, không thay Tester. Tester bổ sung kịch bản theo hiểu biết sản phẩm. Dev chịu trách nhiệm code — AI không tự sửa code khi làm brief.
- Là 1 trong 4 chế độ của skill `testing` — xem tổng quan & 3 chế độ còn lại tại `SKILL.md` (thư mục cha).

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
