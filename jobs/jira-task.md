tại task bug add vào cột done của sprint 1, không links tới task nào, xong thfi gửi danh sách link + task của từng dev vào 1 file md cho t cho
Ngọc Trường + Dung TT + tôi: 
 - https://gitlab.com/avada/blogs/-/merge_requests/781,dev point: 1, testpoint: 1
 - https://gitlab.com/avada/seo/-/merge_requests/2063, dev point: 1, testpoint: 1
 Gia Tài: 
 - Improvement - [Plaza] Audit Report: Improve crisp for both onboarding and audit https://gitlab.com/avada/avada-image-optimizer/-/merge_requests/236
 https://gitlab.com/avada/avada-image-optimizer/-/merge_requests/234
 Đức NM + Dung TT + Tôi: 
 -[SEO] fix credit to use in ai-content, mr: https://avadaio.slack.com/archives/C0A2JLC5AGN/p1782807684419659, dev point: 1, testpoint: 1
 -[SEO] fix translate button in instant index, mr: https://gitlab.com/avada/seo/-/merge_requests/1969,dev point: 1, testpoint: 1
 -[SEO] loading sync imagee, mr: https://gitlab.com/avada/seo/-/merge_requests/1950, dev point: 1, testpoint: 1
 -[SEO] fix organization, mr: https://gitlab.com/avada/seo/-/merge_requests/1989, dev point: 1, testpoint: 1
 -[SEO] tooltip for compressing, mr: https://gitlab.com/avada/seo/-/merge_requests/1958, dev point: 1, testpoint: 1
 MinhPT + Dung TT + Tôi:
 👨💻 Task - [AEO] Llms: auto-detect /policies/ pages per language in llms.txt & llms-full.txt, mr: https://gitlab.com/avada/llm-ai-search-seo/-/merge_requests/97, dev point: 5, testpoint: 1
 Bug - [SEO] Instant Indexing: show Connected key status + fix reload flicker, mr: https://gitlab.com/avada/seo/-/merge_requests/1973, dev point: 1, testpoint: 1
 👨💻 Task - [SEO] Dev zone: bulk-delete unresolved broken links by date range, mr: https://avadaio.slack.com/archives/G01N5G8D562/p1783011652275339, dev point: 3, testpoint: 1
 Bug - [SEO] Sitemap proxy: key rate limiter per shop instead of shared GFE IP, mrr: https://gitlab.com/avada/seo/-/merge_requests/1971, dev point: 2, testpoint: 1
 Bug - [SEO] Internal Link: block free-plan access to internal-link detail page + clarify duplicate anchor text error, mr: https://avadaio.slack.com/archives/C06R8TPSSLV/p1782919755546679, dev point: 2, testpoint: 1
 Bug - [AEO] Additional file: Missing Shopify scope, mr: https://avadaio.slack.com/archives/G01N5G8D562/p1782942086448399, dev point: 1, testpoint: 1
Tung + Dung TT + Tôi:
 1 • Vấn đề chính: After item list content không hiển thị nội dung bản dịch (tiếng Đức) trên trang collection.  
 • Chi tiết:  
   - Store đa ngôn ngữ, khách nhập nội dung tiếng Đức cho phần “After product/item list content” nhưng khi xem trên website vẫn hiển thị tiếng Anh.  
   - URL khách báo lỗi: https://www.parrotuncle.de/collections/deckenventilatoren  
   - Support đã kiểm tra và xác nhận tái hiện được lỗi ở phía họ.
 - mr : https://avadaio.slack.com/archives/G01N5G8D562/p1782874269248409, dev point: 1,testpoint: 1
 -
