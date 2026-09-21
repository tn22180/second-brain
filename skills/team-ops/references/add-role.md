> Chế độ của skill `team-ops`. File này tự đủ — đọc xong là làm được.

# Thêm / định nghĩa lại role — team-ops

Role = **định nghĩa lý tưởng** một vị trí (nên như thế nào để hết chồng chéo), 13 phần. Thư mục: `team-ops/roles/`.

## Trước khi viết — BRAINSTORM với PO (bắt buộc)
Role phải khớp thực tế + tránh giẫm chân role khác. Hỏi câu **định hình** trước khi điền:
- Role này **tồn tại để làm gì** (mục đích, không phải liệt kê việc)?
- **Chịu trách nhiệm cuối** về điều gì?
- **Scope:** phụ trách gì · KHÔNG phụ trách gì (đẩy sang ai)?
- **Quyền quyết định:** tự quyết gì · phải đồng thuận gì?
- **Ranh giới** với role kế cận nào dễ mờ?

> Đưa nháp đề xuất cho từng phần nóng (mục đích, scope +/-, quyền quyết) rồi để PO phản biện — như cách đã dựng 6 role gốc.

## Các bước
1. **Copy** `roles/_role-template.md` → `roles/<ten-role>.md` (kebab-case).
2. **Điền đủ 13 phần.** Bắt buộc rõ: mục đích · scope phụ trách / KHÔNG phụ trách · vai trò ở nhịp ①–⑥ · quyền quyết định · ranh giới với role kế cận · KPI · ai đảm nhận.
3. **Cập nhật index & ma trận:**
   - `roles/README.md` — thêm dòng vào bảng role + ký hiệu viết tắt.
   - `roles/interaction-matrix.md` — thêm role vào **cả 3 bảng**: (1) ai quyết gì, (2) ai bàn giao gì cho ai, (3) rà chồng chéo với role liên quan.
   - `workflows/master-flow.md` mục 5 (bảng "ai làm gì") — thêm cột/điều chỉnh nếu role tham gia flow.
4. **Subflows liên quan:** nếu role tham gia mối nối nào → thêm dòng "Subflows liên quan" trong role file + cập nhật cột "Role chính" của subflow đó (link 2 chiều).
5. **Kiểm nhanh:** grep tên role qua team-ops/ xem đã khớp mọi nơi.

## Gate
- Các quyết định **định hình role** (chịu trách nhiệm gì, scope, quyền quyết) → **PO chốt** trước khi viết chính thức.
- Nếu role mới làm **thay đổi ranh giới role cũ** → cập nhật luôn role bị ảnh hưởng (tránh chồng chéo).

## Nhắc
- Mỗi role PHẢI có mục "KHÔNG phụ trách" + "Ranh giới" — đó là thứ chống giẫm chân.
- Ngôn từ dễ hiểu; đây là định nghĩa lý tưởng, không phải mô tả hiện trạng.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
