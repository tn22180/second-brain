# Sản phẩm team Falcon

6 ứng dụng trên Shopify App Store. Mảng chính: **SEO + tốc độ website** — giúp cửa hàng merchant dễ được tìm thấy hơn, tải nhanh hơn, và dễ được AI trích dẫn hơn.

| Ứng dụng | Làm gì cho merchant | Hướng dẫn (docs) | Repo `product/` |
|---|---|---|---|
| **Avada SEO Suite** | Bộ công cụ SEO tổng hợp: meta tag, sitemap, structured data, tối ưu ảnh, tăng tốc trang | [docs.avada.io/seo-suite-help-center](https://docs.avada.io/seo-suite-help-center) | `seo-suite` |
| **Avada AI Content Blog Builder** | Viết bài blog chuẩn SEO bằng AI | [docs.avada.io/blog](https://docs.avada.io/blog) | `seo-on-blog` |
| **Avada AEO optimizer LLMs.txt** | Giúp cửa hàng được các AI như ChatGPT tìm thấy và trích dẫn | [docs.avada.io/seo-on-aeo-optimizer](https://docs.avada.io/seo-on-aeo-optimizer) | `aeo-llms-txt` |
| **Avada AI Product Description** | Viết mô tả sản phẩm bằng AI | [docs.avada.io/ai-product-copy](https://docs.avada.io/ai-product-copy) | `product-copy` |
| **AP Speed Optimizer** | Tăng tốc độ tải trang cửa hàng | [docs.avada.io/speed-optimizer](https://docs.avada.io/speed-optimizer) | `speed-optimizer` |
| **Blocko: AI Theme Sections** | Thư viện section dựng sẵn + AI tạo section theo mô tả, kéo thả vào theme không cần code | [help.blocko.ai](https://help.blocko.ai) | `blocko` |

> Trong Jira, app được nhận diện qua field **Falcon App** (10 option: SEO · Blog · APC · AEO · Feed · Ads · Pixels · Speed · Canva · Team) — danh sách này rộng hơn 6 app trên App Store (`Team` là task nội bộ đội, không thuộc app nào). Xem [`jira.md`](jira.md).

## Repo `product/<app>` có gì

Toàn bộ repo team nằm trong group GitLab [`avada/falcon`](https://gitlab.com/avada/falcon). Nhóm [`product/`](https://gitlab.com/avada/falcon/product) — **mỗi app một repo riêng**, repo nào cũng cùng một bộ khung:

| Thư mục | Chứa gì | Tìm khi cần |
|---|---|---|
| `document/overview.md` | Tổng quan app | Hiểu app làm gì |
| `document/fsd/` | Tài liệu nghiệp vụ (functional spec) | Hiểu một tính năng: nghiệp vụ, luồng người dùng |
| `document/prd/` | PRD từng tính năng | Vì sao một bản phát hành ra như vậy |
| `document/changelog/` | Changelog | App vừa ra gì mới |
| `market/` | Xu hướng, phân tích đối thủ | Nghiên cứu thị trường |
| `design/` | Mockup, logo, ảnh chụp màn hình | Asset thiết kế |

7 repo app (6 app trên App Store + `product-feed`). Ngoài ra còn có: `agentic-commerce` (nghiên cứu AI agent tác động e-commerce) · `docs.avada.io` (site hướng dẫn 5 app Avada) · `help.blocko.ai` (site hướng dẫn Blocko).

## Tìm gì ở đâu

| Cần | Vào đây |
|---|---|
| Roadmap & task của một app | **Jira — project FAL** (xem [`jira.md`](jira.md)) |
| Quy trình, vai trò, sprint | Repo `team-ops` (repo này) |
| Sửa nội dung hướng dẫn cho merchant | `product/docs.avada.io` (5 app Avada) · `product/help.blocko.ai` (Blocko) |
| Tài liệu đào tạo / khoá học | Repo `resource` |
| Tài liệu marketing | `marketing/seo-suite` |

> ⚠️ Hai repo `not-used-falcon` và `not-used-team-ops` là bản cũ đã bỏ — đừng đọc, đừng clone.

Bản đồ GitLab đầy đủ: [`../../../README.md`](../../../README.md).

---

## Changelog

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-07-14 | LamLN | Cập nhật trong đợt tái cấu trúc plugin falcon (gộp skills/agents, chuẩn hoá roles·workflows·sprint) |
| 2026-07-22 | LamLN | Sửa review: Falcon App là 10 option chứ không phải 9 — thiếu `Team` |
