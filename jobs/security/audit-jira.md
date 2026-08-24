# Audit → Jira, và bỏ nhánh security khỏi MR lane

Tiếp `jobs/security/security.md` (COMPLETE 2026-08-20, handover 2026-08-22). Tool:
`tools/prod-error-autofix`.

## Quyết định (Tuan, 2026-08-22)

Audit có **ba** đầu ra, không phải hai:

| Lane | Đầu ra | Cơ chế |
|---|---|---|
| triage / cleanup | auto-fix + MR | `mr.ts` lane `cleanup`, gate `AUDIT_MR_ENABLED` |
| security | **chỉ báo** — Jira ticket + Telegram | không MR, không agent sửa |
| cả hai | report đầy đủ ra file | như hiện tại |

Đây là việc **gỡ** thứ đang có: `src/audit/mr.ts:25` hiện là
`MrLaneKind = 'security' | 'cleanup'` và `buildSecurityFixPrompt` (`mr.ts:214`) sinh prompt
"Fix these security findings". Nhánh `security` phải chết hẳn, không để lại đường bật bằng env.

Lý do: fix sai ở ranh giới auth vẫn cho test xanh. FAL-720 không phải sửa code mà là đổi schema
`integrationKey` + migrate key đang tồn tại. Tiền lệ: prod-error daemon mở 58 MR không ai đọc
tới 2026-08-04, đó là lý do task 1 của job trước tắt nó đi.

### Chính sách tạo ticket

- Chỉ finding **`fresh`** của lane security. `carried` → comment vào ticket cũ, KHÔNG đẻ ticket mới.
- **1 ticket / app / ngày**, gom nhiều finding vào một description. Không phải 1 ticket / finding.
  Run APC đầu tiên ra 858 finding; 1-ticket-1-finding là lặp lại thất bại 58-MR ở quy mô lớn hơn.
- Project **FAL** cứng, app = Falcon App tương ứng, assignee mặc định = người tạo token.

## Tasks

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| 1 | `jira_key` trên `audit_findings` + accessor | inline | ✅ | 1/5 | clean | Mirror `mr_url` / `setAuditFindingMr`. Migration verify trên bản copy của `state.db` thật |
| 2 | Jira client trong tool | inline | ✅ | 1/5 | clean | create + comment, guard project FAL. `IMG-OPT` → board `Speed` |
| 3a | `resolvedRows` + `jiraLane.ts` | inline | ✅ | 1/5 | clean | Chỗ dễ tạo ticket trùng nhất. Mọi quyết định nằm trong hàm thuần |
| 3b | Wire vào `job.ts` / `run.ts` / `config.ts` | inline | ✅ | 1/5 | clean | Tắt = zero call, có test. Verify trên `.env` thật |
| 3c | Gỡ nhánh `security` khỏi MR lane | inline | ✅ | 1/5 | clean | `MrLaneKind = 'cleanup'`. Không còn env nào bật lại được |
| 4 | `.env.example` + doctor check | inline | ⬜ | 0/5 | — | `.env.example` hiện không có key `AUDIT_` nào |
| 5 | Đóng gap `checkPushCredential` | general-purpose / sonnet | ⬜ | 0/5 | — | Đang chặn `AUDIT_MR_ENABLED=true`; lane cleanup bật cũng không push được |

### Log

#### ✅ Task 1: `jira_key` trên `audit_findings`
- Agent: inline
- Status: ✅ completed
- Plan:
  - Goal: một finding nhớ được ticket Jira của nó qua các run. `AuditFindingRow.jiraKey` đọc ra
    đúng giá trị đã ghi, db cũ (đã có bảng, chưa có cột) mở lên không lỗi và đọc `undefined`.
    `bun test ./test/audit.ledger.test.ts` xanh và `bun run typecheck` sạch.
  - Files allowed: `src/state/store.ts`, `test/audit.ledger.test.ts`. Không đụng gì khác.
  - Approach: `jira_key TEXT` vào `CREATE TABLE` (db mới) **và** `addColumns('audit_findings', …)`
    (db đang sống — `store.ts:249` đã là helper idempotent, `ALTER` không idempotent). Accessor
    `setAuditFindingJira(fp, key)` mirror `setAuditFindingMr` (`store.ts:570`). Bỏ phương án
    bảng `audit_tickets` riêng: quan hệ là 1-1 finding→ticket, thêm bảng chỉ để join.
  - Test command: `bun test ./test/audit.ledger.test.ts` **và** `bun run typecheck`.
  - Risk: `migrate()` chạy trên `state.db` thật đang giữ alert row. `ADD COLUMN` là additive,
    không `DROP`, không đụng bảng `alerts`. Sai ở đây là chỗ duy nhất hỏng được state prod.
  - Rollback: revert commit. Cột thừa nằm lại trong sqlite vô hại (sqlite cũ không `DROP COLUMN`);
    không có data migration nào phải hoàn.
