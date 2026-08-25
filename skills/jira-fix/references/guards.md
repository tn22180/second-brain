# jira-fix — guard và ca phải dừng

Skill này ghi vào repo thật và mở MR thật. Danh sách dưới đây là chỗ nó phải dừng lại và trả việc
cho người, không phải chỗ để tìm cách đi vòng.

## Dừng và hỏi

| Ca | Vì sao |
|---|---|
| `appError.reason = unknown` | Không xác định được app từ Falcon App lẫn tag summary. Đoán repo là cách MR rơi vào nhầm app. |
| `appError.reason = conflict` | Field và summary chỉ hai repo khác nhau. Ticket gắn sai board còn cứu được, MR nhầm repo thì không. |
| `appError.reason = out_of_scope` | App có thật nhưng chưa có trong `apps.json`. Thêm entry (đọc `defaultBranch`, `remote` từ đĩa) rồi chạy lại. |
| Status đã `Done`/`Closed` | Có thể đã có người fix. |
| Ticket không có mô tả lỗi, chỉ có tiêu đề | Không đủ để phân tích. Hỏi reporter, đừng tự dựng giả thuyết rồi fix theo nó. |
| Ticket là feature/task, không phải bug | Skill này chỉ đóng bug đã có mô tả. Feature đi qua brainstorming + plan bình thường. |
| Fix cần đổi schema Firestore, đổi index, migrate dữ liệu | Không phải thứ một MR tự động được quyền đề xuất một mình. |
| Fix cần thêm secret / đổi CI variable | Người làm. |
| Sau 2 vòng phân tích vẫn không pin được nguyên nhân | Báo "không kết luận được" kèm những gì đã loại trừ. Một bug chưa giải thích được nói thật vẫn hơn một MR tự tin dựng trên phỏng đoán. |

## Không bao giờ

- Deploy — `firebase deploy`, `gcloud functions|run deploy`, `npm|yarn run deploy`, cắt tag.
  MR là điểm dừng cuối. (seo và optimize-image deploy **theo tag**, nên một cái tag chính là deploy.)
- Push lên base branch, hay lên branch ngoài prefix `fix/FAL-`.
- Push khi diff chạm file ngoài `allow.txt`. `open-mr.mjs` chặn; đừng viết lại `allow.txt` cho khớp
  diff — quay lại xin duyệt phạm vi mới.
- Đổi status ticket, đổi assignee, đóng ticket.
- Sửa trong cây gốc của repo. Mọi thay đổi sống trong worktree dưới `~/.cache/jira-fix/wt/`.
- Sửa test cho pass thay vì sửa source. Test đỏ sẵn từ trước = nợ có sẵn: ghi vào MR, không im lặng vá.
- Dán token vào command line. Đọc từ env file.
- Mượn skill/doc của app khác cho app đang làm.
- Viết comment tiếng Việt trong code hoặc test. Ngôn ngữ của comment là ngôn ngữ của repo, và cả 5
  repo đều dùng tiếng Anh. Chỗ dùng tiếng Việt: mô tả MR, comment Jira, trả lời cho Tuan.

## Ticket nhạy cảm → MR Draft

Áp dụng khi ticket `priority = Highest`, **hoặc** finding chạm bất kỳ thứ nào sau:
auth / session / JWT / webhook HMAC, quyền theo shop (IDOR), credit và billing, thứ gì đọc/ghi
được xuyên tenant.

Khi đó:
- `open-mr.mjs --draft`.
- Comment trên ticket viết **"đề xuất fix"**, không viết "đã fix".
- MR body có mục "Cho reviewer" nói rõ đường nào còn hở nếu chỉ merge một phần.

Lý do: một fix ở biên auth có thể pass hết test và vẫn rò. Cái đóng lỗ là mắt người, không phải suite test.

## Đối chiếu chéo cả fleet

Bug tìm thấy ở một app thường có bản sao ở app khác — 5 app dùng chung khuôn Shopify + Firebase và
code được copy qua lại. Sau khi pin được nguyên nhân, grep đúng pattern đó trên 4 repo còn lại.

Có ở app khác → **không** kéo vào MR này. Báo trong comment ticket, và nói rõ nên mở ticket riêng.
Một MR một app.
