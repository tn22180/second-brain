# review-core — checkout MR & chạy review (bước 3)

Đầu vào: `projectPath`, `mrIid`. Map repo local qua `resolve-repos.mjs` (xem `onboarding-repos.md`).

## 1. Lấy metadata MR (dùng node, không cần python3)
```bash
ENC=$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "<projectPath>")
glab api "projects/$ENC/merge_requests/<mrIid>" > /tmp/mr.json
TARGET=$(node -e "console.log(require('/tmp/mr.json').target_branch)")
HEADSHA=$(node -e "console.log(require('/tmp/mr.json').sha)")
```

## 2. Checkout worktree cô lập (KHÔNG đụng working tree gốc)
```bash
REPO=<localPath từ: node $DIR/scripts/resolve-repos.mjs --path <projectPath>>
WT="<scratchpad>/wt-<key>"
git -C "$REPO" fetch origin                                                  # target MỚI NHẤT
git -C "$REPO" fetch origin "refs/merge-requests/<mrIid>/head:review-mr-<mrIid>"
git -C "$REPO" worktree add --detach "$WT" "review-mr-<mrIid>"               # HEAD = MR head
git -C "$WT" reset --soft "origin/$TARGET"                                   # HEAD→target mới nhất; index+worktree = MR
```
Giờ `git -C "$WT" diff HEAD` / `git -C "$WT" status` cho thấy TOÀN BỘ thay đổi MR so với `origin/$TARGET` mới nhất, **kể cả file bị xoá**. Built-in code-review/security-review review đúng phạm vi này.

## 3. Chạy built-in review (KHÔNG --comment / --fix)
Đứng ở `$WT`, gọi skill built-in:
- `code-review` (không cờ post) → findings bug/tối ưu/hiệu năng.
- `security-review` → findings bảo mật.

Lấy output của 2 skill, chuẩn hoá về **findings model**:
```json
{ "severity": "bug|optimize|hint|security", "category": "correctness|perf|reuse|security",
  "scope": "in_diff|related",
  "title": "...", "file": "packages/.../x.js", "line": 88,
  "impact": "...", "detail": "...", "suggestion": "...",
  "blobUrl": "https://gitlab.com/<projectPath>/-/blob/<HEADSHA>/<file>#L88" }
```
`severity` PHẢI là đúng 1 trong 4 chuỗi trên (emoji + tên nhóm do renderer tự map, KHÔNG lưu emoji trong model).

### `impact` — giải thích ảnh hưởng bằng ngôn ngữ người dùng (BẮT BUỘC với bug/security)
Một câu (hoặc 2) trả lời: **lỗi này ảnh hưởng tính năng nào của app, và nó xảy ra khi user làm gì**.
- **CẤM** biến code, tên hàm, tên field, path file trong `impact` — chỉ tên tính năng + hành động của user + triệu chứng họ thấy. Người đọc là PO/Tester/assignee, không nhất thiết đọc được code.
- Viết theo góc nhìn "chuyện gì xảy ra với shop/merchant", không phải "dòng nào sai".
- BẮT BUỘC cho `bug` và `security`; với `optimize`/`hint` để trống (`null`) nếu không có ảnh hưởng người dùng rõ ràng.
- Ví dụ tốt: *"Ảnh hưởng tính năng Nén ảnh và Tối ưu ALT: sau khi một lần chạy 'chỉ ALT' được kích hoạt, cấu hình của shop bị nhớ nhầm sang chế độ ALT — các lần nén ảnh sau có thể bị xử lý sai, hoặc shop gói trả phí bị chặn nhầm khỏi tính năng."*
- Ví dụ xấu (có code, cấm): *"`optimizingType` bị ghi 'alt' trong `saveSettings` nên `seoController` gate sai."*
- `detail` vẫn giữ mô tả kỹ thuật (được phép có biến/tên hàm) cho Tech Lead/dev — hai phần bổ trợ nhau, đừng gộp.
Map severity: bug/correctness → `"bug"` · perf/reuse/tối ưu → `"optimize"` · nitpick/gợi ý → `"hint"` · security-review → `"security"`.

### `scope` — phân loại phạm vi (BẮT BUỘC mỗi finding)
Review được **đọc source xung quanh làm ngữ cảnh**, nhưng mỗi finding phải neo rõ vào code nào:
- **`"in_diff"`** — chỗ báo lỗi nằm trên **dòng MR thêm/sửa** (dòng `+`/`-` trong diff, hoặc file MR mới tạo). Đây là lỗi *do MR sinh ra*.
- **`"related"`** — chỗ báo lỗi nằm trên **code CŨ ngoài diff**, nhưng MR **làm lộ ra / tương tác với** nó (vd MR thêm cái khoá ở UI nhưng backend cũ không enforce). Lỗi thật, nhưng chỗ sửa ở file MR không đụng.

Cách xác định: đối chiếu `file:line` của finding với `git -C "$WT" diff HEAD`. Dòng đó là `+`/`-` (hoặc thuộc file mới) → `in_diff`; ngược lại (chỉ xuất hiện khi đọc source đầy đủ, không phải dòng MR đổi) → `related`. Khi mơ hồ, xếp `related`.
Reviewer PHẢI ưu tiên tìm lỗi `in_diff`; chỉ thêm `related` khi nó gắn trực tiếp với thay đổi của MR (đừng biến thành audit toàn repo).

## 4. Dọn sạch
```bash
git -C "$REPO" worktree remove --force "$WT" 2>/dev/null || true
git -C "$REPO" branch -D "review-mr-<mrIid>" 2>/dev/null || true
```
Bắt buộc chạy kể cả khi review lỗi/throw (coi như `finally`) — cả hai lệnh đã được làm an toàn (`|| true` / `2>/dev/null`) nên không bao giờ fail và chặn tiếp bước sau.
Nếu vì lý do nào đó worktree bị bỏ sót (crash phiên...), phục hồi bằng: `git -C "$REPO" worktree prune`.
