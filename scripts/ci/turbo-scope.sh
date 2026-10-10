#!/usr/bin/env bash
# turbo タスクを影響範囲だけ実行する。
#
# Usage: CI_BASE_SHA=<sha> scripts/ci/turbo-scope.sh <task> [追加グローバルパス正規表現...]
# Env:   CI_SCOPE_DRY_RUN=1            turbo を実行せずコマンドを表示（検証用）
#        CI_SCOPE_CHANGED_FILES_FILE   変更ファイル一覧を差し替え（テスト用）
set -euo pipefail

TASK="${1:-}"
if [ -z "$TASK" ]; then
  echo "usage: $0 <turbo-task> [extra-global-path-regex...]" >&2
  exit 2
fi
shift

BASE="${CI_BASE_SHA:-}"

# turbo の --filter=...[ref] はパッケージに属さないファイルの変更で 0 件を返すため、
# ここに挙げたパスが変わったら全実行に倒す。
# **列挙漏れはタスク 0 件のまま緑になる。** ルート直下にファイルを足したら追記する。
GLOBAL_PATHS='\.github/|scripts/ci/|turbo\.json$|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|\.pnpmfile\.cjs$'
for extra in "$@"; do
  GLOBAL_PATHS="${GLOBAL_PATHS}|${extra}"
done
GLOBAL_PATHS="^(${GLOBAL_PATHS})"

run_turbo() {
  if [ "${CI_SCOPE_DRY_RUN:-}" = "1" ]; then
    echo "  [dry-run] pnpm turbo run $*"
    return 0
  fi
  pnpm turbo run "$@"
}

if [ -z "$BASE" ]; then
  echo "::notice::base の指定が無いため全パッケージで ${TASK} を実行する"
  run_turbo "$TASK"
  exit 0
fi

# git diff | grep -q にしないこと。grep -q が先に終了して git が SIGPIPE で 141 を返し、
# pipefail によってマッチしているのに影響範囲のみに倒れる。
CHANGED="$(mktemp)"
trap 'rm -f "$CHANGED"' EXIT
if [ -n "${CI_SCOPE_CHANGED_FILES_FILE:-}" ]; then
  cat "$CI_SCOPE_CHANGED_FILES_FILE" > "$CHANGED"
else
  git diff --name-only "${BASE}...HEAD" > "$CHANGED"
fi

echo "変更ファイル ($(wc -l < "$CHANGED" | tr -d ' ') 件):"
cat "$CHANGED"

if grep -qE "$GLOBAL_PATHS" "$CHANGED"; then
  echo "::notice::パッケージ外の変更を検出したため全パッケージで ${TASK} を実行する"
  run_turbo "$TASK"
else
  echo "::notice::影響範囲のみ ${TASK} を実行する (base=${BASE})"
  run_turbo "$TASK" --filter="...[${BASE}]"
fi
