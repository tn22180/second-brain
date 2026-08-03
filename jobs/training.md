tổng hợp lại 1 số việc t  làm việc hiệu quả với AI + quá trình AI làm 1 task trong app SEO đọc từ đâu tới đâu và workflow của t đang hiệu quả như thế nào, second brain + harness + các mode mới của claude code ra để t giới thiệu và training dev



## Quyết định (sau brainstorm)

- **Dạng:** deck HTML một trang, publish qua Artifact (không phải doc markdown).
- **Case study:** `18xbru1` — SEO · `apisagen2` · 2026-08-02 · MR 2107. Chọn vì có đủ chuỗi
  alert → log đếm được → 7 citation `file:line` → test tái hiện → MR, kèm số chi phí thật.
- **Đối tượng:** dev đã dùng Claude Code nhưng chưa có hệ thống. Bỏ phần cài đặt cơ bản.
- **Mode cover:** hook + memory + `/resume`; Artifact + MCP + `/loop`. Thêm `tony-wf` theo yêu cầu.
- **Thêm theo yêu cầu:** một section riêng về ưu điểm của flow, viết bằng số chứ không bằng tính từ.

11 section: vấn đề · ba tầng context · đường AI đọc · case 18xbru1 · second-brain + harness ·
hook/memory/resume · Artifact/MCP/loop · tony-wf · bảng routing agent-model · vì sao flow ăn ·
dev bắt đầu từ đâu.

**Output:** https://claude.ai/code/artifact/a7b1f52b-2614-4fd6-8394-3e1e593929ff
**Nguồn file:** `scratchpad/ai-workflow-training.html` (republish cùng path để giữ URL)

---

## Progress

Started: 2026-08-03 · Status: **COMPLETE**

| # | Task | Agent / Model | Status | Rounds | Notes |
|---|------|---------------|--------|--------|-------|
| 1 | Verify facts cho deck | inline | ✅ | 1/5 | 13 claim, mỗi claim một nguồn. Sửa 18→16 skill |
| 2 | Viết deck HTML 11 section | inline (+ `artifact-design`) | ✅ | 2/5 | R1 fail: regex check dính false-positive `<header>`. R2 pass sau khi dọn 3 token CSS chết |
| 3 | Publish Artifact | inline | ✅ | 1/5 | 🧠 favicon, URL live |
| 4 | Ghi Progress vào brief | inline | ✅ | 1/5 | Section này |
| 5 | Sửa lỗi tràn chữ trên artifact | inline | ✅ | 3/5 | Grid `min-width: auto` — báo từ trình duyệt thật, script check không bắt được |
| 6 | Sửa list vỡ 1 chữ 1 dòng (`.pts`, `.steps`) | inline | ✅ | 2/5 | `display: grid` trên `li` có nội dung trộn — lỗi có từ đầu, không phải hồi quy |
| 7 | Thêm khối vòng lặp task vào section 08 | inline | ✅ | 1/5 | Sơ đồ 7 bước + luật trần + sổ vòng thật của chính session này |
| 8 | Thêm section Bảo mật (deck 11→12 section) | inline | ✅ | 1/5 | Threat model + case `n9axd7` MR 816. Renumber id/sec-num bằng script |
| 9 | Xuất bản HTML độc lập để trình chiếu | inline | ✅ | 1/5 | `jobs/2026-08-03-ai-workflow-training.html`, sinh từ cùng nguồn qua `build_standalone.py` |
| 10 | Thêm plan-per-task + security check vào skill `tony-wf` | inline | ✅ | 1/5 | SKILL.md 7.7K→14.1K, 7 step→9 step, +6 red flag |
| 11 | Đưa hai phần đó vào deck (section 09 + cross-ref 05) | inline | ✅ | 1/5 | Loop 7 bước→9 bước, +bảng 7 mục security |
| 12 | Sửa §2 `tony-wf`: bỏ eager-load 16 skill, `/init` là built-in | inline | ✅ | 1/5 | −51k token mỗi lần chạy. Đo thật từ transcript session này |
| 13 | Bỏ section Artifact/MCP/loop khỏi deck (12→11 section) | inline | ✅ | 1/5 | Renumber s09-s12 → s08-s11 bằng script, rail + cross-ref theo cùng |
| 14 | Đưa case thật xuống cuối, sắp lại menu | inline | ✅ | 1/5 | Case 04 → 10, xen giữa "Vì sao flow ăn" và "Bắt đầu từ đâu" |
| 15 | Đổi xưng hô deck sang "bạn" | inline | ✅ | 1/5 | 7 chỗ (5 `mày`, 1 `Mày`, 1 `Tao`), thay theo ranh giới từ |