- Rounds used: 1/5 — vòng 1 test sai kiểu: `classify` trả `carried` là **số đếm**
  (`ledger.ts:26`), không phải mảng, nên `toHaveLength` nổ. Sửa thành `toBe(1)`.
- Verify: `bun test ./test/audit.ledger.test.ts` 10 pass / 0 fail; `bun run typecheck` exit 0;
  `bun test ./test` 685 pass / 5 fail — 5 fail là `brainSlice.test.ts` có sẵn, không phát sinh mới.
- Migration verify trên **bản copy của `state.db` thật**, không phải fixture:
  ```
  BEFORE  alerts rows: 483 · cols: …,status,mr_url
  AFTER   alerts rows: 483 · cols: …,status,mr_url,jira_key
  ```
  483 alert row nguyên vẹn, không `DROP`, không đụng bảng `alerts`.
- Security check: **clean** — 2 file, +51/−0 test và +17/−1 `store.ts`. Không secret, không
  log mới, không đụng `.env*`/lockfile/CI/firebase. Shop-scoping không áp dụng (CLI tool).

### Phát hiện trong lúc làm task 1 — ledger CHƯA từng persist

`bin/autofix.ts:274`: `const auditStore = isDryRun ? new Store(':memory:') : store;`

Cả hai lần dry-run APC đều ghi ledger vào `:memory:`. `state.db` thật hiện có
**`audit_findings` = 0 row** (đếm trên bản copy). Nên câu "run 2 đã persist, mai chỉ báo delta"
trong `security.md` là **sai**.

Hệ quả cho lần chạy 06:00 đầu tiên: **mọi** finding của cả 5 app sẽ là `fresh`. Riêng APC đã 858.
Report Telegram sẽ đụng trần 4096 và rơi phần lớn xuống dòng "Còn N phát hiện không hiện ở đây".
Đây cũng chính là lý do chính sách "1 ticket / app / ngày" ở trên là bắt buộc chứ không phải
tối ưu: 1-ticket-1-finding ở lần chạy đầu là hơn 800 ticket.

#### ✅ Task 2: Jira client trong tool
- Agent: inline
- Status: ✅ completed
- Plan:
  - Goal: `createIssue()` trả `{ok, key}` với payload đúng shape FAL, `addComment()` trả `{ok}`,
    cả hai **không bao giờ throw** và guard project ≠ FAL. `bun test ./test/notify.jira.test.ts`
    xanh, `bun run typecheck` sạch.
  - Files allowed: `src/notify/jira.ts` (mới), `test/notify.jira.test.ts` (mới). Không đụng gì khác.
  - Approach: mirror `src/notify/telegram.ts` — `Fetcher` inject được, mọi lỗi *trả về* chứ không
    ném, để Jira sập không làm hỏng audit run. Field id đọc từ probe của skill `jira-create`
    (`customfield_11203` Falcon App, `customfield_10700` assignees). Bỏ phương án shell ra
    `create-issue.mjs` của skill: nó in ra stdout cho người đọc và sống ở `~/.claude`, không phải
    dependency mà một daemon được phép trỏ vào.
  - Test command: `bun test ./test/notify.jira.test.ts` **và** `bun run typecheck`.
  - Risk: client này POST vào Jira thật của cả team. Rủi ro lớn nhất là tạo issue sai project;
    guard `assertProjectFal` chặn ở tầng build payload, trước khi có network call.
  - Rollback: xoá 2 file mới; chưa gì import chúng cho tới task 3.
- Rounds used: 1/5
- Verify: `bun test ./test/notify.jira.test.ts` 14 pass / 0 fail; `bun run typecheck` exit 0;
  `bun test ./test` 699 pass / 5 fail (vẫn đúng 5 cái `brainSlice.test.ts` có sẵn).
