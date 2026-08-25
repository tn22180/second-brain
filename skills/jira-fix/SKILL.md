---
name: jira-fix
description: Đưa 1 link/mã task Jira Falcon (FAL-xxx) → tự đọc ticket, tự định vị repo, tự phân tích code, DỪNG xin duyệt bảng fix, rồi tự sửa + tự mở MR + comment link MR ngược lên ticket. Chỉ 5 app trong registry (SEO/Blog/APC/AEO/Speed). Dùng khi user dán link space.avada.net/browse/FAL-xxx, hoặc gõ "/jira-fix", "fix task này", "fix bug FAL-xxx", "làm task FAL-xxx", "sửa rồi mở MR".
---

# jira-fix

Vào: một link Jira. Ra: một hoặc nhiều MR đã mở, cộng một comment trên ticket nói MR nào phủ finding nào.

Đọc `$ENGINE_DIR/references/workflow.md` (6 pha, chi tiết) và `$ENGINE_DIR/references/guards.md`
(ca phải dừng) TRƯỚC khi chạm bất cứ thứ gì.

## ⚙️ `$ENGINE_DIR`
= **thư mục skill này** (dòng *"Base directory for this skill"* ở đầu context). Thay bằng đường dẫn
tuyệt đối khi chạy script. Token đọc từ `$ENGINE_DIR/.env`, fallback sang `jira-create/.env`.

## Guard tuyệt đối
- **Một cổng duyệt, ở pha 4.** Phân tích xong → in bảng nhóm fix → **dừng, chờ user gật**. Không
  viết một dòng code nào trước đó.
- **Chỉ 5 app trong `references/apps.json`.** App ngoài đó → dừng và nói thiếu gì. Không bao giờ
  đoán repo hàng xóm từ tên app.
- **Branch bắt buộc `fix/FAL-<số>-<slug>`.** Cấm push lên base branch. Cấm push khi diff chạm file
  ngoài bảng đã duyệt — `open-mr.mjs` tự chặn, đừng tìm cách đi vòng.
- **Không deploy.** Không `firebase deploy`, không `gcloud run deploy`, không cắt tag. MR là hết.
- **Luôn comment link MR ngược lên ticket**, và comment phải ngắn (~15 dòng). Không đổi status ticket.
- **Ticket Highest, hoặc chạm auth/credit/billing → MR mở dạng Draft**, comment viết "đề xuất",
  không viết "đã fix".
- **Comment trong code viết bằng tiếng Anh.** Cả code lẫn test. Repo là tài sản chung và toàn bộ
  comment sẵn có đều là tiếng Anh — trộn thêm tiếng Việt là để lại hai giọng trong cùng một file.
  Mô tả MR, comment Jira, và trả lời cho Tuan thì vẫn tiếng Việt.
- Token không bao giờ nằm trên command line.

## 6 pha
1. **Resolve** — `node $ENGINE_DIR/scripts/fetch-issue.mjs <link|FAL-xxx>` → ticket + repo.
2. **Ground** — `git fetch`, in sha `origin/<base>`. **Pin branch trước mọi phát biểu về code.**
   Nạp `CLAUDE.md` + `.claude/skills/` của repo đó.
3. **Analyze** — mỗi finding phải có `file:line` resolve được trên `origin/<base>` **hiện tại**.
   Citation chết = ticket đã trôi → refute, báo, không fix mù.
4. **GATE** — in bảng `nhóm │ finding │ file:line │ fix │ rủi ro │ branch`. **Dừng.**
5. **Fix** — mỗi nhóm: `worktree.mjs` → sửa → test đi kèm (phải fail khi revert source) → chạy test.
6. **MR** — `open-mr.mjs --dry-run` xem trước, rồi thật. Rồi **luôn** `comment-issue.mjs --confirm`
   comment ngược link MR lên ticket — **ngắn**: link MR + một dòng mỗi MR + cái chưa làm + cái đã
   refute. Chi tiết ở MR body, không chép lại vào ticket.

Setup lần đầu / nghi ngờ môi trường: `node $ENGINE_DIR/scripts/doctor.mjs`.
