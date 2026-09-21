---
name: orca-tcc-documents-block
description: "Terminal host là Orca.app; khi Orca auto-update, TCC mất quyền Documents → mọi thao tác trong ~/Documents chết giữa session, phải quit hẳn Orca + re-grant."
metadata: 
  node_type: memory
  type: reference
  originSessionId: cf7f3254-4990-476b-a76a-0d0515c5b2a5
  modified: 2026-09-21T08:36:21.395Z
---

Terminal host của Claude Code trên máy này là **Orca.app** (`com.stablyai.orca`), không phải
Terminal/iTerm — process tree: `Orca Helper → login → zsh → claude → zsh`. Mọi grant TCC phải cấp
cho **Orca**; cấp cho Terminal/iTerm là cấp nhầm app, không có tác dụng.

**Triệu chứng khi mất quyền:** giữa session đang chạy ngon thì mọi thứ dưới `~/Documents` trả
`Operation not permitted` — kể cả `ls`, `head`. `git` báo `fatal: Unable to read current working
directory` (nó chết ở `getcwd()`, không phải lỗi git). Đường dẫn ngoài Documents vẫn OK.

**Cách phân biệt TCC với sandbox của Claude Code** — map thư mục:
`~`, `~/Desktop`, `~/Downloads`, `~/.claude`, `/tmp` = OK nhưng `~/Documents` = DENIED
→ đó là TCC class `Documents Folder` (tách riêng khỏi Desktop/Downloads), không phải sandbox.

**Gốc:** TCC gắn quyền theo code signature của bundle. Orca tự update (quan sát 2026-09-21:
bundle mtime `2026-09-09 18:48` trong khi Orca Helper chạy từ `Sep 8 18:12`) → binary đổi, record
TCC cũ hết khớp. Process đang chạy sống bằng decision đã cache thêm ~12 ngày rồi mới rớt, nên thời
điểm rơi không trùng lúc update.

**Fix:** ⌘Q Orca hẳn (đóng tab không đủ — process cũ giữ quyền cũ) → System Settings → Privacy &
Security → Files and Folders → **xoá entry Orca** rồi mở lại app để nó prompt lại (entry cũ trỏ
signature cũ sẽ nuốt prompt mới), hoặc thêm Orca vào Full Disk Access → relaunch → `/resume`.

Trùng họ với [[falcon-fix-bot-mac-runtime]]: TCC chặn `~/Documents` là vấn đề tái đi tái lại trên
máy này, nên mọi thứ cần chạy bền (watchdog, launchd) mirror ra `~/Library/Application Support`.
