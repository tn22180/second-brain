# 00 — Sửa ledger audit trước khi tin nó

Repo: `tools/prod-error-autofix`. Context: `README.md` cùng thư mục.

**Blocker:** repo chưa có `CLAUDE.md` → tony-wf dừng; Tuan chạy `/init` trong thư mục tool.

## Mục tiêu

Ledger nói đúng: lane fail không xoá finding, cùng lỗi giữ một fp qua các run, lane security
parse được reply, IMG-OPT chạy được hygiene. Sau đó mới bật Jira lane.

## Tasks

| # | Task | Agent / Model | Acceptance |
|---|---|---|---|
| 0a | `classify` chỉ resolve kind của lane chạy **thành công**. Truyền `ranKinds: Set<'security'\|'hygiene'>` từ `job.ts`; lane có trong `laneFailures` → không thuộc set. | general-purpose / sonnet | test mới: security fail → 0 row security resolved; hygiene fail tương tự; lane OK vẫn resolve như cũ |
| 0b | Fp security theo `anchor`. Thêm `anchor` (route hoặc symbol export) **bắt buộc** vào `securitySchema.ts`, prompt yêu cầu nó; `job.ts:115` fp = `app\|file\|category\|anchor`. Hygiene giữ nguyên. | general-purpose / opus | cùng anchor + title khác → cùng fp; 2 route cùng file cùng category → 2 fp; reply thiếu anchor → validation error |
| 0c | Script khôi phục: row security `resolved` mà `last_seen_ms` ≥ run cuối có lane security fail → `open`. Chạy trên **bản copy** `state.db`, in đếm trước/sau, Tuan duyệt rồi mới swap. Sau 0b, fp cũ chết một lần — chấp nhận, ghi rõ. | inline | đếm trước/sau khớp; `alerts` row không đổi |
| 0d | `invalid_answer: no JSON array found` (`securitySchema.ts:197`). Bắt reply thật của 1 run fail (log raw khi parse fail, đã redact), sửa extractor theo mẫu thật — không đoán. | general-purpose / sonnet | fixture từ reply thật parse ra mảng; `audit --app SEO` lane security OK |
| 0e | Hygiene IMG-OPT `ENOENT …/node_modules/.bin/eslint` (`eslint.ts:86`). Resolve binary theo thứ tự worktree → root hoisted → fail có lý do rõ, không ENOENT trần. | cavecrew-builder / haiku | `audit --app IMG-OPT` hygiene chạy |
| 0f | Doctor + `.env.example` có key `AUDIT_*`/Jira (task 4 cũ của `audit-jira.md`). | cavecrew-builder / haiku | `doctor` báo đủ key |

Mọi task: `bun test ./test` **và** `bun run typecheck`. 5 fail `brainSlice.test.ts` có sẵn —
không phát sinh mới là đạt; brain budget (35708/6000) là job riêng, không làm ở đây.

## Ngoài phạm vi, ghi lại

- `checkPushCredential` chưa có caller — chỉ chặn `AUDIT_MR_ENABLED`, MR đang tắt.
- Brain slice ~6x budget.

## Bật Jira

Sau 0a–0d: 2 sáng liên tiếp lane security OK cả 5 app và số open không sụt bất thường → thêm
key Jira vào `.env`. Tuan bật, không phải agent.
