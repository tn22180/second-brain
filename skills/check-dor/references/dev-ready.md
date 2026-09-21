> Chế độ của skill `check-dor`. File này tự đủ — đọc xong là làm được.

# Dev-ready — checklist Gate G3 (PRD final, dùng bởi agent qa-reviewer)

Checklist Dev-ready (PRD final — trước handoff dev, dùng bởi agent `qa-reviewer`).

> Bê nguyên văn từ agent `qa-reviewer.md` (đã gỡ bản chép tay trong agent, gộp về đây làm nguồn duy nhất). Chấm PASS/FAIL từng mục.

**PRD final**
- [ ] Tổng quan: bối cảnh + mục tiêu + đối tượng
- [ ] ≥3 Use Case, mỗi cái có AC **đo được** (clear pass/fail, không "should work")
- [ ] Screen Descriptions có **behavior + states + edge cases** (idle/loading/empty/error/success)
- [ ] User Flows đánh số, step-by-step, không nhảy bước
- [ ] Khớp **100%** mockup đã approve + có link mockup
- [ ] **KHÔNG** mô tả API/data model/architecture (dev tự handle)
- [ ] Qua Polaris design rules (1 primary/page, sentence case, click row = navigate, IndexTable promotedBulkActions, không flag emoji)

**Chuẩn doc**
- [ ] Decision Brief / exec summary 5 dòng đầu doc
- [ ] TLDR 1 dòng mỗi heading
- [ ] Link ngược requirement gốc (traceability)

**Handoff** (nếu đã tới bước này)
- [ ] Mockup đã push GitHub/Vercel
- [ ] Jira task (FAL) đủ field
- [ ] Dev đã brief

> **Quy tắc gate:** FAIL bất kỳ mục PRD/Chuẩn-doc nào → verdict tổng = **FAIL**, không handoff. Handoff items chỉ kiểm khi PRD đã PASS.

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
