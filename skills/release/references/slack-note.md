> Chế độ của skill `release`. File này tự đủ — đọc xong là làm được.

# Release Note Skill

Skill để viết release note cho các sản phẩm Avada / SEO On, post lên Slack channel `#release-seo-on`.

---

## Trigger

Khi PO nhắn:
- "viết release note" / "release note" / "write release note"
- Gửi screenshot tính năng mới kèm yêu cầu viết release

---

## Quy trình

### Bước 1 — Fetch MR mới từ GitLab

Chạy script để lấy MR data mới nhất:

```bash
./scripts/fetch-gitlab-mrs.sh 7
```

- Script tự đọc `GITLAB_TOKEN` và `GITLAB_PROJECT_ID` từ biến môi trường (khối `env` của `~/.claude/settings.json`), fallback `.env` trong thư mục skill
- Output: ghi theo **cwd** → `./products/avada-seo-suite/changelog/gitlab-mrs-latest.json` (full data) + `gitlab-mrs-latest.md` (summary). Đổi đích bằng `MR_PRODUCT` / `MR_OUTPUT_DIR`.
- Nếu cần nhiều ngày hơn: `./scripts/fetch-gitlab-mrs.sh 14`

### Bước 2 — Phân tích MR + Screenshot

- Đọc MR data (title, description, diff summary) để hiểu changes
- Xem screenshot PO gửi để hiểu UX/UI của tính năng
- Map MR nào thuộc tính năng nào
- Xác định loại release: `[New feature]` / `[Improvement]` / `[Bug fix]` / `[Growth hacking]`

### Bước 3 — Viết release note theo format

**Format chuẩn:**

```
###[Tên sản phẩm] - [DD/MM/YYYY] [emoji sản phẩm]
*[Loại] Tên tính năng*
• Vấn đề: [Mô tả vấn đề merchant/user đang gặp]
• Giải pháp: [Giải pháp app cung cấp]
• Vị trí: [Settings > ... hoặc vị trí trong app] (nếu có)
• Mô tả các section: (nếu có nhiều phần)
   ○ Phần 1:
      ▪ Chi tiết
   ○ Phần 2:
      ▪ Chi tiết
• Note: [Lưu ý đặc biệt] (nếu có)
• Demo: [link somup/capture]
*@channel* Mọi người nắm thông tin, nếu cần hỗ trợ liên hệ tổng đài @Linh NQ (Dante) 24/365 ạ :pepe-evil-art:
```

### Bước 4 — Review với PO

- Show bản draft cho PO review
- PO có thể chỉnh sửa, thêm link demo, bổ sung note
- Confirm xong → PO tự copy paste lên Slack

---

## Các loại release tag

| Tag | Dùng khi |
|-----|----------|
| `[New feature]` | Tính năng hoàn toàn mới |
| `[Improvement]` | Cải tiến tính năng cũ |
| `[Bug fix]` | Sửa lỗi |
| `[Growth hacking]` | Cơ chế tăng trưởng, upsell, onboarding |

---

## Emoji theo sản phẩm

| Sản phẩm | Emoji |
|----------|-------|
| Avada SEO Suite | `:pepe-avada-seo:` |
| SEO On Blog | `:pepe-avada-seo-waving-flag:` |
| AEO optimizer LLMs.txt | `:pepe-avada-seo-waving-flag:` |
| AI Product Description | `:pepe-avada-seo-waving-flag:` |
| AP Speed Optimizer | `:pepe-avada-seo-waving-flag:` |

Footer emoji: `:pepe-evil-art:`

---

## Product → GitLab project mapping

| Product | GitLab Project ID | Folder |
|---------|-------------------|--------|
| Avada SEO Suite | 17456707 | `products/avada-seo-suite/` |

> Các product khác sẽ bổ sung project ID khi cần.

---

## Nguyên tắc viết

1. **Ngôn ngữ**: Tiếng Việt, dễ hiểu cho CS/Support team
2. **Focus**: Viết từ góc nhìn merchant — vấn đề gì được giải quyết, không nói code/tech
3. **Vị trí**: Ghi rõ navigation path trong app (ví dụ: Settings > Subscription > AI credit usage)
4. **Demo**: Để placeholder `[link somup/capture]` nếu PO chưa gửi link
5. **Gom nhóm**: Nếu nhiều MR liên quan cùng 1 feature → gom thành 1 release note
6. **Không viết release cho**: Dev Zone changes, internal tools, pure refactor không ảnh hưởng UX

---

## Ví dụ

### New feature
```
###SEO SUITE - 29/01/2026  :pepe-avada-seo:
*[New feature] AI credit usage history*
• Vấn đề: Merchant không có thống kê về credits đã sử dụng, khiến họ không biết đã sử dụng ở đâu, sử dụng bao nhiêu....
• Giải pháp: Merchant có thể đo lường lượng credits mình đã sử dụng qua AI credits history theo ngày, theo tính năng,...
• Vị trí: Settings > Subscription > AI credit usage
• Mô tả các section:
   ○ Usage summary:
      ▪ Total used credits: Tổng credits đã sử dụng
      ▪ Remaining credits: Credits đang còn lại
   ○ Usage over time (chart): Biểu đồ credits sử dụng, được filter trong 1 khoảng thời gian cụ thể
   ○ Usage history: Chi tiết về lượng sử dụng credits theo từng tính năng, theo từng ngày
• Note: Chỉ có record từ ngày 28/1/2026 (thời điểm deploy feature)
• Demo: https://somup.com/cOVUQFSNht
*@channel* Mọi người nắm thông tin, nếu cần hỗ trợ liên hệ tổng đài @Linh NQ (Dante) 24/365 ạ :pepe-evil-art:
```

### Growth hacking
```
###AI Product Description - 28/01/2026 :pepe-avada-seo-waving-flag:
*[Growth hacking] 500 Free credits cho khách hàng mới*
• Mô tả: Hiển thị banner ở Dashboard để offer cho khách 500 free credits để khách có thể test thử nhiều hơn trước khi quyết định Sub.
• Đối tượng áp dụng:
   ○ Free user
   ○ Chưa sub bao giờ
   ○ Cài app từ 1/12/2025
• Flow:
   ○ Step 1: User click vào button ở Banner
   ○ Step 2: Tự động trigger gửi tin nhắn cho CS "I want to claim my 500 free AI credits welcome gift"
   ○ Step 3: CS tiếp nhận thông tin và vào Dev_zone để thêm additional credits cho User
• Note:
   ○ User click Skip hoặc Claim thì banner sẽ không hiển thị lại nữa để tránh làm phiền user
*@channel* Mọi người nắm thông tin, nếu cần hỗ trợ liên hệ tổng đài @Linh NQ (Dante) 24/365 ạ :pepe-evil-art:
```

---

## Dependencies

- **Script**: `scripts/fetch-gitlab-mrs.sh` — fetch MR data từ GitLab API
- **Credentials**: `.env` → `GITLAB_TOKEN`, `GITLAB_PROJECT_ID`
- **Output files** (theo cwd): `./products/avada-seo-suite/changelog/gitlab-mrs-latest.json` + `.md` — override bằng `MR_PRODUCT` / `MR_OUTPUT_DIR`

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