Tổng: 19 vòng / trần 75 (15 task × 5). Không task nào chạm trần.

**Chốt scope:** không làm section Agentic AI (llms.txt / WebMCP) — workshop chỉ nói AI làm việc
trong dự án ra sao, và context + skill giúp làm một task nhanh, ổn, bảo mật thế nào.

### Log

#### ✅ Task 1: Verify facts
- Agent: inline (đọc file trực tiếp, không cần subagent)
- Test: mọi claim lên deck phải có `file:line` hoặc output lệnh
- Kết quả: 13/13 claim có nguồn. Một sai số bắt được — trước đó nói "18 skill",
  `ls -d seo/.claude/skills/*/ | wc -l` trả về **16**.
- Nguồn chính: `harness/config.yml`, `harness/surface.py`, `.claude/settings.json`,
  `tools/prod-error-autofix/{README.md,brain/CORE.md,brain/incidents/18xbru1.md}`

#### ✅ Task 2: Viết deck HTML
- Agent: inline, nạp skill `artifact-design` trước khi viết
- Test: script Python check — không tag wrapper (`doctype/html/head/body`), có `<title>`,
  không ref host ngoài (CSP), có `prefers-color-scheme` + cả hai `data-theme` override,
  có `prefers-reduced-motion` + `focus-visible`, tag đóng cân, mọi anchor `#` resolve,
  đúng 11 section, không CSS token chết
- Round 1 FAIL: check `<head` bắt nhầm `<header>`. Sửa regex thành word-boundary.
- Round 2: pass phần cấu trúc, nhưng check token phát hiện `--shadow` và `--accent-soft`
  khai báo ở cả 3 khối theme mà không chỗ nào dùng → strip 243B. Pass sạch.
- Review: 3 chỗ CSS chết khác dọn luôn (`grid-column: 2` trên phần tử không phải grid item,
  `.body p.lede` không tồn tại trong markup).
- Kích thước cuối: 37662B, 3 khối theme × 13 token khớp nhau.

#### ✅ Task 3: Publish Artifact
- Test: trả về URL hợp lệ → https://claude.ai/code/artifact/a7b1f52b-2614-4fd6-8394-3e1e593929ff
- Riêng tư mặc định. Share từ menu trên trang.

#### ✅ Task 4: Ghi Progress vào brief
- Test: `grep '## Progress' jobs/training.md` có hit, bảng đủ dòng

#### ✅ Task 5: Sửa tràn chữ trên artifact
- Nguyên nhân: grid item mặc định `min-width: auto`, không co dưới min-content. Chuỗi
  `.body → .trace → .stop → .evi` (`white-space: pre`) và `.body → .tw` (bảng `min-width: 34rem`)
  đẩy phình cả trang thay vì tự scroll trong khung.
- Fix: `min-width: 0` cho con của `.shell/.body/.trace/.stop/.sec-head/.stratum/.pts li`,
  thêm `overflow-wrap: break-word` cho `h1`/`h2` mono.
- Round 1 FAIL: checker báo `unclosed style, pre` — bắt nhầm chữ `<pre>` trong comment CSS tao vừa viết.
- Round 2 FAIL: strip comment `/* */` toàn file nuốt mất nửa HTML, vì nội dung trang có
  `memory/*.md` … `packages/*/CLAUDE.md` tạo thành cặp `/*`…`*/` giả.
- Round 3 PASS: chỉ strip comment trong phạm vi `<style>`. Thêm guard hồi quy vĩnh viễn —
  mọi grid container phải có `> *` trong luật `min-width: 0`, mọi khối `white-space: pre`
  phải kèm `overflow-x: auto`.
- **Bài học:** cả 2 round hỏng là hỏng ở *test*, không phải ở trang. Và lỗi gốc thì script
  tĩnh không bao giờ bắt được — phải mở trình duyệt thật mới thấy.

