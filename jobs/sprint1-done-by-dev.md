# Sprint — task Done theo từng dev

- Board: Jira FAL, https://space.avada.net
- Sprint: **Falcon Sprint 2** (id 62, active)
- Tạo ngày: 2026-07-29 — 25 issue, tất cả status **Done**, không link tới task nào
- Range key: **FAL-415 → FAL-439** (đã xoá 4 issue trùng: FAL-430, 431, 432, 434 → còn **21**)

> Brief yêu cầu add vào Sprint 1, nhưng **Falcon Sprint 1 (id 59) đã closed** lúc 2026-07-28T16:59.
> Jira chặn gán issue vào sprint đã hoàn thành (`Issue can be assigned only active or future sprints`).
> Chốt với Tony: dùng Sprint 2 — goal của nó là "Đóng nốt việc dang dở Sprint 1".

## Ngọc Trường + Dung TT + Tony — 2 issue, 2 dev point

| Jira | Type | App | Dev | Test | Việc | MR |
|---|---|---|---|---|---|---|
| [FAL-415](https://space.avada.net/browse/FAL-415) | Bug | Blog | 1 | 1 | MR !781 — blogs | [MR](https://gitlab.com/avada/blogs/-/merge_requests/781) |
| [FAL-416](https://space.avada.net/browse/FAL-416) | Bug | SEO | 1 | 1 | MR !2063 — seo | [MR](https://gitlab.com/avada/seo/-/merge_requests/2063) |

## Tài NG (Matthew) — 2 issue, 0 dev point

| Jira | Type | App | Dev | Test | Việc | MR |
|---|---|---|---|---|---|---|
| [FAL-417](https://space.avada.net/browse/FAL-417) | Task | SEO | - | - | [Plaza] Audit Report: Improve crisp for both onboarding and audit | [MR](https://gitlab.com/avada/avada-image-optimizer/-/merge_requests/236) |
| [FAL-418](https://space.avada.net/browse/FAL-418) | Bug | SEO | - | - | MR !234 — avada-image-optimizer | [MR](https://gitlab.com/avada/avada-image-optimizer/-/merge_requests/234) |

## Đức NM + Dung TT + Tony — 5 issue, 5 dev point

| Jira | Type | App | Dev | Test | Việc | MR |
|---|---|---|---|---|---|---|
| [FAL-419](https://space.avada.net/browse/FAL-419) | Bug | SEO | 1 | 1 | Fix credit dùng trong AI Content | [slack](https://avadaio.slack.com/archives/C0A2JLC5AGN/p1782807684419659) |
| [FAL-420](https://space.avada.net/browse/FAL-420) | Bug | SEO | 1 | 1 | Fix translate button trong Instant Indexing | [MR](https://gitlab.com/avada/seo/-/merge_requests/1969) |
| [FAL-421](https://space.avada.net/browse/FAL-421) | Bug | SEO | 1 | 1 | Loading sync image | [MR](https://gitlab.com/avada/seo/-/merge_requests/1950) |
| [FAL-422](https://space.avada.net/browse/FAL-422) | Bug | SEO | 1 | 1 | Fix organization | [MR](https://gitlab.com/avada/seo/-/merge_requests/1989) |
| [FAL-423](https://space.avada.net/browse/FAL-423) | Bug | SEO | 1 | 1 | Tooltip cho compressing | [MR](https://gitlab.com/avada/seo/-/merge_requests/1958) |

## Minh PT + Dung TT + Tony — 6 issue, 14 dev point

| Jira | Type | App | Dev | Test | Việc | MR |
|---|---|---|---|---|---|---|
| [FAL-424](https://space.avada.net/browse/FAL-424) | Task | AEO | 5 | 1 | Llms: auto-detect /policies/ pages theo ngôn ngữ trong llms.txt & llms-full.txt | [MR](https://gitlab.com/avada/llm-ai-search-seo/-/merge_requests/97) |
| [FAL-425](https://space.avada.net/browse/FAL-425) | Bug | SEO | 1 | 1 | Instant Indexing: hiện trạng thái Connected key + fix reload flicker | [MR](https://gitlab.com/avada/seo/-/merge_requests/1973) |
| [FAL-426](https://space.avada.net/browse/FAL-426) | Task | SEO | 3 | 1 | Dev zone: bulk-delete unresolved broken links theo khoảng ngày | [slack](https://avadaio.slack.com/archives/G01N5G8D562/p1783011652275339) |
| [FAL-427](https://space.avada.net/browse/FAL-427) | Bug | SEO | 2 | 1 | Sitemap proxy: rate limiter theo shop thay vì dùng chung GFE IP | [MR](https://gitlab.com/avada/seo/-/merge_requests/1971) |
| [FAL-428](https://space.avada.net/browse/FAL-428) | Bug | SEO | 2 | 1 | Internal Link: chặn free plan vào trang detail + làm rõ lỗi duplicate anchor text | [slack](https://avadaio.slack.com/archives/C06R8TPSSLV/p1782919755546679) |
| [FAL-429](https://space.avada.net/browse/FAL-429) | Bug | AEO | 1 | 1 | Additional file: thiếu Shopify scope | [slack](https://avadaio.slack.com/archives/G01N5G8D562/p1782942086448399) |

## Tùng LV + Dung TT + Tony — 6 issue, 8 dev point

| Jira | Type | App | Dev | Test | Việc | MR |
|---|---|---|---|---|---|---|
| [FAL-433](https://space.avada.net/browse/FAL-433) | Bug | SEO | 1 | 1 | Lỗi translate | [slack](https://avadaio.slack.com/archives/G01N5G8D562/p1783389361671129) |
| [FAL-435](https://space.avada.net/browse/FAL-435) | Bug | SEO | 1 | 1 | Yandex Webmaster không nhận meta tag yandex-verification dù đã inject vào head | [slack](https://avadaio.slack.com/archives/G01N5G8D562/p1784990510013619) |
| [FAL-436](https://space.avada.net/browse/FAL-436) | Bug | SEO | 1 | 1 | Internal sitemap fetcher báo "Couldn't fetch" với sitemap >400KB dù URL trả 200 OK | [slack](https://avadaio.slack.com/archives/G01N5G8D562/p1784991612099989) |
| [FAL-437](https://space.avada.net/browse/FAL-437) | Bug | Blog | 1 | 1 | Không tự tạo redirect khi edit URL blog handle (cả thủ công lẫn Fix with AI) | [slack](https://avadaio.slack.com/archives/C08928RK00H/p1785101512597299) |
| [FAL-438](https://space.avada.net/browse/FAL-438) | Bug | SEO | 1 | 1 | Không có option stop tiến trình AI generate meta title hàng loạt | [slack](https://avadaio.slack.com/archives/G01N5G8D562/p1785186076298359) |
| [FAL-439](https://space.avada.net/browse/FAL-439) | Bug | Blog | 5 | - | HTTP 500 ở PUT /api/article, POST /apiv2/apiV2/langgraph/blog, POST /api/gen-ai-suggested/recommendBlogPost | [slack](https://avadaio.slack.com/archives/C0BEHGV1ST1/p1785306099522789) |

## Tổng

| Nhóm | Issue | Dev point |
|---|---|---|
| Ngọc Trường + Dung TT + Tony | 2 | 2 |
| Tài NG (Matthew) | 2 | 0 |
| Đức NM + Dung TT + Tony | 5 | 5 |
| Minh PT + Dung TT + Tony | 6 | 14 |
| Tùng LV + Dung TT + Tony | 6 | 8 |
| **Tổng** | **21** | **29** |

Type: 18 Bug + 3 Task. App: SEO 14, Blog 4, AEO 2, APC 0.

4 issue bị xoá 2026-07-29 vì trùng task Tùng đã có từ 23/07:
FAL-430↔[FAL-308](https://space.avada.net/browse/FAL-308), FAL-431↔[FAL-306](https://space.avada.net/browse/FAL-306),
FAL-432↔[FAL-301](https://space.avada.net/browse/FAL-301), FAL-434↔[FAL-304](https://space.avada.net/browse/FAL-304).

3 issue dùng URL làm summary vì brief không có tiêu đề và glab chưa auth: FAL-415 (blogs!781),
FAL-416 (seo!2063), FAL-418 (image-optimizer!234). Login glab rồi sửa summary sau nếu cần.
