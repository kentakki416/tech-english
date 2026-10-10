#!/bin/bash
# 分析クエリが参照する view を作る（ローカル専用）
#
# 設計: packages/data-warehouse/README.md
#
# **初回の docker compose up では view は作られない。** Postgres のテーブルは
# db:migrate（drizzle-kit migrate）で作るので、ClickHouse の初期化時点ではまだ無く、
# アタッチ待ちがタイムアウトする。テーブルは migrate 後に自動でアタッチされるので、
# migrate の後にこのスクリプトを再実行して view を作る（何度実行してもよい）:
#   docker exec project-template-clickhouse bash /docker-entrypoint-initdb.d/03-postgres-cdc-views.sh
#
# **なぜ .sql ではなく .sh なのか**
# 02-postgres-cdc.sql の MaterializedPostgreSQL は CREATE DATABASE が即座に返り、
# テーブルは非同期にアタッチされる。同じ .sql の中で CREATE VIEW すると
# pg_cdc.users がまだ無くて UNKNOWN_TABLE (Code: 60) で落ちるため、
# アタッチを待てるスクリプトに分けている。
#
# **なぜ view を挟むのか**
# CDC テーブルは更新を「新しい版の追記」で表現するので、FINAL を付け忘れると
# 古い版が二重に数えられる。prd (ClickPipes) ではさらに削除が
# `_peerdb_is_deleted = 1` の行として残るため、絞らないと削除済みの行が混ざる。
# どちらもエラーにならず静かに数字が狂うので、view に閉じ込める。
#
# **ローカルと prd で view の名前・列・型を同じにする。** 定義だけが違う:
#   local: ... FINAL WHERE _sign = 1                  (MaterializedPostgreSQL)
#   prd:   ... FINAL WHERE _peerdb_is_deleted = 0      (ClickPipes)
# 分析クエリは v_users / v_memos に対して書けば両環境でそのまま動く。
#
# **なぜ _sign = 1 を明示するのか**
# MaterializedPostgreSQL のテーブルは削除を `_sign = -1` のタンブストーン行で
# 表現する。`SELECT *` は暗黙にこれを除外するが、`SELECT count()` のように
# 通常列を参照しないクエリはその最適化を経由せずタンブストーンまで数える
# (実測: FINAL のみ 4 件 / _sign = 1 付き 3 件)。暗黙の挙動に頼らず明示する。
#
# **なぜ id を UInt64 にキャストするのか**
# Postgres の integer は Int32 にマップされるが、events.user_id は UInt64 なので
# そのまま JOIN すると NO_COMMON_TYPE で落ちる。符号の有無が違うと共通型が無い
# ためキャストが必要で、型合わせを view 側に寄せてクエリから消している。
set -euo pipefail

CDC_TABLES="users memos"
MAX_WAIT_SECONDS=60

clickhouse_query() {
  clickhouse-client --host 127.0.0.1 --query "$1"
}

# MaterializedPostgreSQL のアタッチ完了を待つ
for table in $CDC_TABLES; do
  waited=0
  until clickhouse_query "EXISTS TABLE pg_cdc.${table}" | grep -q '^1$'; do
    if [ "$waited" -ge "$MAX_WAIT_SECONDS" ]; then
      echo "pg_cdc.${table} が ${MAX_WAIT_SECONDS} 秒でアタッチされなかった。Postgres に ${table} テーブルが無い可能性がある（初回起動時は正常）。db:migrate の後にこのスクリプトを再実行する" >&2
      exit 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
done

for table in $CDC_TABLES; do
  clickhouse_query "CREATE VIEW IF NOT EXISTS project_template.v_${table} AS
    SELECT * REPLACE (toUInt64(id) AS id)
    FROM pg_cdc.${table} FINAL
    WHERE _sign = 1"
  echo "created view project_template.v_${table}"
done
