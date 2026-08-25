# jira-fix — 6 pha

`$ENGINE_DIR` = thư mục skill. Mọi lệnh dưới đây chạy bằng đường dẫn tuyệt đối.

---

## Pha 1 — Resolve

```
node $ENGINE_DIR/scripts/fetch-issue.mjs <link|FAL-720>
```

Ra JSON gọn: summary, type, status, priority, Falcon App, reporter, assignees, links, subtasks,
attachments, comments, description, và `app` đã resolve sang repo.

`--raw` khi cần một field chưa được map.

**Đọc trước khi đi tiếp:**
- `appError != null` → **dừng**. `out_of_scope` nghĩa là phải thêm entry vào `apps.json` (kèm
  repo, defaultBranch, remote, testCmd — đọc từ đĩa, không đoán). `conflict` nghĩa là field Falcon
  App và tag `[App]` trong summary chỉ hai repo khác nhau → hỏi user repo nào đúng.
- `status` đã `Done`/`Closed`/`Resolved` → hỏi trước khi làm. Có thể ai đó đã fix rồi.
- `issuetype` là `Sub-task` → đọc thêm `parent`; ngữ cảnh thường nằm ở task cha.
- `comments` không rỗng → đọc hết. Comment hay chứa "đã thử X, không được" và đó là thứ đắt nhất
  để phát hiện lại từ đầu.
- `attachments` → screenshot/log. Tải bằng `curl -H "Authorization: Bearer $JIRA_TOKEN"` với token
  lấy từ env file, **không dán token vào command line**.

---

## Pha 2 — Ground

Trước bất cứ phát biểu nào về code:

```
git -C <repoPath> fetch origin <defaultBranch>
git -C <repoPath> rev-parse origin/<defaultBranch>
```

In sha ra. Cây làm việc của Tuan thường đang nằm trên feature branch đi sau master hàng chục
commit — đọc code ở đó rồi kết luận là cách nhanh nhất để viết một bản phân tích sai toàn tập.

Nạp ngữ cảnh của **repo đó**: `CLAUDE.md` ở gốc repo, `.claude/skills/` của nó. Không mượn skill
của app khác — cùng là Shopify app không có nghĩa cùng kiến trúc.

Nếu ticket có ghi commit gốc (ví dụ "verify trên commit 420385b"), so với sha vừa lấy:
- Trùng → citation trong ticket dùng thẳng được.
- Lệch → mọi `file:line` trong ticket là toạ độ **cũ**. Phải re-verify từng cái ở pha 3.

---

## Pha 3 — Analyze

Đọc code trên `origin/<base>`. Với **từng** finding, sản phẩm là:

| trường | bắt buộc |
|---|---|
| `file:line` | có, và phải resolve được trên `origin/<base>` hiện tại |
| cơ chế | có — đi từ input của attacker/người dùng tới hậu quả, qua từng hàm |
| fix định làm | có |
| test tái hiện được không | có/không, nói rõ |

Quy tắc:
- Citation không resolve → **refute**, ghi "đã đổi/đã fix ở commit nào", không fix mù theo mô tả.
- Ticket nói A nhưng code nói B → tin code, báo lệch. Ticket do người viết và người cũng đọc nhầm.
- Finding ticket ghi "đã refute" → không tự hồi sinh, trừ khi có bằng chứng mới và nói rõ bằng chứng đó.

Fan out khi có từ 3 finding độc lập trở lên: mỗi subagent verify một cụm, trả về bảng trên. Đọc
`superpowers:dispatching-parallel-agents` nếu chưa rõ cách chia.

---

## Pha 4 — GATE ⛔

In bảng, rồi **dừng hẳn**. Không tạo worktree, không sửa file.

```
Nhóm 1 — <tên>            branch fix/FAL-720-<slug>     [Draft? có/không]
  #1  file.js:60-68       <finding>
      fix:                <làm gì>
      rủi ro:             <cái gì có thể vỡ>
      test:               <test nào chứng minh>
  #2  ...
  file được phép chạm:    a.js, b.js, __tests__/a.test.js

Nhóm 2 — ...

Đã refute (không làm): ...
Chưa đủ dữ kiện (không làm): ...
```

Cắt nhóm theo **cái reviewer cần duyệt cùng nhau**, không theo file:
- Một chain phải fix trọn mới đóng được lỗ → một nhóm, dù chạm 5 file.
- Các finding rời cùng loại (IDOR, credit tamper) → gom theo loại, mỗi loại một MR.
- Fix chạm auth boundary không bao giờ đi chung MR với dọn dẹp.

Chờ user gật rõ ràng ("ok", "làm đi", "nhóm 1 thôi"). Im lặng không phải là gật.

---

## Pha 5 — Fix

Mỗi nhóm, tuần tự (worktree dùng chung repo, không chạy song song):

```
node $ENGINE_DIR/scripts/worktree.mjs --key FAL-720 --repo ai-product-copy --slug <slug>
```

Ra `dir`, `branch`, `baseSha`, `testCmd`, `nodeModules`. Sửa **chỉ trong `dir`**, không đụng cây gốc.

`node_modules` được symlink sang checkout gốc (worktree mới không mang nó theo, nên jest chết ở
import đầu tiên). Cài lại cho mỗi worktree tốn vài phút và vài trăm MB; cả hai cây đọc chung một
`yarn.lock` nên symlink cho đúng thứ CI cũng thấy.

**Chạy full suite NGAY, trước khi sửa gì.** Đó là baseline. Repo có thể đang đỏ sẵn, và không biết
con số đó thì không phân biệt được "mình làm hỏng" với "nó hỏng từ trước".