- **Không POST thử vào FAL.** Shape payload đã được chứng minh bằng FAL-720/721/722 tạo hôm nay
  qua skill `jira-create` với đúng field id đó — tạo thêm issue rác để test là bẩn board team.
- Tên registry và option Jira **không trùng nhau**, nên phải có bảng map chứ không
  `toUpperCase()` được: `BLOG` → `Blog`, và `IMG-OPT` → **`Speed`** (Tuan xác nhận 2026-08-22 —
  image optimizer được team track ở board Speed). App không có trong bảng thì bỏ hẳn field →
  rơi vào Falcon Master board; đoán bừa board hàng xóm tệ hơn không board.
- Security check: **clean** — 2 file mới, không sửa file cũ.
  - Không có secret thật. Hai chuỗi hình dạng token trong test là `pat-not-a-real-token` và
    `glpat-<fixture>` — cố ý nhìn là biết giả, đúng kết luận của security check whole-branch
    job trước (fixture trông thật dạy reviewer lướt qua cái thật).
  - Client **không có một lời gọi log nào**, nên token không thể rơi vào `daemon.log`. Nó chỉ
    sống trong header `Authorization`.
  - **Outbound host mới: `space.avada.net`.** Có khai trong plan, không phải lén. Không thêm
    dependency nào — dùng `fetch` global.
  - Blast radius: POST vào Jira dùng chung của team. `assertProjectFal` chặn ở tầng build payload,
    trước khi tồn tại request; có test riêng cho nhánh đó.

> Task 3 tách ba khi lập plan — một task gộp cả build ticket, wire orchestration và gỡ MR lane
> thì không review được từng phần, và §6 nói scope creep phải split chứ không nuốt.

#### ✅ Task 3a: `resolvedRows` trên ledger + `jiraLane.ts`
- Agent: inline
- Status: ✅ completed
- Plan:
  - Goal: cho một app + diff của ledger, dựng đúng **một** ticket cho finding chưa có ticket và
    **một** comment cho mỗi ticket cũ còn liên quan; không có gì mới thì không POST gì cả.
    `bun test ./test/audit.jiraLane.test.ts` xanh, `bun run typecheck` sạch.
  - Files allowed: `src/audit/ledger.ts`, `src/audit/jiraLane.ts` (mới),
    `test/audit.jiraLane.test.ts` (mới), `test/audit.ledger.test.ts`. Không đụng gì khác.
  - Approach: `classify` là chỗ DUY NHẤT biết finding nào vừa chuyển sang `resolved` hôm nay, nên
    nó trả thêm `resolvedRows`; `resolved: number` giữ nguyên để `report.ts` và test cũ không đổi.
    `carried` thì suy được (`openAuditFindings` trừ `fresh`) nên không thêm field. Tách build/post:
    `buildTicket` + `buildComments` thuần, `runJiraLane` chỉ POST. Bỏ phương án query
    `resolvedAuditFindings(app)`: nó trả cả finding resolved từ tháng trước → comment lại mỗi sáng.
  - Test command: `bun test ./test/audit.jiraLane.test.ts ./test/audit.ledger.test.ts` **và**
    `bun run typecheck`.
  - Risk: đây là chỗ đẻ ticket trùng. Sai một nhánh là sáng mai 858 ticket FAL. Vì thế mọi quyết
    định "có tạo không / gộp vào đâu" nằm trong hàm thuần có test, không nằm cạnh lời gọi network.
  - Rollback: revert; chưa gì gọi `runJiraLane` cho tới 3b.
- **Plan sửa giữa chừng:** thêm `resolvedRows` làm 4 literal `emptyLedger` không compile
  (`job.ts:95`, `run.ts:102`, 2 file test). Files allowed mở rộng đúng 4 chỗ đó, mỗi chỗ 1 dòng.
- Rounds used: 1/5 — vòng 1 là 4 lỗi typecheck trên, không phải lỗi logic.
- Verify: `bun test ./test/audit.jiraLane.test.ts` 12 pass / 0 fail; `bun run typecheck` exit 0;
  `bun test ./test` 712 pass / 5 fail (vẫn đúng 5 `brainSlice.test.ts` cũ).
