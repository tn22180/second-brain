#!/usr/bin/env bash
# Daily job: render the full report, then post the compact summary to Telegram if
# credentials are configured. Used by the LaunchAgent (com.avada.billing-report).
set -euo pipefail
SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TZ_ARG="${TZ_ARG:-Asia/Ho_Chi_Minh}"

/opt/homebrew/bin/python3 "$SKILL/scripts/render_report.py" --tz "$TZ_ARG"

# Post GCP cost summary to Telegram (only when configured — silent skip otherwise).
if [ -f "$SKILL/config/telegram.json" ] \
   || { [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; }; then
  /opt/homebrew/bin/python3 "$SKILL/scripts/post_telegram.py" --tz "$TZ_ARG" || \
    echo "post_telegram (billing) exited non-zero (continuing)" >&2
fi

# Also post the AI credit-usage summary from the sibling credit-history-report skill.
# Reuses the same Telegram credentials. Non-fatal if missing or fails.
CREDIT_SKILL="$HOME/.claude/skills/credit-history-report"
if [ -x "$CREDIT_SKILL/scripts/post_telegram.py" ]; then
  /opt/homebrew/bin/python3 "$CREDIT_SKILL/scripts/post_telegram.py" || \
    echo "post_telegram (credit) exited non-zero (continuing)" >&2
fi

# Rebuild the daily manager page. Runs last and never fails the job — it reads
# the report this script just wrote.
MANAGER="$HOME/.claude/skills/daily-manager/build.py"
if [ -f "$MANAGER" ]; then
  /opt/homebrew/bin/python3 "$MANAGER" || \
    echo "daily-manager build exited non-zero (continuing)" >&2
fi