2 • Vấn đề chính: Lỗi AI generate (nội dung sinh ra bị lỗi/không đúng).  
• Chi tiết:  
  - Khách báo trong phần mô tả sản phẩm do AI generate, thỉnh thoảng bị chèn đoạn “internal reasoning” bằng tiếng Anh kiểu: “This structure adheres to the template… I will ensure the final output is pure HTML.” xuất hiện giữa bài (không nên có).  
  - Khách cũng thấy một số sản phẩm bị lặp đoạn (một vài paragraph xuất hiện 2 lần), ví dụ tại link: https://123watches.nl/products/apple-watch-hardcase-aegix-zwart  
  - Lỗi xảy ra ngẫu nhiên: support kiểm tra vài sản phẩm khác thì đa số không bị; khách có nhiều sản phẩm nên không thể kiểm tra thủ công từng cái để tìm lỗi.
- mr: https://avadaio.slack.com/archives/G01N5G8D562/p1782944345516229, dev point: 3,testpoint: 1
3 • Vấn đề chính: Tính năng bulk generate Meta Title bị lỗi liên tục.  
• Chi tiết:  
  - Khi khách thử generate nhiều lần, đa số kết quả trả về lỗi rate limit từ API: HTTPError Response code 429 (Too Many Requests) với thông báo Exceeded 2 calls per second for api client. Reduce request rates to resume uninterrupted service.  
 mr: https://avadaio.slack.com/archives/G01N5G8D562/p1783095101085209, dev point: 1,testpoint: 1
