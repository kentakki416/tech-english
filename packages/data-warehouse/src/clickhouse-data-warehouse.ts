import { createClient, type ClickHouseClient } from "@clickhouse/client"

import { logger } from "@repo/logger"

import type { DataWarehouse } from "./data-warehouse"

export type ClickHouseConfig = {
  database: string
  password: string
  url: string
  username: string
}

/**
 * ClickHouse 実装
 */
export class ClickHouseDataWarehouse implements DataWarehouse {
  private readonly _client: ClickHouseClient

  constructor(config: ClickHouseConfig) {
    this._client = createClient({
      clickhouse_settings: {
        /**
         * 呼び出し側が queue から取り出した分をまとめて INSERT するため、
         * ここでのバッファリングは補助的。**確定は待つ**。
         * 待たないと呼び出し側が成功扱いで処理を完了し、
         * ClickHouse 側で失敗してもリトライが効かなくなる。
         */
        async_insert: 1,
        wait_for_async_insert: 1,
      },
      database: config.database,
      password: config.password,
      url: config.url,
      username: config.username,
    })
  }

  public async insertAll(table: string, rows: Record<string, unknown>[]): Promise<void> {
    if (rows.length === 0) return

    try {
      await this._client.insert({ format: "JSONEachRow", table, values: rows })
    } catch (error) {
      /**
       * 呼び出し元がリトライできるよう re-throw するが、ログはここで出す。
       * ここで出さないと queue の汎用的なジョブ失敗としか残らず、
       * 原因が ClickHouse だと分からないため。
       */
      logger.error(
        "clickhouse insert failed",
        error instanceof Error ? error : new Error(String(error)),
        { count: rows.length, table },
      )
      throw error
    }
  }

  public async close(): Promise<void> {
    await this._client.close()
  }
}
