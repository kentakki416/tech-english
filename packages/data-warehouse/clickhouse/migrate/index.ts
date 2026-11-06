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
import { env, isLocalClickHouse } from "./env"
import { CDC_TABLES_PATH, MIGRATIONS_DIR, VIEWS_DIR } from "./paths"
import { hasCdcDatabase, rebuildLocalCdc, verifyExistingCdcDatabaseIsOwn } from "./rebuild-local-cdc"
import { runVersionedMigrations } from "./run-versioned-migrations"
import { verifyLocalDatabaseExists } from "./verify-local-database"

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
 * 2. ローカルなら、migration を流す database があるか確かめる（別プロジェクトの ClickHouse に繋いでいれば止める）
 * 3. ローカルで CDC を使うなら（materialized_postgresql）CDC を作り直し、使わないなら（none）前に作った CDC が残っていれば警告する
 * 4. 版管理する migration を適用する
 * 5. CDC があれば view を作り直す
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

  if (isLocalClickHouse) {
    const client = createClient(connection)
    try {
      await verifyLocalDatabaseExists(client, env.DATA_WAREHOUSE_DATABASE)
    } finally {
      await closeClient(client)
    }
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
  } else if (env.DATA_WAREHOUSE_CDC === "none" && isLocalClickHouse) {
    /**
     * 消すのは、消し方を見た人に任せる（自動で消すと、別プロジェクトの CDC を同じ DB 名で取り違えたときや、pg_cdc を読む手作りの view まで消えるため）
     */
    const client = createClient(connection)
    try {
      await verifyExistingCdcDatabaseIsOwn(client, {
        database: env.LOCAL_CDC_POSTGRES_DATABASE,
        host: env.LOCAL_CDC_POSTGRES_HOST,
      })
      if (await hasCdcDatabase(client)) {
        logger.warn(
          "pg_cdc from an earlier run is still attached (DATA_WAREHOUSE_CDC=none). Its replication slot stops while the replicated tables do not change, "
          + "and keeps WAL and old catalog rows on Postgres. Drop it unless you use the local cdc: DROP DATABASE pg_cdc (see docs/tech-stack/clickhouse/cdc.md)",
        )
      }
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