#### ✅ Task 6: Sửa list vỡ một chữ một dòng
- Triệu chứng: `.pts.bad` (và mọi `.pts`, `.steps`) xuống dòng từng chữ.
- Nguyên nhân: `li` để `display: grid`. Trong grid, **mỗi element con thành một grid item riêng**,
  nên câu `<b>Context chết theo terminal.</b> Đóng cửa sổ là mất.` bị xé thành nhiều item
  xếp chồng hàng. Lỗi có từ bản đầu — `min-width: 0` ở task 5 chỉ làm nó lộ rõ hơn,
  không phải hồi quy.
- Fix: `li` về block, `position: relative` + `padding-left`, marker `::before` absolute.
  Text quay lại chảy inline bình thường.
- Guard mới trong `check.py`: quét mọi selector có `display: grid`, tìm phần tử tương ứng
  trong markup, fail nếu nó có **nội dung trộn** (text ở top level + ít nhất một element con).
  Đây là bất biến bắt được lỗi này, không phải bắt riêng `.pts`.
- Script check nằm ở `scratchpad/check.py` — chạy lại trước mỗi lần republish.

#### ✅ Task 7: Thêm khối vòng lặp task
- Section 08 giờ có 3 khối: sơ đồ 7 bước của vòng lặp, 4 luật về trần, và **sổ vòng thật
  của chính session này** (6 task, 10 vòng).
- Điểm bán hàng của khối này: bốn vòng đỏ trong session đều là lỗi *script test*, không
  vòng nào là lỗi trang. Hai lỗi trang thật thì script xanh lè, phải mở trình duyệt mới thấy.
  Deck tự nó là bằng chứng cho luật "test xanh chưa phải là xong".
- Test: `check.py` — 13 grid box quét sạch, 42869B, PASS.

#### ✅ Task 8: Thêm section Bảo mật
- Lý do: luận điểm của workshop là context + skill ⇒ task **nhanh, ổn, bảo mật**. Chân thứ ba
  đang trống — deck cũ không nói gì về bảo mật.
- Nội dung, mọi claim lấy từ `seo/.claude/skills/security/SKILL.md` frontmatter + thân bài:
  scope app chỉ themes/products/content/files/locales/markets/translations
  (`config/shopify.js:10-29`), **không `read_customers`** ⇒ không có PII ⇒ rủi ro số một là
  IDOR chéo shop. Skill 187 dòng, có mục "quirk không được sửa", có trường `why-not-claude-md`
  tự bào chữa vì sao tách khỏi CLAUDE.md.
- Luật cứng tầng identity: credential không lên dòng lệnh (transcript nằm trên đĩa);
  bot cấm chạm `.env`/lockfile/CI; xác nhận project id trước mọi lệnh ghi.
- Case thật thứ hai: `n9axd7` · BLOG · MR 816 · $1.87 — credential Crisp hardcode
  `config/crisp.js:5` bị thu hồi từ 2026-07-30, và AI bắt thêm `crispSegmentRepository.js:22`
  thiếu check `syncedAt` ⇒ alert 1-sao chạy trên dữ liệu chết 4 ngày.
- Renumber 11→12 section bằng script (id, `.sec-num`, comment marker theo thứ tự tài liệu),
  rail viết tay 12 mục. Không có id trùng.
- Test: `check.py` sửa kỳ vọng 11→12 → PASS, 47653B.

#### ✅ Task 9: HTML độc lập để trình chiếu
- Nguồn artifact là *fragment* (không có doctype/head/body — host tự bọc). File mở từ đĩa thì
  không ai bọc hộ, nên cần bản riêng.
- `build_standalone.py` bọc cùng một nguồn thành tài liệu đầy đủ: doctype, `lang="vi"`,
  charset, viewport, cộng nút **SÁNG / TỐI** (stamp `data-theme` lên root, ẩn khi in).
  Một nguồn hai bản — sửa deck rồi chạy lại script là đồng bộ.
- Ra: `jobs/2026-08-03-ai-workflow-training.html`
- Test: có đủ 9 thành phần khung tài liệu, `<title>` đúng một lần, 0 ref host ngoài,
  12 section còn nguyên, mọi anchor `#` resolve, toggle nối đúng → PASS.

#### ✅ Task 10: Thêm plan-per-task + security check vào skill `tony-wf`
- File: `~/.claude/skills/tony-wf/SKILL.md` — 7741B → 14110B.
- **§6 mới — plan từng task, ngay trước khi dispatch.** Bước "analyze + plan" cũ chỉ plan cho
  *cả brief*, quá thô để giao subagent. Plan mới sáu dòng ghi thẳng vào Log của task:
  Goal / Files allowed / Approach / Test command / Risk / Rollback. Luật: không plan thì không
  dispatch; đọc file rồi mới plan (mọi khẳng định có `file:line`); task khó route sang agent
  `Plan` (opus, không quyền ghi); plan lệch giữa chừng phải viết lại trước khi chạy tiếp;
  phát hiện task thật ra là ba task thì tách ra chứ không nuốt im.
