#!/bin/bash
# One-shot: opens an Orca Claude session on 2026-10-29 for the recursive per-action report,
# DMs Telegram either way, then unloads its own launchd job (StartCalendarInterval would
# otherwise fire again next year).
set -u
LABEL=com.tn22180.recursive-report-1029
ORCA=/Applications/Orca.app/Contents/Resources/bin/orca
REPO=/Users/nguyentuan/Documents/second-brain
BRIEF=jobs/recursive-action-report-2026-10-29.md
LOG=$REPO/launchd/recursive-report-1029.log
export PATH=/opt/homebrew/bin:/usr/local/bin:/Users/nguyentuan/.local/bin:/Users/nguyentuan/bin:$PATH

tg() {
  local token
  token=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$HOME/.hermes/.env" | head -1 | cut -d= -f2- | tr -d '"'"'")
  [ -n "$token" ] || return 0
  # Token goes through curl's config on stdin so it never appears in argv.
  printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$token" |
    curl -s -K - --data-urlencode chat_id=1178722633 --data-urlencode parse_mode=HTML \
      --data-urlencode "text=$1" >/dev/null
}

{
  echo "$(date -u +%FT%TZ) start"
  PROMPT="Đọc và làm theo brief $BRIEF (báo cáo 2 tuần recursive theo action, đã hẹn với Tuan 2026-10-15)."
  if "$ORCA" terminal create --worktree "path:$REPO" --title recursive-report \
      --command "exec claude --permission-mode auto \"$PROMPT\"" --json; then
    tg "<b>recursive report</b>
Đã mở session Orca (second-brain, tab recursive-report) — báo cáo 2 tuần theo action của recursiveSubscriberGen2."
  else
    tg "<b>recursive report</b>
Mở session Orca thất bại (Orca có đang chạy?). Chạy tay: cd ~/Documents/second-brain && claude \"$PROMPT\""
  fi
  echo "$(date -u +%FT%TZ) done"
} >>"$LOG" 2>&1

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
