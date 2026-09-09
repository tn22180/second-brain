#!/usr/bin/env bash
# Daily job: render the full report, then post the compact summary to Telegram if
# credentials are configured. Used by the LaunchAgent (com.avada.billing-report).
set -euo pipefail
SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TZ_ARG="${TZ_ARG:-Asia/Ho_Chi_Minh}"

# Run bq as a service account, not the interactive user. Workspace "Google Cloud
# session control" forces `gcloud auth login` roughly daily, which silently broke
# this job overnight; a service account's stored key refreshes tokens indefinitely.
export CLOUDSDK_CORE_ACCOUNT="${CLOUDSDK_CORE_ACCOUNT:-tony-cli@avada-seo.iam.gserviceaccount.com}"

# The 06:00 launchd fire can land before wifi associates after a wake, and bq then dies
# on "Failed to resolve oauth2.googleapis.com" — with set -e that kills the whole job,
# so no report, no Telegram, no daily.html. Wait for the token endpoint to answer first.
wait_for_network() {
  local tries=10 delay=30 i
  for ((i = 1; i <= tries; i++)); do
    if /usr/bin/curl -sS -o /dev/null -m 10 https://oauth2.googleapis.com/ 2>/dev/null; then
      [ "$i" -gt 1 ] && echo "network up after $(( (i - 1) * delay ))s" >&2
      return 0
    fi
    echo "network not up yet (attempt $i/$tries), retrying in ${delay}s" >&2
    sleep "$delay"
  done
  echo "oauth2.googleapis.com unreachable after $(( tries * delay ))s — aborting" >&2
  return 1
}
wait_for_network

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
