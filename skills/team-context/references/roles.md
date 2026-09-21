# 8 vai trò trong team Falcon (SP tách 2 sub-role: CS + TS)

Tóm tắt để trả lời nhanh. Định nghĩa đầy đủ (13 phần: scope +/-, quyền quyết định, ranh giới, KPI…) nằm ở file gốc mỗi role.

**Ai quyết gì / ai bàn giao gì cho ai:** không chép lại ở đây — đọc [`../../../roles/interaction-matrix.md`](../../../roles/interaction-matrix.md) (nguồn sự thật).

## PO — Product Owner
- **Mục đích:** đảm bảo team làm **đúng thứ đáng làm** và **làm tới nơi**; chịu trách nhiệm cuối về outcome lẫn delivery.
- **Phụ trách:** roadmap & thứ tự ưu tiên · chốt scope · duyệt PRD/tiêu chí nghiệm thu (BA viết) · chủ trì Discovery/Define/Retro · go/no-go trước live · changelog + hướng dẫn + gói thông tin cho Support · theo dõi số liệu sau live.
- **KHÔNG phụ trách:** viết PRD/tiêu chí nghiệm thu (→ BA) · tài liệu kỹ thuật (→ TL/Dev) · quyết cách làm kỹ thuật & ưu tiên nợ kỹ thuật (→ TL) · tự test/chấm chất lượng (→ Tester) · bấm deploy (→ TL).
- 📄 [`../../../roles/product-owner.md`](../../../roles/product-owner.md)

## BA — Business Analyst
- **Mục đích:** biến định hướng của PO thành **tài liệu đủ rõ để Dev/Tester/Designer tự chạy**.
- **Phụ trách:** làm rõ yêu cầu · viết **PRD + Description + tiêu chí nghiệm thu** · chủ trì buổi Làm rõ (3 bên) · tạo & duy trì task Jira · chốt tài liệu đạt "sẵn sàng làm" trước khi giao Dev.
- **KHÔNG phụ trách:** quyết ưu tiên/roadmap/go-no-go (→ PO) · tài liệu kỹ thuật (→ TL/Dev) · quyết cách làm kỹ thuật (→ TL) · chấm chất lượng/test (→ Tester).
- 📄 [`../../../roles/business-analyst.md`](../../../roles/business-analyst.md)

## TL — Tech Lead
- **Mục đích:** sản phẩm được **xây đúng chuẩn, chạy ổn định**; đội Dev ngày càng giỏi. Là line manager của Dev.
- **Phụ trách:** kiến trúc & chuẩn kỹ thuật · review code trước release · **bấm deploy** (canary → 100%) · ưu tiên nợ kỹ thuật/refactor · đánh giá khả thi kỹ thuật ở Discovery/Define · mentor Dev · code khi cần · chủ trì xử lý sự cố, quyết rollback.
- **KHÔNG phụ trách:** ưu tiên sản phẩm/scope (→ PO) · chấm chất lượng chức năng (→ Tester) · viết PRD (→ BA).
- 📄 [`../../../roles/techlead.md`](../../../roles/techlead.md)

## Dev — Developer
- **Mục đích:** hiện thực hoá tính năng thành **code chạy được, chất lượng**; chủ động đề xuất cách làm tốt hơn.
- **Phụ trách:** code theo PRD + tiêu chí nghiệm thu · dựng UI bằng Polaris · **viết unit test + tự chạy thử** trước khi giao Tester · fix bug từ Tester/TL · ước lượng & báo tiến độ.
- **KHÔNG phụ trách:** quyết kiến trúc/chuẩn kỹ thuật lớn (→ TL) · bấm deploy (→ TL) · chấm chất lượng cuối (→ Tester/TL) · quyết scope/ưu tiên (→ PO).
- 📄 [`../../../roles/developer.md`](../../../roles/developer.md)

## QC — Tester
- **Mục đích:** tính năng **hoạt động đúng & ổn định** trước và sau khi tới tay khách; chặn lỗi nghiêm trọng lọt production.
- **Phụ trách:** test theo tiêu chí nghiệm thu · đánh giá mức nghiêm trọng bug · test trên bản thật + theo dõi canary 24–72h · verify fix, test hồi quy · viết kịch bản test.
- **KHÔNG phụ trách:** sửa code (→ Dev) · duyệt chất lượng code/kiến trúc (→ TL) · đặt tiêu chí nghiệm thu (→ BA) · bấm deploy (→ TL).
- **Quyền chặn:** được **chặn go-live** khi còn bug nghiêm trọng — nhưng phải bàn tradeoff với PO/Dev, không chặn đơn phương.
- 📄 [`../../../roles/tester.md`](../../../roles/tester.md)

## UX — UX/UI Designer *(ad-hoc)*
- **Mục đích:** sản phẩm & thương hiệu **đẹp, dễ dùng, nhất quán** toàn portfolio. **Không nằm cố định trong flow** — chỉ vào khi UI phức tạp (PO triệu tập).
- **Phụ trách:** mockup UI tính năng lớn/khó · asset marketing (App Store listing, landing, ads, social, email) · design system & nhận diện (giữ 9 app nhất quán).
- **KHÔNG phụ trách:** thiết kế UI cho **mọi** tính năng (tính năng thường: BA hướng UI low-fi + Dev dựng Polaris) · quyết scope/ưu tiên (→ PO) · dựng UI thành code (→ Dev).
- 📄 [`../../../roles/ux-ui-designer.md`](../../../roles/ux-ui-designer.md)

## SP — Support *(gồm 2 sub-role: CS + TS)*
- **Mục đích:** giúp khách **thành công với sản phẩm** và mang **tiếng nói khách** về nuôi lại vòng ý tưởng.
- **CS — Customer Success:** onboarding, giữ chân/giảm churn, upsell & xin review, lead-gen chủ động, tổng hợp insight → PO.
- **TS — Technical Support:** xử lý ticket kỹ thuật, troubleshoot, **tái hiện bug & escalate Dev**, duy trì FAQ/tài liệu khắc phục.
- **KHÔNG phụ trách:** tự sửa bug/code (→ Dev) · quyết tính năng/roadmap (→ PO, chỉ đề xuất) · quyết chính sách giá/gói (→ PO).
- 📄 [`../../../roles/support.md`](../../../roles/support.md)

Index đầy đủ 8 role: [`../../../roles/README.md`](../../../roles/README.md)

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
