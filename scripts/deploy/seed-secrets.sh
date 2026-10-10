#!/usr/bin/env bash
# =============================================================================
# scripts/deploy/seed-secrets.sh
# =============================================================================
# Application secret (/project-template-<env>/app) に以下を投入する:
#   1. RDS / ElastiCache の接続情報 (terraform output から自動構築)
#   2. 外部サービスの secret (環境変数から)
#
# Terraform が管理する JWT_* / NODE_ENV / PORT 等は触らず、merge で追加する。
# (modules/secrets の ignore_changes により Terraform は secret_string 更新を見ない)
#
# Usage:
#   ./scripts/deploy/seed-secrets.sh <env>
#
# Example:
#   ./scripts/deploy/seed-secrets.sh dev
#
# 環境変数 (どれも未設定なら skip + warn、後で再実行で OK):
#   GOOGLE_CLIENT_ID
#   GOOGLE_CLIENT_SECRET
#   LIVEKIT_HOST
#   LIVEKIT_API_KEY
#   LIVEKIT_API_SECRET
#   FRONTEND_URL
#   EXTERNAL_DATABASE_URL  (min のみ。PlanetScale の接続文字列 → DATABASE_URL)
#   EXTERNAL_REDIS_URL     (min のみ。Upstash の接続文字列 → REDIS_URL)
#
# シェルで上記を export しておくと毎回入力不要。
# =============================================================================

set -euo pipefail

ENV="${1:-}"
if [ -z "$ENV" ]; then
  echo "Usage: $0 <env>" >&2
  echo "Example: $0 dev" >&2
  exit 1
fi

SECRET_NAME="/project-template-${ENV}/app"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TF_DIR="${REPO_ROOT}/infra/terraform/aws/env/${ENV}"

if [ ! -d "$TF_DIR" ]; then
  echo "ERROR: terraform directory not found: $TF_DIR" >&2
  exit 1
fi

# 依存コマンド確認
for cmd in aws jq terraform; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: '$cmd' not installed" >&2
    exit 1
  fi
done

echo "==> Seeding secrets for ${SECRET_NAME}"

# ============================================================================
# 1. 既存の Secret を取得 (Terraform が投入した JWT 等が入っている)
# ============================================================================
CURRENT=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_NAME" \
  --query SecretString --output text 2>/dev/null || echo '{}')

# 投入する key-value を JSON で組み立てる
NEW_VALUES=$(jq -n '{}')

add_kv() {
  local key="$1"
  local value="$2"
  local source="$3"
  if [ -n "$value" ]; then
    NEW_VALUES=$(echo "$NEW_VALUES" | jq --arg k "$key" --arg v "$value" '. + {($k): $v}')
    echo "  ✓ $key (from $source)"
  else
    echo "  - $key (skipped, $source)"
  fi
}

# ============================================================================
# 2. 外部サービス: 環境変数から
# ============================================================================
echo "==> External secrets (from environment variables)"
add_kv "GOOGLE_CLIENT_ID"       "${GOOGLE_CLIENT_ID:-}"       "env"
add_kv "GOOGLE_CLIENT_SECRET"   "${GOOGLE_CLIENT_SECRET:-}"   "env"
add_kv "LIVEKIT_HOST"           "${LIVEKIT_HOST:-}"           "env"
add_kv "LIVEKIT_API_KEY"        "${LIVEKIT_API_KEY:-}"        "env"
add_kv "LIVEKIT_API_SECRET"     "${LIVEKIT_API_SECRET:-}"     "env"
add_kv "FRONTEND_URL"           "${FRONTEND_URL:-}"           "env"

# 外部の DB / Redis (minimal 構成の PlanetScale / Upstash 等)。RDS / ElastiCache を持たない環境でだけ使う。
# RDS / ElastiCache がある環境 (dev / prd) では、後段の terraform output からの組み立てが上書きする。
# 変数名を DATABASE_URL / REDIS_URL にしないのは、ローカルのシェルに入っている値を
# 誤って本番の secret に書き込まないため。
add_kv "DATABASE_URL"           "${EXTERNAL_DATABASE_URL:-}"  "env"
add_kv "REDIS_URL"              "${EXTERNAL_REDIS_URL:-}"     "env"

# ============================================================================
# 3. RDS: terraform output + app secret の DB_PASSWORD から DATABASE_URL を構築
# ============================================================================
echo "==> Infrastructure-derived secrets (from terraform output)"

