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
| 2 | Jira client trong tool | general-purpose / sonnet | ⬜ | 0/5 | — | create + comment, guard project FAL, token từ env |
| 3 | Wire security lane → Jira, gỡ nhánh security khỏi MR lane | general-purpose / opus | ⬜ | 0/5 | — | Chỗ dễ tạo ticket trùng nhất |
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
