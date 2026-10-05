# Point Falcon — tháng 9/2026

**Nguồn sự thật: field Jira `KPI Month = 2026-09-15`** (`customfield_11300`) — 210 task (FAL-329→337 + 8 bug security 746→763 đã chuyển Archived 05/10, gỡ KPI Month). Mở trên Jira: `project = FAL AND cf[11300] = "2026-09-15"`.

**Luật chốt (2026-10-05):**
* Tính task ở vùng Waiting To Test, Test Staging, Waiting For Review, Reviewing, Review Done, Waiting To Live, Testing Production, QA/QC, Done. Bỏ Archived, To Do, Doing.
* Chốt KPI tháng 9 ngày **05/10**: task vào vùng trong tháng 9 hoặc 01–05/10 → tháng 9. Task vào vùng trước tháng 9 → tính tháng chạm Done lần đầu.
* Task đã có KPI Month (vd 2026-08-15) không tính lại. Tháng sau lọc `cf[11300] is EMPTY`, chốt ~05/11, ghi `2026-10-15`.
* Point theo vai trò roster: dev/techlead ← Dev, tester ← Test, BA/PO ← BA, designer ← Design. Task nhiều người cùng vai trò → mỗi người nhận đủ point.

## Bảng point tháng 9 (tính lại 2026-10-05)

210 task KPI Month 2026-09-15 đang ở vùng Waiting To Test → Done. FAL-872 không tính dev/test (task BA).

| Team | Thành viên | Point | Task | **Point T9** | Trong đó Done (task / point) |
|---|---|---|---|---|---|
| Organic | tuannv | Dev | 57 | **213** | 54 / 165 |
| Organic | ducnm01 | Dev | 17 | **134** | 1 / 2 |
| Organic | truongnn | Dev | 30 | **101** | 28 / 87 |
| Organic | tunglv | Dev | 32 | **76** | 31 / 42 |
| Organic | minhpt | Dev | 36 | **56** | 36 / 56 |
| Organic | dungtt | Test | 16 | **46** | 13 / 20 |
| Organic | linhnq | BA | 2 | **0** | 1 / 0 |
| Speed | hailt | Dev | 13 | **137** | 10 / 116 |
| Speed | lamln | Dev | 19 | **113** | 18 / 92 |
| Speed | tranggt | Test | 61 | **77** | 57 / 71 |
| Speed | bachdv | BA | 2 | **0** | 1 / 0 |
| Speed | taing | Dev | 1 | **0** | 0 / 0 |
| Paid | nghiavt | Dev | 11 | **183** | 0 / 0 |
| Paid | anhnt3 | Dev | 10 | **140** | 0 / 0 |
| Paid | trangdt | Test | 31 | **79** | 1 / 0 |
| Paid | tamnc | BA | 0 | **0** | 0 / 0 |
| Paid | trungph | Dev | 0 | **0** | 0 / 0 |
| Shared | dungta | Design | 1 | **0** | 0 / 0 |

## Task KPI tháng 9 thiếu point (cập nhật 2026-10-05)

### [BUG] — áp luật dev 1 / test 1 (6)

