> Chế độ của skill `team-ops`. File này tự đủ — đọc xong là làm được.

# Thêm subflow mới — team-ops

Subflow = **một mối nối/bàn giao giữa các role** (nguồn duy nhất). Không thuộc về 1 role — role file chỉ *link* tới.

Thư mục: `team-ops/workflows/subflows/`.

## Trước khi viết — làm rõ với PO
Hỏi ngắn để định hình (đừng đoán):
- Mối nối này giữa **những role nào**? Ai khởi động, ai nhận?
- **Trigger** là gì?
- Có **điểm quyết định** (rẽ nhánh) nào không?
- Gắn vào **nhịp nào** của master-flow, hay **cross-cutting** (không gắn nhịp)?
- Hỏng thường gặp là gì?

## Các bước
1. **Copy template** `subflows/_subflow-template.md` → đổi tên `sf<n>-<tên-ngắn>.md` (n = số tiếp theo, kebab-case).
2. **Điền đủ 7 phần:** Mục đích · Nối master · Role · Trigger · Các bước (sơ đồ ngắn) · Điểm quyết định · Nếu hỏng.
3. **Cập nhật 3 bảng index** (thêm đúng 1 dòng mỗi nơi):
   - `subflows/README.md` (bảng danh sách)
   - `workflows/master-flow.md` (mục 7 — bảng subflow)
   - `workflows/README.md` (bảng Subflows)
4. **Link 2 chiều:** cập nhật dòng **"Subflows liên quan"** trong MỌI [role file](../../../roles/) có tham gia mối nối này.
5. **Kiểm nhanh:** `grep -rn "sf<n>-" team-ops/` để chắc mọi nơi đã trỏ đúng; không có link gãy.

## Gate
- Báo PO tóm tắt subflow mới + các file đã đụng, **chờ xác nhận** mới coi là chốt.
- Không tự sync sang falcon.

## Nhắc
- Giữ **1 nguồn**: nội dung chi tiết chỉ nằm trong file subflow; các bảng chỉ là 1 dòng tóm tắt + link.
- Viết **ngôn từ dễ hiểu**, khớp phong cách master-flow.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
