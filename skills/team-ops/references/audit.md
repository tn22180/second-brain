> Chế độ của skill `team-ops`. File này tự đủ — đọc xong là làm được.

# Audit hệ thống team-ops

Rà `team-ops/` xem có lệch/gãy không. **Không tự sửa hàng loạt** — xuất báo cáo + đề xuất, PO duyệt rồi mới fix.

## Các phép kiểm

### 1. Link gãy
```bash
cd "team-ops"
# liệt kê mọi link .md và kiểm file tồn tại (rà thủ công các link tương đối)
grep -rn "](.*\.md)" . --include="*.md"
```
Chú ý các link tương đối `../` sau khi đổi tên/di chuyển file.

### 2. Khớp 2 chiều role ↔ subflow
- Với mỗi subflow: cột **"Role chính"** liệt kê role X → role X phải có subflow đó trong dòng **"Subflows liên quan"**, và ngược lại.
- Lệch = một chiều có, chiều kia thiếu.

### 3. Role docs ↔ interaction-matrix
- **Quyền quyết định:** mục 7 mỗi role ("tự quyết") phải khớp bảng "ai quyết gì" (role đó = **Q**).
- **Đầu vào/Đầu ra** (mục 8 role) phải khớp bảng "ai bàn giao gì cho ai".
- Role nào có trong roles/ nhưng thiếu ở matrix (hoặc ngược lại) = lệch.

### 4. Role docs ↔ master-flow (mục 5 "ai làm gì")
- Vai trò ở nhịp ①–⑥ trong role file (mục 6) phải khớp bảng "ai làm gì" của master-flow.

### 5. Chồng chéo chưa giải quyết
- Rà mục "KHÔNG phụ trách" + "Ranh giới" của các role: có việc nào **2 role cùng nhận** mà chưa phân định? Đối chiếu bảng "rà chồng chéo" trong interaction-matrix.
- Kiểm 3 "điểm còn mờ" đã ghi ở cuối interaction-matrix — đã có tiến triển chưa.

### 6. Phạm vi master-flow
- master-flow có lẫn **việc nội bộ riêng của 1 role** không (chỉ nên là flow chung)?

## Output — báo cáo
```
## AUDIT team-ops — [ngày]
- 🔴 Lệch cần sửa: <mục · file · mô tả · đề xuất fix>
- 🟡 Nên xem lại: <...>
- 🟢 OK: <các phần đã nhất quán>
```

## Gate
- Chỉ **báo cáo + đề xuất**; sửa lớn (đổi scope, quyền quyết) phải PO duyệt.
- Fix cơ học an toàn (link gãy, thiếu 1 dòng link 2 chiều) → có thể sửa và báo lại.

---

> Nội dung dưới đây bê nguyên văn từ agent `falcon-ops.md` (đã gỡ bỏ, gộp vào skill `team-ops`).

## Bản đồ hệ thống (nhớ nằm lòng)

```
team-ops/
├── roles/                         ← định nghĩa 6 vị trí (13 phần/role) — LÝ TƯỞNG
│   ├── _role-template.md          ← khung 13 phần
│   ├── product-owner / techlead / developer / tester / support / ux-ui-designer .md
│   ├── interaction-matrix.md      ← ai quyết gì · ai bàn giao gì cho ai · chồng chéo
│   └── README.md                  ← index role
├── workflows/
│   ├── master-flow.md             ← ⭐ TÀI LIỆU CHÍNH: quy trình 6 nhịp (flow chung team)
│   ├── subflows/                  ← mối nối giữa role (SF1..SFn) — DANH SÁCH MỞ
│   │   ├── _subflow-template.md
│   │   └── sf1..sf6 .md
│   ├── claude-code-in-process.md
│   └── (sơ đồ) *-flowchart / *-swimlane .html/.drawio
└── nhan-su/                       ← gán người thật vào role
```

6 nhịp: **① Nảy ý tưởng → ② Làm rõ & tài liệu → ③ Làm & kiểm thử → ④ Duyệt kỹ thuật → ⑤ Lên sản phẩm → ⑥ Học & cải thiện** (vòng lặp).
6 role: **PO · Dev · Tech Lead · Tester · Support (CS/TS) · UX/UI Designer** (Designer tham gia flow ad-hoc).

> team-ops = tài liệu vận hành nội bộ (private trong Avada). Khi PO nói "đẩy cho team" → mới sync sang **falcon**. Bạn không tự push.

## Nguyên tắc bất di bất dịch

1. **1 nguồn — nhiều góc nhìn.** Mỗi thông tin có đúng 1 nơi chủ (source of truth); nơi khác chỉ *link*, không copy. Subflow = mối nối (nguồn); role file chỉ link tới.
2. **Link 2 chiều.** Thêm/sửa subflow → cập nhật cả bảng index (subflows/README, master-flow mục 7, workflows/README) và dòng "Subflows liên quan" trong role file liên quan.
3. **Định nghĩa lý tưởng, không phải ảnh chụp.** Role mô tả *nên như thế nào*; mỗi role có mục "KHÔNG phụ trách" + "Ranh giới với role kế cận".
4. **master-flow = flow CHUNG.** Không nhét việc nội bộ riêng của 1 vai trò (vd cách PO phân tầng tài liệu) vào master-flow.
5. **Ngôn từ dễ hiểu.** Người mới đọc phải hiểu; thuật ngữ thì giải nghĩa (có mục Thuật ngữ trong master-flow).
6. **Human review gate.** Mọi thay đổi định hình (scope role, quyền quyết định, đổi nhịp) phải PO xác nhận. Không tự sửa hàng loạt rồi mới báo. Không tự sync sang falcon.

## Cách làm việc
- **Khai thác trước khi viết:** với role/subflow mới, brainstorm scope & ranh giới với PO (hỏi câu định hình) TRƯỚC khi điền template — như đã làm khi dựng 6 role.
- **Sau mỗi thay đổi:** chạy nhẩm audit (link 2 chiều còn khớp không).
- **Trả lời câu hỏi vận hành:** trace trong master-flow + interaction-matrix + subflow, trả lời gọn 1 mạch.

## Guardrails
- ❌ Không tự push/sync sang falcon (chờ PO nói "đẩy cho team").
- ❌ Không đổi scope role / quyền quyết định / cấu trúc nhịp mà chưa hỏi PO.
- ❌ Không tạo bản sao thông tin (giữ 1 nguồn).
- ✅ Luôn giữ link 2 chiều khớp sau mỗi lần thêm/sửa.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
