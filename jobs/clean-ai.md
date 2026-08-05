giúp t tạo 1 skill chuyên dọn rác code của AI tạo ra,
- không được dùng comment dài, ưu tiên là 1 đến 2 dòng cho những thứ cần thiêts, 
- code chỉ được dùng theo partern của project, dễ hiểu dễ đọc không dài quá, 
- functions nếu dài có thể viết sub function, cũng như code file cũng thế, 
- phần translate thì viết vào file json chính sau đó nhắc chạy yarn update-label-claude, 
- dọn sạch những file nào import nào không dùng cũng như là check kĩ thiếu import không.

---

## Progress

Started: 2026-08-05
Repo: `projects/Falcon/seo` · branch `feat/agentic-browsing-score`
Spec: `seo/docs/superpowers/specs/2026-08-05-clean-ai-design.md`

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| 1 | `scripts/scan-ai-slop.js` — babel AST scanner | general-purpose / sonnet | ✅ | 1/5 | clean | 14 test xanh; 2392 file, 1494 finding, 38 missing-import (37 thật, 1 FP) |
| 2 | `scan-comments.py` nhận file path + `--diff` | cavecrew-builder / haiku | ✅ | 1/5 | clean | agent không có Bash → tao tự verify. Output no-arg identical với HEAD |
| 3 | `SKILL.md` + mirror `.agent/` | inline | ✅ | 1/5 | clean | skillGate 0 finding 0 warning; overlap 1/3 = 33% |
| 4 | Wire vào `CLAUDE.md`, `yarn docs-gate` | inline | ✅ | 0/5 | clean | docs-gate FAIL 2 — cả 2 có sẵn, verify bằng stash |

**Status: COMPLETE** — 2026-08-05. Tổng 3/20 round. Security verdict cuối: **clean**.

### Findings ngoài scope (báo, không sửa)

- **ESLint chết trong `seo`.** `eslint@6.8.0` + Node 22 + `async-function@1.0.0` hoisted (ESM-only)
  → `SyntaxError: Cannot use import statement outside a module`. `yarn eslint-fix` fail;
  hook `.claude/hooks/auto-lint.sh:33-34` nuốt stderr + `exit 0` nên auto-lint im lặng không chạy.
  Không đụng trong job này — là lý do skill dùng babel AST thay vì eslint.
- **`scan-comments.py` sai im lặng khi truyền file path.** `walk()` là `os.walk`
  (`scan-comments.py:60-65`) → file path ra rỗng, report vẫn "sạch". Task 2 sửa.

### Log

#### 🔄 Task 1: scripts/scan-ai-slop.js
- Agent: general-purpose (sonnet)
- Status: 🔄 in-progress
- Plan:
  - Goal: `node scripts/scan-ai-slop.js --diff` in `path:line: SEV: msg`, exit 1 khi có finding / 0 khi sạch; jest suite xanh
  - Files allowed: `scripts/scan-ai-slop.js`, `scripts/__tests__/scan-ai-slop.test.js`, `scripts/__tests__/fixtures/**`. Không đụng gì khác
  - Approach: tách pure core `analyze({files})` nhận `[{path,content}]` + impure `main()` dùng lại `scripts/docs-gate/gitContext.js` (`diffBase:102`, `changedFiles:108`) — copy đúng cách docs-gate tách để test không cần repo. Loại: tự viết logic git riêng, sẽ lệch khỏi env var CI của `diffBase`
  - Test command: `npx --no-install jest scripts/__tests__/scan-ai-slop.test.js` (jest 24, đã verify chạy được)
  - Risk: missing-import false-positive cao → skill bị bỏ qua. Phải đo FP trên file thật của repo trước khi xong
  - Rollback: file mới hoàn toàn, xóa là xong
- Rounds used: 1/5 — review fail round 1: comment header mâu thuẫn code (nói "no JSX exemption needed"
  trong khi dòng 295 đúng là exemption đó), hack `node.__parentForName` bơm parent vào AST node,
  traverse 2 lượt trên cùng AST, `isClean` dùng `git status --porcelain` → cây chỉ có file untracked
  bị coi là bẩn nên bỏ qua fallback base-diff và scan 0 file im lặng, không in gì khi sạch.
  Siết thêm allowlist: bỏ `name`/`top`/`parent`/`frames`/`origin`/`closed`/`opener` — đo lại 38 hit,
  không tăng FP, đóng được lỗ biến chưa khai báo tên `name`.
