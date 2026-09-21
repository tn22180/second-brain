# render-gitlab — findings → note markdown

Renderer chuyên biến `findings` model (JSON) thành Markdown GFM cho GitLab MR note.

## Input
Mảng findings: `[{ severity, category, scope, title, file, line, impact, detail, suggestion, blobUrl }, ...]`

Severity: `"bug"` (🔴) | `"optimize"` (🟡) | `"hint"` (🟢) | `"security"` (🔒)
Scope: `"in_diff"` → badge **`[trong diff]`** · `"related"` → badge **`[code cũ liên quan]`**

## Output
Markdown GFM để post trên GitLab MR (note body).

## Quy tắc render

### Case: có findings

**Header:**
```markdown
## 🤖 Code Review — <KEY>
Tìm thấy **N vấn đề** (a 🔴 · b 🟡 · c 🔒 · d 🟢).
```

Thay `<KEY>` bằng mã task (ví dụ `FAL-1234`).
Tóm tắt: `a` bug, `b` optimize, `c` security, `d` hint — chỉ liệt kê severity có thực.

**Nhóm theo severity** (thứ tự: bug → security → optimize → hint):

```markdown
### 🔴 Bug
1. **<title>** — `<file>:<line>`
   **Ảnh hưởng:** <impact>
   <detail>. [Xem code](<blobUrl>)
   Gợi ý: <suggestion>

2. ...

### 🔒 Bảo mật
...

### 🟡 Nên sửa
...

### 🟢 Gợi ý
...
```

**Quy tắc chi tiết:**
- Tiêu đề nhóm: `### <emoji> <tên nhóm>`
  - 🔴 Bug
  - 🔒 Bảo mật
  - 🟡 Nên sửa
  - 🟢 Gợi ý
- Mỗi finding: dòng 1 = `N. **<title>** — \`<file>:<line>\` <badge>`
  - `N`: thứ tự global (1, 2, 3, ... qua tất cả severity)
  - `<title>`: tiêu đề vấn đề
  - `<file>:<line>`: đường dẫn + số dòng, wrapped in backticks
  - `<badge>` (BẮT BUỘC): `scope="in_diff"` → `` `[trong diff]` `` · `scope="related"` → `` `[code cũ liên quan]` ``. Giúp Tech Lead biết ngay lỗi ở code MR đổi hay ở code cũ MR làm lộ.
- Dòng 2 — Ảnh hưởng (indent 3 spaces, BẮT BUỘC với bug/security): `   **Ảnh hưởng:** <impact>`
  - Ngôn ngữ người dùng: tính năng nào bị ảnh hưởng + user làm gì thì gặp. **CẤM** biến/tên hàm/path (xem quy tắc `impact` trong review-core.md).
  - Bỏ dòng này nếu `impact` rỗng/null (chỉ chấp nhận rỗng với optimize/hint).
- Dòng 3 — kỹ thuật (indent 3 spaces): `   <detail>. [Xem code](<blobUrl>)`
  - `<detail>`: mô tả lỗi chi tiết cho dev (được phép có biến/tên hàm)
  - Kết thúc bằng dấu chấm, rồi space link
  - Link format: `[Xem code](<blobUrl>)` — URL tuyệt đối (https://...) với commit sha
- Dòng 4 (nếu có suggestion): `   Gợi ý: <suggestion>`
  - Chỉ thêm nếu `suggestion` có nội dung (non-null, non-empty)

### Case: không có findings

```markdown
## 🤖 Code Review — <KEY>
Không phát hiện vấn đề. Đã check bug, CLAUDE.md và bảo mật.
```

## Ví dụ

### Input
```json
[
  {
    "severity": "bug",
    "category": "correctness",
    "scope": "in_diff",
    "title": "Race condition khi update Firestore",
    "file": "packages/functions/src/services/imageService.js",
    "line": 88,
    "impact": "Ảnh hưởng lưu cấu hình tối ưu của shop: khi hai lần bấm lưu gần nhau, một số thay đổi bị ghi đè mất — merchant thấy cài đặt tự quay về giá trị cũ.",
    "detail": "Hai request song song ghi đè nhau; cần dùng transaction",
    "suggestion": "Bọc logic trong `db.runTransaction()`",
    "blobUrl": "https://gitlab.com/avada/project/-/blob/abc1234/packages/functions/src/services/imageService.js#L88"
  },
  {
    "severity": "optimize",
    "category": "efficiency",
    "scope": "related",
    "title": "Lặp query trong loop",
    "file": "src/components/Report.tsx",
    "line": 120,
    "impact": null,
    "detail": "Chạy query N lần per item; nên batch query trước",
    "suggestion": null,
    "blobUrl": "https://gitlab.com/avada/project/-/blob/abc1234/src/components/Report.tsx#L120"
  }
]
```

### Output
```markdown
## 🤖 Code Review — FAL-1234
Tìm thấy **2 vấn đề** (1 🔴 · 1 🟡).

### 🔴 Bug
1. **Race condition khi update Firestore** — `packages/functions/src/services/imageService.js:88` `[trong diff]`
   **Ảnh hưởng:** Ảnh hưởng lưu cấu hình tối ưu của shop: khi hai lần bấm lưu gần nhau, một số thay đổi bị ghi đè mất — merchant thấy cài đặt tự quay về giá trị cũ.
   Hai request song song ghi đè nhau; cần dùng transaction. [Xem code](https://gitlab.com/avada/project/-/blob/abc1234/packages/functions/src/services/imageService.js#L88)
   Gợi ý: Bọc logic trong `db.runTransaction()`.

### 🟡 Nên sửa
2. **Lặp query trong loop** — `src/components/Report.tsx:120` `[code cũ liên quan]`
   Chạy query N lần per item; nên batch query trước. [Xem code](https://gitlab.com/avada/project/-/blob/abc1234/src/components/Report.tsx#L120)
```

## Ghi chú
- Markdown GFM hỗ trợ tất cả syntax trên GitLab.
- Backticks `` ` `` để format code inline (file path).
- Link markdown: `[text](url)`.
- Emoji render native trên GitLab.