- Quyết định đã đóng bằng test, không phải bằng comment:
  - không có gì mới → **không POST gì cả**
  - fresh nhiều → **một** ticket, không phải mỗi finding một ticket
  - carried **chưa có** ticket → gộp vào ticket hôm nay (nếu không thì nó không fresh ngày nào
    nữa và sẽ không bao giờ có ticket)
  - carried/resolved **đã có** ticket → gộp thành **một** comment cho mỗi ticket
  - create fail → `ticketedFps` rỗng, không đóng dấu `jira_key` lên finding, mai chạy lại
  - comment fail ở ticket này không chặn ticket kia
- Security check: **clean** — 2 file mới, 5 file sửa (16 insert / 8 delete, trong đó 4 file chỉ
  1 dòng literal). Không secret, không lời gọi log nào trong `jiraLane.ts`, không host mới
  (`space.avada.net` đã khai ở task 2), không dependency mới, không đụng `.env*`/lockfile/CI.
  Blast radius: đây là chỗ đẻ ticket trùng — vì thế `buildTicket`/`buildComments` là hàm thuần
  có test, tách khỏi lời gọi network.

#### ✅ Task 3b: Wire vào `job.ts` / `run.ts` / `config.ts`
- Agent: inline
- Status: 🔄 in-progress
- Plan:
  - Goal: `AUDIT_JIRA_ENABLED=true` + `JIRA_TOKEN` có mặt thì mỗi app tạo/comment đúng như 3a
    và đóng dấu `jira_key` lên finding; thiếu một trong hai thì **không có lời gọi Jira nào**.
    Ticket của hôm nay hiện trong message Telegram. `bun test ./test` không phát sinh fail mới,
    `bun run typecheck` sạch.
  - Files allowed: `src/config.ts`, `src/audit/job.ts`, `src/audit/run.ts`, `src/audit/report.ts`,
    `test/audit.job.test.ts`, `test/audit.report.test.ts`, `test/config.test.ts`. Không đụng khác.
  - Approach: gộp hai cờ (`AUDIT_JIRA_ENABLED` và có token hay không) thành **một** field
    `AuditJobSettings.jira` — `undefined` là lane tắt. Đúng hợp đồng `telegram` đang dùng, và
    job không phải biết vì sao nó tắt. Bỏ phương án truyền cả `enabled` lẫn `cfg` xuống job:
    hai cờ cho một quyết định là chỗ đẻ nhánh "enabled nhưng không có token".
  - Test command: `bun test ./test` **và** `bun run typecheck`.
  - Risk: đây là lần đầu code có thể POST vào Jira thật của team khi chạy. Mặc định phải TẮT, và
    phải có test chứng minh tắt nghĩa là zero call, không phải "gọi rồi bỏ kết quả".
  - Rollback: revert; `AUDIT_JIRA_ENABLED` không set thì code mới không chạy nhánh nào.
- Status: ✅ completed
- Rounds used: 1/5 — vòng 1 là chuỗi lỗi typecheck (literal `AppAuditResult`/`AuditJobSettings`
  thiếu field mới ở 6 chỗ, và `category: 'auth'` không có trong `SecurityCategory` — đúng là
  `authn`). Không có lỗi logic.
- Verify: `bun run typecheck` exit 0; `bun test ./test` **719 pass / 5 fail** (vẫn đúng 5
  `brainSlice.test.ts` cũ, không phát sinh mới).
- **Verify trên `.env` thật, không phải fixture** — cái quan trọng nhất của task này:
  ```
  audit.jira      = undefined (lane OFF)
  audit.mrEnabled = false
  ```
  Chạy 06:00 sáng mai sẽ không có một request Jira nào.
- Hai cờ gộp thành một field: `audit.jira` là `undefined` khi thiếu `AUDIT_JIRA_ENABLED=true`
  **hoặc** thiếu `JIRA_TOKEN`. `job.ts` không cần biết vì sao nó tắt. Có test cho cả 3 tổ hợp.
- Test chứng minh tắt = **zero call**, không phải "gọi rồi bỏ kết quả": stub `runJiraLane` đếm
  số lần gọi và assert `0`.
- Report: thêm dòng `🎫 <url>` dưới tên app. App có ticket nhưng không có finding `fresh` thì
  **không** bị gom vào "không có gì mới" — ca đó xảy ra đúng một lần cho mỗi app, là lần backlog
  cũ hơn lane Jira cuối cùng được tạo ticket, và im lặng ở đó là giấu mất message duy nhất
  nhắc tới ticket đó.
