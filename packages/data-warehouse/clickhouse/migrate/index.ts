import { createClient, type ClickHouseClient } from "@clickhouse/client"

import { logger } from "@repo/logger"

import { applyViews } from "./apply-views"
import {
  readCdcTables,
  readMigrationDefinitions,
  readViewDefinitions,
  verifyMigrationFileNames,
  verifyMigrationsDoNotReferenceCdc,
  verifyViewsMatchCdcTables,
} from "./definition-files"
import { env } from "./env"
import { CDC_TABLES_PATH, MIGRATIONS_DIR, VIEWS_DIR } from "./paths"
import { rebuildLocalCdc } from "./rebuild-local-cdc"
import { runVersionedMigrations } from "./run-versioned-migrations"

const LOCAL_CDC_TIMEOUT_MS = 60_000

/**
 * 後始末の失敗で、元のエラー（処理の失敗）が上書きされないようにする
 */
const closeClient = async (client: ClickHouseClient): Promise<void> => {
  await client.close().catch((error: unknown) => {
    logger.warn("failed to close clickhouse client", { error: String(error) })
  })
}

/**
 * ClickHouse の migration
 *
 * 1. 定義ファイルを検査する（DB に触る前に止める）
 * 2. ローカルなら CDC（MaterializedPostgreSQL）を作り直す
 * 3. 版管理する migration を適用する
 * 4. CDC があれば view を作り直す
 *
 * 設計: docs/spec/clickhouse-migration/README.md
 */
const main = async (): Promise<void> => {
  const [migrations, cdcTables, views] = await Promise.all([
    readMigrationDefinitions(MIGRATIONS_DIR),
    readCdcTables(CDC_TABLES_PATH),
    readViewDefinitions(VIEWS_DIR),
  ])
  const problems = [
    ...verifyMigrationFileNames(migrations.map((migration) => migration.fileName)),
    ...verifyMigrationsDoNotReferenceCdc(migrations),
    ...verifyViewsMatchCdcTables(cdcTables, views.map((view) => view.table)),
  ]
  if (problems.length > 0) {
    throw new Error(`invalid migration definitions:\n${problems.join("\n")}`)
  }

  const connection = {
    password: env.DATA_WAREHOUSE_PASSWORD,
    url: env.DATA_WAREHOUSE_URL,
    username: env.DATA_WAREHOUSE_USER,
  }

  if (env.DATA_WAREHOUSE_CDC === "materialized_postgresql") {
    logger.info("rebuilding local cdc", { tables: cdcTables })
    const client = createClient(connection)
    try {
      await rebuildLocalCdc(client, {
        postgres: {
          database: env.LOCAL_CDC_POSTGRES_DATABASE,
          host: env.LOCAL_CDC_POSTGRES_HOST,
          password: env.LOCAL_CDC_POSTGRES_PASSWORD,
          user: env.LOCAL_CDC_POSTGRES_USER,
        },
        tables: cdcTables,
        timeoutMs: LOCAL_CDC_TIMEOUT_MS,
      })
    } finally {
      await closeClient(client)
    }
  }

  logger.info("applying versioned migrations", { database: env.DATA_WAREHOUSE_DATABASE })
  await runVersionedMigrations({
    ...connection,
    database: env.DATA_WAREHOUSE_DATABASE,
    migrationsDir: MIGRATIONS_DIR,
  })

  if (env.DATA_WAREHOUSE_CDC === "none") {
    logger.info("cdc is disabled, skipped views")
    return
  }

  /**
   * database は版管理する migration（clickhouse-migrations）が作った後なので、ここで初めて指定できる
   */
  const client = createClient({ ...connection, database: env.DATA_WAREHOUSE_DATABASE })
  try {
    const skippedTables = await applyViews(client, { cdcMode: env.DATA_WAREHOUSE_CDC, views })
    logger.info("applied views", { count: views.length - skippedTables.length })
    if (skippedTables.length > 0) {
      logger.warn(
        "skipped views whose cdc table does not exist yet (initial sync of the ClickPipe may not be finished). Run the migration again later",
        { tables: skippedTables },
      )
    }
  } finally {
    await closeClient(client)
  }
}

main().catch((error: unknown) => {
  logger.error("clickhouse migration failed", error instanceof Error ? error : new Error(String(error)))
  process.exitCode = 1
})
