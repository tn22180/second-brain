# jira-point-sync

Tính point team SEOOn từ Jira FAL rồi đẩy lên Firestore project **`falcon-manager`**.

```bash
node tools/jira-point-sync/sync.mjs             # dry-run, in bảng điểm
node tools/jira-point-sync/sync.mjs --confirm   # ghi thật
node tools/jira-point-sync/sync.mjs --json      # in JSON
```

## Quy tắc tính point

Chốt với Tuấn 2026-07-29:

1. Chỉ tính issue ở cột **Waiting To Test → Done**. Bỏ `To Do`, `Doing`, `Archived`.
2. **Dung TT** tính bằng **Tester Point**, không phải Dev Point.
3. **Tuấn (techlead)**: 100% dev point nếu là dev duy nhất trong task (không kể tester),
   **20%** nếu task còn dev khác.

## Credential

Service account của `falcon-manager` **không nằm trong repo**. Mặc định script đọc
`~/Downloads/falcon-manager-firebase-adminsdk-fbsvc-9a5d4332ee (1).json`; đổi chỗ thì set:

```bash
export FALCON_SA_PATH=/duong/dan/toi/service-account.json
```

Token Jira đọc từ `~/.claude/skills/jira-create/.env` (`JIRA_TOKEN`).

## Ghi vào đâu

| Collection | Nội dung |
|---|---|
| `jiraMembers/{username}` | point, donePoint, soloPoint, sharedPoint, issueCount, role, pointBasis, notionUserId, syncedAt |
| `jiraTasks/{FAL-xxx}` | summary, status, app, sprints[], devPoint, testerPoint, assignees[], countedFor[], url, syncedAt |

**Không đụng** `members` / `ledger` / `records` / `syncRuns` / `syncState` — đó là hệ chấm điểm
cũ nguồn **Notion** (5.614 + 4.521 doc), đã ngừng sync từ `2026-07-06`. `jiraMembers` có sẵn
`notionUserId` để join sang hệ đó khi cần gộp hai nguồn.

Script dùng `update` nên chạy lại bao nhiêu lần cũng được, không sinh rác. Nhưng cũng vì thế,
doc của task đã rời khỏi cột tính point sẽ **nằm lại** trong `jiraTasks` — muốn dọn phải xoá tay.

## Bẫy đã gặp

- Assignees nằm ở `customfield_10700` (mảng user), **không** phải field `assignee`. JQL
  `assignee = x` trả 0 kết quả — phải dùng `cf[10700] = x`.
- Document name khi commit phải là resource path thuần (`projects/.../documents/...`); kèm host
  thì trả `400 lacks "projects" at index 0`.
- Field id: Dev Point `customfield_11204`, Tester Point `customfield_11202`,
  Falcon App `customfield_11203`, Sprint `customfield_10101`.

## Lưu ý khi lấy số để chấm KPI

Board bị sửa liên tục trong giờ làm. Ngày 2026-07-29, đo cách nhau vài phút cho kết quả rất khác:
Dung TT `68 → 97 → 114 → 151 → 108`, Tùng LV `225 → 156 → 106`, Đức NM `169 → 114`.

Point trên board thay đổi được cả hai chiều, và **ai tự thêm tên mình vào Assignees là tự được
cộng point** — hôm đó có 35 issue được một người tự thêm tên trong 3 giây. Muốn số dùng để chấm
KPI thì chốt một mốc cứng sau khi team dừng tay, hoặc tính theo changelog (chỉ ghi nhận người có
tên trước lúc task chuyển Done).