- Security check: **clean** — `git diff --stat scripts/` = 1 file M (+51/−8) + 2 file mới (639 dòng).
  Không secret (grep api_key|token|secret|password|credential|BEGIN|sshpass → 0 hit); git gọi bằng
  argv-list (`execFileSync`, `subprocess.run([...])`), không `shell=True`, không nội suy chuỗi shell;
  không đụng `.env*`/lockfile/`.gitlab-ci.yml`/`firebase.json`/`.firebaserc`/rules; không dep mới,
  không outbound host; cả hai script chỉ đọc, không ghi file nào.
- Completed: 2026-08-05

#### 🔄 Task 2: scan-comments.py --diff
- Agent: cavecrew-builder (haiku)
- Status: 🔄 in-progress
- Plan:
  - Goal: truyền file path vào `scan-comments.py` thì nó scan đúng file đó; `--diff` tự lấy list từ git; truyền thư mục hành vi không đổi
  - Files allowed: `scripts/scan-comments.py`. Chỉ 1 file
  - Approach: `walk()` yield thẳng path nếu `os.path.isfile`; `main()` thêm nhánh `--diff` gọi git. Loại: viết lại `main()` theo model file-first — diff to, phá cách dùng thư mục đang có
  - Test command: `python3 scripts/scan-comments.py <file nhiễu nhất từ bản scan toàn repo>` — số phải khớp dòng của file đó trong bảng "worst files"
  - Risk: thấp, script chỉ report, không sửa file
  - Rollback: `git checkout scripts/scan-comments.py`
- Rounds used: 1/5 — routing sai: `cavecrew-builder` chỉ có Read/Edit/Write/Grep/Glob, không Bash,
  nên nó **không verify được** và tự khai điều đó. Tao chạy 3 bước verify. Review fail round 1:
  5 comment narrate (`# Get unstaged changes`, `# Union of both`…) — đúng thứ chính script này đi bắt;
  4 block `subprocess.run` gần trùng nhau; `repo_root = os.getcwd()` sai (git trả path repo-relative,
  chạy từ subdir là hỏng); `--diff` không lọc EXTS nên header in cả `.toml`/`.py`.
  Sửa: gộp thành helper `git()` + `diff_paths()`, `REPO_ROOT` từ `__file__`, lọc EXTS.
- Security check: **clean** — cùng lượt diff với Task 1, xem ghi chú ở trên.
- Completed: 2026-08-05

**Verify output:**
```
=== jest ===            14 passed, 14 total
=== no-arg unchanged ===  IDENTICAL (diff vs HEAD version = rỗng)
=== single file ===     bulkEditService.js → step=18 restate=4  (khớp đúng dòng trong bảng full scan)
=== --diff ===          scanned: (no matching files)   ← diff hiện tại không có .js/.jsx tracked
```

#### 🔄 Task 3: SKILL.md + mirror
- Agent: inline
- Status: 🔄 in-progress
- Plan:
  - Goal: `.claude/skills/clean-ai/SKILL.md` qua được `skillGate` (có `trigger` + `why-not-claude-md`
    không boilerplate, citation trỏ dòng có thật, overlap với file always-loaded < 50%) và
    `.agent/skills/clean-ai/SKILL.md` byte-identical
  - Files allowed: `.claude/skills/clean-ai/SKILL.md`, `.agent/skills/clean-ai/SKILL.md`. Không gì khác
  - Approach: citation chủ yếu neo vào `scripts/scan-ai-slop.js` + `scripts/scan-comments.py` +
    `packages/functions/src/commands/updateLabel.js` — CLAUDE.md không cite dòng nào trong đám này,
    nên overlap chỉ còn `dispatchWork.js:35` (1/6 ≈ 17%). Loại: cite lại `CLAUDE.md` từng dòng cho
    tiện — sẽ đội overlap qua 50% và ăn WARN "cái này thuộc về CLAUDE.md"
  - Test command: `yarn docs-gate` (chạy ở Task 4, sau khi wire xong CLAUDE.md)
  - Risk: skill nói sai lệnh/đường dẫn → agent chạy theo và làm hỏng. Mọi lệnh trong SKILL.md phải
    được chạy thật trước khi viết vào
  - Rollback: xoá 2 file, thư mục mới hoàn toàn
