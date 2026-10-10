#!/usr/bin/env bash
# =============================================================================
# scripts/setup/setup-labels.sh
# =============================================================================
# .github/labeler.yml が付与する PR ラベルを GitHub リポジトリに作成する。
#
# このリポジトリは template であり、GitHub のラベルは template から生成した
# 新リポジトリには引き継がれない。派生リポジトリで本スクリプトを 1 回実行して
# ラベルを揃える想定。
#
# `gh label create --force` を使うため冪等（既存ラベルは色/説明を更新）。
#
# Usage:
#   ./scripts/setup/setup-labels.sh [<owner>/<repo>]
#
# Example:
#   ./scripts/setup/setup-labels.sh                 # カレントリポジトリ
#   ./scripts/setup/setup-labels.sh foo/bar         # 明示指定
#
# 依存: gh (認証済み)
# =============================================================================

set -euo pipefail

REPO="${1:-}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: 'gh' not installed" >&2
  exit 1
fi

# リポジトリ未指定ならカレントを解決
if [ -z "$REPO" ]; then
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
fi

echo "==> Setting up labels on ${REPO}"

# ラベル名|色|説明
# 色は project-template の app/packages 区分が一目で分かるよう割り当て
LABELS=(
  "web|1d76db|apps/web の変更"
  "admin|5319e7|apps/admin の変更"
  "api|0e8a16|apps/api の変更"
  "mobile|006b75|apps/mobile の変更"
  "cron|d93f0b|apps/cron の変更"
  "worker|fbca04|apps/worker の変更"
  "packages|0052cc|packages/ 配下の変更"
  "chore|cfd3d7|apps/ にも packages/ にも該当しない変更"
)

for entry in "${LABELS[@]}"; do
  IFS='|' read -r name color description <<<"$entry"
  gh label create "$name" \
    --repo "$REPO" \
    --color "$color" \
    --description "$description" \
    --force >/dev/null
  echo "  ✓ ${name} (#${color})"
done

echo "==> Done. ${#LABELS[@]} labels are in sync on ${REPO}"
