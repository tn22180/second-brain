> Chế độ của skill `testing`. File này tự đủ — đọc xong là làm được.

# Regression scope — vùng cần test hồi quy

Từ diff, tìm những chỗ **có thể gãy gián tiếp** để Tester không sót/thừa. Chạy trong repo code (thư mục repo code SEO Suite của bạn).

## Các bước
1. Đọc diff → liệt kê hàm/module/component bị sửa. Nếu diff quá lớn/mơ hồ để trace hết → nêu rõ phần chưa chắc chắn thay vì đoán bừa.
2. **Trace phụ thuộc:** ai gọi tới chúng, dùng chung state/dữ liệu/tích hợp nào.
3. Xếp mức rủi ro (cao/vừa/thấp) theo mức độ dùng chung.

## Output
```markdown
## REGRESSION SCOPE — [tính năng]
- 🔴 Cao: <luồng> — vì <phụ thuộc>
- 🟡 Vừa: …
- 🟢 Thấp: …
```

## Gate
- Là **gợi ý phạm vi**; Tech Lead/Tester xác nhận. Không thay test hồi quy thật.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
