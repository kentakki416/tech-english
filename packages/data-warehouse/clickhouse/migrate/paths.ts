import path from "node:path"

const CLICKHOUSE_DIR = path.resolve(__dirname, "..")

export const MIGRATIONS_DIR = path.join(CLICKHOUSE_DIR, "migrations")

export const VIEWS_DIR = path.join(CLICKHOUSE_DIR, "views")

/**
 * CDC の対象一覧の正本。Terraform（ClickPipe の table_mappings）も同じファイルを読む。
 * migration イメージでは /app/infra/clickhouse/ に COPY している（packages/db/Dockerfile.migration）
 */
export const CDC_TABLES_PATH = path.resolve(CLICKHOUSE_DIR, "../../../infra/clickhouse/cdc-tables.json")
