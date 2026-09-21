> Chế độ của skill `testing`. File này tự đủ — đọc xong là làm được.

# Gen testcases — sinh test case từ AC + diff

Sinh kịch bản test từ tiêu chí nghiệm thu + code thật. **AI sinh nháp; Tester rà & bổ sung.**

## Input
- Tiêu chí nghiệm thu (AC).
- Code diff/nhánh (để bắt các nhánh điều kiện, không chỉ theo AC).

## Các bước
1. Với mỗi AC → sinh case happy path + case thất bại/biên.
2. Rà code diff → thêm case cho **nhánh điều kiện** xuất hiện trong code mà AC chưa nói.
3. Gắn loại: chức năng / biên / hồi quy / bảo mật.
4. **Xếp ưu tiên** case theo rủi ro: case chạm luồng chính/dữ liệu thật lên trước, case biên hiếm gặp xuống cuối — để Tester chạy hết phần quan trọng trước nếu thiếu thời gian.

## Output
```markdown
| # | Tiền điều kiện | Bước | Kỳ vọng | Loại |
|---|---|---|---|---|
```

## Gate
- Bộ case là **nháp gợi ý**; Tester quyết phạm vi test thực tế.
- Không bỏ qua trường hợp biên chỉ vì "code trông ổn" — nếu AC không nói tới nhưng code có nhánh rẽ, vẫn phải sinh case cho nhánh đó.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
