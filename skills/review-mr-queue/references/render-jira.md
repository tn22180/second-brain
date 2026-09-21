# render-jira — findings → comment wiki markup

Renderer chuyên biến `findings` model (JSON) thành Jira Server/Data Center wiki markup cho task comment.

## Input
Mảng findings: `[{ severity, category, scope, title, file, line, impact, detail, suggestion, blobUrl }, ...]`

Severity: `"bug"` (🔴) | `"optimize"` (🟡) | `"hint"` (🟢) | `"security"` (🔒)
Scope: `"in_diff"` → badge `{{[trong diff]}}` · `"related"` → badge `{{[code cũ liên quan]}}` (đặt cuối dòng heading finding)

## Output
Jira wiki markup (Server/Data Center, NOT Jira Cloud markdown) để post trên task comment.

## Quy tắc render

**QUAN TRỌNG:** Jira Server/DC dùng wiki markup, KHÔNG phải markdown. Không được dùng `#`, `**`, `-` kiểu markdown.

### Case: có findings

**Header:**
```
h3. 🤖 Code Review — <KEY>
Tìm thấy *N vấn đề* (a bug · b nên sửa · c bảo mật · d gợi ý).
```

Thay `<KEY>` bằng mã task (ví dụ `FAL-1234`).
Tóm tắt: `a` bug, `b` optimize, `c` security, `d` hint — chỉ liệt kê severity có thực.

**Nhóm theo severity** (thứ tự: bug → security → optimize → hint):

```
{panel:title=🔴 Bug|borderColor=#d04437}
# *<title>* — {{<file>:<line>}}
*Ảnh hưởng:* <impact>
<detail>. [Xem code|<blobUrl>]
{panel}

{panel:title=🔒 Bảo mật|borderColor=#3b7fc4}
# ...
{panel}

{panel:title=🟡 Nên sửa|borderColor=#f6c342}
# ...
{panel}

{panel:title=🟢 Gợi ý|borderColor=#8993a4}
# ...
{panel}
```

**Quy tắc chi tiết:**

- **Panel wrapper:** `{panel:title=<emoji> <tên>|borderColor=<hex>}` ... `{panel}`
  - Severity colors:
    - 🔴 Bug: `#d04437` (red)
    - 🔒 Bảo mật: `#3b7fc4` (blue)
    - 🟡 Nên sửa: `#f6c342` (yellow)
    - 🟢 Gợi ý: `#8993a4` (gray)
  - Tên nhóm tiếng Việt, không thay `<tên>` = macro Jira

- **Mỗi finding trong panel:**
  - Dòng 1: `# *<title>* — {{<file>:<line>}} {{<badge>}}`
    - `#` = wiki heading level 1 (tương đương markdown `##`, nhưng wiki syntax)
    - `*` = bold (wiki: `*text*`, NOT markdown `**text**`)
    - `{{<file>:<line>}}` = code macro (ngang dấu backtick markdown)
    - `<badge>` (BẮT BUỘC): `scope="in_diff"` → `{{[trong diff]}}` · `scope="related"` → `{{[code cũ liên quan]}}`
  - Dòng 2 — Ảnh hưởng (BẮT BUỘC với bug/security): `*Ảnh hưởng:* <impact>`
    - Ngôn ngữ người dùng: tính năng nào bị ảnh hưởng + user làm gì thì gặp. **CẤM** biến/tên hàm/path ở dòng này (xem quy tắc `impact` trong review-core.md).
    - Bỏ dòng này nếu `impact` rỗng/null (chỉ chấp nhận rỗng với optimize/hint).
  - Dòng 3 — kỹ thuật: `<detail>. [Xem code|<blobUrl>]`
    - `<detail>`: mô tả chi tiết cho dev (được phép có biến/tên hàm)
    - Kết thúc dấu chấm + space link
    - Link wiki: `[text|url]` (NOT markdown `[text](url)`)
  - Dòng 4 (nếu có suggestion): `Gợi ý: {{<suggestion>}}`
    - Chỉ thêm nếu `suggestion` có nội dung
    - Code bọc `{{...}}` (wiki code macro)

### Case: không có findings

```
h3. 🤖 Code Review — <KEY>
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
    "suggestion": "Bọc logic trong db.runTransaction()",
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
```
h3. 🤖 Code Review — FAL-1234
Tìm thấy *2 vấn đề* (1 bug · 1 nên sửa).

{panel:title=🔴 Bug|borderColor=#d04437}
# *Race condition khi update Firestore* — {{packages/functions/src/services/imageService.js:88}} {{[trong diff]}}
*Ảnh hưởng:* Ảnh hưởng lưu cấu hình tối ưu của shop: khi hai lần bấm lưu gần nhau, một số thay đổi bị ghi đè mất — merchant thấy cài đặt tự quay về giá trị cũ.
Hai request song song ghi đè nhau; cần dùng transaction. [Xem code|https://gitlab.com/avada/project/-/blob/abc1234/packages/functions/src/services/imageService.js#L88]
Gợi ý: {{Bọc logic trong db.runTransaction()}}
{panel}

{panel:title=🟡 Nên sửa|borderColor=#f6c342}
# *Lặp query trong loop* — {{src/components/Report.tsx:120}} {{[code cũ liên quan]}}
Chạy query N lần per item; nên batch query trước. [Xem code|https://gitlab.com/avada/project/-/blob/abc1234/src/components/Report.tsx#L120]
{panel}
```

## Ghi chú cú pháp wiki vs markdown

| Yếu tố | Wiki markup (Jira) | Markdown (GitLab) |
|---|---|---|
| Heading 3 | `h3. text` | `### text` |
| Bold | `*text*` | `**text**` |
| Code inline | `{{text}}` | `` `text` `` |
| Link | `[text\|url]` | `[text](url)` |
| Panel | `{panel:...}...{panel}` | N/A |

**CẤM** đặc biệt:
- ❌ Đừng dùng `#`, `**`, `-` (markdown) trong output Jira — sẽ render thành text thô
- ❌ Đừng dùng `\` escape — wiki markup KHÔNG cần
- ✅ Luôn dùng `{{...}}` cho code, `[text|url]` cho link, `*text*` cho bold

## Implementation hint
Khi code:
1. Group findings theo `severity` (thứ tự: bug → security → optimize → hint)
2. Với mỗi group, build panel wrapper + list findings
3. Mỗi finding: dòng 1 heading, dòng 2 detail+link, dòng 3 (nếu có) suggestion
4. Concat tất cả panels thành output