if RDS_ADDRESS=$(terraform -chdir="$TF_DIR" output -raw rds_address 2>/dev/null); then
  RDS_DB_NAME=$(terraform -chdir="$TF_DIR" output -raw rds_db_name)
  RDS_USERNAME=$(terraform -chdir="$TF_DIR" output -raw rds_master_username)

  # パスワードの唯一の情報源は app secret の DB_PASSWORD。
  # (Terraform が random 初期値を投入し、module.rds が ephemeral 経由で password_wo に渡す。
  #  以前の rds! managed secret は自動ローテーションが DATABASE_URL と乖離する事故を
  #  起こしたため廃止した)
  RDS_PASSWORD=$(echo "$CURRENT" | jq -r '.DB_PASSWORD // empty')

  if [ -z "$RDS_PASSWORD" ]; then
    echo "  - DATABASE_URL (skipped, DB_PASSWORD not found in ${SECRET_NAME})"
  else
    # パスワードに URL 不適合な文字が混じることがあるため percent-encode
    ENCODED_PW=$(jq -rn --arg p "$RDS_PASSWORD" '$p|@uri')
    # sslmode=no-verify: 暗号化はするが CA 検証はしない。
    # Prisma 7 の pg ドライバアダプタ(@prisma/adapter-pg)は sslmode=require を verify-full 扱いに
    # するため、RDS の CA(自己署名チェーン)を弾いて TlsConnectionError(P1011) になる。RDS は VPC
    # 内通信なので no-verify で運用する（CA 同梱で verify-full にするのは将来の hardening）。
    DATABASE_URL="postgresql://${RDS_USERNAME}:${ENCODED_PW}@${RDS_ADDRESS}:5432/${RDS_DB_NAME}?sslmode=no-verify"

    NEW_VALUES=$(echo "$NEW_VALUES" | jq --arg url "$DATABASE_URL" '. + { DATABASE_URL: $url }')
    echo "  ✓ DATABASE_URL (constructed from RDS outputs + DB_PASSWORD)"
  fi
else
  echo "  - DATABASE_URL (skipped, RDS not deployed yet)"
fi

# ============================================================================
# 4. ElastiCache: terraform output から REDIS_URL を構築
# ============================================================================
# app が読むのは REDIS_URL の 1 本だけ (packages/redis の createRedisClient が
# process.env.REDIS_URL を見る)。ホスト名だけ渡しても組み立てるコードが無いので、
# ここで完全な URL にする。
#
# scheme が redis:// なのは module.elasticache が transit_encryption_enabled = false
# で立てているため。TLS を有効化したら rediss:// に変える必要がある。
if REDIS_HOST=$(terraform -chdir="$TF_DIR" output -raw redis_address 2>/dev/null); then
  # port / db は app secret の値を使い、無い or 不正なら ElastiCache の既定にフォールバックする。
  #
  # 検証しているのは、不正な値をそのまま埋めると Secrets Manager に壊れた URL が入り、
  # 障害が「worker が Redis に繋がらない」という原因の分かりにくい形で出るため。
  # jq の `//` は null にしか効かず空文字列は素通りするので、ここで明示的に弾く。
  REDIS_PORT=$(echo "$CURRENT" | jq -r '.REDIS_PORT // empty')
  REDIS_DB=$(echo "$CURRENT" | jq -r '.REDIS_DB // empty')

  if ! [[ "$REDIS_PORT" =~ ^[0-9]+$ ]] || [ "$REDIS_PORT" -lt 1 ] || [ "$REDIS_PORT" -gt 65535 ]; then
    if [ -n "$REDIS_PORT" ]; then
      echo "  ! REDIS_PORT='${REDIS_PORT}' は不正なため既定の 6379 を使う"
    fi
    REDIS_PORT=6379
  fi

  if ! [[ "$REDIS_DB" =~ ^[0-9]+$ ]]; then
    if [ -n "$REDIS_DB" ]; then
      echo "  ! REDIS_DB='${REDIS_DB}' は不正なため既定の 0 を使う"
    fi
    REDIS_DB=0
  fi

  REDIS_URL="redis://${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}"
  NEW_VALUES=$(echo "$NEW_VALUES" | jq --arg url "$REDIS_URL" '. + { REDIS_URL: $url }')
  echo "  ✓ REDIS_URL (constructed from ElastiCache output)"
else
  echo "  - REDIS_URL (skipped, ElastiCache not deployed yet)"
fi

# ============================================================================
# 5. 既存と merge して put
# ============================================================================
UPDATED_COUNT=$(echo "$NEW_VALUES" | jq 'keys | length')
if [ "$UPDATED_COUNT" -eq 0 ]; then
  echo "==> No new values to add. Exit."
  exit 0
fi

MERGED=$(echo "$CURRENT" | jq --argjson new "$NEW_VALUES" '. + $new')

aws secretsmanager put-secret-value \
  --secret-id "$SECRET_NAME" \
  --secret-string "$MERGED" \
  >/dev/null

echo "==> Updated ${UPDATED_COUNT} keys in ${SECRET_NAME}"