- Security check: **clean** — 7 file, +226/−7.
  - Không secret; chuỗi hình dạng token trong test đều là `not-a-real-token`.
  - **Không có lời gọi log mới nào**, và `grep` xác nhận không chỗ nào `JSON.stringify` cả
    object config — token Jira không có đường rơi vào `daemon.log` hay `audit.log`.
  - Không host mới (đã khai ở task 2), không dependency mới, không đụng `.env*`/lockfile/CI.
  - Blast radius: đây là commit đầu tiên mà code **có thể** POST vào Jira dùng chung của team.
    Mặc định tắt, đã verify trên `.env` thật ở trên.

#### ✅ Task 3c: Gỡ nhánh `security` khỏi MR lane
- Agent: inline
- Status: ✅ completed
- Plan:
  - Goal: không còn đường nào trong code dẫn tới một MR do agent sửa security. `MrLaneKind`
    chỉ còn `'cleanup'`, `buildSecurityFixPrompt` biến mất, và **không** có env nào bật lại được.
    `bun test ./test` không phát sinh fail mới, `bun run typecheck` sạch.
  - Files allowed: `src/audit/mr.ts`, `src/audit/job.ts`, `src/audit/run.ts`,
    `test/audit.mr.test.ts`, `test/audit.job.test.ts`. Không đụng khác.
  - Approach: xoá hẳn prompt + nhánh dựng body + field `MrLaneInput.security`, giữ `MrLaneKind`
    làm union một phần tử vì `auditBranchName`/`auditWorktreeDir` vẫn đặt tên theo nó và một
    lane thứ ba (không phải security) là chuyện có thật sau này. Bỏ phương án để lại prompt và
    chỉ tắt bằng cờ: cờ tắt được thì có ngày ai đó bật.
  - Test command: `bun test ./test` **và** `bun run typecheck`.
  - Risk: xoá nhầm phần dùng chung sẽ làm lane cleanup — lane DUY NHẤT còn push — hỏng im lặng.
    Vì thế test của lane cleanup phải còn nguyên số lượng và vẫn xanh, không được sửa cho vừa.
  - Rollback: revert; `AUDIT_MR_ENABLED` vẫn đang false nên không có hành vi prod nào đổi.
- **Plan sửa giữa chừng:** `src/git/worktree.ts` phải vào files allowed. `auditBranchName` khai
  `kind: 'security' | 'cleanup'` — để nguyên thì helper vẫn biết đẻ tên nhánh security, đúng thứ
  task này nói là phải hết. Thu về `'cleanup'`, viết literal chứ không import `MrLaneKind`:
  tầng git không phụ thuộc tầng audit.
- Rounds used: 1/5 — vòng 1 là chuỗi lỗi typecheck do đổi kiểu, cộng 1 test chết theo tiền đề
  (`the second lane does not re-run it` — không còn lane thứ hai). Test đó viết lại thành hai lần
  gọi liên tiếp, giữ nguyên điều nó thật sự bảo vệ: baseline cache theo `(repo, base sha)`.
- Verify: `bun run typecheck` exit 0; `bun test ./test` **719 pass / 5 fail** (vẫn đúng 5
  `brainSlice.test.ts` cũ). `test/audit.mr.test.ts` 35 pass / 0 fail.
- Xoá thật, không phải tắt bằng cờ:
  - `MrLaneKind` giờ là `'cleanup'` — union một phần tử
  - `buildSecurityFixPrompt` xoá hẳn
  - `MrLaneInput.security` và `AuditMrBodyInput.security`/`.kind` xoá hẳn
  - `auditMrTitle(kind, …)` → `auditMrTitle(appName, count)`
  - `auditBranchName` thu về `'cleanup'`
  - `AppAuditResult.mr` từ `{security, cleanup}` còn `{cleanup}`
  - `grep security src/audit/mr.ts` chỉ còn comment giải thích vì sao nó biến mất
- Security check: **clean** — 7 file code/test, **+156/−224** (xoá nhiều hơn thêm, đúng bản chất
  task). Không secret mới: chuỗi `shpat_…` duy nhất trong diff là fixture redaction có sẵn, bị
  *dời* từ test security sang test cleanup, giá trị hex lặp nhìn là biết giả. Không log mới,
  không host mới, không dependency mới, không đụng `.env*`/lockfile/CI.
  Blast radius: lane cleanup là lane DUY NHẤT còn push. Test của nó giữ nguyên và vẫn xanh —
  không sửa test cho vừa code.
