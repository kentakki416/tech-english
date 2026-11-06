import type { ClickHouseClient } from "@clickhouse/client"

type RecordedCall = {
  kind: "command" | "query"
  query: string
}

type FakeState = {
  /**
   * system.databases の pg_cdc の engine_full。undefined なら pg_cdc は無い
   */
  cdcEngineFull?: string
  /**
   * system.tables にある pg_cdc のテーブル
   */
  existingCdcTables: string[]
}

/**
 * migration コマンドが使う query / command だけを持つ ClickHouse client の偽物
 *
 * 実行した SQL を記録し、system.databases / system.tables への問い合わせには state から答える。
 */
export const createFakeClickHouseClient = (state: FakeState) => {
  const calls: RecordedCall[] = []
  const client = {
    command: async ({ query }: { query: string }) => {
      calls.push({ kind: "command", query })
    },
    query: async ({ query, query_params }: { query: string, query_params?: Record<string, unknown> }) => {
      calls.push({ kind: "query", query })
      const rows = query.includes("system.databases")
        ? (state.cdcEngineFull === undefined ? [] : [{ engine_full: state.cdcEngineFull }])
        : state.existingCdcTables
          .filter((name) => (query_params?.tables as string[] | undefined)?.includes(name) ?? true)
          .map((name) => ({ name }))
      return { json: async () => rows }
    },
  }
  return { calls, client: client as unknown as ClickHouseClient }
}
