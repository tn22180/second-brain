---
name: team-daily-report
description: "Báo cáo SEOOn hằng ngày vào #system-alert (falcon_bot) — commit+title, Jira kéo/board, token + chấm 7-level từ prompt-audit; launchd collect 00:10 / post 09:00."
metadata:
  node_type: memory
  type: project
  originSessionId: 06adf3f8-c40b-4e62-9b94-0f0dfbbc02c3
  modified: 2026-10-15T09:07:46.578Z
---

Dựng 2026-10-15 qua harness graph `jobs/graphs/team-daily-1015.json` (Codex) + sửa tay; code `second-brain/tools/team-daily/` (stdlib, `python3 -m unittest discover -p 'test_*.py'`). launchd `com.tn22180.team-daily-collect` (00:10, ghi `~/.cache/team-daily/<hôm qua>.json`) và `-post` (09:00, tin chính + 1 reply thread/người); có trong loops.yml.

Nguồn: Jira FAL (PAT ở `~/.claude/skills/jira-create/.env`, UA trình duyệt, owner = `customfield_10700`), GitLab group `avada` qua `glab api` (map người theo local-part email, không theo tên), `prompt-audit` HTTP JSON-RPC (`team_usage`, `member_prompts`; token trong `~/.claude.json`), chấm bằng `claude -p --model sonnet --tools ''` trong dir rỗng.

Giới hạn đã biết:
- Token không lấy từ Grafana: máy chỉ có token ingest, không có token đọc. `team_usage` chỉ có tổng, cửa sổ cuốn 24h (vì thế collect chạy 00:10). avg/day của server sai (luôn /5) — dùng total.
- Thành viên (Tuan chốt 2026-10-15): 10 người — tuannv, tunglv, truongnn, minhpt, dungtt, anhnt3, ducnm01, hailt, lamln, nghiavt (nghiavt dùng email `@avada.email` ở prompt-audit). Đã bỏ tranggt, nhóm board SB (ngocnt, haibm, damhv, dantt, hungvm, trungnq, truongnd1), taing, trungph; đừng tự thêm lại theo roster.
- Jira chỉ FAL (10 người này 0 task SB). dungtt ngoài scope prompt-audit → không token/level.
- truongnn: server trả `<REDACTED>` cho mọi prompt → không chấm.
- member_prompts cap 200, không phân trang.
- Level chỉ từ text prompt (không có tool-call log) → 4+ độ tin cậy thấp.

**Why:** Tuan muốn 1 tin/ngày nhìn cả team: output (commit, Jira) đặt cạnh mức dùng AI và cảnh báo dùng sai/thừa.
**How to apply:** post PHẢI bằng falcon_bot — #system-alert bị [[slack-thread-watch]] theo dõi, token cá nhân sẽ spawn session support. Kênh private chỉ Tuan + bot. Rubric 7-level nằm trong grade.py (nguồn: session 3e0fb477, 10-01).