| FAL | Status | Đang có | Thiếu | Task |
|---|---|---|---|---|
| [FAL-669](https://space.avada.net/browse/FAL-669) | Waiting To Test | — | Dev: taing | [BUG][Speed] Landing page public speed-audit: SSRF + bypass rate limit |
| [FAL-838](https://space.avada.net/browse/FAL-838) | Done | Dev 3 | Test: tranggt | [BUG][Speed] Pending review quá hạn vẫn chặn gửi notification cho các  |
| [FAL-874](https://space.avada.net/browse/FAL-874) | Done | Dev 5 | Test: tranggt | [BUG][APC] Stored XSS ở Product Description editor (Generate in bulk) |
| [FAL-901](https://space.avada.net/browse/FAL-901) | Test Staging | Test 1 | Dev: nghiavt | [BUG][Pixels]Bug sau khi merge |
| [FAL-1059](https://space.avada.net/browse/FAL-1059) | Waiting To Test | — | Dev: hailt, Test: tranggt | [BUG][Speed] Đổi gói v1 khi còn subscription active thì plan về Free d |
| [FAL-1060](https://space.avada.net/browse/FAL-1060) | Waiting To Test | — | Dev: hailt, Test: tranggt | [BUG][Speed] Mua Pro $29 khi warranty $19 đang active: sub warranty bị |

### [DEV]/[BA] — đánh tay (14)

| FAL | Status | Đang có | Thiếu | Task |
|---|---|---|---|---|
| [FAL-41](https://space.avada.net/browse/FAL-41) | Done | Dev 21, Test 3 | BA: bachdv | [DEV][Speed] Quảng cáo qua mail |
| [FAL-527](https://space.avada.net/browse/FAL-527) | Waiting For Review | Dev 13, Test 5 | BA: linhnq | [DEV][Blog] Tích hợp Shopify Sidekick để merchant tạo và tối ưu bài bl |
| [FAL-621](https://space.avada.net/browse/FAL-621) | Done | Dev 3 | BA: linhnq, Test: tranggt | [DEV][AEO] Tài liệu ngắn gọn hướng dẫn kết nối qua ChatGPT và Sidekick |
| [FAL-672](https://space.avada.net/browse/FAL-672) | Test Staging | Test 2 | Dev: nghiavt | [DEV][Pixels] Ẩn trang Diagnostic, thay bằng trang Phân tích Pixel |
| [FAL-690](https://space.avada.net/browse/FAL-690) | Review Done | — | BA: bachdv | [BA][Speed] Thiết kế lại màn Speed Request (list + detail) cho multi-p |
| [FAL-776](https://space.avada.net/browse/FAL-776) | Done | Dev 13 | Test: tranggt | [DEV][SEO] Automation test tính năng Image compression (v25) |
| [FAL-868](https://space.avada.net/browse/FAL-868) | Done | Dev 2 | Test: trangdt | [DEV][Ads] Gỡ các trường Settings không có tác dụng và đường tạo/sửa c |
| [FAL-885](https://space.avada.net/browse/FAL-885) | Waiting To Test | Dev 5 | Test: trangdt | [DEV][Ads] Case lifecycle v2: vụ Dismiss hiện lại khi tái diễn + chống |
| [FAL-886](https://space.avada.net/browse/FAL-886) | Waiting To Test | Dev 2 | Test: trangdt | [DEV][Ads] CI installs a new dependency again, without turning off che |
| [FAL-1019](https://space.avada.net/browse/FAL-1019) | Waiting To Test | — | Dev: ducnm01, Test: trangdt | [DEV][Ads] Feed-blocked: sản phẩm bị Google từ chối thành vụ việc và s |
| [FAL-1020](https://space.avada.net/browse/FAL-1020) | Waiting To Test | Dev 5 | Test: trangdt | [BA][Ads] Feed-blocked: spec + plan triển khai A/B/C |
| [FAL-1021](https://space.avada.net/browse/FAL-1021) | Waiting To Test | Dev 13 | Test: trangdt | [DEV][Ads] Feed-blocked A — Detector: phán quyết từ chối của Google th |
| [FAL-1022](https://space.avada.net/browse/FAL-1022) | Waiting To Test | Dev 13 | Test: trangdt | [DEV][Ads] Feed-blocked B — Override layer: merchant sửa giá trị gửi G |
| [FAL-1028](https://space.avada.net/browse/FAL-1028) | Waiting To Test | Dev 8 | Test: trangdt | [DEV][Ads] Home setup guide: trạng thái setup + sửa lỗi tại chỗ (BFS 4 |

### Không có Assignees (6)

| FAL | Status | Đang có | Task |
|---|---|---|---|
| [FAL-851](https://space.avada.net/browse/FAL-851) | Done | Test 8 | [DEV][AEO] Refactor AEO Audit checks theo Shopify Agentic Readiness (m |
| [FAL-880](https://space.avada.net/browse/FAL-880) | Done | Dev 1, Test 1 | [BUG][SEO] Checklist không báo lại issue sau khi merchant bấm "I have  |
| [FAL-896](https://space.avada.net/browse/FAL-896) | Waiting To Test | — | [DEV][Ads] Diagnostic engine: quét nền 5 nguồn song song → sinh và tự  |
| [FAL-903](https://space.avada.net/browse/FAL-903) | Waiting To Test | — | [DEV][Ads] Alerting pipeline: scheduler hằng ngày + email đúng-một-lần |
| [FAL-909](https://space.avada.net/browse/FAL-909) | Waiting To Test | — | [DEV][Ads] Re-check on demand: lượt kiểm thật theo từng nguồn, tiến tr |
| [FAL-1062](https://space.avada.net/browse/FAL-1062) | Testing Production | Dev 1, Test 1 | [BUG][SEO] Sitemap manager gọi GSC bằng domain shop thay vì property đ |

**FAL-872** (Backlinks phase 1 UX/UI, `[BA][DESIGN]`): task BA — không tính dev/test point cho tuannv, tunglv, tranggt (chốt 2026-10-05).