4. lỗi translate, mr: https://avadaio.slack.com/archives/G01N5G8D562/p1783389361671129 ,dev point: 1,testpoint: 1
5. Issue:
• Vấn đề chính: Lỗi AI credits (ghi nhận sai loại tác vụ, trừ credit khi lỗi, và thiếu usage history). 
• Chi tiết: 
  - Generate Meta Title trong AI Content nhưng Usage History lại ghi credit dùng cho “generate FAQ” (video test: https://www.loom.com/share/6bb7846057af4c08ad7745691bc805e6). 
  - Khách generate Meta Title cho product có một số lần bị error nhưng vẫn bị trừ credit; cần dev kiểm tra số lần error để cộng lại đúng số credit (https://capture.avada.io/i/G2a2xzQIbYex). 
  - Khách có ảnh generate in bulk nhưng khi check Usage History lại trống (https://capture.avada.io/i/4x24SUrLHX7s).
  - mr: https://avadaio.slack.com/archives/G01N5G8D562/p1783371668498189, ,dev point: 2,testpoint: 1
6. - App SEO đã lưu và inject meta tag <meta name="yandex-verification" content="f95bd607a3879ad9" /> vào <head> — xác nhận thấy trong HTML source của https://www.xinghaoya.net :white_check_mark:
  - Tuy nhiên Yandex Webmaster vẫn báo "Rights haven't been verified – Meta tag not found" (ảnh: https://capture.avada.io/i/je9aZXnEtQuw)
  - Store dùng custom domain www.xinghaoya.net (myshopify: adult-tribe-store.myshopify.com) và có Avada Speed Up (LightJS defer) đang hoạt động — có thể Yandex crawler không thực thi JS nên không đọc được tag nếu tag bị render sau JS
  - Cần dev kiểm tra: tag có được output trực tiếp trong HTML tĩnh (không bị wrap trong JS) hay không; và tại sao Yandex không nhận dù tag hiển thị trong browser.
- mr: https://avadaio.slack.com/archives/G01N5G8D562/p1784990510013619,dev point: 1,testpoint: 1
7. Issue:
• Vấn đề chính: Avada SEO Suite internal sitemap fetcher hiển thị "Couldn't fetch" với 2 sitemap URL dù cả 2 đều accessible 200 OK từ bên ngoài — đây là bug phía app, không phải lỗi phía merchant.
• Chi tiết:
  - /sitemap_blogs_1.xml → trả 200 OK, XML valid, nhưng file nặng 411,570 bytes (~402KB) với 731 URLs — khả năng cao Avada internal fetcher timeout trước khi đọc xong response. Last read: July 25, 2026.
  - /sitemap_products_1.xml?from=1772230639675&to=6637082017835 → trả 200 OK bình thường khi fetch từ Chrome UA và Googlebot UA. Status "Couldn't fetch" nhưng Google đã nhận submit thành công.
  - Đã verify cả 2 URL với Chrome UA và Googlebot UA → đều 200 OK, XML valid → confirm không phải lỗi URL, không phải block bot.
  - GSC Submission log trong app: cả 4 sitemap đều "Success" (Google nhận đủ) — lỗi chỉ nằm ở cột "Status" do Avada fetcher tự check nội bộ bị timeout/fail.
  - Root cause nghi ngờ: fetcher không handle được response body lớn (>400KB) → timeout hoặc read error → hiển thị "Couldn't fetch" sai lệch với thực tế.
  - mr: https://avadaio.slack.com/archives/G01N5G8D562/p1784991612099989, dev point: 1,testpoint: 1
8. Vấn đề chính: Không tự động tạo redirect khi edit URL blog handle (cả thủ công lẫn Fix with AI)
• Chi tiết:
  - App hiển thị thông báo "sẽ tự động tạo URL redirect" nhưng thực tế redirect KHÔNG được tạo
  - CS đã test lại trên test store: edit URL thủ công + Fix with AI đều không tạo redirect
  - Page ví dụ: /blogs/news/choosing-right-kitchen-splashback (handle updated 14/7), old URL bị 404
  - Khách kiểm tra Ahrefs thấy nhiều blog bị 404 sau khi AI optimize URL 
- mr: https://avadaio.slack.com/archives/C08928RK00H/p1785101512597299,dev point: 1,testpoint: 1
9. Vấn đề chính: Không có option để dừng (stop) tiến trình AI generate meta title đang chạy hàng loạt
• Chi tiết:
  - Khách dùng AI content, ấn nhầm → trigger gen meta title cho >5,000 sản phẩm
  - Lúc liên hệ đã gen xong ~1,000 items (xem ảnh: https://capture.avada.io/i/euY4RMILVjU2)
  - Progress screenshot: https://capture.avada.io/i/oZ9lSTtDH3vj
  - Hiện không có option stop trong dev zone cho case này
  - Câu hỏi 1: Có thể implement option stop progress cho những case như này không?
  - Câu hỏi 2: Khách muốn reimburse AI credits đã dùng do misclick — team product check được không? (Khách plan cũ: Pro, hiện: Enterprise)
  - mr: https://avadaio.slack.com/archives/G01N5G8D562/p1785186076298359, dev point: 1,testpoint: 1
10. resolve bug product cho blog: HTTP 500 PUT /api/article/587406442575, HTTP 500 POST /apiv2/apiV2/langgraph/blog,HTTP 500 POST /api/gen-ai-suggested/recommendBlogPost, mr: https://avadaio.slack.com/archives/C0BEHGV1ST1/p1785306099522789, devpoint: 5

---

## Progress

Started: 2026-07-29

Mục tiêu: tạo 25 issue trên Jira FAL, add vào **Falcon Sprint 1** (id 59), status **Done**,
không link tới task nào. Sau đó xuất `jobs/sprint1-done-by-dev.md`.

Chốt với user trước khi chạy:
- "Gia Tài" = `taing` (Tài NG - Matthew)
- 3 MR không có title (blogs!781, seo!2063, image-optimizer!234) → dùng URL làm summary tạm (glab chưa auth)
- Issue type theo nhãn trong brief: 3 Task + 22 Bug
- E2 (AI generate chèn internal reasoning vào product description) = app **APC**, không phải SEO

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Dựng draft 25 issue + script tạo | ✅ | 25/25 link MR khớp brief, 0 thiếu 0 thừa, tổng 38 dev point |
| 2 | Chạy thật 1 issue A1 + verify pipeline | ✅ | FAL-415 OK. Phát hiện Sprint 1 đã closed → chuyển sang Sprint 2 |
| 3 | Tạo 24 issue còn lại | ✅ | FAL-416 → FAL-439, sprint+Done đều OK |
| 4 | Verify 25 issue bằng JQL | ✅ | 25/25 khớp draft, 0 lệch |
| 5 | Gen file sprint1-done-by-dev.md | ✅ | 25 row, 0 link lệch, 25/25 MR có mặt |

**COMPLETE** — 2026-07-29

### Log

#### ✅ Task 1: Dựng draft 25 issue + script tạo
- Status: ✅ completed
- Started: 2026-07-29
- Completed: 2026-07-29
- Output: `scratchpad/issues.json` (25 payload) + `scratchpad/create-sprint-done.mjs`
- Verify: 25 link MR trong brief ↔ 25 link trong issues, thiếu 0 thừa 0; Falcon App đều hợp lệ;
  0 summary trùng; dev point đều thuộc enum Fibonacci; tổng 38 dev point
- Phân bổ: 22 Bug + 3 Task; app SEO 17, Blog 4, AEO 2, APC 1

#### ✅ Task 2: Chạy thật 1 issue A1 + verify pipeline
- Status: ✅ completed
- Started: 2026-07-29
- Completed: 2026-07-29
- Tạo được [FAL-415](https://space.avada.net/browse/FAL-415) — status Done, Assignees
  `truongnn, dungtt, tuannv`, app Blog, dev 1, tester 1, `issuelinks: []`
- **Blocker phát hiện ở đây:** Falcon Sprint 1 (id 59) đã closed lúc `2026-07-28T16:59`.
  Jira chặn gán issue vào sprint đã hoàn thành, cả 2 đường:
  - `PUT /rest/api/2/issue/{key}` → `400 "Issue can be assigned only active or future sprints."`
  - `POST /rest/agile/1.0/sprint/59/issue` → `400 "You must specify a sprint which has not been completed."`
- **Quyết định (user chốt):** đẩy toàn bộ vào **Falcon Sprint 2 (id 62, active)** — goal của sprint này
  là "Đóng nốt việc dang dở Sprint 1". Không reopen Sprint 1 để tránh lệch velocity/burndown đã chốt.
- FAL-415 đã PUT sprint 62 thành công (`204`), verify lại: status Done, sprint 62, 0 link

#### ✅ Task 3: Tạo 24 issue còn lại
- Status: ✅ completed
- Started: 2026-07-29
- Completed: 2026-07-29
- Lần chạy đầu crash `ETIMEDOUT` tới space.avada.net ngay issue đầu (chưa tạo gì thêm). Đã thêm
  `withRetry` (4 lần, backoff 2s/4s/6s) + `findExisting` tra summary trước khi POST để rerun sau
  crash không tạo trùng. Chạy lại: 24/24 `sprint=OK done=OK`.
- Key: FAL-416 → FAL-439

#### ✅ Task 4: Verify 25 issue bằng JQL
- Status: ✅ completed
- Completed: 2026-07-29
- Đối chiếu từng field với draft: status Done ✔, sprint 62 ✔, summary ✔, assignees ✔, Falcon App ✔,
  dev point ✔, tester point ✔, issuetype ✔, `issuelinks: []` ✔ — **0/25 lệch**
- Tổng dev point trên Jira = 38, khớp draft. Type: 22 Bug + 3 Task.
- Lần check đầu báo 15 issue "lệch assignees" — do so sánh theo thứ tự mảng; Jira trả về thứ tự khác.
  So theo tập hợp thì khớp hết. Không phải lỗi dữ liệu.

#### ✅ Task 5: Gen file sprint1-done-by-dev.md
- Status: ✅ completed
- Completed: 2026-07-29
- Output: `~/Documents/second-brain/jobs/sprint1-done-by-dev.md`
- Verify: 25 row, 25 key unique, 0 link `[FAL-x]` trỏ sai `/browse/FAL-x`, 25/25 link MR trong brief
  đều có mặt trong file
