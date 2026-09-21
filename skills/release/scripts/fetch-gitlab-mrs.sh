#!/bin/bash
# Fetch recent merged MRs from GitLab API
# Usage: ./scripts/fetch-gitlab-mrs.sh [days]
# Default: fetch MRs merged in the last 7 days

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Nạp cấu hình. Thứ tự ưu tiên GIỐNG scripts/lib/env.mjs: biến môi trường THẮNG file .env.
# Biến môi trường đến từ `env` trong ~/.claude/settings.json (cách chính, sống qua mọi lần
# update plugin); .env trong thư mục skill là fallback cho dev sửa repo local.
# Cũ dùng `export $(grep ... | xargs)` — dòng rỗng `GITLAB_TOKEN=` trong .env cũ ĐÈ giá trị
# đã set ở settings.json thành rỗng, báo "must be set in .env" dù người dùng đã điền đúng chỗ.
load_env_file() {
  local file="$1" key value
  [ -f "$file" ] || return 0
  for key in GITLAB_TOKEN GITLAB_PROJECT_ID; do
    # Đã có giá trị (không rỗng) từ môi trường → giữ, không đọc file.
    [ -n "${!key:-}" ] && continue
    value=$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$file" | head -1 | cut -d= -f2- \
      | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^["'"'"']//' -e 's/["'"'"']$//')
    [ -n "$value" ] && export "$key=$value"
  done
}
load_env_file "$ROOT_DIR/.env"

if [ -z "${GITLAB_TOKEN:-}" ] || [ -z "${GITLAB_PROJECT_ID:-}" ]; then
  echo "Error: GITLAB_TOKEN and GITLAB_PROJECT_ID must be set."
  echo "Cách chính: thêm vào \"env\" trong ~/.claude/settings.json (sống qua mọi lần update plugin)."
  echo "Fallback: .env trong thư mục skill release ($ROOT_DIR/.env)."
  exit 1
fi

# Dùng cho test: chỉ kiểm phần nạp cấu hình, không gọi API.
if [ "${1:-}" = "--check-env" ]; then
  echo "OK GITLAB_PROJECT_ID=$GITLAB_PROJECT_ID"
  exit 0
fi

DAYS="${1:-7}"
SINCE=$(date -v-${DAYS}d +%Y-%m-%dT00:00:00Z 2>/dev/null || date -d "${DAYS} days ago" +%Y-%m-%dT00:00:00Z)

# Output ghi vào THƯ MỤC ĐANG MỞ (cwd), không phải thư mục skill.
# Thư mục skill nằm trong ~/.claude/plugins/ sau khi cài plugin — bị xoá sạch mỗi lần
# /plugin install, và không phải nơi Claude đi tìm file. Override bằng MR_OUTPUT_DIR nếu cần.
PRODUCT="${MR_PRODUCT:-avada-seo-suite}"
OUTPUT_DIR="${MR_OUTPUT_DIR:-$PWD/products/$PRODUCT/changelog}"
mkdir -p "$OUTPUT_DIR"
OUTPUT_FILE="$OUTPUT_DIR/gitlab-mrs-latest.json"

echo "Fetching MRs merged since $SINCE (last $DAYS days)..."

# Fetch all pages of merged MRs
PAGE=1
ALL_MRS="[]"

while true; do
  RESPONSE=$(curl -s --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
    "https://gitlab.com/api/v4/projects/$GITLAB_PROJECT_ID/merge_requests?state=merged&updated_after=$SINCE&per_page=100&page=$PAGE&order_by=merged_at&sort=desc")

  # Check for errors
  if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if isinstance(d,list) else 1)" 2>/dev/null; then
    COUNT=$(echo "$RESPONSE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
    if [ "$COUNT" -eq 0 ]; then
      break
    fi
    ALL_MRS=$(python3 -c "
import json, sys
existing = json.loads('$ALL_MRS') if '$ALL_MRS' != '[]' else []
with open('/dev/stdin') as f:
    new = json.load(f)
print(json.dumps(existing + new))
" <<< "$RESPONSE")
    if [ "$COUNT" -lt 100 ]; then
      break
    fi
    PAGE=$((PAGE + 1))
  else
    echo "Error from GitLab API:"
    echo "$RESPONSE"
    exit 1
  fi
done

TOTAL=$(echo "$ALL_MRS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "Found $TOTAL merged MRs"

# Save full JSON for reference
echo "$ALL_MRS" > "$OUTPUT_FILE"

# Generate summary for changelog
echo "$ALL_MRS" | python3 -c "
import json, sys
from datetime import datetime

mrs = json.load(sys.stdin)
if not mrs:
    print('No new MRs found.')
    sys.exit(0)

features = []
improvements = []
fixes = []
other = []

for mr in mrs:
    title = mr.get('title', '')
    merged = mr.get('merged_at', '')[:10]
    iid = mr.get('iid', '')
    desc = mr.get('description', '') or ''
    # First 200 chars of description
    desc_short = desc[:200].replace('\n', ' ').strip()

    entry = f'- **MR !{iid}: {title}** ({merged})'
    if desc_short:
        entry += f' — {desc_short}'

    title_lower = title.lower()
    if any(k in title_lower for k in ['feat', 'feature', 'add ', 'new ']):
        features.append(entry)
    elif any(k in title_lower for k in ['improve', 'enhance', 'refactor', 'optimize', 'update', 'chore']):
        improvements.append(entry)
    elif any(k in title_lower for k in ['fix', 'bug', 'hotfix', 'patch']):
        fixes.append(entry)
    else:
        other.append(entry)

print('# GitLab MRs — Latest Fetch')
print(f'Fetched: {datetime.now().strftime(\"%Y-%m-%d %H:%M\")}')
print()

if features:
    print('### New Features')
    print('\n'.join(features))
    print()
if improvements:
    print('### Improvements')
    print('\n'.join(improvements))
    print()
if fixes:
    print('### Bug Fixes')
    print('\n'.join(fixes))
    print()
if other:
    print('### Other')
    print('\n'.join(other))
    print()
" | tee "$OUTPUT_DIR/gitlab-mrs-latest.md"

echo ""
echo "Done! Files saved:"
echo "  JSON: $OUTPUT_FILE"
echo "  Summary: $OUTPUT_DIR/gitlab-mrs-latest.md"