Thứ tự: viết test tái hiện trước → chạy, phải **fail** → sửa source → chạy lại, phải **pass**.
Rồi revert riêng phần source, chạy lại: test phải fail lại. Không có bước cuối này thì không biết
test đang bám vào bug hay bám vào fix.

Revert bằng `cp` file ra chỗ khác rồi `git checkout HEAD -- <file>`, **không dùng `git stash`**:
stash stack dùng chung cho cả repo, worktree khác và cây gốc của user đều thấy nó.

```
cd <dir> && npx jest --ci <đường dẫn test>
```

Chạy hẹp trước, rộng sau. Test vỡ sẵn từ trước khi sửa → ghi nhận là nợ có sẵn, nói trong MR, đừng
im lặng sửa kèm.

Kiểm cả CI của repo có thật sự chạy suite đó không (`grep jest .gitlab-ci.yml`). Nếu không, nói
thẳng trong MR rằng mọi con số test là chạy tay — reviewer đang không có pipeline nào đỡ cho họ.

Repo có `scripts/docs-gate/` thì chạy `node scripts/docs-gate/index.js` trước khi mở MR: nó chạy
trên mọi MR pipeline và fail vì doc trỏ vào code đã dời.

Thêm dependency → phải commit `yarn.lock` cùng MR, nếu không CI immutable install fail.

Comment trong code và test viết **tiếng Anh**. Cả 5 repo đều vậy; thêm tiếng Việt là để lại hai
giọng trong cùng một file. Mô tả MR và comment Jira thì tiếng Việt.

**Sửa tiếp một MR đang mở** — thêm `--existing`:

```
node $ENGINE_DIR/scripts/worktree.mjs --key FAL-720 --repo <repo> --slug <slug> --existing
```

Không có cờ đó, script cắt branch mới bằng `-B <branch> <baseSha>` và ném đi mọi commit đã push.
Lần cập nhật này không đi qua `open-mr.mjs` (MR đã tồn tại): commit rồi
`git push origin HEAD:refs/heads/<branch>` là đủ, GitLab tự cập nhật MR.

Dọn: `node $ENGINE_DIR/scripts/worktree.mjs --key ... --repo ... --slug ... --remove` sau khi MR đã mở.

---

## Pha 6 — MR + comment ngược

Viết `body.md` (mô tả MR) và `allow.txt` (mỗi dòng một đường dẫn repo-relative được phép chạm —
đúng danh sách đã duyệt ở pha 4).

`allow.txt` **là thứ quyết định cái gì được stage**: script chạy `git add -- <allow>`, không phải
`git add -A`. File ngoài danh sách không vào commit và được liệt kê lại trong `warnings`. Thiếu tên
trong `allow.txt` nghĩa là thay đổi đó bị bỏ lại, nên đọc `warnings` của bản dry-run.

Xem trước, không commit gì:
```
node $ENGINE_DIR/scripts/open-mr.mjs --dir <dir> --base master \
  --title "fix(apc): ..." --body-file body.md --allow-file allow.txt --dry-run
```

Thật (thêm `--draft` nếu ticket Highest hoặc chạm auth/credit/billing):
```
node $ENGINE_DIR/scripts/open-mr.mjs --dir <dir> --base master \
  --title "..." --body-file body.md --allow-file allow.txt --draft
```

`failure` có thể gặp:
- `out_of_scope` — diff chạm file ngoài `allow.txt`. Sửa diff, hoặc quay lại xin duyệt phạm vi mới.
  Không nới `allow.txt` một mình.
- `no_mr_url` — branch đã lên remote nhưng push option không ăn; dùng `createMrUrl` trả về, một click.
- `push_failed` — đọc `detail`. Remote là HTTPS nên đây thường là credential.

### Body của MR

Viết cho người sẽ review, không cho bot:

```markdown
## Vì sao
<ticket key + link>. <root cause một đoạn>.

## Cơ chế
<đi từ input tới hậu quả>

## Code liên quan
- `file.js:60` — <vì sao dòng này>

## Đã đổi gì
<tóm tắt diff>

## Test
<test nào, chạy ra sao, đã revert source để chứng minh test bám bug>

## Cho reviewer
<rủi ro, thứ cần mắt người>

---
Mở tự động bởi skill `jira-fix` từ <ticket url>. Chưa có người review phần nào của MR này.
```

### Comment lên ticket

**Bắt buộc, và bắt buộc NGẮN.** Ticket là nơi tra "cái này ai làm, MR đâu" — không phải nơi chép
lại bản phân tích. Mọi lý lẽ, cơ chế, bằng chứng test đã nằm trong MR body; lặp lại lần hai là hai
bản để lệch nhau.

Khuôn, tối đa ~15 dòng:

```
Đã fix, N MR (Draft):

!191 <slug>  https://.../merge_requests/191
  <một dòng: phủ finding nào>
!192 <slug>  https://.../merge_requests/192
  <một dòng>

Chưa làm: <finding> — <lý do, một dòng>
Đã refute: <finding> — <bằng chứng, một dòng>

Chi tiết trong từng MR. Chưa đổi status ticket.
```

Ba thứ không được bỏ, mỗi thứ một dòng:
1. MR nào phủ finding nào.
2. Finding nào **chưa làm**, và vì sao.
3. Finding nào **đã refute**.

Thứ gì cần hơn một dòng để nói thì nó thuộc về MR body, không thuộc về comment.

Chạy:
```
node $ENGINE_DIR/scripts/comment-issue.mjs --key FAL-720 --body-file comment.txt
# đọc lại, rồi:
node $ENGINE_DIR/scripts/comment-issue.mjs --key FAL-720 --body-file comment.txt --confirm
```

Không đổi status ticket. Đó là việc của người cầm task.
