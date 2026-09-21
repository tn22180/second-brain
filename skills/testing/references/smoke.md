> Chế độ của skill `testing`. File này tự đủ — đọc xong là làm được.

# Smoke checklist — chạy thử nhanh trên bản thật (SF4)

Sinh checklist ngắn để Tester kiểm canary có hệ thống (pass/fail nhanh core path). **Không thay QA/QC đầy đủ.**

## Input
- Tính năng + tiêu chí nghiệm thu.
- (nếu có) danh sách core path quan trọng của app.

## Các bước
1. Rút **các luồng cốt lõi** tính năng đụng tới (đăng nhập, thao tác chính, lưu, hiển thị storefront...).
2. Mỗi luồng → 1 dòng kiểm pass/fail nhanh.
3. Thêm 1-2 mục "không được gãy" (regression cốt lõi của app).

## Output
```markdown
## SMOKE CHECKLIST — [tính năng] (canary)
- [ ] <core path 1> hoạt động
- [ ] <core path 2> …
- [ ] Không gãy: <luồng nền quan trọng>
```

## Gate
- Smoke = kiểm nhanh trước khi mở rộng; QA/QC sâu vẫn theo quy trình Tester.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