- **§8 mới — security check trên diff sau mỗi task**, chạy sau review, trước khi đánh ✅.
  Bảng 7 mục: secret trong diff · secret trên dòng lệnh hoặc trong log · shop scoping /
  IDOR · input từ request là untrusted · file cấm (`.env*`, lockfile, `.gitlab-ci.yml`,
  `firebase.json`, `.firebaserc`) · dep hay outbound host lén thêm (kèm luật `yarn.lock`
  immutable install) · blast radius. Verdict `clean|fixed|accepted` ghi vào brief; `accepted`
  chỉ khi user đồng ý rõ ràng. Bẩn = một vòng đỏ, cùng trần 5.
- Luật quan trọng nhất: **không "sửa" secret bằng cách xoá dòng** — secret đã commit là secret
  đã cháy, phải báo đi thu hồi. Lấy `n9axd7` làm tiền lệ.
- Bảng Progress template thêm cột `Sec`; §9 final verification quét lại **toàn branch** vì hai
  diff sạch riêng lẻ cộng lại vẫn có thể sai.
- Red Flags +6 dòng ("Small task, skip the plan", "Tests green, ship it", "Only CSS/docs
  changed, no security check", …). Đồ thị dot cập nhật: 7 → 9 node đường chính.
- Test: script kiểm số mục `### N` liên tục 1→9, frontmatter parse được, mọi node trong dot
  reachable, chỉ 2 node terminal đúng thiết kế (`HARD STOP`, `Update brief as COMPLETE`) → PASS.

#### ✅ Task 11: Đưa hai phần đó vào deck
- Section 09: strip 9 → 11 chặng (thêm `plan task`, `security check`); khối mới
  "Plan từng task" (6 dòng + 5 luật); vòng lặp 7 → **9 bước** (01 viết plan, 07 security check,
  08 review trượt *hoặc* security bẩn = một vòng đỏ); bảng 7 mục security + 5 luật kèm.
- Section 05 (Bảo mật) thêm một dòng nối sang `#s09`: biết threat model là điều kiện cần,
  bắt buộc soi diff mới là điều kiện đủ.
- Test: `check.py` → PASS, 12 section, 13 grid box, 53499B. `build_standalone.py` → 59501B.
  Republish artifact cùng URL, label `plan-gate-and-security-check`.
- Sửa luôn `build_standalone.py`: nó in `len(out)` (ký tự) mà gắn nhãn "bytes" — lệch 4647
  với `ls` vì tiếng Việt nhiều ký tự đa byte. Đổi sang `len(out.encode())`.

#### ✅ Task 12: Sửa §2 của `tony-wf` — chi phí context của bước "init"
- **Đo thật, không ước.** Baseline session này lúc mở = **45,713 token**
  (`cache_creation 25,133` + `cache_read 20,580`, lấy từ `usage` của message đầu trong
  `~/.claude/projects/…/81dc84d4….jsonl`). Đó là system prompt + tool schema + chuỗi
  CLAUDE.md + MEMORY.md + hook, trước khi gõ chữ nào.
- §2 cũ trên repo `seo` cộng thêm **63,734 token**: `seo/CLAUDE.md` 6,066 ·
  `packages/*/CLAUDE.md` (2 file) 6,706 · **16 file `SKILL.md` = 50,962**.
  Tổng sau init = **109k** → 11% cửa sổ 1M, **55%** cửa sổ 200k.
- 80% chi phí nằm ở việc đọc hết 16 skill, mà một task chỉ dùng 1. Claude Code vốn đã inject
  sẵn name + description của skill — cả 16 cái chỉ **5,046 token**.
- Sửa: đọc `CLAUDE.md` repo + `CLAUDE.md` của package sắp đụng + `ls .claude/skills/` (tên thôi).
  Thân `SKILL.md` để §6 đọc khi task route tới. → **~13k**, tiết kiệm 51k mỗi lần chạy
  và mỗi lần `/resume`.
- **Bug thật bắt được:** §2 viết *"invoke the `init` skill"* — **không có skill nào tên `init`**.
  `ls ~/.claude/skills/` ra 12 skill, không có; danh sách skill của session cũng không có.
  `/init` là **built-in slash command**, AI không tự gọi được. Nên với **17 repo dưới
  `projects/Falcon/` không có `CLAUDE.md`** (`avachat`, `fleet-control`, `worker-sdk`,
  `team-ops`, `avada-core`, `seo-suite-ai`, …) bước này im lặng hỏng. Nhánh mới: **dừng, bảo
  user gõ `/init`**, không tự viết `CLAUDE.md` thay.
- Overview, đồ thị dot, frontmatter `description`, +2 dòng Red Flags cập nhật theo. 14110B → 15485B.

#### ✅ Task 13: Bỏ section Artifact / MCP / loop khỏi deck
- Lý do (yêu cầu): chỉ muốn giải thích vòng lặp ở phần `tony-wf`, không lan sang mode khác.
- Cắt trọn block `<!-- 08 -->` (1,662B), renumber `s09..s12` → `s08..s11` cho id, `.sec-num`,
  comment marker và rail bằng script; sửa cross-ref trong section 05 `#s09` → `#s08`.
  Assert trước khi cắt (`id="s08"` + `Artifact, MCP` phải nằm trong block) để không cắt nhầm.
- Còn đúng một chữ "Artifact" trong deck: dòng **"Publish Artifact"** ở sổ vòng — đó là tên
  task có thật của session, giữ.
- Test: `check.py` (đổi kỳ vọng 12→11) → **PASS**, 11 section, 13 grid box, 51905B,
  mọi anchor `#` resolve, rail khớp id 1:1. Standalone rebuild 57743B. Republish cùng URL.

#### ✅ Task 14: Đưa case thật xuống cuối, sắp lại menu
- Case `18xbru1` từ vị trí 04 xuống **10** — nằm ngay sau "Vì sao flow này ăn", ngay trước
  "Bắt đầu từ đâu". Lý do sắp thế: 09 nêu luận điểm → 10 là bằng chứng → 11 kêu gọi hành động.
  Đặt case ngay sau CTA thì người đọc rời trang trước khi thấy bằng chứng.
- Thứ tự mới: Vấn đề · Ba tầng context · Đường AI đọc · Bảo mật · Second brain + harness ·
  Hook/memory/resume · tony-wf + vòng lặp · Routing agent/model · Vì sao flow này ăn ·
  **Case thật 18xbru1** · Bắt đầu từ đâu.
- Case `n9axd7` **giữ nguyên trong section Bảo mật** — nó là bằng chứng inline cho lập luận
  threat model, tách ra thì section đó rỗng.
- Script tách block theo comment marker, đổi thứ tự, renumber id/`.sec-num`/marker, remap mọi
  anchor `#sNN` qua token trung gian (tránh va nhau khi đổi vòng), dựng lại rail theo thứ tự mới.
  Dọn luôn 3 comment CSS trỏ số section cũ — đổi sang tên phần, khỏi lệch lần sau.
- Thêm một câu dẫn vào `sec-sub` của case cho khớp vị trí mới: "Toàn bộ những thứ ở trên,
  chạy thật một lần."
- Test: `check.py` **PASS** 11 section 51970B · 0 anchor mồ côi · rail khớp id 1:1 theo thứ tự ·
  11 tiêu đề `h2` khớp 11 nhãn menu. Standalone 57846B.

#### ✅ Task 15: Đổi xưng hô trong deck sang "bạn"
- Deck là tài liệu training cho cả team, không phải chat riêng — "mày/tao" không hợp người đọc.
- 7 chỗ: 5 × `mày`, 1 × `Mày` (bảng ba tầng context), 1 × `Tao` (dòng mô tả
  `~/.claude/CLAUDE.md` trong phần "Đường AI đọc"). Cả hai chỗ hoa đều nói về **tầng identity**
  nên gộp về cùng một cách viết: "Bạn là ai, trả lời kiểu gì, luật cứng".
- Thay theo **ranh giới từ** (`(?<![\w])…(?![\w])`) chứ không thay chuỗi trần — tránh nuốt
  nhầm ký tự nằm trong từ khác. Quét lại sau khi thay: 0 chỗ sót.
- Test: `check.py` **PASS**, 11 section, 51970B (không đổi — thay từ đồng độ dài byte).
  Standalone 57854B.
