#!/usr/bin/env bash
# Copy project CI/CD variables from one GitLab instance to another.
#
# GitLab project export does not carry CI/CD variables, so they must be replayed
# through the API. Dry-run by default; set APPLY=1 to write.
#
# Tokens are read from the environment only — never pass them as arguments,
# because command lines land in shell history and process listings.
#
#   set -a; source ~/.avada-migrate.env; set +a
#   ./migrate-ci-vars.sh            # dry-run
#   APPLY=1 ./migrate-ci-vars.sh    # write

set -euo pipefail

SRC_HOST="${SRC_HOST:-https://gitlab.com}"
DST_HOST="${DST_HOST:-https://git.avada.net}"
SRC_PROJECT="${SRC_PROJECT:-avada%2Fseo}"
DST_PROJECT="${DST_PROJECT:-avada%2Fseo}"
APPLY="${APPLY:-0}"

: "${SRC_TOKEN:?SRC_TOKEN not set — source ~/.avada-migrate.env}"
: "${DST_TOKEN:?DST_TOKEN not set — source ~/.avada-migrate.env}"

command -v jq >/dev/null || { echo "jq required" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "src: $SRC_HOST/$SRC_PROJECT"
echo "dst: $DST_HOST/$DST_PROJECT"
[ "$APPLY" = "1" ] && echo "mode: APPLY" || echo "mode: dry-run (APPLY=1 to write)"
echo

page=1
: > "$tmp/vars.ndjson"
while :; do
  body="$(curl -sf --max-time 60 -H "PRIVATE-TOKEN: $SRC_TOKEN" \
    "$SRC_HOST/api/v4/projects/$SRC_PROJECT/variables?per_page=100&page=$page")" || {
    echo "fetch failed on page $page — token needs Maintainer on the source project" >&2
    exit 1
  }
  count="$(jq 'length' <<<"$body")"
  [ "$count" -eq 0 ] && break
  jq -c '.[]' <<<"$body" >> "$tmp/vars.ndjson"
  page=$((page + 1))
done

total="$(wc -l < "$tmp/vars.ndjson" | tr -d ' ')"
echo "fetched $total variables"
echo

printf '%-42s %-6s %-5s %-6s %-4s %s\n' KEY TYPE PROT MASKED RAW SCOPE
ok=0; fail=0
while IFS= read -r v; do
  key="$(jq -r '.key' <<<"$v")"
  vtype="$(jq -r '.variable_type // "env_var"' <<<"$v")"
  prot="$(jq -r '.protected // false' <<<"$v")"
  masked="$(jq -r '.masked // false' <<<"$v")"
  raw="$(jq -r '.raw // false' <<<"$v")"
  scope="$(jq -r '.environment_scope // "*"' <<<"$v")"
  desc="$(jq -r '.description // ""' <<<"$v")"

  printf '%-42s %-6s %-5s %-6s %-4s %s\n' \
    "$key" "${vtype/_var/}" "$prot" "$masked" "$raw" "$scope"

  [ "$APPLY" = "1" ] || continue

  # Value goes through a file so a multi-line SA key or env file survives intact
  # and never appears in argv.
  jq -rj '.value' <<<"$v" > "$tmp/value"

  code="$(curl -s -o "$tmp/resp" -w '%{http_code}' --max-time 60 \
    -X POST -H "PRIVATE-TOKEN: $DST_TOKEN" \
    --form-string "key=$key" \
    --form "value=<$tmp/value" \
    --form-string "variable_type=$vtype" \
    --form-string "protected=$prot" \
    --form-string "masked=$masked" \
    --form-string "raw=$raw" \
    --form-string "environment_scope=$scope" \
    --form-string "description=$desc" \
    "$DST_HOST/api/v4/projects/$DST_PROJECT/variables")"

  case "$code" in
    2*) ok=$((ok + 1)) ;;
    *)  fail=$((fail + 1))
        echo "  !! $key -> HTTP $code: $(head -c 300 "$tmp/resp")" >&2 ;;
  esac
done < "$tmp/vars.ndjson"

echo
if [ "$APPLY" = "1" ]; then
  echo "created $ok, failed $fail, of $total"
  # A masked value that violates GitLab's masking rules is the usual 400: it must be
  # a single line, >=8 chars, base64-ish. Those need the masked flag dropped by hand.
  [ "$fail" -gt 0 ] && exit 1
else
  echo "dry-run only, nothing written"
fi
