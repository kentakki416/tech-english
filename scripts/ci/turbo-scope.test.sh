#!/usr/bin/env bash
# turbo-scope.sh のテスト。判定を誤ると必要なタスクが走らないまま緑になるため、
# ローカルで判定を変えたときに実行する。CI では動かしていない。
#
# Usage: scripts/ci/turbo-scope.test.sh
set -uo pipefail

cd "$(cd "$(dirname "$0")/../.." && pwd)"

SCRIPT="scripts/ci/turbo-scope.sh"
PASS=0
FAIL=0
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
fail() {
  FAIL=$((FAIL + 1))
  echo "  ✗ $1"
  echo "    期待: $2 / 実際: $3"
}

# 変更ファイル一覧を渡して判定だけを取り出す
scope_of() {
  local files="$1"
  shift
  printf '%s\n' "$files" > "$WORK/changed.txt"
  CI_BASE_SHA="dummy-base" CI_SCOPE_DRY_RUN=1 \
    CI_SCOPE_CHANGED_FILES_FILE="$WORK/changed.txt" bash "$SCRIPT" "$@" 2>&1
}

assert_full_run() {
  local label="$1" files="$2"
  shift 2
  local out
  out="$(scope_of "$files" "$@")"
  case "$out" in
    *"pnpm turbo run $1"*"--filter"*) fail "$label" "全実行" "影響範囲のみ" ;;
    *"pnpm turbo run $1"*) pass "$label" ;;
    *) fail "$label" "全実行" "$out" ;;
  esac
}

assert_scoped_run() {
  local label="$1" files="$2"
  shift 2
  local out
  out="$(scope_of "$files" "$@")"
  case "$out" in
    *"--filter=...[dummy-base]"*) pass "$label" ;;
    *) fail "$label" "影響範囲のみ" "$out" ;;
  esac
}

echo "== 引数 =="
OUT="$(bash "$SCRIPT" 2>&1)"
CODE=$?
if [ "$CODE" -eq 2 ] && [[ "$OUT" == *usage* ]]; then
  pass "タスク名なしなら usage + exit 2"
else
  fail "タスク名なしなら usage + exit 2" "exit 2 + usage" "exit $CODE / $OUT"
fi

echo
echo "== base なし =="
OUT="$(CI_SCOPE_DRY_RUN=1 bash "$SCRIPT" lint 2>&1)"
case "$OUT" in
  *"pnpm turbo run lint"*"--filter"*) fail "base 空なら全実行" "全実行" "影響範囲のみ" ;;
  *"pnpm turbo run lint"*) pass "base 空なら全実行" ;;
  *) fail "base 空なら全実行" "全実行" "$OUT" ;;
esac

echo
echo "== パッケージ内 → 影響範囲のみ =="
assert_scoped_run "packages 配下" "packages/queue/src/types.ts" lint
assert_scoped_run "apps 配下" "apps/api/src/index.ts" lint
assert_scoped_run "パッケージの package.json" "apps/api/package.json" lint
assert_scoped_run "複数パッケージ" "apps/web/src/a.tsx
packages/db/src/b.ts" lint

echo
echo "== パッケージ外 → 全実行 =="
assert_full_run "ワークフロー" ".github/workflows/test.yml" lint
assert_full_run "turbo.json" "turbo.json" lint
assert_full_run "lockfile" "pnpm-lock.yaml" lint
assert_full_run "workspace 定義" "pnpm-workspace.yaml" lint
assert_full_run "判定スクリプト自身" "scripts/ci/turbo-scope.sh" lint
assert_full_run "ルートの package.json" "package.json" lint

echo
echo "== ci/ 以外の scripts → 影響範囲のみ =="
assert_scoped_run "deploy 用スクリプト" "scripts/deploy/seed-secrets.sh" lint
assert_scoped_run "setup 用スクリプト" "scripts/setup/copy-template.sh" lint

echo
echo "== タスク固有のグローバルパス =="
assert_full_run "infra/ は test:ci では全実行" "infra/clickhouse/init/01-events.sql" \
  "test:ci" 'docker-compose\.yaml' 'infra/'
assert_scoped_run "infra/ は lint では影響範囲のみ" "infra/clickhouse/init/01-events.sql" lint
assert_full_run "docker-compose は test:ci では全実行" "docker-compose.yaml" \
  "test:ci" 'docker-compose\.yaml' 'infra/'

echo
echo "== 大きな差分（SIGPIPE 回帰） =="
{
  echo ".github/workflows/test.yml"
  for i in $(seq 1 20000); do echo "apps/web/src/generated/file-$i.tsx"; done
} > "$WORK/big.txt"
OUT="$(CI_BASE_SHA="dummy-base" CI_SCOPE_DRY_RUN=1 \
  CI_SCOPE_CHANGED_FILES_FILE="$WORK/big.txt" bash "$SCRIPT" lint 2>&1)"
case "$OUT" in
  *"pnpm turbo run lint"*"--filter"*) fail "差分 2 万件でも全実行" "全実行" "影響範囲のみ" ;;
  *"pnpm turbo run lint"*) pass "差分 2 万件でも全実行" ;;
  *) fail "差分 2 万件でも全実行" "全実行" "(判定できず)" ;;
esac

echo
echo "== turbo の filter 意味論 =="
# ...[ref] は「変更 + 依存元」。[ref]... に直すと依存元が走らなくなる。
if [ -n "$(git status --porcelain)" ]; then
  echo "  - skip: 作業ツリーが clean でないため"
else
  TMP_BRANCH="tmp/ci-scope-test-$$"
  ORIGINAL_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  restore() {
    git checkout -q "$ORIGINAL_BRANCH" 2>/dev/null || true
    git branch -q -D "$TMP_BRANCH" 2>/dev/null || true
  }
  trap 'restore; rm -rf "$WORK"' EXIT

  git checkout -q -b "$TMP_BRANCH"
  printf '\n/** ci-scope-test fixture */\n' >> packages/queue/src/types.ts
  git commit -q -m "test fixture" -- packages/queue/src/types.ts

  SELECTED="$(pnpm turbo run test:ci --filter="...[HEAD~1]" --dry=json 2>/dev/null | node -e '
    let s = "";
    process.stdin.on("data", (c) => (s += c));
    process.stdin.on("end", () => {
      const d = JSON.parse(s);
      const n = [...new Set(d.tasks.filter((t) => t.task === "test:ci").map((t) => t.package))];
      console.log(n.sort().join(","));
    });
  ')"

  restore
  trap 'rm -rf "$WORK"' EXIT

  for expected in "@repo/queue" api worker; do
    case ",$SELECTED," in
      *",$expected,"*) pass "queue の変更で $expected が選ばれる" ;;
      *) fail "queue の変更で $expected が選ばれる" "$expected を含む" "$SELECTED" ;;
    esac
  done
fi

echo
echo "pass: $PASS / fail: $FAIL"
[ "$FAIL" -eq 0 ]