- Rounds used: 1/5 — verify từng citation bằng `sed -n "<n>p"`: 14/15 đúng, `scan-ai-slop.js:284` trỏ
  nhầm `return 'anonymous'` thay vì dòng exemption React → sửa thành `:295`.
- Security check: **clean** — grep secret/staging-url/myshopify/trycloudflare trên cả 2 file → 0 hit.
  Chỉ là markdown, không có lệnh thực thi nào ngoài 2 script read-only đã audit ở Task 1.
- Completed: 2026-08-05

**Verify output:**
```
skillGate (ép chạy trực tiếp — docs-gate bỏ qua vì file chưa commit):
  findings: []      warnings: []
  unique anchored cites: 3 | overlap với always-loaded: 1 (dispatchWork.js) = 33% < 50%
mirror: BYTE-IDENTICAL, sha1 84306edfbab799177c1d6f0d3f277f53baf0eb45 cả hai bên
lệnh trong SKILL.md chạy thật: `node scripts/scan-ai-slop.js --diff` → exit 0, "0 file(s), 0 finding(s)"
```

#### ✅ Task 4: CLAUDE.md + docs-gate
- Agent: inline
- Status: ✅ completed
- Plan:
  - Goal: `clean-ai` có mặt trong bảng skill của `CLAUDE.md`; `yarn docs-gate` không thêm finding mới
  - Files allowed: `CLAUDE.md`
  - Approach: thêm 1 dòng vào bảng skill + nối đoạn `scan-comments.py` sẵn có (dòng 296) cho biết
    nó đã có `--diff` và trỏ sang skill. Loại: viết hẳn một mục mới cho `clean-ai` trong CLAUDE.md —
    trùng nội dung SKILL.md, đúng thứ `why-not-claude-md` vừa cam kết là không làm
  - Test command: `yarn docs-gate`
  - Risk: docs-gate là gate CI thật; thêm finding mới là chặn MR của người khác
  - Rollback: `git checkout CLAUDE.md`
- Rounds used: 0/5
- Security check: **clean** — diff `CLAUDE.md` chỉ là 2 chỗ text (1 dòng bảng + 1 đoạn 2 câu), phần
  còn lại là formatter căn lại cột bảng. Không secret, không URL staging, không đụng file cấm.
- Completed: 2026-08-05

**Verify output:**
```
yarn docs-gate  →  FAIL (2 finding(s))
  FAIL docs/features/settings-and-billing.md:124  shopRepository.js:1163 — past EOF (file có 1141 dòng)
  FAIL branch "feat/agentic-browsing-score" đổi 51 feature file nhưng không có docs/features/*.md
  citations: 88 living docs | 424 anchored checked
  skill-gate: 0 changed skill(s)      mirror-parity: 69 pair(s), 69/69 khớp

`git stash -u` rồi chạy lại → FAIL y hệt 2 cái đó.
=> cả 2 có sẵn trên branch, thay đổi của job này thêm 0 finding.
```

### Final verification

```
jest scripts/__tests__/scan-ai-slop.test.js   →  14 passed, 14 total
jest scripts/docs-gate/__tests__              →  85 passed, 85 total   (5 suite, không regress)
whole-branch working diff = 1135 dòng
  grep api_key|access_token|sk-|password=|secret=|BEGIN|sshpass -p|redis-cli -a
       |serviceAccount.json|myshopify.com|trycloudflare  →  0 hit
```

**Deliverable:**
- `seo/.claude/skills/clean-ai/SKILL.md` + mirror `.agent/skills/clean-ai/SKILL.md`
- `seo/scripts/scan-ai-slop.js` (461 dòng) + `seo/scripts/__tests__/scan-ai-slop.test.js` (178 dòng)
- `seo/scripts/scan-comments.py` (+51/−8)
- `seo/CLAUDE.md` (bảng skill + đoạn Comments)
- `seo/docs/superpowers/specs/2026-08-05-clean-ai-design.md`

**Chưa commit** — deploy/commit là việc của mày.
